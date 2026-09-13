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
RAW = np.array(PATCH, np.float64)
CONV = srgb_to_p3coded(PATCH)

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
def patch_png(path):
    arr = np.zeros((256, 256, 4), np.uint8)
    arr[:, :] = (*PATCH, 255)
    Image.fromarray(arr, "RGBA").save(path)


def author(name, fill=None, bleed=None):
    """Render one case. `fill` is a canvas fill dict; `bleed` is an encoded
    sRGB triple painted as a full-bleed opaque PNG layer UNDER the patch
    (no declared canvas fill -- so no automatic gradient anywhere)."""
    out = os.path.join(WORK, name + ".png")
    if a.skip_render and os.path.exists(out):
        return np.asarray(Image.open(out).convert("RGB")).astype(np.float64)
    d = os.path.join(WORK, name + ".icon")
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(os.path.join(d, "Assets"))
    patch_png(os.path.join(d, "Assets", "patch.png"))
    layers = []
    if bleed is not None:
        arr = np.zeros((1024, 1024, 4), np.uint8)
        arr[:, :] = (*np.round(np.clip(bleed, 0, 1) * 255).astype(int), 255)
        Image.fromarray(arr, "RGBA").save(os.path.join(d, "Assets", "bleed.png"))
        layers.append({"image-name": "bleed.png", "name": "bleed", "glass": False})
    layers.append({"image-name": "patch.png", "name": "patch", "glass": False})
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


def verdict(im):
    """Centre pixel -> RAW / CONVERT, with the distance to each hypothesis."""
    c = np.median(im[480:544, 480:544].reshape(-1, 3), axis=0)
    dr, dc = np.abs(c - RAW).max(), np.abs(c - CONV).max()
    return ("RAW" if dr < dc else "CONVERT"), c, dr, dc


def canvas_read(im, y):
    """The RENDERED canvas at row band `y`, in a column 120..240 px from the
    left edge: outside the body-light's ~48 px reach and clear of the
    centred 384..640 patch. Shows what ictool made of the declared fill."""
    return np.median(im[y:y + 24, 120:240].reshape(-1, 3), axis=0)


def run(name, fill=None, bleed=None):
    im = author(name, fill=fill, bleed=bleed)
    v, c, dr, dc = verdict(im)
    return v, c, dr, dc, canvas_read(im, 120)


want = lambda s: a.section in (None, s)
print(f"patch {PATCH}   RAW hypothesis {np.round(RAW,1)}   "
      f"CONVERT hypothesis {np.round(CONV, 1)}")

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


def classify(spec, fill=None, tag="bi"):
    name = tag + "-" + spec.replace(":", "-").replace(",", "_")
    return run(name, fill=fill if fill is not None else flat_lg(spec))


def bisect_axis(space, axis, lo=0.0, hi=1.0, tol=0.001, fill_of=None, tag="bi"):
    """Return (v_raw, v_conv) bracketing the flip, or None if not bracketed."""
    fo = fill_of or (lambda s: flat_lg(s))
    vlo = classify(case_spec(space, axis, lo), fill=fo(case_spec(space, axis, lo)), tag=tag)[0]
    vhi = classify(case_spec(space, axis, hi), fill=fo(case_spec(space, axis, hi)), tag=tag)[0]
    if vlo != "RAW" or vhi != "CONVERT":
        return None, (lo, vlo), (hi, vhi)
    while hi - lo > tol:
        mid = (lo + hi) / 2
        v = classify(case_spec(space, axis, mid), fill=fo(case_spec(space, axis, mid)), tag=tag)[0]
        if v == "RAW":
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
