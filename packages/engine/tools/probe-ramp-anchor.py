#!/usr/bin/env python3
# Instrument: does the glass material alpha ramp anchor to CANVAS-Y or to
# GLASS-BOUNDS-Y? The material family (probe-material.py,
# calibration/glass-material-family.json) measured alpha(y) under a large
# centered circle; before the translator can synthesize glass material it
# must know whether that ramp is a function of absolute canvas y or of the
# pixel's normalized position within the glass layer's bounding box.
#
# Method: same two-gray per-row affine solve (out = k*bg + c, alpha = 1-k)
# at translucency 0.5, no specular. One big reference circle (r=10.5 units,
# the family geometry) gives alpha_ref(y) in-run; two SMALL circles
# (r=4.5 units = 144 px) at top (cy=10.5 units, 336 px) and bottom
# (cy=21.5 units, 688 px) placements are solved the same way and compared
# against two predictions, both pure interpolation of alpha_ref:
#   A canvas-y:  pred(y) = alpha_ref(y)
#   B bounds-y:  pred(y) = alpha_ref(bigTop + u*bigH), u = (y - top)/(2r)
# The placements are chosen so A and B diverge by ~0.3 alpha at the small
# circles' edges — one run decides; two placements make it unambiguous by
# construction. Verdict = the hypothesis with the lower RMSE. macOS +
# Icon Composer.
#
#   $PYTHON packages/engine/tools/probe-ramp-anchor.py

import json
import os
import shutil
import subprocess

import numpy as np
from PIL import Image

WORK = os.environ.get("PROBE_WORK", "/tmp/probe-ramp-anchor")
shutil.rmtree(WORK, ignore_errors=True)
os.makedirs(WORK)
ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool"

PX = 32          # 1 SVG unit = 32 px at the 1024 export (family geometry)
ERODE = 48       # px clear of the refraction band (as probe-material.py)
BIG = (16.0, 16.0, 10.5)                     # cx, cy, r in SVG units
SMALL = {"top": (16.0, 10.5, 4.5), "bottom": (16.0, 21.5, 4.5)}


def circle_svg(cx, cy, r):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#fff"/></svg>')


def bundle(name, gray, glass_hidden, svg):
    d = os.path.join(WORK, name + ".icon")
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(os.path.join(d, "Assets"))
    open(os.path.join(d, "Assets", "icon.svg"), "w").write(svg)
    group = {
        "hidden": glass_hidden,
        "translucency": {"enabled": True, "value": 0.5},
        "specular": False,
        "layers": [{
            "image-name": "icon.svg", "name": "icon", "glass": True,
            "fill": {"solid": "srgb:1.00000,1.00000,1.00000,1.00000"},
            "position": {"scale": 32, "translation-in-points": [0, 0]},
        }],
    }
    doc = {
        "fill": {"solid": f"srgb:{gray:.5f},{gray:.5f},{gray:.5f},1.00000"},
        "groups": [group],
        "supported-platforms": {"squares": "shared"},
    }
    json.dump(doc, open(os.path.join(d, "icon.json"), "w"))
    out = os.path.join(WORK, name + ".png")
    subprocess.run([ICTOOL, d, "--export-image", "--output-file", out,
                    "--platform", "macOS", "--rendition", "Default",
                    "--width", "1024", "--height", "1024", "--scale", "1"],
                   check=True, capture_output=True)
    return np.asarray(Image.open(out).convert("RGB")).astype(np.float64)


def solve_rows(g25, g75, bg25, bg75, cx, cy, r):
    """Per-row affine solve inside the eroded circle interior."""
    ys, xs = np.mgrid[0:1024, 0:1024]
    interior = np.hypot(xs - cx * PX, ys - cy * PX) < (r * PX - ERODE)
    rows = []
    for y in range(1024):
        m = interior[y]
        if m.sum() < 60:
            continue
        i25 = np.median(g25[y][m], axis=0)
        i75 = np.median(g75[y][m], axis=0)
        b25 = np.median(bg25[y][m], axis=0)
        b75 = np.median(bg75[y][m], axis=0)
        k = (i75 - i25) / np.maximum(b75 - b25, 1e-6)
        rows.append((y, 1.0 - float(k.mean())))
    return (np.array([r[0] for r in rows], dtype=float),
            np.array([r[1] for r in rows]))


print("rendering background references...")
svg_any = circle_svg(*BIG)
bg25 = bundle("bg25", 0.25, True, svg_any)
bg75 = bundle("bg75", 0.75, True, svg_any)

print("rendering big reference circle...")
big25 = bundle("big-25", 0.25, False, svg_any)
big75 = bundle("big-75", 0.75, False, svg_any)
ref_y, ref_a = solve_rows(big25, big75, bg25, bg75, *BIG)
print(f"  ref rows {ref_y[0]:.0f}..{ref_y[-1]:.0f}  "
      f"alpha {ref_a[0]:.3f}..{ref_a[-1]:.3f}")

big_top = (BIG[1] - BIG[2]) * PX          # 176
big_h = 2 * BIG[2] * PX                   # 672

report = {"ref": {"y0": float(ref_y[0]), "y1": float(ref_y[-1]),
                  "alpha0": round(float(ref_a[0]), 4),
                  "alpha1": round(float(ref_a[-1]), 4)}}
verdicts = []
for place, (cx, cy, r) in SMALL.items():
    g25 = bundle(place + "-25", 0.25, False, circle_svg(cx, cy, r))
    g75 = bundle(place + "-75", 0.75, False, circle_svg(cx, cy, r))
    sy, sa = solve_rows(g25, g75, bg25, bg75, cx, cy, r)

    pred_canvas = np.interp(sy, ref_y, ref_a)
    u = (sy - (cy - r) * PX) / (2 * r * PX)
    pred_bounds = np.interp(big_top + u * big_h, ref_y, ref_a)

    rms_c = float(np.sqrt(np.mean((sa - pred_canvas) ** 2)))
    rms_b = float(np.sqrt(np.mean((sa - pred_bounds) ** 2)))
    win = "canvas-y" if rms_c < rms_b else "bounds-y"
    verdicts.append(win)
    report[place] = {
        "y0": float(sy[0]), "y1": float(sy[-1]),
        "alpha_top": round(float(sa[:20].mean()), 4),
        "alpha_bot": round(float(sa[-20:].mean()), 4),
        "rmse_canvas_y": round(rms_c, 4),
        "rmse_bounds_y": round(rms_b, 4),
        "winner": win,
        "alpha_full": [round(float(v), 4) for v in sa[::8]],
        "pred_canvas": [round(float(v), 4) for v in pred_canvas[::8]],
        "pred_bounds": [round(float(v), 4) for v in pred_bounds[::8]],
    }
    print(f"{place:7s} rows {sy[0]:.0f}..{sy[-1]:.0f}  "
          f"alpha {sa[0]:.3f}..{sa[-1]:.3f}  "
          f"RMSE canvas-y {rms_c:.4f}  bounds-y {rms_b:.4f}  -> {win}")

report["verdict"] = (verdicts[0] if len(set(verdicts)) == 1
                     else "DISAGREE: " + ", ".join(verdicts))
print("VERDICT:", report["verdict"])
json.dump(report, open(os.path.join(WORK, "ramp-anchor.json"), "w"),
          indent=1)
print("wrote", os.path.join(WORK, "ramp-anchor.json"))
