#!/usr/bin/env python3
# Translate an .icon bundle (flat or Liquid Glass, SVG art) into an
# engine recipe with ZERO ictool measurement — the universal .icon
# player. Everything comes from declared values:
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
#   - GLASS layers from the measured declared-value laws:
#       alpha(y) = groupOpacity * layerOpacity * fillAlpha
#                  * family_alpha(u, translucency)
#     with u = (y - boundsTop)/boundsHeight (probe-ramp-anchor: the
#     material ramp anchors to GLASS BOUNDS, size-invariant) and the
#     family curve from calibration/glass-material-family.json
#     (probe-material: white overlay, neutral gain, specular has zero
#     interior effect). The opacity product reproduces the measured
#     recipe alphas to +-0.01 on 8/11 catalog glass layers — including
#     apple's "low-alpha" circles, which are simply layer opacity
#     0.17/0.18. gc = the artwork/declared fill color through the
#     standard sRGB->P3 composite conversion (overcast's #ff7f00 waves
#     measure (245,125,49) = exactly that path). Edge lighting is
#     PREDICTED from the shared per-contour (distance x normal-angle x
#     thickness-class) LUT (calibration/glass-edge-lut.json, fit by
#     build_glass_lut.py per probe-layer-lightmap's conditional-GO
#     verdict) and baked as the recipe's global lightmap.
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
    # declared display-p3 SOLID -> P3-coded render value. Measured
    # (probe-p3-solid.py, 35-color grid): the sRGB round trip is
    # EXTENDED-RANGE — in-gamut values come back exactly; only negative
    # sRGB channels are compressed, by a soft knee in mirrored-encoded
    # space (y = -a(1-exp(-|x|/a)), a = 0.238, max err 2.3/255; hard
    # clipping missed sonnet's navy by 16/255 in red). Values > 1 pass
    # through (identity within 0.005 linear). Gradient STOPS compress
    # harder — that is the separate stop law (gradient_stop_ext).
    e = _enc_ext(_P3_TO_SRGB @ _lin(rgb01))
    A = 0.238
    e = np.where(e < 0, -A * (1 - np.exp(-np.abs(e) / A)), e)
    p3 = np.clip(_enc_ext(_SRGB_TO_P3 @ _lin_ext(e)), 0, 1)
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
_AG_FLIP = 0.775  # above this MEAN lightness the gradient anchors at the top
# colored-input lift (probe-autogradient-colored, 12-canvas dataset):
# bottom stop = the SOLID soft-knee conversion of the input (dBot within
# -3..+0.5 across the dataset); per-channel lift blends the gray ladder
# (exact at saturation 0) with a dominant-channel ratio model fit on the
# dataset — lift_c = (1-S)*ladder(vmax) + S*(a + b*v_c/vmax), S =
# 1 - vmin/vmax — at rms 3.2 / max 9.8 (0..255) in-sample. No colored
# sample flips (incl. max-channel 0.8), so the flip criterion is mean
# lightness, not max (grays are unchanged either way). Still the
# ledger's approximate cell; this is the best measured model of it.
_AGC_A, _AGC_B = 6.78, 20.52


def auto_gradient_render(kind, v):
    # declared automatic-gradient color -> (top_render, bottom_render)
    if kind == "gray":
        v = [v[0]] * 3
        kind = "srgb"
    bottom = np.array(p3_to_render(v) if kind == "display-p3"
                      else srgb_to_render(v), np.float64)
    b01 = bottom / 255.0
    vmax = float(b01.max())
    S = 1 - float(b01.min()) / max(vmax, 1e-9)
    lift = ((1 - S) * float(np.interp(vmax, _AG_V, _AG_SPAN))
            + S * (_AGC_A + _AGC_B * b01 / max(vmax, 1e-9)))
    if float(b01.mean()) < _AG_FLIP:
        top, bot = np.clip(bottom + lift, 0, 255), bottom
    else:
        top, bot = bottom, np.clip(bottom - lift, 0, 255)
    return ([round(float(x), 1) for x in top], [round(float(x), 1) for x in bot])


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


def svg_color_to_render(spec, fullbleed=False):
    # SOLID layer-content color law (measured, forensics 2026-08-17):
    # sRGB-DECLARED values (hex, rgb(), srgb:) leak through as raw numbers
    # into the P3-coded composite — relabeled, never converted (netflix
    # #b20710 stem -> GT (178,7,15) = the raw bytes; tunein srgb teal
    # likewise). DISPLAY-P3-declared values are properly converted through
    # the sRGB-clip composite (spotify/deepcast regressed under direct).
    # Canvas fills: sRGB-composite path (probe-gamut, p3-declared);
    # gradient stops: the stop law. Distinct paths, each measured.
    space, c = spec
    if space == "p3":
        return p3_to_render(c)
    if fullbleed:
        return [round(float(min(max(v, 0), 1)) * 255, 1) for v in c]
    return srgb_to_render(c)


# CoreSVG gradient-stop law (measured 2026-08-17, probe-gradient-law.py +
# probe-p3-gradient.py). Stops — and only stops; solid fills are exact —
# are clamped PER CHANNEL in UNCLIPPED linear sRGB (out-of-gamut
# display-p3 stops keep their extended-range values until then):
#   R' = clamp(R, -0.0258 G + 0.0018 B - 0.0009, 1.0054 - 0.0075 G)
#   G' = clamp(G, 0.0185 R + 0.0320 B, gceil(R, B))   [the original law]
#   B' = clamp(B, -0.0015 R - 0.0017 G - 0.0002, 1.0024)
# with gceil a measured 2x3 table over (R, B) clamped to [0,1] — the
# green ceiling saturates toward 1 as either other channel rises. The
# ramp is a plain lerp of the MIRROR-ENCODED clamped stops in extended
# encoded sRGB; per pixel the (possibly negative) result converts
# sRGB->P3 in linear light and only the final P3-coded value clips.
# All 18 instrument pair-curves fit at <= 1.6 RMSE (the old law left
# out-of-gamut p3 pairs at up to 4.4; podvine's field missed by 27/255
# in red under the engine's P3-coded lerp).


def _lin_ext(u):  # mirrored (extended-range) sRGB decode
    u = np.asarray(u, np.float64)
    return np.sign(u) * np.where(np.abs(u) <= 0.04045, np.abs(u) / 12.92,
                                 ((np.abs(u) + 0.055) / 1.055) ** 2.4)


def _enc_ext(u):  # mirrored (extended-range) sRGB encode
    u = np.asarray(u, np.float64)
    return np.sign(u) * np.where(np.abs(u) <= 0.0031308, 12.92 * np.abs(u),
                                 1.055 * np.abs(u) ** (1 / 2.4) - 0.055)


def gradient_stop_ext(spec):
    # resolved stop color -> transformed stop in EXTENDED encoded sRGB
    space, c = spec
    srgb = _P3_TO_SRGB @ _lin(c) if space == "p3" else _lin(np.clip(c, 0, 1))
    R, G, B = (float(v) for v in srgb)
    Rc, Bc = min(max(R, 0.0), 1.0), min(max(B, 0.0), 1.0)
    g0 = np.interp(Bc, [0.0, 0.152, 1.0], [0.9520, 0.9838, 0.9940])
    g1 = np.interp(Bc, [0.0, 0.152, 1.0], [0.9907, 0.9907, 1.0])
    return _enc_ext(np.array([
        np.clip(R, -0.0258 * G + 0.0018 * B - 0.0009, 1.0054 - 0.0075 * G),
        np.clip(G, 0.0185 * R + 0.0320 * B, g0 + (g1 - g0) * Rc),
        np.clip(B, -0.0015 * R - 0.0017 * G - 0.0002, 1.0024),
    ]))


def _ramp_to_render(e):
    # extended encoded sRGB ramp value -> P3-coded 0..255 (negatives
    # propagate through the linear-light conversion; clip only at output)
    p3 = np.clip(_enc_ext(_SRGB_TO_P3 @ _lin_ext(e)), 0, 1)
    return [round(float(v) * 255, 1) for v in p3]


def resample_law_stops(stops):
    # [(offset, spec, alpha)] -> (st, cs, als) sampling the law curve
    # densely enough that the engine's piecewise-linear P3-coded lerp
    # stays within tol. The engine lerps stored P3-coded colors; the law
    # curve lives in extended encoded sRGB, so intermediate stops are
    # inserted wherever the two disagree. Stop alpha lerps linearly in t
    # composited in encoded space (measured: the glow-probe fade's
    # implied alpha is exactly 1-t per channel in encoded sRGB).
    knots = [(float(o), gradient_stop_ext(spec), float(al)) for o, spec, al in stops]
    TOL = 0.4  # 0..255 units

    def law_at(e0, e1, u):
        return _ramp_to_render(e0 + (e1 - e0) * u)

    out = [(knots[0][0], law_at(knots[0][1], knots[0][1], 0.0), knots[0][2])]
    for (o0, e0, al0), (o1, e1, al1) in zip(knots, knots[1:]):
        seg = [(0.0, np.array(law_at(e0, e1, 0.0))), (1.0, np.array(law_at(e0, e1, 1.0)))]
        for _ in range(5 if o1 - o0 > 1e-6 else 0):  # up to 33 samples/segment
            refined = [seg[0]]
            split = False
            for (u0, c0), (u1, c1) in zip(seg, seg[1:]):
                um = (u0 + u1) / 2
                cm = np.array(law_at(e0, e1, um))
                if np.abs((c0 + c1) / 2 - cm).max() > TOL:
                    refined.append((um, cm))
                    split = True
                refined.append((u1, c1))
            seg = refined
            if not split:
                break
        for u, c in seg[1:]:
            out.append((o0 + (o1 - o0) * u, [round(float(v), 1) for v in c],
                        al0 + (al1 - al0) * u))
    return ([round(o, 4) for o, _, _ in out], [c for _, c, _ in out],
            [round(al, 3) for _, _, al in out])


def attr(attrs, name, style):
    v = re.findall(rf'(?:^|\s){name}="([^"]*)"', attrs)
    if v:
        return v[0]
    m = re.search(rf"(?:^|;)\s*{name}\s*:\s*([^;]+)", style or "")
    return m.group(1).strip() if m else None


def shape_to_path_d(tag, attrs):
    def f(n, d=0.0):
        v = re.findall(rf'(?:^|\s){n}="([^"]*)"', attrs)
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
    if tag in ("polygon", "polyline"):  # fill treats both as closed
        pts = re.findall(NUM, re.findall(r'points="([^"]*)"', attrs)[0])
        d = "M" + ",".join(pts[:2]) + " " + " ".join(
            "L" + pts[i] + "," + pts[i+1] for i in range(2, len(pts) - 1, 2))
        return d + " Z"
    return None


def parse_gradients(s):
    grads = {}
    for m in re.finditer(
        r"<(linearGradient|radialGradient)([^>]*)>(.*?)</\1>", s, re.S
    ):
        kind, attrs, body = m.group(1), m.group(2), m.group(3)
        gid = re.findall(r'id="([^"]*)"', attrs)
        if not gid:
            continue
        def f(n, d):
            v = re.findall(rf'(?:^|\s){n}="([^"]*)"', attrs)
            return v[0] if v else d
        stops = []
        for sm in re.finditer(r"<stop([^>]*)/?>", body):
            sa = sm.group(1)
            st = attr(sa, "style", None)
            col = attr(sa, "stop-color", st) or "#000"
            off = attr(sa, "offset", st) or "0"
            sop = attr(sa, "stop-opacity", st)
            alpha = float(sop) if sop is not None else 1.0
            c = parse_svg_color(col if not col.startswith("stop-color") else col)
            stops.append((float(off.rstrip("%")) / (100 if "%" in off else 1), c, alpha))
        grads[gid[0]] = {
            "kind": "radial" if kind == "radialGradient" else "linear",
            "x1": f("x1", "0"), "y1": f("y1", "0"),
            "x2": f("x2", "1" if f("gradientUnits", "objectBoundingBox") == "objectBoundingBox" else "0"),
            "y2": f("y2", "0"),
            "cx": f("cx", "0.5"), "cy": f("cy", "0.5"), "r": f("r", "0.5"),
            "fx": f("fx", None), "fy": f("fy", None),
            "units": f("gradientUnits", "objectBoundingBox"),
            "transform": f("gradientTransform", ""),
            "stops": stops,
        }
    return grads, set()


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
    fullbleed = False
    hidden = 0  # depth inside non-rendered containers (defs/clipPath/mask/...)
    HIDE = ("defs", "clipPath", "mask", "symbol", "pattern")
    SHAPES = ("path", "rect", "circle", "ellipse", "polygon", "polyline")
    stack = [(np.eye(3), root_fill[0] if root_fill else None, 1.0)]

    # id -> (tag, attrs) for every shape anywhere (defs included), so <use>
    # can instantiate them
    by_id = {}
    for sm in re.finditer(r"<(path|rect|circle|ellipse|polygon|polyline)([^>]*?)/?>", s):
        gid = re.findall(r'\bid="([^"]*)"', sm.group(2))
        if gid:
            by_id[gid[0]] = (sm.group(1), sm.group(2))

    def resolve_paint(ps):
        gm = re.match(r"url\(#([^)]+)\)", ps.strip()) if ps else None
        if gm:
            return ("grad", gm.group(1))
        c = parse_svg_color(ps)
        if c == "UNPARSED":
            warn(f"unparsed paint '{ps}' -> black")
            return ("srgb", (0, 0, 0))
        return c  # None = nothing painted

    def handle_shape(tag, attrs, extra_m):
        nonlocal strokes, clipped, fullbleed
        style = attr(attrs, "style", None)
        d = attr(attrs, "d", None) if tag == "path" else shape_to_path_d(tag, attrs)
        if not d:
            return
        parent = stack[-1]
        tr = attr(attrs, "transform", style)
        M = parent[0] @ extra_m @ (parse_transform(tr) if tr else np.eye(3))
        if attr(attrs, "clip-path", style):
            clipped += 1
        op = parent[2]
        v = attr(attrs, "opacity", style)
        if v:
            op *= float(v)
        cubics = []
        for cu in parse_path(d):
            tc = []
            for (x, y) in cu:
                p = M @ np.array([x, y, 1.0])
                tc.append((float(p[0]), float(p[1])))
            cubics.append(tuple(tc))
        if not cubics:
            return
        fill_s = attr(attrs, "fill", style)
        if fill_s is None:
            fill_s = parent[1] if parent[1] is not None else "#000"
        fill = resolve_paint(fill_s)
        if fill is not None:
            fop = op
            v = attr(attrs, "fill-opacity", style)
            if v:
                fop *= float(v)
            rule = attr(attrs, "fill-rule", style) or "nonzero"
            els.append({"cubics": cubics, "rule": rule, "fill": fill, "op": fop})
            # DARK full-bleed detection: an opaque solid element covering
            # the exact viewBox with mean encoded luminance < 0.30 flips
            # sRGB-declared artwork colors to the raw-direct path
            # (measured: style-probes — white/light backgrounds composite
            # in sRGB, dark ones blit raw; threshold brackets to
            # (0.282, 0.314); <use>-referenced and <path> covers count,
            # 1px-short coverage does not)
            if (fop >= 0.999 and isinstance(fill, tuple) and fill[0] in ("srgb", "p3")
                    and sum(fill[1]) / 3 < 0.30):
                px = [c2 for cu in cubics for c2 in (cu[0][0], cu[3][0])]
                py = [c2 for cu in cubics for c2 in (cu[0][1], cu[3][1])]
                if (min(px) <= vb[0] + 1e-3 and min(py) <= vb[1] + 1e-3
                        and max(px) >= vb[0] + vb[2] - 1e-3 and max(py) >= vb[1] + vb[3] - 1e-3):
                    fullbleed = True
        stroke_s = attr(attrs, "stroke", style)
        if stroke_s not in (None, "none"):
            paint = resolve_paint(stroke_s)
            if paint is not None:
                w = float(attr(attrs, "stroke-width", style) or 1)
                # width scales by the element transform (uniform-scale assumption)
                w *= float(np.sqrt(abs(np.linalg.det(M[:2, :2]))))
                ring = stroke_annulus(cubics, w)
                if ring is None:
                    strokes += 1  # open/degenerate subpath: still unsupported
                else:
                    sop = op
                    v = attr(attrs, "stroke-opacity", style)
                    if v:
                        sop *= float(v)
                    els.append({"cubics": ring, "rule": "evenodd", "fill": paint, "op": sop})

    for m in re.finditer(
        r"<(g|path|rect|circle|ellipse|polygon|polyline|use|defs|clipPath|mask|symbol|pattern"
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
            href = attr(attrs, "href", None) or attr(attrs, "xlink:href", None)
            target = by_id.get(href.lstrip("#")) if href else None
            if target is None:
                uses += 1  # unresolvable (group targets etc.): still warned
                continue
            ux = float(attr(attrs, "x", None) or 0)
            uy = float(attr(attrs, "y", None) or 0)
            style = attr(attrs, "style", None)
            tr = attr(attrs, "transform", style)
            T = np.eye(3)
            T[0, 2], T[1, 2] = ux, uy
            extra = (parse_transform(tr) if tr else np.eye(3)) @ T
            handle_shape(target[0], target[1], extra)
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
        if tag in SHAPES:
            handle_shape(tag, attrs, np.eye(3))
    return vb, els, grads, radial, strokes, clipped, uses, fullbleed


def stroke_annulus(cubics, width):
    # closed smooth subpaths -> ring outline (outer + inner polylines,
    # evenodd). Open subpaths return None (general stroking unsupported).
    subs = []
    cur = []
    for cu in cubics:
        if cur and np.hypot(cu[0][0] - cur[-1][3][0], cu[0][1] - cur[-1][3][1]) > 1e-6:
            subs.append(cur)
            cur = []
        cur.append(cu)
    if cur:
        subs.append(cur)
    out = []
    for sub in subs:
        pts = [sub[0][0]]
        for (P0, P1, P2, P3) in sub:
            for k in range(1, 25):
                t = k / 24
                mt = 1 - t
                pts.append((mt**3*P0[0] + 3*mt*mt*t*P1[0] + 3*mt*t*t*P2[0] + t**3*P3[0],
                            mt**3*P0[1] + 3*mt*mt*t*P1[1] + 3*mt*t*t*P2[1] + t**3*P3[1]))
        P = np.array(pts)
        if np.hypot(*(P[0] - P[-1])) > 1e-3 * max(np.ptp(P, 0).max(), 1e-9):
            return None  # open subpath
        P = P[:-1]
        if len(P) < 3:
            return None
        nxt = np.roll(P, -1, 0)
        prv = np.roll(P, 1, 0)
        t1 = P - prv
        t2 = nxt - P
        t1 /= np.maximum(np.linalg.norm(t1, axis=1, keepdims=True), 1e-9)
        t2 /= np.maximum(np.linalg.norm(t2, axis=1, keepdims=True), 1e-9)
        m = t1 + t2
        m /= np.maximum(np.linalg.norm(m, axis=1, keepdims=True), 1e-9)
        n = np.stack([-m[:, 1], m[:, 0]], 1)
        # miter compensation, clamped (smooth curves stay ~1)
        cosj = np.clip(np.abs((n * np.stack([-t1[:, 1], t1[:, 0]], 1)).sum(1)), 0.33, 1)
        offs = n * (width / 2 / cosj)[:, None]
        for poly in (P + offs, P - offs):
            q = np.vstack([poly, poly[:1]])
            for i in range(len(q) - 1):
                a2, b2 = tuple(q[i]), tuple(q[i + 1])
                out.append((a2, a2, b2, b2))
    return out or None


# ---------------- glass: material family + shared edge-lighting LUT -------
_CAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "calibration")


def _family():
    fam = json.load(open(os.path.join(_CAL, "glass-material-family.json")))
    ts = sorted(float(k[1:]) for k in fam if k.startswith("t"))
    curves = {t: np.array(fam[f"t{t}"]["alpha_full"], np.float64) for t in ts}
    # the family rows are the ERODED interior of the reference circle:
    # rows y0..y1 within glass bounds 176..848 (r=10.5u circle at 32px/u).
    # Normalized-bounds coordinates of the curve samples:
    y0, y1 = fam["t0.5"]["y0"], fam["t0.5"]["y1"]
    u0, u1 = (y0 - 176.0) / 672.0, (y1 - 176.0) / 672.0
    return ts, curves, np.linspace(u0, u1, len(curves[ts[0]]))


_FAM_TS, _FAM_CURVES, _FAM_U = _family()


def family_alpha_curve(transl):
    t = min(max(transl, _FAM_TS[0]), _FAM_TS[-1])
    i = min(max(int(np.searchsorted(_FAM_TS, t)), 1), len(_FAM_TS) - 1)
    t0, t1 = _FAM_TS[i - 1], _FAM_TS[i]
    f = (t - t0) / max(t1 - t0, 1e-9)
    return (1 - f) * _FAM_CURVES[t0] + f * _FAM_CURVES[t1]


# GLASS_LUT overrides the committed artifact (leave-target-out validation)
_LUT = json.load(open(os.environ.get("GLASS_LUT")
                      or os.path.join(_CAL, "glass-edge-lut.json")))
_LGRID = _LUT["grid"]
_LS = 1024.0 / _LGRID
_LDB = np.array(_LUT["db"], np.float64)
_LND = len(_LDB) - 1
_LNPHI = _LUT["nphi"]
_LTCLASS = np.array(_LUT["tclass"], np.float64)
_LNT = len(_LTCLASS) - 1
_LK = np.array(_LUT["k"], np.float64)


# per-contour geometry fields (kept in sync with probe-layer-lightmap.py,
# the instrument that measured this model)
def contours_of(seg):
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


def glass_polyline(contour, spacing=0.75):
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
    keep = [0]
    acc = 0.0
    for i in range(1, len(P)):
        acc += float(np.hypot(*(P[i] - P[i - 1])))
        if acc >= spacing:
            keep.append(i)
            acc = 0.0
    return P[keep]


def rast_parity(contours, grid):
    E = []
    for cont in contours:
        P = glass_polyline(cont, spacing=0.5) / _LS
        Q = np.vstack([P, P[:1]])
        for j in range(len(Q) - 1):
            if Q[j][1] != Q[j + 1][1]:
                E.append((Q[j][0], Q[j][1], Q[j + 1][0], Q[j + 1][1]))
    E = np.array(E)
    cov = np.zeros((grid, grid), bool)
    if not len(E):
        return cov
    for row in range(grid):
        yy = row + 0.5
        m = (np.minimum(E[:, 1], E[:, 3]) <= yy) & (np.maximum(E[:, 1], E[:, 3]) > yy)
        if not m.any():
            continue
        e = E[m]
        xs = np.sort(e[:, 0] + (yy - e[:, 1]) * (e[:, 2] - e[:, 0]) / (e[:, 3] - e[:, 1]))
        for a2, b2 in zip(xs[0::2], xs[1::2]):
            cov[row, max(int(np.ceil(a2 - 0.5)), 0): min(int(np.floor(b2 + 0.5)) + 1, grid)] = True
    return cov


def contour_normals(P, cov):
    Q = np.vstack([P, P[:1]])
    tang = Q[1:] - Q[:-1]
    k = 5
    tw = np.vstack([np.roll(tang, s2, axis=0) for s2 in range(-(k // 2), k // 2 + 1)]).reshape(k, -1, 2).mean(axis=0)
    L = np.hypot(tw[:, 0], tw[:, 1])
    L[L == 0] = 1
    nx = -tw[:, 1] / L
    ny = tw[:, 0] / L
    xi = np.clip(((P[:, 0] + nx * 4) / _LS).astype(int), 0, _LGRID - 1)
    yi = np.clip(((P[:, 1] + ny * 4) / _LS).astype(int), 0, _LGRID - 1)
    flip = ~cov[yi, xi]
    nx = np.where(flip, -nx, nx)
    ny = np.where(flip, -ny, ny)
    return nx, ny


def contour_field(P, cov):
    gy, gx = np.mgrid[0:_LGRID, 0:_LGRID]
    px = ((gx + 0.5) * _LS).ravel().astype(np.float32)
    py = ((gy + 0.5) * _LS).ravel().astype(np.float32)
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
    dist = dist.reshape(_LGRID, _LGRID)
    idx = idx.reshape(_LGRID, _LGRID)
    sgn = np.where(cov, 1.0, -1.0).astype(np.float32)
    s = dist * sgn
    nx, ny = contour_normals(P, cov)
    phi = np.arctan2(ny[idx.ravel()], nx[idx.ravel()]).reshape(_LGRID, _LGRID).astype(np.float32)
    return s, phi, idx


def sample_thickness(P, cov):
    n = len(P)
    T = np.full(n, 1e9, np.float32)
    nx, ny = contour_normals(P, cov)

    def inside_at(x, y):
        xi = np.clip((x / _LS).astype(int), 0, _LGRID - 1)
        yi = np.clip((y / _LS).astype(int), 0, _LGRID - 1)
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


def lut_bin_ids(s, phi, T):
    di = np.digitize(s, _LDB) - 1
    ok = (di >= 0) & (di < _LND)
    pi = ((phi + np.pi) / (2 * np.pi) * _LNPHI).astype(int) % _LNPHI
    ti = np.clip(np.digitize(T, _LTCLASS) - 1, 0, _LNT - 1)
    bid = (ti * _LND + di) * _LNPHI + pi
    return np.where(ok, bid, -1)


def predicted_lightmap(glass_entries):
    """Sum the shared edge-LUT contribution of every glass contour into a
    GRID x GRID luma field (the material ramp lives in the alpha curves,
    NOT here)."""
    pred = np.zeros(_LGRID * _LGRID)
    for entry in glass_entries:
        conts = contours_of(entry["path"])
        cov = rast_parity(conts, _LGRID)
        for cont in conts:
            P = glass_polyline(cont)
            if len(P) < 8:
                continue
            s, phi, idx = contour_field(P, cov)
            T = sample_thickness(P, cov)
            bid = lut_bin_ids(s, phi, T[idx]).ravel()
            m = bid >= 0
            pred[m] += _LK[bid[m]]
    return pred.reshape(_LGRID, _LGRID)


def seg_bounds_y(seg):
    ys = []
    for i in range(0, len(seg), 8):
        p = np.array(seg[i:i + 8], np.float64).reshape(4, 2)
        t = np.linspace(0, 1, 9)[:, None]
        mt = 1 - t
        xy = mt**3 * p[0] + 3 * mt**2 * t * p[1] + 3 * mt * t**2 * p[2] + t**3 * p[3]
        ys.append(xy[:, 1])
    ys = np.concatenate(ys)
    return float(ys.min()), float(ys.max())


def glass_alpha_b64(seg, transl, opacity):
    """Engine per-canvas-y alpha bytes: the family curve at the declared
    translucency, resampled into the layer's bounds (bounds-y anchoring),
    scaled by the declared opacity product."""
    curve = family_alpha_curve(transl)
    top, bot = seg_bounds_y(seg)
    n = 256
    yc = (np.arange(n) + 0.5) * (1024.0 / n)
    u = (yc - top) / max(bot - top, 1e-9)
    al = np.interp(np.clip(u, _FAM_U[0], _FAM_U[-1]), _FAM_U, curve) * opacity
    return base64.b64encode(bytes(np.clip(np.round(al * 255), 0, 255)
                                  .astype(np.uint8).tolist())).decode()


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

bg = []
glass_entries = []
_PROF = json.load(open(os.path.join(_CAL, "refraction-profile.json")))
GLASS_LAW = {"A0": _PROF["A0"], "R0": _PROF["R0"], "pw": _PROF["pw"],
             "sr": _PROF.get("smooth_r", 3), "sn": _PROF.get("smooth_n", 2)}


def icon_color_and_alpha(cstr):
    kind, vals = cstr.split(":")
    v = [float(x) for x in vals.split(",")]
    if kind == "gray":
        return srgb_to_render([v[0]] * 3), (v[1] if len(v) > 1 else 1.0)
    al = v[3] if len(v) > 3 else 1.0
    if kind == "display-p3":
        return p3_to_render(v[:3]), al
    return srgb_to_render(v[:3]), al


def el_area(cubics):
    # signed shoelace over the flattened subpaths (knockout holes wound
    # opposite subtract); used only as a color-averaging weight
    tot = 0.0
    for sub in contours_of([v for cu in cubics for pt in cu for v in pt]):
        pts = []
        for c in sub:
            p = np.array(c, np.float64).reshape(4, 2)
            t = np.linspace(0, 1, 9)[:-1, None]
            mt = 1 - t
            pts.append(mt**3 * p[0] + 3 * mt**2 * t * p[1] + 3 * mt * t**2 * p[2] + t**3 * p[3])
        P = np.vstack(pts)
        Q = np.roll(P, -1, 0)
        tot += 0.5 * float((P[:, 0] * Q[:, 1] - Q[:, 0] * P[:, 1]).sum())
    return abs(tot)


def glass_color(override, els, grads):
    """Material color spec for a glass layer: {gc[, gc1, gcy], al} — the
    declared icon.json fill if present, else the artwork's area-weighted
    fill. Measured (overcast waves #ff7f00 -> gc (245,125,49)): glass
    artwork colors take the standard sRGB->P3 composite conversion.
    Vertical linear-gradient fills emit the engine's optional gc1/gcy
    material gradient (overcast's tower renders its declared navy->black
    ramp in ground truth; a constant mean color misses by up to 42/255
    at the bottom)."""
    if override:
        if "solid" in override:
            gc, al = icon_color_and_alpha(override["solid"])
            return {"gc": gc, "al": al}
        grad = override.get("linear-gradient")
        if grad:
            pairs = [icon_color_and_alpha(c) for c in grad]
            al = float(np.mean([p[1] for p in pairs]))
            o = override.get("orientation",
                             {"start": {"x": 0.5, "y": 0}, "stop": {"x": 0.5, "y": 1}})
            if abs(o["start"]["x"] - o["stop"]["x"]) < 0.02 and len(pairs) >= 2:
                if len(pairs) > 2:
                    warn("glass gradient fill: >2 stops -> endpoints")
                return {"gc": pairs[0][0], "gc1": pairs[-1][0],
                        "gcy": [round(o["start"]["y"] * 1024, 1),
                                round(o["stop"]["y"] * 1024, 1)], "al": al}
            warn("glass gradient fill: non-vertical -> mean color")
            return {"gc": [round(float(np.mean([p[0][i] for p in pairs])), 1)
                           for i in range(3)], "al": al}
        if "automatic-gradient" in override:
            kind, vals = override["automatic-gradient"].split(":")
            v = [float(x) for x in vals.split(",")]
            top, bottom = auto_gradient_render(kind, v[:3])
            al = (v[1] if kind == "gray" and len(v) > 1
                  else v[3] if len(v) > 3 else 1.0)
            return {"gc": top, "gc1": bottom, "gcy": [0, 1024], "al": al}
    acc = np.zeros(3)
    tot = 0.0
    for el in els:
        f = el["fill"]
        if isinstance(f, tuple) and f[0] == "grad":
            gr = grads.get(f[1])
            stops = [s2 for s2 in (gr["stops"] if gr else [])
                     if s2[1] not in (None, "UNPARSED")]
            if not stops:
                continue
            c = np.mean([svg_color_to_render(s2[1]) for s2 in stops], axis=0)
        elif isinstance(f, tuple):
            c = np.array(svg_color_to_render(f))
        else:
            continue
        w = max(el_area(el["cubics"]), 1e-9) * el["op"]
        acc += c * w
        tot += w
    if tot <= 0:
        warn("glass layer artwork has no parsable fill -> white material")
        return {"gc": [255.0, 255.0, 255.0], "al": 1.0}
    return {"gc": [round(float(v), 1) for v in acc / tot], "al": 1.0}

# canvas fill -> full-bleed rect path (engine's path-gradient handles any
# orientation, unlike the fixed 0..1024 vgrad)
CANVAS_SEG = []
for cu in parse_path("M0,0 L1024,0 L1024,1024 L0,1024 Z"):
    for (x, y) in cu:
        CANVAS_SEG.extend([x, y])


def fill_desc_from_icon(fill, direct=False):
    if "solid" in fill:
        if direct:  # layer overrides follow the layer-content color law
            _k, vals = fill["solid"].split(":")
            v = [float(x) for x in vals.split(",")][:3]
            if _k == "gray":
                v = [v[0]] * 3
            if _k == "display-p3":
                return {"t": "solid", "c": p3_to_render(v)}
            return {"t": "solid", "c": [round(min(max(x, 0), 1) * 255, 1) for x in v]}
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
        top, bottom = auto_gradient_render(kind, v)
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
        l_op = 1.0 if op is None else op
        op = l_op * g_op
        name = l["image-name"]
        if not name.lower().endswith(".svg"):
            raise SystemExit(f"NOT SVG: layer art {name}")
        vb, els, grads, radial, strokes, clipped, uses, fullbleed = svg_elements(
            os.path.join(a.bundle, "Assets", name))
        if strokes:
            warn(f"{name}: {strokes} stroked element(s) ignored")
        if clipped:
            warn(f"{name}: {clipped} element(s) use clip-path (rendered unclipped)")
        if uses:
            warn(f"{name}: {uses} <use> element(s) not instantiated")
        pos = l.get("position", {})
        # position-less layers render at scale 1 (1 svg unit = 1 canvas
        # unit), centered, canvas-clipped — measured via a viewBox sweep
        # through ictool (7 cases; the 1200x500 case proves clip over fit)
        sc = pos.get("scale", 1.0)
        tr = pos.get("translation-in-points", [0.0, 0.0])
        ox = (1024.0 - vb[2] * sc) / 2 + tr[0]
        oy = (1024.0 - vb[3] * sc) / 2 + tr[1]

        def to_canvas(x, y):
            return ((x - vb[0]) * sc + ox, (y - vb[1]) * sc + oy)

        override = light_value(l, "fill")

        if light_value(l, "glass") is True:
            if g.get("blur-material"):
                warn(f"{name}: blur-material {g['blur-material']} ignored")
            seg = []
            segf = []
            for el in els:
                for cu in el["cubics"]:
                    for (x, y) in cu:
                        cx, cy = to_canvas(x, y)
                        segf.append(cx)
                        segf.append(cy)
                        seg.append(round(cx, 2))
                        seg.append(round(cy, 2))
            if not seg:
                warn(f"{name}: glass layer has no geometry, skipped")
                continue
            trd = light_value(g, "translucency") or {}
            tv = float(trd.get("value", 0.0)) if trd.get("enabled", True) else 0.0
            gcspec = glass_color(override, els, grads)
            sh = g.get("shadow")
            shadow = None
            if sh:
                shadow = {"dy": 29, "r": 23, "n": 3,
                          "amp": round(17.385 * sh.get("opacity", 0.5) / 0.5, 3)}
            entry = {"path": seg, "law": GLASS_LAW,
                     "alpha": glass_alpha_b64(segf, tv, gcspec["al"]),
                     "gc": gcspec["gc"], "shadow": shadow, "lm": None}
            if "gc1" in gcspec:
                entry["gc1"] = gcspec["gc1"]
                entry["gcy"] = gcspec["gcy"]
            # layer x group opacity is POST-COMPOSITE (the engine blends the
            # finished glass composite with the clean base), NOT material
            # alpha — measured on overcast's op-0.9 tower group, whose ring
            # bottom keeps 10% of the UNREFRACTED canvas
            if l_op * g_op < 0.9995:
                entry["op"] = round(l_op * g_op, 4)
            glass_entries.append(entry)
            continue
        if glass_entries:
            warn(f"{name}: non-glass layer above glass rendered beneath it")

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
                fdesc = fill_desc_from_icon(override, direct=True)
                if fdesc["t"] == "lin" and "x0" not in fdesc:
                    pass
            elif isinstance(el["fill"], tuple) and el["fill"][0] == "grad":
                gid = el["fill"][1]
                if gid in grads:
                    gr = grads[gid]
                    # colorless fully-transparent stops (Figma's
                    # fade-to-'none' idiom) inherit the nearest colored
                    # stop's color and act as pure alpha knots
                    raw = sorted(gr["stops"], key=lambda s2: s2[0])
                    colored = [s2 for s2 in raw if s2[1] is not None]
                    stops = []
                    for o, c, al in raw:
                        if c is None:
                            if al <= 0.01 and colored:
                                near = min(colored, key=lambda s2: abs(s2[0] - o))
                                stops.append((o, near[1], al))
                        else:
                            stops.append((o, c, al))
                    if len(stops) < 2:
                        warn(f"gradient #{gid}: <2 usable stops -> solid")
                        c = stops[0][1] if stops else ("srgb", (0, 0, 0))
                        fdesc = {"t": "solid", "c": svg_color_to_render(c)}
                    else:
                        GM = parse_transform(gr["transform"])
                        A_tc = np.array([[sc, 0, ox - vb[0] * sc],
                                         [0, sc, oy - vb[1] * sc],
                                         [0, 0, 1.0]])
                        def gpt(xs_, ys_):
                            if gr["units"] == "userSpaceOnUse":
                                p = GM @ np.array([float(xs_), float(ys_), 1.0])
                                return to_canvas(p[0], p[1])
                            bx0, bx1 = min(xs), max(xs)
                            by0, by1 = min(ys), max(ys)
                            fx = float(str(xs_).rstrip("%")) / (100 if "%" in str(xs_) else 1)
                            fy = float(str(ys_).rstrip("%")) / (100 if "%" in str(ys_) else 1)
                            return (bx0 + fx * (bx1 - bx0), by0 + fy * (by1 - by0))
                        if gr["kind"] == "radial":
                            if gr["units"] != "userSpaceOnUse":
                                warn(f"radial gradient #{gid}: objectBoundingBox units -> midpoint solid")
                                fdesc = {"t": "solid", "c": svg_color_to_render(("srgb", (0.5, 0.5, 0.5)))}
                            else:
                                if gr["fx"] is not None and (gr["fx"], gr["fy"]) != (gr["cx"], gr["cy"]):
                                    warn(f"radial gradient #{gid}: focal point ignored")
                                T = np.array([[float(gr["r"]), 0, float(gr["cx"])],
                                              [0, float(gr["r"]), float(gr["cy"])],
                                              [0, 0, 1.0]])
                                Fm = A_tc @ GM @ T
                                Mi = np.linalg.inv(Fm)
                                fdesc = {"t": "rad",
                                         "m": [round(float(v), 6) for v in Mi[:2].ravel()]}
                        else:
                            p0 = gpt(gr["x1"], gr["y1"])
                            p1 = gpt(gr["x2"], gr["y2"])
                            fdesc = {"t": "lin",
                                     "x0": round(p0[0], 1), "y0": round(p0[1], 1),
                                     "x1": round(p1[0], 1), "y1": round(p1[1], 1)}
                        if fdesc["t"] in ("lin", "rad"):
                            st, cs, als = resample_law_stops(stops)
                            has_alpha = any(al < 0.999 for al in als)
                            if len(st) == 2 and abs(st[0]) < 1e-4 and abs(st[1] - 1) < 1e-4:
                                fdesc["c0"], fdesc["c1"] = cs
                                if has_alpha:
                                    fdesc["a0"], fdesc["a1"] = als
                            else:
                                fdesc["st"], fdesc["cs"] = st, cs
                                if has_alpha:
                                    fdesc["as"] = als
                else:
                    warn(f"gradient #{gid} not found -> black")
                    fdesc = {"t": "solid", "c": [0, 0, 0]}
            else:
                fdesc = {"t": "solid", "c": svg_color_to_render(el["fill"], fullbleed)}
            lay = {"t": "path", "seg": seg, "rule": el["rule"], "fill": fdesc}
            eff_op = op * el["op"]
            if eff_op != 1:
                lay["op"] = round(eff_op, 3)
            bg.append(lay)

recipe = {"bg": bg, "dluts": [], "glass": glass_entries}
if glass_entries:
    # zero-measurement edge lighting: the shared per-contour LUT summed
    # over every glass contour, baked as the recipe's global lightmap
    # (builder quantization: deadzone 1, step 1.5, half-res)
    pred = predicted_lightmap(glass_entries)
    Q = 1.5
    q = np.round(pred / Q)
    q = np.where(np.abs(pred) >= 1.0, q, 0)
    q = np.clip(q, -100, 100)
    recipe["lm"] = {
        "y": base64.b64encode(zlib.compress((q + 128).astype(np.uint8).tobytes(), 9)).decode(),
        "q": Q, "b": _LUT["b"], "x0": 0, "y0": 0, "ds": int(1024 // _LGRID),
        "w": _LGRID, "h": _LGRID}
os.makedirs(os.path.join(a.outdir, "recipes"), exist_ok=True)
out = os.path.join(a.outdir, "recipes", f"{a.id}.mjs")
open(out, "w").write(
    f"// recipes/{a.id}.mjs — Liquid Glass recipe (data only).\n"
    f"// TRANSLATED by packages/engine/tools/translate_icon.py from "
    f"{os.path.basename(a.bundle)} — zero ictool measurement.\n"
    "export const recipe = " + json.dumps(recipe, separators=(",", ":")) + ";\n")
print(f"wrote {out}: {os.path.getsize(out)} bytes, {len(bg)} bg layers, "
      f"{len(glass_entries)} glass layer(s), {len(warnings)} warning(s)")
