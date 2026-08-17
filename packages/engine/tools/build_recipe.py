#!/usr/bin/env python3
# Build a Liquid Glass recipe for a decanted .icon bundle (non-glass, SVG-art
# icons — v1 of the generic pipeline; Spotify-class). Consumes:
#   - the .icon bundle (icon.json + Assets/*.svg)
#   - its ictool ground-truth render (previews/<Name>-1024.png)
# Emits recipes/<id>.mjs for the engine from build_node_module.py.
#
# Two-phase like every bake in this project:
#   python3 tools/build_recipe.py --bundle X.icon --gt X-1024.png --id x --outdir D
#   node render (pass 1) -> PNG
#   python3 tools/build_recipe.py ... --lightmap pass1.png
import numpy as np, base64, json, argparse, os, re, zlib, math
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("--bundle", required=True)
ap.add_argument("--gt", required=True)
ap.add_argument("--id", required=True)
ap.add_argument("--outdir", required=True)
ap.add_argument("--lightmap", default=None)
# Lightmap resolution. The engine's sampler is scale-aware (ds), so this is
# a pure size/fidelity dial: 512 maximizes 1024-render fidelity; 128
# (default) is ~9x smaller and indistinguishable at display sizes <=256.
ap.add_argument("--lm-res", type=int, default=128, choices=[64, 128, 256, 512])
a = ap.parse_args()

def b64z(u8bytes):
    return base64.b64encode(zlib.compress(u8bytes, 9)).decode()

# ---------------- full SVG path parser -> cubics ----------------
NUM = r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?"

def arc_to_cubics(cur, rx, ry, rot, laf, swf, end):
    # SVG endpoint arc -> center parameterization -> cubic segments
    x1, y1 = cur; x2, y2 = end
    if rx == 0 or ry == 0 or (x1 == x2 and y1 == y2):
        return [(cur, cur, end, end)]
    phi = math.radians(rot)
    cp, sp = math.cos(phi), math.sin(phi)
    dx, dy = (x1-x2)/2, (y1-y2)/2
    x1p = cp*dx + sp*dy; y1p = -sp*dx + cp*dy
    rx, ry = abs(rx), abs(ry)
    lam = x1p*x1p/(rx*rx) + y1p*y1p/(ry*ry)
    if lam > 1:
        s = math.sqrt(lam); rx *= s; ry *= s
    num = rx*rx*ry*ry - rx*rx*y1p*y1p - ry*ry*x1p*x1p
    den = rx*rx*y1p*y1p + ry*ry*x1p*x1p
    co = math.sqrt(max(num, 0)/max(den, 1e-12))
    if laf == swf: co = -co
    cxp = co*rx*y1p/ry; cyp = -co*ry*x1p/rx
    cx = cp*cxp - sp*cyp + (x1+x2)/2
    cy = sp*cxp + cp*cyp + (y1+y2)/2
    def ang(ux, uy, vx, vy):
        d = math.hypot(ux, uy)*math.hypot(vx, vy)
        c = max(-1, min(1, (ux*vx + uy*vy)/max(d, 1e-12)))
        s2 = 1 if ux*vy - uy*vx >= 0 else -1
        return s2*math.acos(c)
    th1 = ang(1, 0, (x1p-cxp)/rx, (y1p-cyp)/ry)
    dth = ang((x1p-cxp)/rx, (y1p-cyp)/ry, (-x1p-cxp)/rx, (-y1p-cyp)/ry)
    if not swf and dth > 0: dth -= 2*math.pi
    if swf and dth < 0: dth += 2*math.pi
    nseg = max(1, int(math.ceil(abs(dth)/(math.pi/2))))
    out = []
    for i in range(nseg):
        t0 = th1 + dth*i/nseg; t1 = th1 + dth*(i+1)/nseg
        dt = t1 - t0
        alpha = math.sin(dt)*(math.sqrt(4 + 3*math.tan(dt/2)**2) - 1)/3
        def pt(t):
            return (cx + rx*math.cos(t)*cp - ry*math.sin(t)*sp,
                    cy + rx*math.cos(t)*sp + ry*math.sin(t)*cp)
        def dpt(t):
            return (-rx*math.sin(t)*cp - ry*math.cos(t)*sp,
                    -rx*math.sin(t)*sp + ry*math.cos(t)*cp)
        p0 = pt(t0); p3 = pt(t1); d0 = dpt(t0); d1 = dpt(t1)
        out.append((p0, (p0[0]+alpha*d0[0], p0[1]+alpha*d0[1]),
                    (p3[0]-alpha*d1[0], p3[1]-alpha*d1[1]), p3))
    return out

def parse_path(d):
    toks = re.findall(r"[MmLlHhVvCcSsQqTtAaZz]|" + NUM, d)
    i = 0; cubics = []; cur = (0.0, 0.0); start = cur
    last_c = None; last_q = None; last_cmd = ""
    def num():
        nonlocal i
        v = float(toks[i]); i += 1; return v
    def more():
        return i < len(toks) and not re.match(r"[MmLlHhVvCcSsQqTtAaZz]", toks[i])
    def line_to(p):
        nonlocal cur
        if p != cur: cubics.append((cur, cur, p, p))
        cur = p
    while i < len(toks):
        cmd = toks[i]; i += 1
        rel = cmd.islower()
        C = cmd.upper()
        first = True
        while True:
            if C == "Z":
                if cur != start: line_to(start)
                cur = start; last_c = last_q = None
                break
            if not (first or more()): break
            first = False
            if C == "M":
                p = (num(), num())
                if rel: p = (cur[0]+p[0], cur[1]+p[1])
                cur = p; start = p; last_c = last_q = None
                C = "L"  # subsequent pairs are implicit lineto
                if not more(): break
                continue
            if C == "L":
                p = (num(), num())
                if rel: p = (cur[0]+p[0], cur[1]+p[1])
                line_to(p); last_c = last_q = None
            elif C == "H":
                x = num(); x = cur[0]+x if rel else x
                line_to((x, cur[1])); last_c = last_q = None
            elif C == "V":
                y = num(); y = cur[1]+y if rel else y
                line_to((cur[0], y)); last_c = last_q = None
            elif C == "C":
                c1 = (num(), num()); c2 = (num(), num()); p = (num(), num())
                if rel:
                    c1 = (cur[0]+c1[0], cur[1]+c1[1]); c2 = (cur[0]+c2[0], cur[1]+c2[1]); p = (cur[0]+p[0], cur[1]+p[1])
                cubics.append((cur, c1, c2, p)); last_c = c2; last_q = None; cur = p
            elif C == "S":
                c1 = (2*cur[0]-last_c[0], 2*cur[1]-last_c[1]) if last_c else cur
                c2 = (num(), num()); p = (num(), num())
                if rel:
                    c2 = (cur[0]+c2[0], cur[1]+c2[1]); p = (cur[0]+p[0], cur[1]+p[1])
                cubics.append((cur, c1, c2, p)); last_c = c2; last_q = None; cur = p
            elif C == "Q":
                q = (num(), num()); p = (num(), num())
                if rel:
                    q = (cur[0]+q[0], cur[1]+q[1]); p = (cur[0]+p[0], cur[1]+p[1])
                c1 = (cur[0]+2/3*(q[0]-cur[0]), cur[1]+2/3*(q[1]-cur[1]))
                c2 = (p[0]+2/3*(q[0]-p[0]), p[1]+2/3*(q[1]-p[1]))
                cubics.append((cur, c1, c2, p)); last_q = q; last_c = None; cur = p
            elif C == "T":
                q = (2*cur[0]-last_q[0], 2*cur[1]-last_q[1]) if last_q else cur
                p = (num(), num())
                if rel: p = (cur[0]+p[0], cur[1]+p[1])
                c1 = (cur[0]+2/3*(q[0]-cur[0]), cur[1]+2/3*(q[1]-cur[1]))
                c2 = (p[0]+2/3*(q[0]-p[0]), p[1]+2/3*(q[1]-p[1]))
                cubics.append((cur, c1, c2, p)); last_q = q; last_c = None; cur = p
            elif C == "A":
                rx = num(); ry = num(); rot = num(); laf = int(num()); swf = int(num())
                p = (num(), num())
                if rel: p = (cur[0]+p[0], cur[1]+p[1])
                cubics.extend(arc_to_cubics(cur, rx, ry, rot, laf, swf, p))
                cur = p; last_c = last_q = None
        last_cmd = C
    return cubics

def parse_transform(t):
    # supports matrix/translate/scale (sufficient for CoreSVG output)
    M = np.eye(3)
    for name, args in re.findall(r"(\w+)\(([^)]*)\)", t or ""):
        v = [float(x) for x in re.findall(NUM, args)]
        if name == "matrix":
            A = np.array([[v[0], v[2], v[4]], [v[1], v[3], v[5]], [0, 0, 1]])
        elif name == "translate":
            A = np.eye(3); A[0, 2] = v[0]; A[1, 2] = v[1] if len(v) > 1 else 0
        elif name == "scale":
            A = np.eye(3); A[0, 0] = v[0]; A[1, 1] = v[1] if len(v) > 1 else v[0]
        else:
            A = np.eye(3)
        M = M @ A
    return M

def svg_to_cubics(path):
    s = open(path).read()
    vb = [float(v) for v in re.findall(r'viewBox="([^"]+)"', s)[0].split()]
    # walk elements, tracking group transforms (flat regex walk is enough for
    # CoreSVG output: <g transform=...> ... <path .../> ... </g>)
    cubics = []
    rules = set()
    stack = [np.eye(3)]
    for m in re.finditer(r"<(g|path|/g)([^>]*?)(/?)>", s):
        tag, attrs = m.group(1), m.group(2)
        if tag == "g":
            tr = re.findall(r'transform="([^"]+)"', attrs)
            stack.append(stack[-1] @ (parse_transform(tr[0]) if tr else np.eye(3)))
            if m.group(3) == "/": stack.pop()
        elif tag == "/g":
            if len(stack) > 1: stack.pop()
        elif tag == "path":
            d = re.findall(r' d="([^"]+)"', attrs)
            if not d: continue
            tr = re.findall(r'transform="([^"]+)"', attrs)
            M = stack[-1] @ (parse_transform(tr[0]) if tr else np.eye(3))
            fr = re.findall(r'fill-rule="([^"]+)"', attrs)
            rules.add(fr[0] if fr else "nonzero")
            for cu in parse_path(d[0]):
                tc = []
                for (x, y) in cu:
                    p = M @ np.array([x, y, 1.0])
                    tc.append((float(p[0]), float(p[1])))
                cubics.append(tuple(tc))
    rule = "evenodd" if rules == {"evenodd"} else "nonzero"
    return cubics, vb, rule

# ---------------- color ----------------
def p3_to_srgb(r, g, b):
    def lin(u): return u/12.92 if u <= 0.04045 else ((u+0.055)/1.055)**2.4
    def enc(u): return 12.92*u if u <= 0.0031308 else 1.055*u**(1/2.4) - 0.055
    rl, gl, bl = lin(r), lin(g), lin(b)
    M1 = np.array([[0.4865709, 0.2656677, 0.1982173],
                   [0.2289746, 0.6917385, 0.0792869],
                   [0.0000000, 0.0451134, 1.0439444]])
    M2 = np.linalg.inv(np.array([[0.4123908, 0.3575843, 0.1804808],
                                 [0.2126390, 0.7151687, 0.0721923],
                                 [0.0193308, 0.1191948, 0.9505322]]))
    rgb = M2 @ (M1 @ np.array([rl, gl, bl]))
    return [round(max(0.0, min(1.0, enc(max(0.0, min(1.0, v)))))*255, 1) for v in rgb]

def parse_color(cstr):
    kind, vals = cstr.split(":")
    v = [float(x) for x in vals.split(",")]
    if kind == "display-p3":
        return p3_to_srgb(v[0], v[1], v[2])
    if kind in ("srgb", "gray"):
        if kind == "gray": v = [v[0], v[0], v[0], v[1]]
        return [round(v[0]*255, 1), round(v[1]*255, 1), round(v[2]*255, 1)]
    raise ValueError(cstr)

def light_value(spec, key):
    # icon.json "-specializations" resolution for the LIGHT appearance
    if key in spec: return spec[key]
    sp = spec.get(key + "-specializations")
    if sp:
        for e in sp:
            if "appearance" not in e: return e["value"]
    return None

# ---------------- python coverage rasterizer (for GT fill measurement) ----
def rasterize_cov(seg, rule, size=512):
    sc = size/1024.0
    pts_all = []
    for si in range(0, len(seg), 8):
        x0, y0, x1, y1, x2, y2, x3, y3 = [v*sc for v in seg[si:si+8]]
        t = np.linspace(0, 1, 33)
        mt = 1-t
        xs = mt**3*x0 + 3*mt*mt*t*x1 + 3*mt*t*t*x2 + t**3*x3
        ys = mt**3*y0 + 3*mt*mt*t*y1 + 3*mt*t*t*y2 + t**3*y3
        pts_all.append(np.stack([xs, ys], 1))
    E = []
    for P in pts_all:
        for j in range(len(P)-1):
            if P[j][1] != P[j+1][1]:
                E.append((P[j][0], P[j][1], P[j+1][0], P[j+1][1]))
    E = np.array(E)
    cov = np.zeros((size, size), np.float32)
    for row in range(size):
        yy = row + 0.5
        m = (np.minimum(E[:,1], E[:,3]) <= yy) & (np.maximum(E[:,1], E[:,3]) > yy)
        if not m.any(): continue
        e = E[m]
        xc = e[:,0] + (yy - e[:,1])*(e[:,2]-e[:,0])/(e[:,3]-e[:,1])
        wd = np.where(e[:,3] > e[:,1], 1, -1)
        order = np.argsort(xc)
        xs2, ws2 = xc[order], wd[order]
        wind = 0
        for k in range(len(xs2)):
            inside0 = (wind != 0) if rule == "nonzero" else (wind % 2 != 0)
            wind += ws2[k] if rule == "nonzero" else 1
            inside1 = (wind != 0) if rule == "nonzero" else (wind % 2 != 0)
            if not inside0 and inside1: a2 = xs2[k]
            elif inside0 and not inside1:
                ia, ib = int(max(np.floor(a2), 0)), int(min(np.floor(xs2[k]), size-1))
                if ia <= ib: cov[row, ia:ib+1] = 1
    return cov

# ---------------- build ----------------
GT = np.asarray(Image.open(a.gt).convert("RGBA")).astype(np.float64)
vis = GT[..., 3] > 0
doc = json.load(open(os.path.join(a.bundle, "icon.json")))

bg_layers = []
art_cov = np.zeros((1024, 1024), bool)   # union bbox of artwork, for bg fitting
layer_masks = []

glass_layers = []
groups = doc.get("groups", [])
# icon.json lists topmost group first; render bottom-up = reversed
for g in reversed(groups):
    if g.get("hidden"): continue
    for l in reversed(g.get("layers", [])):
        gl = light_value(l, "glass")
        op = light_value(l, "opacity")
        if op == 0: continue
        name = l["image-name"]
        assert name.lower().endswith(".svg"), f"non-SVG layer {name} not supported by v1"
        cubics, vb, rule = svg_to_cubics(os.path.join(a.bundle, "Assets", name))
        natural = max(vb[2], vb[3])
        pos = l.get("position", {})
        sc = pos.get("scale", 1024.0/natural)
        tr = pos.get("translation-in-points", [0.0, 0.0])
        # layer anchored centered on the canvas at natural*scale, plus offset
        ox = (1024.0 - vb[2]*sc)/2 + tr[0]
        oy = (1024.0 - vb[3]*sc)/2 + tr[1]
        seg = []
        for cu in cubics:
            for (x, y) in cu:
                seg.append(round((x - vb[0])*sc + ox, 3))
                seg.append(round((y - vb[1])*sc + oy, 3))
        if gl is True:
            gopts = {"shadowOp": (g.get("shadow") or {}).get("opacity", 0.5) if g.get("shadow") else None,
                     "transl": (light_value(g, "translucency") or {}).get("value", 0.5)}
            glass_layers.append({"seg": seg, "rule": rule, "group": gopts,
                                 "_cov": rasterize_cov(seg, rule)})
            continue
        fill = light_value(l, "fill")
        if fill and "solid" in fill:
            fdesc = {"t": "solid", "c": parse_color(fill["solid"])}
        elif fill and "linear-gradient" in fill:
            o = fill.get("orientation", {"start": {"x": 0.5, "y": 0}, "stop": {"x": 0.5, "y": 1}})
            fdesc = {"t": "lin", "c0": parse_color(fill["linear-gradient"][0]),
                     "c1": parse_color(fill["linear-gradient"][1]),
                     "x0": o["start"]["x"]*1024, "y0": o["start"]["y"]*1024,
                     "x1": o["stop"]["x"]*1024, "y1": o["stop"]["y"]*1024}
        else:
            raise ValueError(f"layer {name}: unsupported fill {fill} (v1 needs an icon.json fill override)")
        lay = {"t": "path", "seg": seg, "rule": rule, "fill": fdesc}
        if op is not None and op != 1: lay["op"] = op
        lay["_cov"] = rasterize_cov(seg, rule)
        bg_layers.append(lay)

# fills: CALIBRATE from GT over each layer's eroded coverage (declared icon
# colors are Display-P3 and ictool's gamut mapping is not plain clipping —
# measuring sidesteps the color management entirely). Interior = coverage
# eroded 6px, minus any layer above.
for li, lay in enumerate(bg_layers):
    cov = lay.pop("_cov")
    er = cov.copy()
    for _ in range(3):
        er = np.minimum.reduce([er, np.roll(er, 2, 0), np.roll(er, -2, 0), np.roll(er, 2, 1), np.roll(er, -2, 1)])
    for lay2 in bg_layers[li+1:]:
        er = np.minimum(er, 1 - lay2["_cov"] if "_cov" in lay2 else er*0+1)
    m = er > 0.5
    if m.sum() < 200:
        print(f"layer {li}: too little interior to measure fill, keeping declared color")
        continue
    ys2, xs2 = np.where(m)
    gt_px = GT[ys2*2, xs2*2, :3]
    f = lay["fill"]
    if f["t"] == "solid":
        med = np.median(gt_px, axis=0)
        print(f"layer {li}: declared {f['c']} -> measured {med.round(1).tolist()}")
        f["c"] = [round(float(v), 1) for v in med]
    else:
        ax = np.stack([np.ones(len(ys2)), (( (xs2*2 - f["x0"])*(f["x1"]-f["x0"]) + (ys2*2 - f["y0"])*(f["y1"]-f["y0"]) )
                       / max((f["x1"]-f["x0"])**2 + (f["y1"]-f["y0"])**2, 1e-9)).clip(0, 1)], 1)
        coef2, *_ = np.linalg.lstsq(ax, gt_px, rcond=None)
        f["c0"] = [round(float(v), 1) for v in coef2[0]]
        f["c1"] = [round(float(v), 1) for v in (coef2[0] + coef2[1])]
        print(f"layer {li}: gradient measured c0={f['c0']} c1={f['c1']}")

# background canvas fill fit. With glass layers present, render a
# glass-hidden variant via ictool (the calibration playbook's person-hidden
# trick) and fit from that; otherwise fit from GT rows outside the artwork.
ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool"
bgGT = None
if glass_layers:
    import shutil, subprocess, tempfile
    tmp = tempfile.mkdtemp()
    vb2 = os.path.join(tmp, "v.icon")
    shutil.copytree(a.bundle, vb2)
    doc2 = json.load(open(os.path.join(vb2, "icon.json")))
    for g in doc2.get("groups", []):
        if any(light_value(l, "glass") is True for l in g.get("layers", [])):
            g["hidden"] = True
    json.dump(doc2, open(os.path.join(vb2, "icon.json"), "w"))
    outp = os.path.join(tmp, "bg.png")
    r = subprocess.run([ICTOOL, vb2, "--export-image", "--output-file", outp,
                        "--platform", "macOS", "--rendition", "Default",
                        "--width", "1024", "--height", "1024", "--scale", "1"],
                       capture_output=True, text=True)
    assert os.path.exists(outp), f"ictool failed: {r.stderr[:300]}"
    bgGT = np.asarray(Image.open(outp).convert("RGBA")).astype(np.float64)
    print("rendered glass-hidden bg variant via ictool")

fit_src = bgGT if bgGT is not None else GT
if bgGT is not None:
    covered = np.zeros((512, 512), bool)
    for lay in bg_layers:
        covered |= lay.get("_cov", np.zeros((512, 512))) > 0.01
    rows = []
    for y in range(80, 945, 4):
        xs = [x for x in range(20, 1004, 4) if fit_src[y, x, 3] > 200 and not covered[y//2, x//2]]
        if len(xs) > 20:
            rows.append((y, fit_src[y, xs, :3].mean(axis=0)))
else:
    minx = min(min(l["seg"][0::2]) for l in bg_layers) if bg_layers else 400
    rows = []
    for y in range(120, 905, 8):
        xs = [x for x in range(30, 1024, 4) if (x < minx - 8 or x > 1024 - (minx - 8)) and vis[y, x]]
        if len(xs) > 20:
            rows.append((y, fit_src[y, xs, :3].mean(axis=0)))
if not rows:
    # Fully-covered canvas: the layer stack hides the background
    # entirely, so no uncovered samples exist and any flat color is
    # visually correct. Emit a flat gradient from a center sample.
    c = fit_src[512, 480:545, :3].mean(axis=0)
    rows = [(80, c), (944, c)]
ys = np.array([r[0] for r in rows], dtype=float)
cs = np.stack([r[1] for r in rows])
A_ = np.stack([np.ones_like(ys), ys/1024.0], 1)
coef, *_ = np.linalg.lstsq(A_, cs, rcond=None)
c0 = [round(float(v), 1) for v in coef[0]]
c1 = [round(float(v), 1) for v in (coef[0] + coef[1])]
print(f"bg vgrad fit: c0={c0} c1={c1} (residual rms {np.sqrt(((A_@coef - cs)**2).mean()):.2f})")

# glass materials: the TWO-GRAY instrument, automated through ictool.
# Render the bundle with the canvas fill overridden to two flat grays,
# glass shown and glass hidden (4 renders); the per-pixel affine response
# composite = k*bg + c falls out exactly (the disk-LUT methodology).
prof_j = json.load(open(os.path.join(os.path.dirname(__file__), "..", "calibration", "refraction-profile.json")))
glass_entries = []
# stacked glass: measure each layer INCREMENTALLY — R_j = render with only
# the bottom j glass layers shown, at two gray canvas fills; layer i's
# affine response falls out of R_{i+1} vs R_i. Layers are identified in the
# variant bundle by (group index, layer index) so per-layer hiding works.
if glass_layers:
    import shutil, subprocess, tempfile
    tg = tempfile.mkdtemp()
    # map glass layer order (bottom-up) to (group, layer) indices
    gpos = []
    for gi2 in reversed(range(len(groups))):
        g = groups[gi2]
        if g.get("hidden"): continue
        for li2 in reversed(range(len(g.get("layers", [])))):
            l = g["layers"][li2]
            if light_value(l, "glass") is True and light_value(l, "opacity") != 0:
                gpos.append((gi2, li2))
    def variant(gray, nshow, tag):
        vb3 = os.path.join(tg, f"{tag}.icon")
        shutil.copytree(a.bundle, vb3)
        d3 = json.load(open(os.path.join(vb3, "icon.json")))
        d3["fill"] = {"solid": f"srgb:{gray:.5f},{gray:.5f},{gray:.5f},1.00000"}
        d3.pop("fill-specializations", None)
        for idx, (gi2, li2) in enumerate(gpos):
            if idx >= nshow:
                d3["groups"][gi2]["layers"][li2]["hidden"] = True
        json.dump(d3, open(os.path.join(vb3, "icon.json"), "w"))
        outp = os.path.join(tg, f"{tag}.png")
        r = subprocess.run([ICTOOL, vb3, "--export-image", "--output-file", outp,
                            "--platform", "macOS", "--rendition", "Default",
                            "--width", "1024", "--height", "1024", "--scale", "1"],
                           capture_output=True, text=True)
        assert os.path.exists(outp), f"ictool failed ({tag}): {r.stderr[:300]}"
        return np.asarray(Image.open(outp).convert("RGB")).astype(np.float64)
    Rj1 = [variant(0.25, j, f"a{j}") for j in range(len(glass_layers)+1)]
    Rj2 = [variant(0.75, j, f"b{j}") for j in range(len(glass_layers)+1)]
for gi, glay in enumerate(glass_layers):
    cov = glay.pop("_cov")
    er = cov.copy()
    for _ in range(6):
        er = np.minimum.reduce([er, np.roll(er, 2, 0), np.roll(er, -2, 0), np.roll(er, 2, 1), np.roll(er, -2, 1)])
    m = er > 0.5
    ys2, xs2 = np.where(m)
    s1 = Rj1[gi+1][ys2*2, xs2*2]; s2 = Rj2[gi+1][ys2*2, xs2*2]
    h1 = Rj1[gi][ys2*2, xs2*2]; h2 = Rj2[gi][ys2*2, xs2*2]
    den = h2 - h1
    ok = np.abs(den).min(axis=1) > 25
    if ok.sum() < 100:
        print(f"glass {gi}: WARN weak base contrast ({ok.sum()} px), widening")
        ok = np.abs(den).min(axis=1) > 10
    kpix = (s2[ok] - s1[ok])/den[ok]
    ks = np.median(kpix, axis=0)
    k = float(np.clip(np.mean(ks), 0.0, 0.999))
    cvec = ((s1 - k*h1).mean(axis=0) + (s2 - k*h2).mean(axis=0))/2
    al = 1.0 - k
    gc = [round(float(min(max(v/max(al, 1e-3), 0), 255)), 1) for v in cvec]
    print(f"glass {gi}: k per-ch {[round(float(v),3) for v in ks]} -> alpha={al:.3f} gc={gc}")
    alpha_b = base64.b64encode(bytes([int(round(al*255))]*96)).decode()
    sh = glay["group"]["shadowOp"]
    entry = {"path": [round(v, 3) for v in glay["seg"]],
             "law": {"A0": prof_j["A0"], "R0": prof_j["R0"], "pw": prof_j["pw"],
                     "sr": prof_j.get("smooth_r", 3), "sn": prof_j.get("smooth_n", 2)},
             "alpha": alpha_b, "gc": gc,
             "shadow": ({"dy": 29, "r": 23, "n": 3, "amp": round(17.385*sh/0.5, 3)} if sh else None),
             "lm": None}
    glass_entries.append(entry)

recipe = {"bg": [{"t": "vgrad", "c0": c0, "c1": c1}] + bg_layers,
          "dluts": [], "glass": glass_entries, "bodyLight": True, "lm": None}

# ------------- optional lightmap (generic: pooled luma + white-restore) ----
if a.lightmap:
    R1 = np.asarray(Image.open(a.lightmap).convert("RGBA")).astype(np.float64)
    w = np.minimum(GT[..., 3], R1[..., 3])/255.0
    L = (GT[..., :3] - R1[..., :3])*w[..., None]
    Y = L.mean(axis=2)
    DS = 1024 // a.lm_res
    y0, x0 = 0, 0
    h2, w2 = 1024//DS, 1024//DS
    small = Y.reshape(h2, DS, w2, DS).mean(axis=(1, 3))
    Q = 1.5
    q = np.round(small/Q)
    q = np.where(np.abs(small) >= 1.0, q, 0)
    q = np.clip(q, -100, 100)
    lz = b64z((q+128).astype(np.uint8).tobytes())
    # white-restore chroma fit
    lum = R1[..., :3].mean(axis=2)
    headr = np.maximum(255.0-lum, 1.0)
    wrst = Y[..., None]*(255.0-R1[..., :3])/headr[..., None]
    regm = w > 0.5
    num2 = ((L - Y[..., None])*(wrst - Y[..., None]))[regm].sum()
    den = max(((wrst - Y[..., None])**2)[regm].sum(), 1e-9)
    bfit = float(np.clip(num2/den, 0.0, 1.5))
    print(f"lightmap: ds{DS} luma {w2}x{h2}, deflate {len(zlib.compress((q+128).astype(np.uint8).tobytes(),9))}B, b={bfit:.2f}")
    recipe["lm"] = {"y": lz, "q": Q, "b": round(bfit, 3), "x0": x0, "y0": y0, "ds": DS, "w": w2, "h": h2}

os.makedirs(os.path.join(a.outdir, "recipes"), exist_ok=True)
out = os.path.join(a.outdir, "recipes", f"{a.id}.mjs")
open(out, "w").write(
    f"// recipes/{a.id}.mjs — Liquid Glass recipe (data only).\n"
    f"// GENERATED by packages/engine/tools/build_recipe.py from {os.path.basename(a.bundle)}\n"
    f"// — do not edit by hand.\n"
    "export const recipe = " + json.dumps(recipe, separators=(",", ":")) + ";\n")
print(f"wrote {out}: {os.path.getsize(out)} bytes")
