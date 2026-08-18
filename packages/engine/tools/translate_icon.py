#!/usr/bin/env python3
# Translate a FLAT .icon bundle (no glass:true layers) into an engine
# recipe with ZERO ictool measurement — the first slice of a universal
# .icon player. Everything comes from declared values:
#
#   - fills via the solved color model (ictool composites in sRGB with
#     colorimetric clipping and encodes in Display-P3 coordinates; the
#     engine's calibrated space is those P3-coded values, so declared
#     colors convert sRGB-clip -> P3 coords — see probe-gamut.mjs)
#   - automatic-gradient via the measured ladder (probe-autogradient.mjs
#     --fit): bottom = declared color, top lightened toward white by the
#     lightness-bucketed span; colored inputs approximate
#   - per-subpath SVG fills parsed from the artwork itself (the gap that
#     rejected 35/36 bundles in the recipe sweep: build_recipe.py only
#     accepts icon.json fill overrides)
#
# Shares its path/transform/placement machinery with build_recipe.py
# (copied; keep in sync). Supported SVG subset: path/rect/circle/ellipse/
# polygon, solid fills (hex/rgb/named subset/style attr), 2-stop linear
# gradients (userSpaceOnUse + objectBoundingBox), nested <g> transforms,
# fill/element opacity. Unsupported (warned, layer skipped or
# approximated): strokes, radial gradients, >2-stop gradients (endpoints
# used), filters, non-normal blend modes.
#
#   python3 translate_icon.py --bundle X.icon --id slug --outdir out
import argparse
import base64
import json
import math
import os
import re
import zlib

import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("--bundle", required=True)
ap.add_argument("--id", required=True)
ap.add_argument("--outdir", required=True)
a = ap.parse_args()

NUM = r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?"
warnings = []


def warn(msg):
    warnings.append(msg)
    print(f"  ! {msg}")


# ---------------- color: declared -> render space (P3-coded sRGB) ---------
_M_P3_XYZ = np.array([[0.4865709, 0.2656677, 0.1982173],
                      [0.2289746, 0.6917385, 0.0792869],
                      [0.0000000, 0.0451134, 1.0439444]])
_M_SRGB_XYZ = np.array([[0.4123908, 0.3575843, 0.1804808],
                        [0.2126390, 0.7151687, 0.0721923],
                        [0.0193308, 0.1191948, 0.9505322]])
_P3_TO_SRGB = np.linalg.inv(_M_SRGB_XYZ) @ _M_P3_XYZ
_SRGB_TO_P3 = np.linalg.inv(_P3_TO_SRGB)


def _lin(u):
    u = np.asarray(u, np.float64)
    return np.where(u <= 0.04045, u / 12.92, ((u + 0.055) / 1.055) ** 2.4)


def _enc(u):
    u = np.clip(np.asarray(u, np.float64), 0, 1)
    return np.where(u <= 0.0031308, 12.92 * u, 1.055 * u ** (1 / 2.4) - 0.055)


def srgb_to_render(rgb01):
    # sRGB color -> P3-coded engine values (0..255)
    p3 = _enc(_SRGB_TO_P3 @ _lin(np.clip(rgb01, 0, 1)))
    return [round(float(v) * 255, 1) for v in p3]


def p3_to_render(rgb01):
    # declared display-p3 -> composited-in-sRGB (clip) -> P3-coded
    srgb = np.clip(_P3_TO_SRGB @ _lin(rgb01), 0, 1)
    p3 = _enc(_SRGB_TO_P3 @ srgb)
    return [round(float(v) * 255, 1) for v in p3]


def parse_icon_color(cstr):
    kind, vals = cstr.split(":")
    v = [float(x) for x in vals.split(",")]
    if kind == "display-p3":
        return p3_to_render(v[:3])
    if kind == "gray":
        return srgb_to_render([v[0]] * 3)
    if kind == "srgb":
        return srgb_to_render(v[:3])
    raise ValueError(cstr)


# measured automatic-gradient ladder (probe-autogradient --fit, gray rows):
# input value v (0..1) -> encoded-sRGB span of the derived gradient.
_AG_V = np.array([0, .05, .1, .15, .2, .25, .3, .35, .4, .45, .5, .55, .6,
                  .65, .7, .75, .8, .85, .9, .95, 1.0])
_AG_SPAN = np.array([9.8, 9.5, 9.2, 8.6, 8.1, 7.1, 14.3, 13.0, 12.3, 11.1,
                     10.0, 17.7, 15.9, 13.1, 10.8, 9.0, 10.2, 11.0, 12.0,
                     12.1, 11.9])
_AG_FLIP = 0.775  # above this lightness the gradient anchors at the top


def auto_gradient(rgb01):
    # returns (top_render, bottom_render) — colored inputs approximate
    L = float(np.max(rgb01))
    span = float(np.interp(L, _AG_V, _AG_SPAN)) / 255.0
    srgb = np.clip(_P3_TO_SRGB @ _lin(rgb01), 0, 1) if True else None
    base = np.clip(np.asarray(rgb01, np.float64), 0, 1)
    if L < _AG_FLIP:
        top = np.clip(base + span, 0, 1)
        bottom = base
    else:
        top = base
        bottom = np.clip(base - span, 0, 1)
    return srgb_to_render(top), srgb_to_render(bottom)


# ---------------- SVG path machinery (shared with build_recipe.py) --------
def arc_to_cubics(cur, rx, ry, rot, laf, swf, end):
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
    last_c = None; last_q = None
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
                C = "L"
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
    return cubics


def parse_transform(t):
    M = np.eye(3)
    for name, args in re.findall(r"(\w+)\(([^)]*)\)", t or ""):
        v = [float(x) for x in re.findall(NUM, args)]
        if name == "matrix":
            A = np.array([[v[0], v[2], v[4]], [v[1], v[3], v[5]], [0, 0, 1]])
        elif name == "translate":
            A = np.eye(3); A[0, 2] = v[0]; A[1, 2] = v[1] if len(v) > 1 else 0
        elif name == "scale":
            A = np.eye(3); A[0, 0] = v[0]; A[1, 1] = v[1] if len(v) > 1 else v[0]
        elif name == "rotate":
            r = math.radians(v[0]); c, s = math.cos(r), math.sin(r)
            A = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
            if len(v) == 3:
                T1 = np.eye(3); T1[0, 2], T1[1, 2] = v[1], v[2]
                T2 = np.eye(3); T2[0, 2], T2[1, 2] = -v[1], -v[2]
                A = T1 @ A @ T2
        else:
            A = np.eye(3)
        M = M @ A
    return M


# ---------------- SVG element walk with per-subpath fills -----------------
NAMED = {"white": (1, 1, 1), "black": (0, 0, 0), "red": (1, 0, 0),
         "none": None, "transparent": None}


def parse_svg_color(s):
    # -> None (nothing painted) | ("srgb"|"p3", (r,g,b) 0..1) | "UNPARSED"
    s = (s or "").strip()
    if not s or s in ("none", "transparent"):
        return None
    if s.startswith("#"):
        h = s[1:]
        if len(h) == 3: h = "".join(c * 2 for c in h)
        if len(h) >= 6:
            return ("srgb", tuple(int(h[i:i+2], 16) / 255 for i in (0, 2, 4)))
    m = re.match(r"rgba?\(([^)]+)\)", s)
    if m:
        v = [float(x.strip().rstrip("%")) for x in m.group(1).split(",")]
        sc = [x / 100 if "%" in m.group(1) else x / 255 for x in v[:3]]
        return ("srgb", tuple(min(max(c, 0), 1) for c in sc))
    # CSS Color 4: color(display-p3 r g b [/ a]) — the modern export idiom
    m = re.match(r"color\(\s*(display-p3|srgb)\s+([^)]+)\)", s)
    if m:
        comps = [float(x) for x in re.findall(NUM, m.group(2).split("/")[0])]
        space = "p3" if m.group(1) == "display-p3" else "srgb"
        return (space, tuple(min(max(c, 0), 1) for c in comps[:3]))
    if s in NAMED:
        c = NAMED[s]
        return None if c is None else ("srgb", c)
    if s.lower() == "currentcolor":
        return ("srgb", (0, 0, 0))
    return "UNPARSED"


def svg_color_to_render(spec):
    space, c = spec
    return p3_to_render(c) if space == "p3" else srgb_to_render(c)


# CoreSVG gradient-stop law (measured 2026-08-17, probe-gradient-law.py):
# stops — and only stops; solid fills are exact — pass through a working
# space that clamps linear green to a range set by the other channels
# (G' = clamp(G, kR*R + kB*B, span + kR*R + kB*B)), then the ramp is a
# plain lerp of the clamped stops in encoded sRGB. Fit RMSE 0.18/255
# over a 4x4x4 stop grid; all ten instrument pair-curves <= 1.2 RMSE.
_STOP_KR, _STOP_KB, _STOP_SPAN = 0.0185, 0.0320, 0.9540


def gradient_stop_srgb(spec):
    # resolved stop color -> composite-space sRGB 0..1 with the stop law
    space, c = spec
    srgb = np.clip(_P3_TO_SRGB @ _lin(c), 0, 1) if space == "p3" else _lin(np.clip(c, 0, 1))
    lo = _STOP_KR * srgb[0] + _STOP_KB * srgb[2]
    g = np.clip(srgb[1], lo, lo + _STOP_SPAN)
    return np.array([srgb[0], g, srgb[2]])


def gradient_stop_to_render(spec):
    p3 = _enc(_SRGB_TO_P3 @ gradient_stop_srgb(spec))
    return [round(float(v) * 255, 1) for v in p3]


def attr(attrs, name, style):
    v = re.findall(rf'{name}="([^"]*)"', attrs)
    if v:
        return v[0]
    m = re.search(rf"(?:^|;)\s*{name}\s*:\s*([^;]+)", style or "")
    return m.group(1).strip() if m else None


def shape_to_path_d(tag, attrs):
    def f(n, d=0.0):
        v = re.findall(rf'{n}="([^"]*)"', attrs)
        return float(v[0]) if v else d
    if tag == "rect":
        x, y, w, h = f("x"), f("y"), f("width"), f("height")
        rx = f("rx", f("ry")); ry = f("ry", rx)
        if rx > 0 or ry > 0:
            rx, ry = min(rx or ry, w / 2), min(ry or rx, h / 2)
            return (f"M{x+rx},{y} L{x+w-rx},{y} A{rx},{ry} 0 0 1 {x+w},{y+ry} "
                    f"L{x+w},{y+h-ry} A{rx},{ry} 0 0 1 {x+w-rx},{y+h} "
                    f"L{x+rx},{y+h} A{rx},{ry} 0 0 1 {x},{y+h-ry} "
                    f"L{x},{y+ry} A{rx},{ry} 0 0 1 {x+rx},{y} Z")
        return f"M{x},{y} L{x+w},{y} L{x+w},{y+h} L{x},{y+h} Z"
    if tag in ("circle", "ellipse"):
        cx, cy = f("cx"), f("cy")
        rx = f("r") if tag == "circle" else f("rx")
        ry = f("r") if tag == "circle" else f("ry")
        return (f"M{cx-rx},{cy} A{rx},{ry} 0 1 0 {cx+rx},{cy} "
                f"A{rx},{ry} 0 1 0 {cx-rx},{cy} Z")
    if tag == "polygon":
        pts = re.findall(NUM, re.findall(r'points="([^"]*)"', attrs)[0])
        d = "M" + ",".join(pts[:2]) + " " + " ".join(
            "L" + pts[i] + "," + pts[i+1] for i in range(2, len(pts) - 1, 2))
        return d + " Z"
    return None


def parse_gradients(s):
    grads = {}
    for m in re.finditer(r"<linearGradient([^>]*)>(.*?)</linearGradient>", s, re.S):
        attrs, body = m.group(1), m.group(2)
        gid = re.findall(r'id="([^"]*)"', attrs)
        if not gid:
            continue
        def f(n, d):
            v = re.findall(rf'{n}="([^"]*)"', attrs)
            return v[0] if v else d
        stops = []
        for sm in re.finditer(r"<stop([^>]*)/?>", body):
            sa = sm.group(1)
            st = attr(sa, "style", None)
            col = attr(sa, "stop-color", st) or "#000"
            off = attr(sa, "offset", st) or "0"
            c = parse_svg_color(col if not col.startswith("stop-color") else col)
            stops.append((float(off.rstrip("%")) / (100 if "%" in off else 1), c))
        grads[gid[0]] = {
            "x1": f("x1", "0"), "y1": f("y1", "0"),
            "x2": f("x2", "1" if f("gradientUnits", "objectBoundingBox") == "objectBoundingBox" else "0"),
            "y2": f("y2", "0"),
            "units": f("gradientUnits", "objectBoundingBox"),
            "transform": f("gradientTransform", ""),
            "stops": stops,
        }
    # radial gradients: record ids so fills can fall back with a warning
    radial = set(re.findall(r'<radialGradient[^>]*id="([^"]*)"', s))
    return grads, radial


def svg_elements(path):
    # -> (viewBox, [ {cubics, rule, fill: solid rgb01 | ('grad', id), op} ]),
    #    gradients dict, radial-id set, stroke count
    s = open(path).read()
    vb = [float(v) for v in re.findall(r'viewBox="([^"]+)"', s)[0].split()]
    grads, radial = parse_gradients(s)
    root_fill = re.findall(r'<svg[^>]*\sfill="([^"]*)"', s)
    els = []
    strokes = 0
    clipped = 0
    uses = 0
    hidden = 0  # depth inside non-rendered containers (defs/clipPath/mask/...)
    HIDE = ("defs", "clipPath", "mask", "symbol", "pattern")
    stack = [(np.eye(3), root_fill[0] if root_fill else None, 1.0)]
    for m in re.finditer(
        r"<(g|path|rect|circle|ellipse|polygon|use|defs|clipPath|mask|symbol|pattern"
        r"|/g|/defs|/clipPath|/mask|/symbol|/pattern)([^>]*?)(/?)>",
        s,
    ):
        tag, attrs, selfclose = m.group(1), m.group(2), m.group(3)
        if tag in HIDE:
            if selfclose != "/":
                hidden += 1
            continue
        if tag.startswith("/") and tag[1:] in HIDE:
            hidden = max(hidden - 1, 0)
            continue
        if hidden:
            if tag == "g" and selfclose != "/":
                hidden += 1  # nested groups inside hidden containers
            elif tag == "/g":
                hidden = max(hidden - 1, 0)
            continue
        if tag == "use":
            if not hidden:
                uses += 1
            continue
        style = attr(attrs, "style", None)
        if tag == "g":
            tr = attr(attrs, "transform", style)
            fill = attr(attrs, "fill", style)
            op = attr(attrs, "opacity", style)
            parent = stack[-1]
            stack.append((parent[0] @ (parse_transform(tr) if tr else np.eye(3)),
                          fill if fill is not None else parent[1],
                          parent[2] * float(op) if op else parent[2]))
            if selfclose == "/":
                stack.pop()
            continue
        if tag == "/g":
            if len(stack) > 1:
                stack.pop()
            continue
        d = attr(attrs, "d", None) if tag == "path" else shape_to_path_d(tag, attrs)
        if not d:
            continue
        parent = stack[-1]
        tr = attr(attrs, "transform", style)
        M = parent[0] @ (parse_transform(tr) if tr else np.eye(3))
        if attr(attrs, "stroke", style) not in (None, "none"):
            strokes += 1
        if attr(attrs, "clip-path", style):
            clipped += 1
        fill_s = attr(attrs, "fill", style)
        if fill_s is None:
            fill_s = parent[1] if parent[1] is not None else "#000"
        op = parent[2]
        for nm in ("opacity", "fill-opacity"):
            v = attr(attrs, nm, style)
            if v:
                op *= float(v)
        gm = re.match(r"url\(#([^)]+)\)", fill_s.strip()) if fill_s else None
        if gm:
            fill = ("grad", gm.group(1))
        else:
            c = parse_svg_color(fill_s)
            if c == "UNPARSED":
                warn(f"unparsed fill '{fill_s}' -> black")
                c = ("srgb", (0, 0, 0))
            if c is None:
                continue  # fill:none, nothing painted (strokes unsupported)
            fill = c
        rule = attr(attrs, "fill-rule", style) or "nonzero"
        cubics = []
        for cu in parse_path(d):
            tc = []
            for (x, y) in cu:
                p = M @ np.array([x, y, 1.0])
                tc.append((float(p[0]), float(p[1])))
            cubics.append(tuple(tc))
        if cubics:
            els.append({"cubics": cubics, "rule": rule, "fill": fill, "op": op})
    return vb, els, grads, radial, strokes, clipped, uses


# ---------------- icon.json walk ------------------------------------------
def light_value(spec, key):
    if key in spec:
        return spec[key]
    sp = spec.get(key + "-specializations")
    if sp:
        for e in sp:
            if "appearance" not in e:
                return e["value"]
    return None


doc = json.load(open(os.path.join(a.bundle, "icon.json")))

for g in doc.get("groups", []):
    for l in g.get("layers", []):
        if light_value(l, "glass") is True:
            raise SystemExit(f"NOT FLAT: layer {l.get('name')} is glass")

bg = []

# canvas fill -> full-bleed rect path (engine's path-gradient handles any
# orientation, unlike the fixed 0..1024 vgrad)
CANVAS_SEG = []
for cu in parse_path("M0,0 L1024,0 L1024,1024 L0,1024 Z"):
    for (x, y) in cu:
        CANVAS_SEG.extend([x, y])


def fill_desc_from_icon(fill):
    if "solid" in fill:
        return {"t": "solid", "c": parse_icon_color(fill["solid"])}
    if "linear-gradient" in fill:
        o = fill.get("orientation", {"start": {"x": 0.5, "y": 0}, "stop": {"x": 0.5, "y": 1}})
        return {"t": "lin",
                "c0": parse_icon_color(fill["linear-gradient"][0]),
                "c1": parse_icon_color(fill["linear-gradient"][-1]),
                "x0": o["start"]["x"] * 1024, "y0": o["start"]["y"] * 1024,
                "x1": o["stop"]["x"] * 1024, "y1": o["stop"]["y"] * 1024}
    if "automatic-gradient" in fill:
        kind, vals = fill["automatic-gradient"].split(":")
        v = [float(x) for x in vals.split(",")][:3]
        if kind == "gray":
            v = [v[0]] * 3
        elif kind == "display-p3":
            v = list(np.clip(_P3_TO_SRGB @ _lin(v), 0, 1))
        top, bottom = auto_gradient(v)
        warn("automatic-gradient translated from measured ladder (approx for colored inputs)")
        return {"t": "lin", "c0": top, "c1": bottom,
                "x0": 512, "y0": 0, "x1": 512, "y1": 1024}
    raise ValueError(f"unsupported canvas fill {fill}")


canvas_fill = light_value(doc, "fill")
if canvas_fill:
    bg.append({"t": "path", "seg": [round(v, 1) for v in CANVAS_SEG],
               "rule": "nonzero", "fill": fill_desc_from_icon(canvas_fill)})

for g in reversed(doc.get("groups", [])):
    if g.get("hidden"):
        continue
    g_op = light_value(g, "opacity")
    g_op = 1.0 if g_op is None else g_op
    bm = light_value(g, "blend-mode")
    if bm not in (None, "normal"):
        warn(f"group blend-mode '{bm}' unsupported, treated as normal")
    for l in reversed(g.get("layers", [])):
        op = light_value(l, "opacity")
        if op == 0:
            continue
        op = (1.0 if op is None else op) * g_op
        name = l["image-name"]
        if not name.lower().endswith(".svg"):
            raise SystemExit(f"NOT SVG: layer art {name}")
        vb, els, grads, radial, strokes, clipped, uses = svg_elements(
            os.path.join(a.bundle, "Assets", name))
        if strokes:
            warn(f"{name}: {strokes} stroked element(s) ignored")
        if clipped:
            warn(f"{name}: {clipped} element(s) use clip-path (rendered unclipped)")
        if uses:
            warn(f"{name}: {uses} <use> element(s) not instantiated")
        natural = max(vb[2], vb[3])
        pos = l.get("position", {})
        sc = pos.get("scale", 1024.0 / natural)
        tr = pos.get("translation-in-points", [0.0, 0.0])
        ox = (1024.0 - vb[2] * sc) / 2 + tr[0]
        oy = (1024.0 - vb[3] * sc) / 2 + tr[1]

        def to_canvas(x, y):
            return ((x - vb[0]) * sc + ox, (y - vb[1]) * sc + oy)

        override = light_value(l, "fill")

        for el in els:
            seg = []
            xs, ys = [], []
            for cu in el["cubics"]:
                for (x, y) in cu:
                    cx, cy = to_canvas(x, y)
                    seg.append(round(cx, 2))
                    seg.append(round(cy, 2))
                    xs.append(cx); ys.append(cy)
            if override:
                fdesc = fill_desc_from_icon(override)
                if fdesc["t"] == "lin" and "x0" not in fdesc:
                    pass
            elif isinstance(el["fill"], tuple) and el["fill"][0] == "grad":
                gid = el["fill"][1]
                if gid in radial:
                    warn(f"radial gradient #{gid} -> midpoint solid")
                    fdesc = {"t": "solid", "c": svg_color_to_render(("srgb", (0.5, 0.5, 0.5)))}
                elif gid in grads:
                    gr = grads[gid]
                    stops = [s2 for s2 in gr["stops"] if s2[1] is not None]
                    if len(stops) < 2:
                        warn(f"gradient #{gid}: <2 usable stops -> solid")
                        c = stops[0][1] if stops else ("srgb", (0, 0, 0))
                        fdesc = {"t": "solid", "c": svg_color_to_render(c)}
                    else:
                        if len(stops) > 2:
                            warn(f"gradient #{gid}: {len(stops)} stops, using endpoints")
                        stops.sort(key=lambda s2: s2[0])
                        GM = parse_transform(gr["transform"])
                        def gpt(xs_, ys_):
                            if gr["units"] == "userSpaceOnUse":
                                p = GM @ np.array([float(xs_), float(ys_), 1.0])
                                return to_canvas(p[0], p[1])
                            bx0, bx1 = min(xs), max(xs)
                            by0, by1 = min(ys), max(ys)
                            fx = float(str(xs_).rstrip("%")) / (100 if "%" in str(xs_) else 1)
                            fy = float(str(ys_).rstrip("%")) / (100 if "%" in str(ys_) else 1)
                            return (bx0 + fx * (bx1 - bx0), by0 + fy * (by1 - by0))
                        p0 = gpt(gr["x1"], gr["y1"])
                        p1 = gpt(gr["x2"], gr["y2"])
                        fdesc = {"t": "lin",
                                 "c0": gradient_stop_to_render(stops[0][1]),
                                 "c1": gradient_stop_to_render(stops[-1][1]),
                                 "x0": round(p0[0], 1), "y0": round(p0[1], 1),
                                 "x1": round(p1[0], 1), "y1": round(p1[1], 1)}
                else:
                    warn(f"gradient #{gid} not found -> black")
                    fdesc = {"t": "solid", "c": [0, 0, 0]}
            else:
                fdesc = {"t": "solid", "c": svg_color_to_render(el["fill"])}
            lay = {"t": "path", "seg": seg, "rule": el["rule"], "fill": fdesc}
            eff_op = op * el["op"]
            if eff_op != 1:
                lay["op"] = round(eff_op, 3)
            bg.append(lay)

recipe = {"bg": bg, "dluts": [], "glass": []}
os.makedirs(os.path.join(a.outdir, "recipes"), exist_ok=True)
out = os.path.join(a.outdir, "recipes", f"{a.id}.mjs")
open(out, "w").write(
    f"// recipes/{a.id}.mjs — Liquid Glass recipe (data only).\n"
    f"// TRANSLATED by packages/engine/tools/translate_icon.py from "
    f"{os.path.basename(a.bundle)} — zero ictool measurement.\n"
    "export const recipe = " + json.dumps(recipe, separators=(",", ":")) + ";\n")
print(f"wrote {out}: {os.path.getsize(out)} bytes, {len(bg)} bg layers, "
      f"{len(warnings)} warning(s)")
