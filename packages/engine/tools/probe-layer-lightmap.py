# Probe: per-LAYER / per-CONTOUR glass-lighting parameterization — the
# iteration on probe-lightmap-lut.py's silhouette-union (d x phi) LUT,
# which failed on thin features (podcastrepublic ring R^2 0.19: nearest-
# edge binning conflates the ring's inner/outer edges).
#
# Model family measured here: the residual lightmap as an ADDITIVE field
# of per-contour edge kernels,
#
#     L(p) = sum over contours c of K( s_c(p), phi_c(p) [, T_c(p)] )
#
# where s_c = signed distance to contour c (+ on the glass side), phi_c =
# local inside-pointing normal angle, and T_c = local feature thickness at
# the nearest edge point (the thin-feature axis). K is fit by least
# squares (bins are shared across contours/layers/bundles), so a ring's
# inner and outer edges get separate, superposing contributions instead
# of a conflated nearest-edge bin.
#
# Ground truth: fresh 1024 residual fields L = luma(GT - pass1) from
# ictool renders + this engine's pass-1 recipes (the same field the
# recipe bake quantizes), NOT the baked lm-res-128 recipe lightmaps
# (8px texels are too coarse for edge analysis).
#
# Subcommands (workdir defaults to $PROBE_WORK or /tmp/probe-layer-lightmap):
#   gen       author instrument bundles (rings/bars/disk/wedge on gray),
#             render GT + build pass-1 recipes + residual fields for them
#             and the catalog glass bundles (macOS + ictool + node)
#   fit       compute per-contour fields, fit/evaluate the model ladder
#             (union baseline, per-layer, per-contour, +thickness), report
#             per-bundle R^2, cross-bundle K correlation, transfer R^2
#   endtoend  leave-target-out K fit -> predicted lightmap -> inject into
#             the pass-1 recipe -> render -> RMSE vs ictool GT at 1024/64
#
#   $PYTHON packages/engine/tools/probe-layer-lightmap.py gen|fit|endtoend
#
# Requires numpy + Pillow; gen/endtoend also need ictool and node.

import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import zlib

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ENGDIR = os.path.join(HERE, "..")
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool"
PY = sys.executable

REAL = {
    "apple": "platforms/apple/ApplePodcasts.icon",
    "overcast": "platforms/overcast/Overcast.icon",
    "overcast-premiumblue": "platforms/overcast/Overcast-PremiumBlue.icon",
    "podcastrepublic": "platforms/podcastrepublic/PodcastRepublic.icon",
}
INSTRUMENTS = ["disk", "ring24", "ring56", "ring120", "barh", "barv", "wedge",
               "diskw", "ring56w", "diskd"]
FILLS = {"diskw": "#ffffff", "ring56w": "#ffffff", "diskd": "#333333"}

GRID = 512            # analysis grid (canvas px = 2x grid px)
S = 1024 / GRID
# signed distance bins, canvas px: fine near the edge, coarse deep inside
# (blob interiors carry a real glow field, e.g. apple's radial glow)
DB = np.concatenate([np.arange(-16, 48, 2), np.arange(48, 168 + 8, 8)])
NPHI = 16
TCLASS = [0.0, 48.0, 120.0, 1e9]   # thickness classes, canvas px
ND = len(DB) - 1
NT = len(TCLASS) - 1


# ---------------------------------------------------------------- gen
def circle_cubics(cx, cy, r):
    k = 0.5522847498 * r
    return [((cx + r, cy), (cx + r, cy + k), (cx + k, cy + r), (cx, cy + r)),
            ((cx, cy + r), (cx - k, cy + r), (cx - r, cy + k), (cx - r, cy)),
            ((cx - r, cy), (cx - r, cy - k), (cx - k, cy - r), (cx, cy - r)),
            ((cx, cy - r), (cx + k, cy - r), (cx + r, cy - k), (cx + r, cy))]


def line_cubic(p0, p3):
    return (p0,
            (p0[0] + (p3[0] - p0[0]) / 3, p0[1] + (p3[1] - p0[1]) / 3),
            (p0[0] + 2 * (p3[0] - p0[0]) / 3, p0[1] + 2 * (p3[1] - p0[1]) / 3),
            p3)


def rrect_cubics(x0, y0, x1, y1, r):
    k = 0.5522847498 * r
    return [
        line_cubic((x0 + r, y0), (x1 - r, y0)),
        ((x1 - r, y0), (x1 - r + k, y0), (x1, y0 + r - k), (x1, y0 + r)),
        line_cubic((x1, y0 + r), (x1, y1 - r)),
        ((x1, y1 - r), (x1, y1 - r + k), (x1 - r + k, y1), (x1 - r, y1)),
        line_cubic((x1 - r, y1), (x0 + r, y1)),
        ((x0 + r, y1), (x0 + r - k, y1), (x0, y1 - r + k), (x0, y1 - r)),
        line_cubic((x0, y1 - r), (x0, y0 + r)),
        ((x0, y0 + r), (x0, y0 + r - k), (x0 + r - k, y0), (x0 + r, y0)),
    ]


def shape_cubics(slug):
    slug = slug.rstrip("wd") if slug in FILLS else slug
    if slug == "disk":
        return circle_cubics(512, 512, 320)
    if slug.startswith("ring"):
        w = int(slug[4:])
        return circle_cubics(512, 512, 300) + circle_cubics(512, 512, 300 - w)
    if slug == "barh":
        return rrect_cubics(192, 488, 832, 536, 24)
    if slug == "barv":
        return rrect_cubics(488, 192, 536, 832, 24)
    if slug == "wedge":
        pts = [(362, 312), (742, 512), (362, 712)]
        return [line_cubic(pts[i], pts[(i + 1) % 3]) for i in range(3)]
    raise ValueError(slug)


def instrument_svg(slug):
    cubics = shape_cubics(slug)
    parts = []
    prev_end = None
    for c in cubics:
        if prev_end is None or c[0] != prev_end:
            parts.append(f"M{c[0][0]:.3f} {c[0][1]:.3f}")
        parts.append(f"C{c[1][0]:.3f} {c[1][1]:.3f} {c[2][0]:.3f} {c[2][1]:.3f} {c[3][0]:.3f} {c[3][1]:.3f}")
        prev_end = c[3]
    d = " ".join(parts) + " Z"
    fill = FILLS.get(slug, "#888888")
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">'
            f'<path fill-rule="evenodd" fill="{fill}" d="{d}"/></svg>')


def write_instrument(slug, dirpath):
    os.makedirs(os.path.join(dirpath, "Assets"), exist_ok=True)
    open(os.path.join(dirpath, "Assets", "shape.svg"), "w").write(instrument_svg(slug))
    doc = {
        "fill": {"solid": "srgb:0.60000,0.60000,0.60000,1.00000"},
        "groups": [{
            "hidden": False,
            "layers": [{"image-name": "shape.svg", "name": "shape", "glass": True}],
            "shadow": {"kind": "neutral", "opacity": 0.5},
            "blend-mode": "normal", "lighting": "individual", "specular": True,
            "translucency": {"enabled": True, "value": 0.5},
        }],
        "supported-platforms": {"circles": ["watchOS"], "squares": "shared"},
    }
    json.dump(doc, open(os.path.join(dirpath, "icon.json"), "w"), indent=1)


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)}\n{r.stdout[-800:]}\n{r.stderr[-800:]}")
    return r.stdout


def gen(work, slugs):
    for slug in slugs:
        d = os.path.join(work, slug)
        os.makedirs(d, exist_ok=True)
        if slug in REAL:
            bundle = os.path.join(REPO, REAL[slug])
        else:
            bundle = os.path.join(d, f"{slug}.icon")
            if not os.path.isdir(bundle):
                write_instrument(slug, bundle)
        gt = os.path.join(d, "gt.png")
        if not os.path.exists(gt):
            run([ICTOOL, bundle, "--export-image", "--output-file", gt,
                 "--platform", "macOS", "--rendition", "Default",
                 "--width", "1024", "--height", "1024", "--scale", "1"])
        rec = os.path.join(d, "recipes", f"{slug}.mjs")
        if not os.path.exists(rec):
            try:
                out = run([PY, os.path.join(HERE, "build_recipe.py"), "--bundle", bundle,
                           "--gt", gt, "--id", slug, "--outdir", d])
                print(out.strip().splitlines()[-1])
            except RuntimeError as e:
                if slug in REAL:
                    raise
                # thin instruments: no interior survives the two-gray
                # erosion. The glass material family is measured to be
                # universal (calibration/glass-material-family.json), so
                # reuse the disk instrument's measured material with this
                # geometry's own silhouette.
                print(f"{slug}: builder failed (thin feature) -> synthesizing "
                      "recipe from disk's measured material")
                disk_rec = load_recipe(os.path.join(work, "disk", "recipes", "disk.mjs"))
                dg = disk_rec["glass"][0]
                seg = []
                for c in shape_cubics(slug):
                    for (x, y) in c:
                        seg.extend([round(x, 3), round(y, 3)])
                entry = {"path": seg, "law": dg["law"], "alpha": dg["alpha"],
                         "gc": dg["gc"], "shadow": dg["shadow"], "lm": None}
                rj = {"bg": disk_rec["bg"], "dluts": [], "glass": [entry],
                      "bodyLight": True, "lm": None}
                os.makedirs(os.path.dirname(rec), exist_ok=True)
                open(rec, "w").write("export const recipe = " + json.dumps(rj, separators=(",", ":")) + ";\n")
        p1 = os.path.join(d, "pass1.png")
        if not os.path.exists(p1):
            run(["node", os.path.join(HERE, "render.mjs"), ENGDIR, rec, p1, "1024", "--p3"])
        ng = os.path.join(d, "noglass.png")
        if not os.path.exists(ng):
            # base under the glass, from the recipe alone (bg + bodyLight,
            # no glass): the reference field for material-ramp bases
            rj = load_recipe(rec)
            rj["glass"] = []
            ngrec = os.path.join(d, "recipes", f"{slug}-noglass.mjs")
            open(ngrec, "w").write("export const recipe = " + json.dumps(rj, separators=(",", ":")) + ";\n")
            run(["node", os.path.join(HERE, "render.mjs"), ENGDIR, ngrec, ng, "1024", "--p3"])
        resid = os.path.join(d, "resid.npy")
        if not os.path.exists(resid):
            GT = np.asarray(Image.open(gt).convert("RGBA")).astype(np.float64)
            R1 = np.asarray(Image.open(p1).convert("RGBA")).astype(np.float64)
            w = np.minimum(GT[..., 3], R1[..., 3]) / 255.0
            Y = ((GT[..., :3] - R1[..., :3]) * w[..., None]).mean(axis=2)
            np.save(resid, Y.astype(np.float32))
            rms = float(np.sqrt((Y ** 2).mean()))
            print(f"{slug:22s} residual field rms {rms:6.2f}")
        else:
            print(f"{slug:22s} cached")


# ------------------------------------------------------- geometry fields
def load_recipe(path):
    src = open(path).read()
    m = re.search(r"export const recipe = (\{.*\});", src, re.S)
    return json.loads(m.group(1))


def contours_of(seg):
    """Split a flat cubic seg list into closed contours (recipe paths
    concatenate subpaths; a new contour starts where segment i's start
    point != segment i-1's end point)."""
    cs, cur = [], []
    prev_end = None
    for i in range(0, len(seg), 8):
        c = seg[i:i + 8]
        if prev_end is not None and (abs(c[0] - prev_end[0]) > 1e-6 or abs(c[1] - prev_end[1]) > 1e-6):
            cs.append(cur)
            cur = []
        cur.append(c)
        prev_end = (c[6], c[7])
    if cur:
        cs.append(cur)
    return cs


def polyline(contour, spacing=0.75):
    """Flatten a contour ADAPTIVELY to ~spacing px chords (a fixed t-step
    leaves 30px chords on big arcs, which wrecks nearest-sample distance
    and normal estimates)."""
    pts = []
    for c in contour:
        p = np.array(c, np.float64).reshape(4, 2)
        approx = (np.hypot(*(p[1] - p[0])) + np.hypot(*(p[2] - p[1]))
                  + np.hypot(*(p[3] - p[2])))
        n = max(3, int(np.ceil(approx / spacing)) + 1)
        t = np.linspace(0, 1, n)[:, None]
        mt = 1 - t
        xy = mt**3 * p[0] + 3 * mt**2 * t * p[1] + 3 * mt * t**2 * p[2] + t**3 * p[3]
        pts.append(xy[:-1])
    P = np.vstack(pts)
    # decimate to >= spacing arc length
    keep = [0]
    acc = 0.0
    for i in range(1, len(P)):
        acc += float(np.hypot(*(P[i] - P[i - 1])))
        if acc >= spacing:
            keep.append(i)
            acc = 0.0
    return P[keep]


def rast_parity(contours, grid=GRID):
    """Even-odd coverage of a set of closed contours (matches the
    engine's default glass fill rule)."""
    E = []
    for cont in contours:
        P = polyline(cont, spacing=0.5) / S
        Q = np.vstack([P, P[:1]])
        for j in range(len(Q) - 1):
            if Q[j][1] != Q[j + 1][1]:
                E.append((Q[j][0], Q[j][1], Q[j + 1][0], Q[j + 1][1]))
    E = np.array(E)
    cov = np.zeros((grid, grid), bool)
    for row in range(grid):
        yy = row + 0.5
        m = (np.minimum(E[:, 1], E[:, 3]) <= yy) & (np.maximum(E[:, 1], E[:, 3]) > yy)
        if not m.any():
            continue
        e = E[m]
        xs = np.sort(e[:, 0] + (yy - e[:, 1]) * (e[:, 2] - e[:, 0]) / (e[:, 3] - e[:, 1]))
        for a, b in zip(xs[0::2], xs[1::2]):
            cov[row, max(int(np.ceil(a - 0.5)), 0): min(int(np.floor(b + 0.5)) + 1, grid)] = True
    return cov


def contour_normals(P, cov):
    """Inward-pointing unit normals at each polyline sample (smoothed
    over ~3px of arc, oriented by a coverage probe)."""
    Q = np.vstack([P, P[:1]])
    tang = Q[1:] - Q[:-1]
    # smooth tangents a little (sample spacing is sub-pixel)
    k = 5
    tw = np.vstack([np.roll(tang, s2, axis=0) for s2 in range(-(k // 2), k // 2 + 1)]).reshape(k, -1, 2).mean(axis=0)
    L = np.hypot(tw[:, 0], tw[:, 1])
    L[L == 0] = 1
    nx = -tw[:, 1] / L
    ny = tw[:, 0] / L
    xi = np.clip(((P[:, 0] + nx * 4) / S).astype(int), 0, GRID - 1)
    yi = np.clip(((P[:, 1] + ny * 4) / S).astype(int), 0, GRID - 1)
    flip = ~cov[yi, xi]
    nx = np.where(flip, -nx, nx)
    ny = np.where(flip, -ny, ny)
    return nx, ny


def contour_field(P, inside, cov):
    """Distance + nearest-sample index from every grid pixel to polyline
    P (canvas coords); returns signed distance (canvas px, + on the glass
    side), inside-pointing normal angle phi (the CONTOUR's normal at the
    nearest sample — the (p - e) direction is tangent-dominated garbage
    near the edge), nearest sample index."""
    gy, gx = np.mgrid[0:GRID, 0:GRID]
    px = ((gx + 0.5) * S).ravel().astype(np.float32)
    py = ((gy + 0.5) * S).ravel().astype(np.float32)
    Q = P.astype(np.float32)
    n = px.shape[0]
    dist = np.empty(n, np.float32)
    idx = np.empty(n, np.int32)
    chunk = max(1, int(64e6 // (4 * max(len(Q), 1))))
    for i in range(0, n, chunk):
        dx = px[i:i + chunk, None] - Q[None, :, 0]
        dy = py[i:i + chunk, None] - Q[None, :, 1]
        d2 = dx * dx + dy * dy
        j = np.argmin(d2, axis=1)
        idx[i:i + chunk] = j
        dist[i:i + chunk] = np.sqrt(d2[np.arange(len(j)), j])
    dist = dist.reshape(GRID, GRID)
    idx = idx.reshape(GRID, GRID)
    sgn = np.where(inside, 1.0, -1.0).astype(np.float32)
    s = dist * sgn
    nx, ny = contour_normals(P, cov)
    phi = np.arctan2(ny[idx.ravel()], nx[idx.ravel()]).reshape(GRID, GRID).astype(np.float32)
    return s, phi, idx


def sample_thickness(P, cov):
    """Feature thickness at each contour sample: march along the
    inward normal until coverage exits (canvas px)."""
    n = len(P)
    T = np.full(n, 1e9, np.float32)
    nx, ny = contour_normals(P, cov)

    def inside_at(x, y):
        xi = np.clip((x / S).astype(int), 0, GRID - 1)
        yi = np.clip((y / S).astype(int), 0, GRID - 1)
        return cov[yi, xi]

    alive = np.ones(n, bool)
    for t in np.arange(3.0, 400.0, 2.0):
        ins = inside_at(P[:, 0] + nx * t, P[:, 1] + ny * t)
        newly = alive & ~ins & (t > 6.0)
        T[newly] = t
        alive &= ~newly
        if not alive.any():
            break
    T[T > 9e8] = 400.0
    return T


def bundle_fields(work, slug):
    """Residual field at GRID + per-contour (s, phi, T) fields + the
    no-glass base luma (for material-ramp bases)."""
    d = os.path.join(work, slug)
    Y = np.load(os.path.join(d, "resid.npy")).astype(np.float64)
    Yg = Y.reshape(GRID, 2, GRID, 2).mean(axis=(1, 3))
    B = np.asarray(Image.open(os.path.join(d, "noglass.png")).convert("RGB")).astype(np.float64).mean(axis=2)
    Bg = B.reshape(GRID, 2, GRID, 2).mean(axis=(1, 3))
    rec = load_recipe(os.path.join(d, "recipes", f"{slug}.mjs"))
    # per-glass-layer DECLARED translucency, from the bundle's icon.json
    # (build_recipe traversal order; undeclared -> 0.0, i.e. ramp-free)
    bundle = os.path.join(REPO, REAL[slug]) if slug in REAL else os.path.join(d, f"{slug}.icon")
    doc = json.load(open(os.path.join(bundle, "icon.json")))
    transls = []
    for grp in reversed(doc.get("groups", [])):
        if grp.get("hidden"):
            continue
        tr = grp.get("translucency") or {}
        tv = float(tr.get("value", 0.0)) if tr.get("enabled", True) and tr else 0.0
        for l in reversed(grp.get("layers", [])):
            gl = l.get("glass")
            if gl is None:
                sp = l.get("glass-specializations") or []
                gl = next((e["value"] for e in sp if "appearance" not in e), None)
            if gl is True and l.get("opacity") != 0:
                transls.append(tv)
    layers = []
    for g in rec["glass"]:
        conts = contours_of(g["path"])
        cov = rast_parity(conts)
        fields = []
        for cont in conts:
            P = polyline(cont)
            if len(P) < 8:
                continue
            s, phi, idx = contour_field(P, cov, cov)
            T = sample_thickness(P, cov)
            Tpix = T[idx]
            fields.append({"s": s, "phi": phi, "T": Tpix})
        al0 = base64.b64decode(g["alpha"])[0] / 255.0
        layers.append({"cov": cov, "contours": fields, "al0": al0,
                       "gcL": float(np.mean(g["gc"])),
                       "transl": transls[len(layers)] if len(layers) < len(transls) else 0.0})
    # per-layer base luma: the recipe's own flat-material composite of
    # everything BELOW each layer (bottom-up recursion from the no-glass base)
    B = Bg.copy()
    for lay in layers:
        lay["base"] = B.copy()
        B = np.where(lay["cov"], (1 - lay["al0"]) * B + lay["al0"] * lay["gcL"], B)
    return Yg, layers, Bg


# family ramp: the measured alpha(y) curves per translucency
# (glass-material-family.json, slab rows y0=226..y1=798), interpolated
# over the layer's DECLARED translucency (undeclared -> t0, ramp-free)
_FAM = None


def family_ramp(transl=0.5):
    global _FAM
    if _FAM is None:
        fam = json.load(open(os.path.join(ENGDIR, "calibration", "glass-material-family.json")))
        ts = sorted(float(k[1:]) for k in fam if k.startswith("t"))
        _FAM = {"y0": fam["t0.5"]["y0"], "y1": fam["t0.5"]["y1"], "ts": ts,
                "curves": {t: np.array(fam[f"t{t}"]["alpha_full"], np.float64) for t in ts}}
    ts = _FAM["ts"]
    t = min(max(transl, ts[0]), ts[-1])
    i = max(1, np.searchsorted(ts, t))
    i = min(i, len(ts) - 1)
    t0, t1 = ts[i - 1], ts[i]
    f = (t - t0) / max(t1 - t0, 1e-9)
    alpha = (1 - f) * _FAM["curves"][t0] + f * _FAM["curves"][t1]
    return {"y0": _FAM["y0"], "y1": _FAM["y1"], "alpha": alpha}


def layer_ramp_unit(lay, anchor):
    """The material-law ramp for one glass layer, amplitude 1.0:

        ramp = (a_fam(y)/mean(a_fam) - 1) * alpha0 * (gcLuma - base(p)) * cov

    a_fam is the measured universal alpha(y) curve (translucency 0.5 row
    of glass-material-family.json); alpha0/gcLuma/base come from the
    recipe alone. The measured constant alpha0 is the interior mean, so
    only the RELATIVE family shape enters; amplitude scales with the
    contrast between the layer's flat material color and what's beneath
    it (sign flips for glass darker than its base - measured on the
    gray instruments vs podcastrepublic's white ring). The curve is the
    family row at the layer's DECLARED translucency (undeclared -> t0,
    which is ramp-free: measured on overcast, whose undeclared-translucency
    glass shows no ramp)."""
    fam = family_ramp(lay["transl"])
    gy = (np.mgrid[0:GRID, 0:GRID][0] + 0.5) * S
    cov = lay["cov"]
    if anchor == "canvas":
        yn = (gy - fam["y0"]) / (fam["y1"] - fam["y0"])
    else:
        ys = np.where(cov.any(axis=1))[0]
        ylo, yhi = (ys[0] + 0.5) * S, (ys[-1] + 0.5) * S
        yn = (gy - ylo) / max(yhi - ylo, 1e-9)
    a = np.interp(np.clip(yn, 0, 1), np.linspace(0, 1, len(fam["alpha"])), fam["alpha"])
    rel = a / float(fam["alpha"].mean()) - 1.0
    return (rel * lay["al0"] * (lay["gcL"] - lay["base"]) * cov).ravel()


def ramp_bases(layers, Bg, anchor):
    """Per-layer bases for the DIAGNOSTIC joint fit: the material-law ramp
    (fitted amplitude should be ~1 if the law transfers) plus a flat
    offset over the layer (absorbs constant-alpha measurement error)."""
    bases = []
    for lay in layers:
        bases.append(layer_ramp_unit(lay, anchor))
        bases.append(((lay["gcL"] - lay["base"]) / 255.0 * lay["cov"]).ravel())
    return bases


def derived_ramp(layers, Bg, anchor):
    """ZERO-FIT material ramp: the law at amplitude exactly 1."""
    out = np.zeros(GRID * GRID)
    for lay in layers:
        out += layer_ramp_unit(lay, anchor)
    return out.reshape(GRID, GRID)


# ------------------------------------------------------------- models
def bin_ids(s, phi, T=None):
    """(d, phi[, T]) -> flat bin id; -1 where out of the distance band."""
    di = np.digitize(s, DB) - 1
    ok = (di >= 0) & (di < ND)
    pi = ((phi + np.pi) / (2 * np.pi) * NPHI).astype(int) % NPHI
    if T is None:
        bid = di * NPHI + pi
    else:
        ti = np.digitize(T, TCLASS) - 1
        ti = np.clip(ti, 0, NT - 1)
        bid = (ti * ND + di) * NPHI + pi
    return np.where(ok, bid, -1)


def contributions(layers, model):
    """List of flat bin-id arrays (one per additive contribution)."""
    out = []
    if model == "union":
        # single nearest contribution across all contours (baseline)
        best_s = None
        best = None
        for lay in layers:
            for f in lay["contours"]:
                if best_s is None:
                    best_s = np.abs(f["s"])
                    best = bin_ids(f["s"], f["phi"])
                else:
                    m = np.abs(f["s"]) < best_s
                    best_s = np.where(m, np.abs(f["s"]), best_s)
                    nb = bin_ids(f["s"], f["phi"])
                    best = np.where(m, nb, best)
        out.append(best)
    elif model == "layer":
        # nearest contour WITHIN each layer, additive across layers
        for lay in layers:
            best_s = None
            best = None
            for f in lay["contours"]:
                if best_s is None:
                    best_s = np.abs(f["s"])
                    best = bin_ids(f["s"], f["phi"])
                else:
                    m = np.abs(f["s"]) < best_s
                    best_s = np.where(m, np.abs(f["s"]), best_s)
                    best = np.where(m, bin_ids(f["s"], f["phi"]), best)
            if best is not None:
                out.append(best)
    elif model in ("contour", "contourT"):
        useT = model == "contourT"
        for lay in layers:
            for f in lay["contours"]:
                out.append(bin_ids(f["s"], f["phi"], f["T"] if useT else None))
    else:
        raise ValueError(model)
    return [b.ravel() for b in out]


def nbins(model):
    return ND * NPHI * (NT if model == "contourT" else 1)


def accumulate(ATA, ATb, cnt, contribs, y):
    y = y.ravel()
    for bi in contribs:
        m = bi >= 0
        np.add.at(ATb, bi[m], y[m])
        np.add.at(cnt, bi[m], 1)
    for a in contribs:
        for b in contribs:
            m = (a >= 0) & (b >= 0)
            np.add.at(ATA, (a[m], b[m]), 1.0)


def solve(ATA, ATb, lam=3.0):
    A = ATA + lam * np.eye(len(ATb))
    return np.linalg.solve(A, ATb)


def fit_joint(contribs, extras, y, nb, lam=3.0):
    """LSQ over [bin indicators | dense extra bases]; returns (K, amps)."""
    ne = len(extras)
    ATA = np.zeros((nb + ne, nb + ne))
    ATb = np.zeros(nb + ne)
    cnt = np.zeros(nb)
    accumulate(ATA[:nb, :nb], ATb[:nb], cnt, contribs, y)
    yr = y.ravel()
    for j, e in enumerate(extras):
        ATb[nb + j] = float(e @ yr)
        for bi in contribs:
            m = bi >= 0
            np.add.at(ATA[:nb, nb + j], bi[m], e[m])
        for j2 in range(ne):
            ATA[nb + j2, nb + j] = float(extras[j2] @ e)
    ATA[nb:, :nb] = ATA[:nb, nb:].T
    X = solve(ATA, ATb, lam)
    return X[:nb], X[nb:], cnt


def predict(K, contribs, shape):
    pred = np.zeros(shape[0] * shape[1])
    for bi in contribs:
        m = bi >= 0
        pred[m] += K[bi[m]]
    return pred.reshape(shape)


def band_mask(contribs, shape):
    m = np.zeros(shape[0] * shape[1], bool)
    for bi in contribs:
        m |= bi >= 0
    return m.reshape(shape)


def r2_score(Y, pred, band):
    tot = float((Y[band] ** 2).sum())
    resid = float(((Y - pred)[band] ** 2).sum())
    return 1 - resid / max(tot, 1e-9), tot


def ramp_removed(data, slug, model="contourT", anchor="canvas"):
    """Per-bundle joint fit; returns (K, y_minus_fitted_ramp, amps)."""
    Y, layers, Bg = data[slug]
    contribs = contributions(layers, model)
    extras = ramp_bases(layers, Bg, anchor)
    K, amps, cnt = fit_joint(contribs, extras, Y, nbins(model))
    ramp = np.zeros(GRID * GRID)
    for j, e in enumerate(extras):
        ramp += amps[j] * e
    return K, Y - ramp.reshape(GRID, GRID), amps, cnt


def fit(work, slugs):
    data = {}
    for slug in slugs:
        print(f"fields: {slug}", flush=True)
        data[slug] = bundle_fields(work, slug)

    models = ["union", "layer", "contour", "contourT", "contourTRc", "contourTRb"]
    print(f"\nper-bundle model-form R^2 (band d in [{DB[0]},{DB[-1]}] canvas px; "
          "Rc/Rb = + material ramp, canvas/bounds anchored):")
    hdr = "bundle".ljust(22) + "band-en " + "".join(m.rjust(11) for m in models)
    print(hdr)
    perK = {}
    for slug in slugs:
        Y, layers, Bg = data[slug]
        row = slug.ljust(22)
        for mi, model in enumerate(models):
            base_model = model[:8] if model.startswith("contourTR") else model
            contribs = contributions(layers, base_model)
            band = band_mask(contribs, Y.shape)
            nb = nbins(base_model)
            if model == "union":
                sums = np.zeros(nb)
                cnts = np.zeros(nb)
                bi = contribs[0]
                m = bi >= 0
                np.add.at(sums, bi[m], Y.ravel()[m])
                np.add.at(cnts, bi[m], 1)
                K = np.where(cnts > 0, sums / np.maximum(cnts, 1), 0.0)
                pred = predict(K, contribs, Y.shape)
            elif model.startswith("contourTR"):
                anchor = "canvas" if model.endswith("c") else "bounds"
                extras = ramp_bases(layers, Bg, anchor)
                K, amps, cnt = fit_joint(contribs, extras, Y, nb)
                pred = predict(K, contribs, Y.shape)
                for j, e in enumerate(extras):
                    pred += (amps[j] * e).reshape(Y.shape)
            else:
                ATA = np.zeros((nb, nb))
                ATb = np.zeros(nb)
                cnt = np.zeros(nb)
                accumulate(ATA, ATb, cnt, contribs, Y)
                K = solve(ATA, ATb)
                pred = predict(K, contribs, Y.shape)
            if model == "contourT":
                perK[slug] = (K, cnt.copy())
            r2, tot = r2_score(Y, pred, band)
            if mi == 0:
                be = tot / max(float((Y ** 2).sum()), 1e-9)
                row += f"{be:6.1%}  "
            row += f"{r2:11.3f}"
        print(row, flush=True)

    print("\nfitted material-law ramp amplitudes (canvas anchor; per layer: "
          "law-amp [expect ~1 if the law transfers], offset-amp [expect ~0]):")
    for slug in slugs:
        Y, layers, Bg = data[slug]
        _, _, amps, _ = ramp_removed(data, slug, anchor="canvas")
        pairs = " | ".join(f"{amps[2*i]:6.2f}/{amps[2*i+1]:6.1f}"
                           for i in range(len(layers)))
        print(f"  {slug:22s} {pairs}")

    print("\ncross-bundle K correlation (contourT, ramp-removed, bins with >=32 samples both):")
    Kr = {}
    for slug in slugs:
        K, Yr, amps, cnt = ramp_removed(data, slug, anchor="canvas")
        Kr[slug] = (K, cnt)
    names = list(slugs)
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            (Ka, ca), (Kb, cb) = Kr[names[i]], Kr[names[j]]
            m = (ca >= 32) & (cb >= 32)
            if m.sum() > 8:
                r = float(np.corrcoef(Ka[m], Kb[m])[0, 1])
                print(f"  {names[i]:22s} vs {names[j]:22s} r={r:6.3f}  ({int(m.sum())} bins)")

    model = "contourT"
    for anchor in ("canvas", "bounds"):
        print(f"\ntransfer ({model} + derived ramp, {anchor} anchor; K fit on all "
              "OTHER bundles' ramp-removed fields):")
        rr = {s: ramp_removed(data, s, anchor=anchor)[1] for s in slugs}
        for slug in slugs:
            nb = nbins(model)
            ATA = np.zeros((nb, nb))
            ATb = np.zeros(nb)
            cnt = np.zeros(nb)
            for other in slugs:
                if other == slug:
                    continue
                Yo, Lo, _ = data[other]
                accumulate(ATA, ATb, cnt, contributions(Lo, model), rr[other])
            K = solve(ATA, ATb)
            Y, layers, Bg = data[slug]
            contribs = contributions(layers, model)
            band = band_mask(contribs, Y.shape)
            pred = predict(K, contribs, Y.shape) + derived_ramp(layers, Bg, anchor)
            r2, _ = r2_score(Y, pred, band)
            r = float(np.corrcoef(pred[band], Y[band])[0, 1])
            print(f"  {slug:22s} R2 {r2:6.3f}   r {r:6.3f}", flush=True)


# ----------------------------------------------------------- endtoend
def b64z(b):
    return base64.b64encode(zlib.compress(b, 9)).decode()


def endtoend(work, slugs, targets, model="contourT", sources=None, anchor="canvas"):
    data = {}
    for slug in slugs:
        print(f"fields: {slug}", flush=True)
        data[slug] = bundle_fields(work, slug)
    # measured b (white-restore) values from the adopted recipes
    bs = []
    recdir = os.path.join(ENGDIR, "recipes")
    for f in os.listdir(recdir):
        rec = load_recipe(os.path.join(recdir, f))
        if rec.get("lm"):
            bs.append(rec["lm"].get("b", 1.0))
    bmean = float(np.mean(bs)) if bs else 1.0
    print(f"white-restore b (mean of adopted recipes): {bmean:.3f}")

    for target in targets:
        srcs = [s for s in (sources or slugs) if s != target]
        nb = nbins(model)
        ATA = np.zeros((nb, nb))
        ATb = np.zeros(nb)
        cnt = np.zeros(nb)
        for s2 in srcs:
            Yo, Lo, _ = data[s2]
            Yr = ramp_removed(data, s2, model=model, anchor=anchor)[1]
            accumulate(ATA, ATb, cnt, contributions(Lo, model), Yr)
        K = solve(ATA, ATb)
        Y, layers, Bg = data[target]
        contribs = contributions(layers, model)
        pred = predict(K, contribs, Y.shape) + derived_ramp(layers, Bg, anchor)

        # inject as the recipe's global lightmap (builder quantization)
        d = os.path.join(work, target)
        rec = load_recipe(os.path.join(d, "recipes", f"{target}.mjs"))
        Q = 1.5
        q = np.round(pred / Q)
        q = np.where(np.abs(pred) >= 1.0, q, 0)
        q = np.clip(q, -100, 100)
        rec["lm"] = {"y": b64z((q + 128).astype(np.uint8).tobytes()), "q": Q,
                     "b": round(bmean, 3), "x0": 0, "y0": 0, "ds": 2,
                     "w": GRID, "h": GRID}
        out = os.path.join(d, "recipes", f"{target}-pred.mjs")
        open(out, "w").write("export const recipe = " + json.dumps(rec, separators=(",", ":")) + ";\n")
        png = os.path.join(d, "pred.png")
        run(["node", os.path.join(HERE, "render.mjs"), ENGDIR, out, png, "1024", "--p3"])

        gt = os.path.join(d, "gt.png")
        GT = np.asarray(Image.open(gt).convert("RGBA")).astype(np.float64)
        # reference: measured-lm bake at the same 512 resolution
        mpng = os.path.join(d, "measured512.png")
        if not os.path.exists(mpng):
            bundle = os.path.join(REPO, REAL[target]) if target in REAL else os.path.join(d, f"{target}.icon")
            run([PY, os.path.join(HERE, "build_recipe.py"), "--bundle", bundle,
                 "--gt", gt, "--id", target + "-m512", "--outdir", d,
                 "--lightmap", os.path.join(d, "pass1.png"), "--lm-res", "512"])
            run(["node", os.path.join(HERE, "render.mjs"), ENGDIR,
                 os.path.join(d, "recipes", f"{target}-m512.mjs"), mpng, "1024", "--p3"])
        for name, path in (("pass1 (no lm)", os.path.join(d, "pass1.png")),
                           ("predicted-lm", png), ("measured-lm", mpng)):
            R = np.asarray(Image.open(path).convert("RGBA")).astype(np.float64)
            vis = GT[..., 3] > 0
            rmse = float(np.sqrt((((R - GT)[..., :3])[vis] ** 2).mean()))
            g64 = np.asarray(Image.open(gt).convert("RGBA").resize((64, 64), Image.LANCZOS)).astype(np.float64)
            r64 = np.asarray(Image.open(path).convert("RGBA").resize((64, 64), Image.LANCZOS)).astype(np.float64)
            v64 = g64[..., 3] > 0
            rm64 = float(np.sqrt((((r64 - g64)[..., :3])[v64] ** 2).mean()))
            print(f"  {target:22s} {name:14s} RMSE@1024 {rmse:6.2f}   RMSE@64 {rm64:6.2f}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["gen", "fit", "endtoend"])
    ap.add_argument("--work", default=os.environ.get("PROBE_WORK", "/tmp/probe-layer-lightmap"))
    ap.add_argument("--bundles", nargs="*", default=None)
    ap.add_argument("--targets", nargs="*", default=list(REAL))
    ap.add_argument("--sources", nargs="*", default=None,
                    help="restrict the K fit to these bundles (default: all but target)")
    ap.add_argument("--model", default="contourT")
    a = ap.parse_args()
    slugs = a.bundles or (list(REAL) + INSTRUMENTS)
    os.makedirs(a.work, exist_ok=True)
    if a.cmd == "gen":
        gen(a.work, slugs)
    elif a.cmd == "fit":
        fit(a.work, slugs)
    else:
        endtoend(a.work, slugs, a.targets, model=a.model, sources=a.sources)


if __name__ == "__main__":
    main()
