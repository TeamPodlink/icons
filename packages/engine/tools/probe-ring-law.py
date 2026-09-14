#!/usr/bin/env python3
# Instrument: what exactly does ictool's dark-artwork classifier read off
# the composite border ring?
#
# The recorded law (ledger "Raster layers", `probe-raster.py`) is
#
#     raw <=> every pixel of the composite's 1-px border ring is opaque
#             AND has max encoded channel < ~0.308   bracket (0.302, 0.314)
#
# and it is REFUTED for saturated fills: a green canvas flips below 0.20
# while blue is still RAW at 0.30 (ledger "The dark-status composite's
# blind spots"). No single max-channel reading, in P3-coded or in sRGB
# coordinates, explains that. This probe bisects the flip point along
# many color axes, tests whether the canvas auto-gradient's
# saturation-dependent top lift is the cause, and fits a law.
#
# Method (one minimal .icon per case, so the canvas IS the ring):
#   canvas fill = the case under test
#   artwork     = one 256x256 untagged sRGB PNG of PATCH, centred, no
#                 position  (its 1:1 blit is the readout)
#   render      = ictool --platform macOS --rendition Default
#                 --width 1024 --height 1024 --scale 1
#   verdict     = centre pixel. RAW iff the patch bytes come back
#                 verbatim; CONVERT iff they come back soft-knee
#                 converted (the p3-solid law).
#
# Sections (each authored as minimal .icon bundles and rendered):
#   repro      the 8 rows recorded in the ledger, re-measured (8/8)
#   scan       RAW/CONVERT at 32 points per axis -- establishes that every
#              ray through black is monotone, so bisection is sound
#   bisect     the flip point along 13 color axes
#   patchdep   the same flip points against four different readout patches;
#              identical, so the gate reads the ring, not ring-vs-artwork
#   mech       five canvas mechanisms -- flat `linear-gradient` [C,C],
#              `automatic-gradient`, `solid`, a full-bleed PNG canvas
#              (which takes no automatic gradient at all), and a literal
#              two-stop with the MEASURED auto-gradient lift baked in
#   grid       the flip point along all 61 directions of the unit cube
#   minchan    the flip point against the direction's smallest component
#   dominance  pairs where the brighter color reads DARKER -- the result
#              that rules out every brightness statistic
#   hue        the chroma bound around the S=1 hue circle, 2.5 degrees
#   switch     where the chroma constraint lets go (an absolute floor on
#              the minimum channel, not a saturation ratio)
#   fit        convexity, and closed forms scored on held-out directions
#   law        the law, validated against 400 random canvases
#
#   $PYTHON probe-ring-law.py [--section <name>] [--skip-render]
import argparse
import json
import os
import shutil
import subprocess

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("--section", default=None)
ap.add_argument("--skip-render", action="store_true")
a = ap.parse_args()

WORK = "/tmp/ring-law-probe"
ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool"

M_P3 = np.array([[0.4865709, 0.2656677, 0.1982173],
                 [0.2289746, 0.6917385, 0.0792869],
                 [0.0, 0.0451134, 1.0439444]])
M_SR = np.array([[0.4123908, 0.3575843, 0.1804808],
                 [0.2126390, 0.7151687, 0.0721923],
                 [0.0193308, 0.1191948, 0.9505322]])
P3_SRGB = np.linalg.inv(M_SR) @ M_P3
SRGB_P3 = np.linalg.inv(P3_SRGB)


def lin(u):
    u = np.asarray(u, np.float64)
    return np.where(u <= 0.04045, u / 12.92, ((u + 0.055) / 1.055) ** 2.4)


def enc(u):
    u = np.clip(np.asarray(u, np.float64), 0, 1)
    return np.where(u <= 0.0031308, 12.92 * u, 1.055 * u ** (1 / 2.4) - 0.055)


def srgb_to_p3coded(v255):
    """The sRGB-composite (CONVERT) path: sRGB bytes -> P3-coded bytes."""
    return enc(SRGB_P3 @ lin(np.asarray(v255, np.float64) / 255)) * 255


PATCH = (230, 46, 86)                       # the ledger's readout patch

os.makedirs(WORK, exist_ok=True)


# ---------------- color literals -------------------------------------------
def gray(v):
    return "gray:%.5f,1.00000" % v


def srgb(r, g, b):
    return "srgb:%.5f,%.5f,%.5f,1.00000" % (r, g, b)


def p3(r, g, b):
    return "display-p3:%.5f,%.5f,%.5f,1.00000" % (r, g, b)


def spec_rgb(spec):
    """The declared triple of a color literal, in ITS OWN coordinates."""
    head, _, rest = spec.partition(":")
    v = [float(x) for x in rest.split(",")]
    if head == "gray":
        return np.array([v[0]] * 3)
    return np.array(v[:3])


def spec_to_srgb(spec):
    """Declared literal -> encoded sRGB coordinates."""
    head = spec.partition(":")[0]
    v = spec_rgb(spec)
    if head == "display-p3":
        return enc(P3_SRGB @ lin(v))
    return v                                 # gray and srgb are already sRGB


def spec_to_p3(spec):
    """Declared literal -> encoded (P3-coded) render coordinates."""
    head = spec.partition(":")[0]
    v = spec_rgb(spec)
    if head == "display-p3":
        return v
    return enc(SRGB_P3 @ lin(v))


# ---------------- bundle authoring ------------------------------------------
def patch_png(path, patch):
    arr = np.zeros((256, 256, 4), np.uint8)
    arr[:, :] = (*patch, 255)
    Image.fromarray(arr, "RGBA").save(path)


def author(name, fill=None, bleed=None, patch=PATCH):
    """Render one case. `fill` is a canvas fill dict; `bleed` is an encoded
    sRGB triple painted as a full-bleed opaque PNG layer UNDER the patch
    (no declared canvas fill -- so no automatic gradient anywhere)."""
    out = os.path.join(WORK, name + ".png")
    if a.skip_render and os.path.exists(out):
        return np.asarray(Image.open(out).convert("RGB")).astype(np.float64)
    d = os.path.join(WORK, name + ".icon")
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(os.path.join(d, "Assets"))
    patch_png(os.path.join(d, "Assets", "patch.png"), patch)
    # ictool paints `layers` top-first, so the patch must lead the list.
    layers = [{"image-name": "patch.png", "name": "patch", "glass": False}]
    if bleed is not None:
        arr = np.zeros((1024, 1024, 4), np.uint8)
        arr[:, :] = (*np.round(np.clip(bleed, 0, 1) * 255).astype(int), 255)
        Image.fromarray(arr, "RGBA").save(os.path.join(d, "Assets", "bleed.png"))
        layers.append({"image-name": "bleed.png", "name": "bleed", "glass": False})
    doc = {"groups": [{"layers": layers}],
           "supported-platforms": {"squares": "shared"}}
    if fill:
        doc["fill"] = fill
    json.dump(doc, open(os.path.join(d, "icon.json"), "w"))
    subprocess.run([ICTOOL, d, "--export-image", "--output-file", out,
                    "--platform", "macOS", "--rendition", "Default",
                    "--width", "1024", "--height", "1024", "--scale", "1"],
                   check=True, capture_output=True)
    return np.asarray(Image.open(out).convert("RGB")).astype(np.float64)


def flat_lg(spec):
    """A two-stop linear-gradient with both stops equal -- a literal flat
    canvas that still travels the gradient code path."""
    return {"linear-gradient": [spec, spec],
            "orientation": {"start": {"x": 0.5, "y": 0},
                            "stop": {"x": 0.5, "y": 1}}}


def two_stop(top, bot):
    return {"linear-gradient": [top, bot],
            "orientation": {"start": {"x": 0.5, "y": 0},
                            "stop": {"x": 0.5, "y": 1}}}


def verdict(im, patch=PATCH):
    """Centre pixel -> RAW / CONVERT, with the distance to each hypothesis."""
    c = np.median(im[480:544, 480:544].reshape(-1, 3), axis=0)
    raw = np.asarray(patch, np.float64)
    dr, dc = np.abs(c - raw).max(), np.abs(c - srgb_to_p3coded(patch)).max()
    return ("RAW" if dr < dc else "CONVERT"), c, dr, dc


def canvas_read(im, y):
    """The RENDERED canvas at row band `y`, in a column 120..240 px from the
    left edge: outside the body-light's ~48 px reach and clear of the
    centred 384..640 patch. Shows what ictool made of the declared fill."""
    return np.median(im[y:y + 24, 120:240].reshape(-1, 3), axis=0)


def run(name, fill=None, bleed=None, patch=PATCH):
    im = author(name, fill=fill, bleed=bleed, patch=patch)
    v, c, dr, dc = verdict(im, patch)
    return v, c, dr, dc, canvas_read(im, 120)


want = lambda s: a.section in (None, s)
print(f"patch {PATCH}   RAW hypothesis {np.round(np.array(PATCH,float),1)}   "
      f"CONVERT hypothesis {np.round(srgb_to_p3coded(PATCH), 1)}")

# ---------------- repro ------------------------------------------------------
if want("repro"):
    print("\n[repro] the 8 rows recorded in the ledger")
    LEDGER = [(gray(0.310), "RAW"), (gray(0.312), "CONVERT"),
              (srgb(0.25, 0, 0), "RAW"), (srgb(0.30, 0, 0), "CONVERT"),
              (srgb(0, 0.20, 0), "CONVERT"), (srgb(0, 0, 0.30), "RAW"),
              (p3(0.25, 0, 0), "CONVERT"), (p3(0.295, 0, 0), "CONVERT")]
    agree = 0
    for spec, recorded in LEDGER:
        v, c, dr, dc, tr = run("repro-" + spec.replace(":", "-").replace(",", "_"),
                               fill=flat_lg(spec))
        ok = "ok" if v == recorded else "MISMATCH"
        agree += v == recorded
        print(f"  {spec:<40} {v:<8} (rec {recorded:<8} {ok})  "
              f"centre {np.round(c,1)} dRAW {dr:.1f} dCONV {dc:.1f}  "
              f"canvas@120 {np.round(tr,1)}")
    print(f"  => {agree}/{len(LEDGER)} reproduce")

# ---------------- bisection --------------------------------------------------
# An axis is a unit direction; the case at scalar v is the literal
# <space>:(v * axis). Bisection assumes monotonicity along the axis (RAW
# below, CONVERT above) -- checked by bracketing both ends first.
AXES = [
    ("gray",      "gray", (1, 1, 1)),
    ("srgb-R",    "srgb", (1, 0, 0)),
    ("srgb-G",    "srgb", (0, 1, 0)),
    ("srgb-B",    "srgb", (0, 0, 1)),
    ("srgb-C",    "srgb", (0, 1, 1)),
    ("srgb-M",    "srgb", (1, 0, 1)),
    ("srgb-Y",    "srgb", (1, 1, 0)),
    ("srgb-RG2",  "srgb", (1, 0.5, 0)),
    ("srgb-GB2",  "srgb", (0, 1, 0.5)),
    ("srgb-halfG", "srgb", (0.5, 1, 0.5)),
    ("p3-R",      "display-p3", (1, 0, 0)),
    ("p3-G",      "display-p3", (0, 1, 0)),
    ("p3-B",      "display-p3", (0, 0, 1)),
]


def literal(space, rgb):
    if space == "gray":
        return gray(rgb[0])
    if space == "srgb":
        return srgb(*rgb)
    return p3(*rgb)


def case_spec(space, axis, v):
    return literal(space, tuple(np.clip(np.asarray(axis, float) * v, 0, 1)))


def classify(spec, fill=None, tag="bi", patch=PATCH):
    name = tag + "-" + spec.replace(":", "-").replace(",", "_")
    return run(name, fill=fill if fill is not None else flat_lg(spec), patch=patch)


def bisect_axis(space, axis, lo=0.0, hi=1.0, tol=0.001, probe=None, tag="bi",
                patch=PATCH):
    """Return ((v_raw, v_conv), None, None) bracketing the flip, else the two
    failing endpoints. Monotonicity along each ray is established by
    --section scan (13/13 axes, one transition each), so bisection is sound.

    `probe(space, axis, v)` -> "RAW"/"CONVERT" selects the canvas mechanism;
    the default is a flat two-stop `linear-gradient`."""
    pr = probe or (lambda sp, ax, v: classify(case_spec(sp, ax, v), tag=tag,
                                              patch=patch)[0])
    vlo, vhi = pr(space, axis, lo), pr(space, axis, hi)
    if vlo != "RAW" or vhi != "CONVERT":
        return None, (lo, vlo), (hi, vhi)
    while hi - lo > tol:
        mid = (lo + hi) / 2
        if pr(space, axis, mid) == "RAW":
            lo = mid
        else:
            hi = mid
    return (lo, hi), None, None


def report_point(space, axis, v):
    """Every candidate coordinate of the flip colour, for the fit section."""
    spec = case_spec(space, axis, v)
    s = spec_to_srgb(spec)
    q = spec_to_p3(spec)
    ls, lq = lin(s), lin(q)
    return {
        "spec": spec, "srgb": s, "p3": q,
        "srgbMax": s.max(), "p3Max": q.max(),
        "srgbLuma": float(np.array([.2126, .7152, .0722]) @ s),
        "linLuma": float(np.array([.2126, .7152, .0722]) @ ls),
        "p3LinLuma": float(np.array([.2290, .6917, .0793]) @ lq),
        "srgbSum": float(s.sum()), "linMax": float(ls.max()),
        "linSum": float(ls.sum()),
    }


# ---------------- dense scan (monotonicity) ----------------------------------
if want("scan"):
    print("\n[scan] RAW(.) / CONVERT(#) along each axis, v = 0.00 .. 0.62 step 0.02")
    print("       (a single . -> # transition means the axis is monotone)")
    for name, space, axis in AXES:
        row = ""
        for k in range(32):
            v = k * 0.02
            row += "." if classify(case_spec(space, axis, v), tag="sc")[0] == "RAW" else "#"
        flips = sum(row[i] != row[i + 1] for i in range(len(row) - 1))
        print(f"  {name:<12} {row}  transitions {flips}")


if want("bisect"):
    print("\n[bisect] flip point per axis, flat two-stop `linear-gradient`")
    FLIPS = {}
    for name, space, axis in AXES:
        br, bad_lo, bad_hi = bisect_axis(space, axis, tag="bi")
        if br is None:
            print(f"  {name:<12} NOT BRACKETED  lo{bad_lo}  hi{bad_hi}")
            continue
        lo, hi = br
        FLIPS[name] = (space, axis, lo, hi)
        pl, ph = report_point(space, axis, lo), report_point(space, axis, hi)
        print(f"  {name:<12} RAW<= {lo:.4f}  CONVERT>= {hi:.4f}   "
              f"srgb {np.round(pl['srgb'],3)}  srgbMax {pl['srgbMax']:.3f}  "
              f"p3Max {ph['p3Max']:.3f}  srgbLuma {pl['srgbLuma']:.3f}  "
              f"linLuma {pl['linLuma']:.4f}")
    np.save(os.path.join(WORK, "flips.npy"),
            np.array([(k, *map(str, v[:2]), v[2], v[3]) for k, v in FLIPS.items()],
                     dtype=object), allow_pickle=True)

# ---------------- is the law about the canvas, or the contrast? --------------
# If the flip point of a given canvas moves when the READOUT PATCH changes,
# the classifier is reading a canvas/artwork relationship, not the ring.
if want("patchdep"):
    print("\n[patchdep] flip point vs readout-patch color")
    PATCHES = [(230, 46, 86), (30, 215, 96), (0, 122, 255), (255, 149, 0),
               (12, 12, 20)]
    for pc in PATCHES:
        if np.abs(srgb_to_p3coded(pc) - np.array(pc, float)).max() < 4:
            print(f"  patch {pc}  SKIP: RAW and CONVERT differ by "
                  f"{np.abs(srgb_to_p3coded(pc) - np.array(pc,float)).max():.1f}/255 "
                  f"-- not separable")
            continue
        out = []
        for name, space, axis in AXES[:4]:
            tag = "pd%d_%d_%d" % pc
            br, bl, bh = bisect_axis(space, axis, tag=tag, patch=pc)
            out.append(f"{name} {('%.4f' % br[0]) if br else 'NONE'}")
        print(f"  patch {str(pc):<16} " + "   ".join(out))

# ---------------- canvas mechanism (is the auto-gradient lift the cause?) ----
if want("mech"):
    print("\n[mech] flip point per canvas mechanism")
    print("  lg     flat two-stop `linear-gradient` [C, C]")
    print("  ag     `automatic-gradient: C` (ictool derives its own top lift)")
    print("  solid  `solid: C`")
    print("  bleed  full-bleed opaque untagged-sRGB PNG layer, NO declared fill")
    print("  lglift literal two-stop [measured ag top, C] -- the lift, baked in")

    def mech_probe(kind):
        def f(space, axis, v):
            spec = case_spec(space, axis, v)
            nm = f"me-{kind}-" + spec.replace(":", "-").replace(",", "_")
            if kind == "lg":
                return run(nm, fill=flat_lg(spec))[0]
            if kind == "ag":
                return run(nm, fill={"automatic-gradient": spec})[0]
            if kind == "solid":
                return run(nm, fill={"solid": spec})[0]
            if kind == "bleed":
                return run(nm, bleed=spec_to_srgb(spec))[0]
            if kind == "lglift":
                return run(nm, fill=two_stop(ag_top_literal(spec), spec))[0]
            raise ValueError(kind)
        return f

    def ag_top(spec):
        """MEASURE the automatic-gradient's top stop for `spec`: render the
        canvas with blank artwork and linearly extrapolate the rendered
        centre column to y=0 (the probe-autogradient-colored method). The
        flat [C,C] gradient of the same C gives the no-lift reference, so
        the lift is read as a difference of two renders -- no model."""
        key = "agtop-" + spec.replace(":", "-").replace(",", "_")
        cached = os.path.join(WORK, key + ".npy")
        if os.path.exists(cached):
            return np.load(cached)
        prof = {}
        for kind, fill in (("ag", {"automatic-gradient": spec}),
                           ("lg", flat_lg(spec))):
            im = author(f"{key}-{kind}", fill=fill, patch=(0, 0, 0))
            col = np.median(im[:, 120:240, :], axis=1)      # clear of the patch
            ys = np.arange(120, 900)
            A = np.stack([np.ones(len(ys)), (ys + 0.5) / 1024], 1)
            coef, *_ = np.linalg.lstsq(A, col[120:900], rcond=None)
            prof[kind] = (coef[0], coef[0] + coef[1])       # (top, bottom)
        lift = (prof["ag"][0] - prof["ag"][1]) - (prof["lg"][0] - prof["lg"][1])
        np.save(cached, lift)
        return lift

    def ag_top_literal(spec):
        """`spec` raised by its own measured auto-gradient lift, as a literal."""
        head = spec.partition(":")[0]
        base = spec_rgb(spec)
        lift = ag_top(spec) / 255.0
        if head == "display-p3":
            top = np.clip(base + lift, 0, 1)
        else:
            top = np.clip(enc(P3_SRGB @ lin(np.clip(spec_to_p3(spec) + lift, 0, 1))),
                          0, 1)
        if head == "gray":
            return gray(float(top.mean()))
        return literal(head, tuple(top))

    rows = []
    for name, space, axis in AXES[:4] + [AXES[6], AXES[9]]:
        line = f"  {name:<12}"
        vals = {}
        for kind in ("lg", "ag", "solid", "bleed", "lglift"):
            br, bl, bh = bisect_axis(space, axis, probe=mech_probe(kind))
            vals[kind] = br[0] if br else None
            line += f" {kind} " + (f"{br[0]:.4f}" if br else " NONE ")
        rows.append((name, vals))
        print(line)
    same = all(v["lg"] is not None and v["solid"] is not None
               and abs(v["lg"] - v["solid"]) <= 0.002 for _, v in rows)
    print(f"  => lg == solid on every axis within 0.002: {same}")

# ---------------- the full hue map -------------------------------------------
# `solid` canvases (no lift, continuous float input) along every direction of
# the unit cube whose largest component is 1, at quarter steps: 61 rays.
GRID_STEPS = (0.0, 0.25, 0.5, 0.75, 1.0)
GRID_DIRS = [(r, g, b) for r in GRID_STEPS for g in GRID_STEPS for b in GRID_STEPS
             if max(r, g, b) == 1.0]


def grid_probe(space, axis, v):
    spec = case_spec(space, axis, v)
    return run("gr-" + spec.replace(":", "-").replace(",", "_"),
               fill={"solid": spec})[0]


if want("grid"):
    print(f"\n[grid] flip point of `solid` canvases along {len(GRID_DIRS)} "
          f"cube directions")
    print("  dir(r,g,b)        vFlip    color at flip (encoded sRGB)")
    recs = []
    for d in GRID_DIRS:
        br, bl, bh = bisect_axis("srgb", d, probe=grid_probe)
        if br is None:
            print(f"  {str(d):<18} NOT BRACKETED {bl} {bh}")
            continue
        v = (br[0] + br[1]) / 2
        c = np.asarray(d) * v
        recs.append((d, v, c))
        print(f"  {str(d):<18} {v:.4f}   {np.round(c, 4)}")
    np.save(os.path.join(WORK, "grid.npy"),
            np.array([(*d, v) for d, v, _ in recs], np.float64))
    print(f"  => {len(recs)} rays bracketed, saved to {WORK}/grid.npy")

# ---------------- how the minimum channel lifts the threshold ----------------
# The grid says every direction with min > 0 flips at the neutral cap, while
# min == 0 directions can flip far below it. Is that a discontinuity at zero,
# or a ramp the grid's quarter steps stepped over?
EPS = (0.0, 0.01, 0.02, 0.04, 0.06, 0.08, 0.12, 0.16, 0.20, 0.25, 0.35, 0.50, 1.0)
MIN_FAMILIES = [
    ("(e,1,e)", lambda e: (e, 1.0, e)),     # green, desaturated symmetrically
    ("(e,1,0)", lambda e: (e, 1.0, 0.0)),   # green + red only
    ("(0,1,e)", lambda e: (0.0, 1.0, e)),   # green + blue only
    ("(1,e,e)", lambda e: (1.0, e, e)),     # red, desaturated symmetrically
]

if want("minchan"):
    print("\n[minchan] flip point vs the smallest component of the direction")
    print("  family      " + "".join(f"{e:>8}" for e in EPS))
    for label, mk in MIN_FAMILIES:
        row = f"  {label:<12}"
        for e in EPS:
            br, bl, bh = bisect_axis("srgb", mk(e), probe=grid_probe)
            row += f"{br[0]:>8.4f}" if br else "    NONE"
        print(row)

# ---------------- the headline: the classifier is not monotone ---------------
if want("dominance"):
    print("\n[dominance] a strictly brighter colour that renders DARKER")
    PAIRS = [((0.0, 0.1160, 0.0), (0.0800, 0.3000, 0.0800)),
             ((0.0, 0.1160, 0.1160), (0.0800, 0.3000, 0.3000)),
             ((0.2900, 0.0, 0.0), (0.3000, 0.0400, 0.0400))]
    for lo, hi in PAIRS:
        dom = all(h >= l for l, h in zip(lo, hi))
        vlo = run("dom-lo-%s" % (lo,), fill={"solid": srgb(*lo)})[0]
        vhi = run("dom-hi-%s" % (hi,), fill={"solid": srgb(*hi)})[0]
        print(f"  {str(lo):<26} {vlo:<8}   {str(hi):<26} {vhi:<8}"
              f"  hi dominates lo: {dom}")

# ---------------- V cap around the fully saturated hue circle ----------------
def hue_unit(h):
    """The S=1, V=1 RGB direction at hue angle h (degrees): max 1, min 0."""
    x = 1 - abs((h / 60.0) % 2 - 1)
    return [(1, x, 0), (x, 1, 0), (0, 1, x), (0, x, 1), (x, 0, 1),
            (1, 0, x)][int(h // 60) % 6]


# The chroma bound is sampled at 2.5 degrees: at 10 degrees the conservative
# "lower of the two bracketing samples" read is too coarse where the bound
# climbs fastest (hue 205-220 gains 0.09 in 15 degrees), and it wrongly
# rejected greatpods' own ring colour, which ictool renders RAW.
HUE_STEP = 2.5
HUE_N = int(360 / HUE_STEP)

if want("hue"):
    print("\n[hue] chroma bound around the S=1 hue circle (`solid` canvases)")
    print("  at min = 0 the chroma max - min IS the max channel, so the flip")
    print("  point along each hue ray is that hue's chroma bound.")
    table = []
    for k in range(HUE_N):
        h = k * HUE_STEP
        u = hue_unit(h)
        br, bl, bh = bisect_axis("srgb", u, probe=grid_probe)
        v = (br[0] + br[1]) / 2 if br else float("nan")
        table.append(v)
        print(f"  {h:>6.1f}  {str(tuple(round(x,3) for x in u)):<22} "
              f"{v:.4f}  {np.round(np.asarray(u) * v, 4)}")
    np.save(os.path.join(WORK, "chroma-by-hue.npy"), np.array(table))
    print(f"\n  CHROMA_BY_HUE ({HUE_N} entries, {HUE_STEP} deg apart):")
    for i in range(0, HUE_N, 6):
        row = ", ".join(f"{v:.4f}" for v in table[i:i + 6])
        print(f"    {row},  // {i * HUE_STEP:g}-{(i + 5) * HUE_STEP:g}")

# ---------------- where does the high-saturation constraint switch off? ------
# Ray d(h, e) = (1-e)*hue_unit(h) + e*(1,1,1): max 1, min e, so S = 1 - e.
# A ray is "in the cap regime" iff it is still RAW at v = 0.300, just under
# the universal cap -- one render per test, so the switch bisects cheaply.
def sat_dir(h, e):
    u = np.asarray(hue_unit(h), np.float64)
    return tuple((1 - e) * u + e)


if want("switch"):
    print("\n[switch] the saturation at which the extra constraint lets go")
    print("  probe: is the ray still RAW at v = 0.300 (just under the cap)?")
    for h in range(0, 360, 30):
        lo, hi = 0.0, 1.0
        at = lambda e: run("sw-%d-%.4f" % (h, e),
                           fill={"solid": srgb(*(np.asarray(sat_dir(h, e)) * 0.300))}
                           )[0] == "RAW"
        if at(lo):
            print(f"  hue {h:>3}   already at cap at S = 1 (no extra constraint)")
            continue
        if not at(hi):
            print(f"  hue {h:>3}   never reaches the cap even at S = 0")
            continue
        while hi - lo > 0.004:
            mid = (lo + hi) / 2
            if at(mid):
                hi = mid
            else:
                lo = mid
        print(f"  hue {h:>3}   switches at min/max = {(lo+hi)/2:.3f}  "
              f"(S = {1-(lo+hi)/2:.3f})")

# ---------------- fit ---------------------------------------------------------
# 40 random midpoints of measured boundary colours all render RAW, so the RAW
# region is convex -- it is a polytope {c : W c <= 1}, not a brightness
# threshold. Candidate facet normals: the three channels (the recorded
# max-channel cap) and the six channel DIFFERENCES, which is what the
# saturation ramp measured (green's flip holds max - min constant at 0.111,
# red's at 0.281). Each bound is set to the largest value any measured
# boundary colour reaches, then the fit is validated on held-out directions.
FUNCS = [("r", (1, 0, 0)), ("g", (0, 1, 0)), ("b", (0, 0, 1)),
         ("r-g", (1, -1, 0)), ("r-b", (1, 0, -1)), ("g-r", (-1, 1, 0)),
         ("g-b", (0, 1, -1)), ("b-r", (-1, 0, 1)), ("b-g", (0, -1, 1))]
W = np.array([w for _, w in FUNCS], np.float64)


def boundary(dirs, tag):
    out = []
    for d in dirs:
        br, _, _ = bisect_axis("srgb", d, probe=grid_probe)
        if br:
            out.append((np.asarray(d, np.float64), (br[0] + br[1]) / 2))
    return out


def predict(d, t):
    """Radial limit of {c : W c <= t} along direction d."""
    s = W @ np.asarray(d, np.float64)
    act = s > 1e-9
    return (t[act] / s[act]).min() if act.any() else np.inf


if want("fit"):
    rng = np.random.default_rng(20260913)
    rand = [tuple(x) for x in rng.random((60, 3))]
    fit_dirs = GRID_DIRS + [hue_unit(h) for h in range(0, 360, 10)] + rand[:30]
    hold_dirs = rand[30:]
    print(f"\n[fit] {len(fit_dirs)} fitting directions, {len(hold_dirs)} held out")
    B = boundary(fit_dirs, "fit")
    H = boundary(hold_dirs, "hold")
    np.save(os.path.join(WORK, "boundary-fit.npy"),
            np.array([(*d, v) for d, v in B], np.float64))
    np.save(os.path.join(WORK, "boundary-hold.npy"),
            np.array([(*d, v) for d, v in H], np.float64))
    X = np.array([d * v for d, v in B])
    t = (W @ X.T).max(1)                      # tightest bound containing them
    for (name, _), tv in zip(FUNCS, t):
        print(f"  {name:<5} <= {tv:.4f}")

    def score(name, S):
        e = np.array([predict(d, t) - v for d, v in S])
        print(f"  {name:<10} n {len(S):>3}  max |dv| {np.abs(e).max():.4f}  "
              f"rms {np.sqrt((e ** 2).mean()):.4f}  worst over-predict {e.max():+.4f}")

    score("fit", B)
    score("held out", H)
    rec = np.array([0.308] * 3 + [9] * 6, np.float64)   # the recorded law
    e = np.array([predict(d, rec) - v for d, v in B + H])
    print(f"  recorded   n {len(B)+len(H):>3}  max |dv| {np.abs(e).max():.4f}  "
          f"rms {np.sqrt((e ** 2).mean()):.4f}  worst over-predict {e.max():+.4f}")

# ---------------- the law -----------------------------------------------------
# The boundary is convex but not a polytope of few facets and not a quadric.
# What the ramps measure exactly is a constant CHROMA at the flip: holding
# hue and sliding the minimum channel up, green flips at max - min = 0.111
# across nine samples and red at 0.281 across five, while the max channel
# itself moves by 0.03. So the law is a chroma bound, and the hue circle
# (--section hue, 36 samples at min = 0, where chroma = max) IS that bound:
#
#     raw  <=>  ring opaque
#               AND max(c) < CAP
#               AND max(c) - min(c) < CHROMA_BY_HUE[hue(c)]
#
# CAP is the smallest cap measured over every direction; the chroma table is
# read at the conservative (lower) of the two bracketing hue samples, so the
# rule stays an INNER bound -- it never claims raw where ictool converts.
# Table entries at ~0.311 are hues where no chroma bound binds before the cap.
LAW_CAP = 0.308
CHROMA_BY_HUE = [
    0.2817, 0.2925, 0.3071, 0.3101, 0.3120, 0.3120,  # 0-12.5
    0.3110, 0.3101, 0.3120, 0.3022, 0.2886, 0.2788,  # 15-27.5
    0.2681, 0.2583, 0.2466, 0.2378, 0.2280, 0.2183,  # 30-42.5
    0.2104, 0.2026, 0.1958, 0.1880, 0.1812, 0.1753,  # 45-57.5
    0.1685, 0.1704, 0.1724, 0.1724, 0.1733, 0.1753,  # 60-72.5
    0.1763, 0.1782, 0.1782, 0.1792, 0.1802, 0.1812,  # 75-87.5
    0.1821, 0.1831, 0.1831, 0.1831, 0.1841, 0.1567,  # 90-102.5
    0.1499, 0.1411, 0.1323, 0.1255, 0.1216, 0.1147,  # 105-117.5
    0.1118, 0.1118, 0.1118, 0.1118, 0.1118, 0.1118,  # 120-132.5
    0.1118, 0.1118, 0.1118, 0.1118, 0.1118, 0.1118,  # 135-147.5
    0.1118, 0.1118, 0.1118, 0.1118, 0.1118, 0.1118,  # 150-162.5
    0.1118, 0.1118, 0.1118, 0.1118, 0.1118, 0.1118,  # 165-177.5
    0.1118, 0.1167, 0.1216, 0.1274, 0.1343, 0.1411,  # 180-192.5
    0.1489, 0.1577, 0.1675, 0.1782, 0.1919, 0.2065,  # 195-207.5
    0.2231, 0.2437, 0.2681, 0.2974, 0.3110, 0.3091,  # 210-222.5
    0.3101, 0.3101, 0.3101, 0.3101, 0.3101, 0.3110,  # 225-237.5
    0.3110, 0.3110, 0.3110, 0.3110, 0.3110, 0.3110,  # 240-252.5
    0.3101, 0.3101, 0.3101, 0.3101, 0.3101, 0.3101,  # 255-267.5
    0.3101, 0.3101, 0.3101, 0.3101, 0.3091, 0.3110,  # 270-282.5
    0.3110, 0.3110, 0.3110, 0.3110, 0.3081, 0.2944,  # 285-297.5
    0.2817, 0.2817, 0.2817, 0.2817, 0.2817, 0.2817,  # 300-312.5
    0.2817, 0.2817, 0.2817, 0.2817, 0.2817, 0.2817,  # 315-327.5
    0.2817, 0.2817, 0.2817, 0.2817, 0.2817, 0.2817,  # 330-342.5
    0.2817, 0.2817, 0.2817, 0.2817, 0.2817, 0.2817,  # 345-357.5
]


def hue_of(c):
    """HSV hue in degrees; None for a neutral (chroma 0)."""
    r, g, b = (float(x) for x in c)
    mx, mn = max(r, g, b), min(r, g, b)
    if mx == mn:
        return None
    d = mx - mn
    if mx == r:
        h = 60 * (((g - b) / d) % 6)
    elif mx == g:
        h = 60 * ((b - r) / d + 2)
    else:
        h = 60 * ((r - g) / d + 4)
    return h % 360


def chroma_bound(h):
    """The measured bound at hue h, taken at the lower of the two bracketing
    samples so interpolation cannot make the rule optimistic."""
    if h is None:
        return float("inf")
    i = int(h // HUE_STEP) % HUE_N
    return min(CHROMA_BY_HUE[i], CHROMA_BY_HUE[(i + 1) % HUE_N])


def law_raw(c):
    c = [float(x) for x in c]
    return max(c) < LAW_CAP and (max(c) - min(c)) < chroma_bound(hue_of(c))


if want("law"):
    print(f"\n[law] raw <=> max < {LAW_CAP} AND max - min < CHROMA_BY_HUE[hue]")
    rng = np.random.default_rng(913)
    N = 400
    cols = rng.random((N, 3)) * 0.36
    unsound = wasted = nraw = npred = 0
    for i, c in enumerate(cols):
        actual = run("law-%d" % i, fill={"solid": srgb(*c)})[0] == "RAW"
        pred = law_raw(c)
        nraw += actual
        npred += pred
        if pred and not actual:
            unsound += 1
            print(f"  UNSOUND {np.round(c,4)} predicted raw, renders CONVERT")
        if actual and not pred:
            wasted += 1
    print(f"  {N} random canvases: {nraw} render RAW, the rule predicts {npred}")
    print(f"  unsound (claims raw, ictool converts): {unsound}")
    print(f"  conservative (ictool raws, rule says convert): {wasted}"
          f"  = {wasted / max(nraw,1):.1%} of the raw set")
    print(f"  recorded law (maxEnc < 0.308) on the same sample: "
          f"{sum(1 for c in cols if max(c) < 0.308)} predicted raw, "
          f"{sum(1 for i, c in enumerate(cols) if max(c) < 0.308 and run('law-%d' % i, fill={'solid': srgb(*c)})[0] != 'RAW')}"
          f" of them UNSOUND")
