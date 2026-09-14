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
# Sections:
#   repro    the 8 rows recorded in the ledger, re-measured
#   bisect   per-axis bisection of the flip point (gray, R, G, B, and
#            mixed hues) on a flat two-stop `linear-gradient`
#   mech     the same colors across four canvas mechanisms -- flat
#            linear-gradient, literal gradient with the modeled
#            auto-gradient lift baked into the top stop, `solid`, and a
#            full-bleed opaque PNG canvas layer (which takes no
#            auto-gradient at all) -- plus the RENDERED top-row value,
#            to see what the classifier actually had in front of it
#   fit      candidate laws scored against the bisected thresholds
#
#   $PYTHON probe-ring-law.py [--section repro|bisect|mech|fit] [--skip-render]
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
