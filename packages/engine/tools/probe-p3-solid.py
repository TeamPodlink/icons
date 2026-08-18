#!/usr/bin/env python3
# Instrument: what does a SOLID color(display-p3 ...) SVG fill render as
# when the declared color is OUTSIDE the sRGB gamut? (In-gamut p3 solids
# follow the sRGB-composite path exactly; sonnet's navy — sRGB R =
# -0.015 — renders at R 14/255, between the clip (30) and raw-p3 (0)
# hypotheses, so the out-of-gamut behavior is its own cell.)
#
# Renders a centered 24x24 rect (NOT full-bleed: keeps the dark-artwork
# classifier out of play) over a transparent canvas for each grid color,
# reads the rect's center directly — no curve extraction, no bias.
#
#   $PYTHON probe-p3-solid.py [--skip-render]

import argparse
import json
import os
import shutil
import subprocess

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("--skip-render", action="store_true")
a = ap.parse_args()

WORK = "/tmp/p3-solid"
ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool"

LV = [0.0, 0.5, 1.0]
GRID = [(r, g, b) for r in LV for g in LV for b in LV]
# denser sampling near the gamut boundary hues that matter (sonnet navy,
# resso reds, podvine teal/violet)
GRID += [(0, .2902, .5765), (1, .8078, 0), (1, 0, .3804), (1, .3137, .3686),
         (0, .9255, .8706), (.4392, 0, 1), (0, .75, .25), (.25, 0, .75)]

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
    return np.sign(u) * np.where(np.abs(u) <= 0.04045, np.abs(u) / 12.92,
                                 ((np.abs(u) + 0.055) / 1.055) ** 2.4)


def encm(u):
    u = np.asarray(u, np.float64)
    return np.sign(u) * np.where(np.abs(u) <= 0.0031308, 12.92 * np.abs(u),
                                 1.055 * np.abs(u) ** (1 / 2.4) - 0.055)


def render(name, r, g, b):
    d = os.path.join(WORK, name + ".icon")
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(os.path.join(d, "Assets"))
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
           f'<rect x="4" y="4" width="24" height="24" fill="color(display-p3 {r} {g} {b})"/></svg>')
    open(os.path.join(d, "Assets", "icon.svg"), "w").write(svg)
    json.dump({"groups": [{"layers": [{"image-name": "icon.svg", "name": "icon",
               "glass": False, "position": {"scale": 32, "translation-in-points": [0, 0]}}]}],
               "supported-platforms": {"squares": "shared"}},
              open(os.path.join(d, "icon.json"), "w"))
    out = os.path.join(WORK, name + ".png")
    subprocess.run([ICTOOL, d, "--export-image", "--output-file", out,
                    "--platform", "macOS", "--rendition", "Default",
                    "--width", "1024", "--height", "1024", "--scale", "1"],
                   check=True, capture_output=True)
    return out


os.makedirs(WORK, exist_ok=True)
rows = []
for (r, g, b) in GRID:
    name = f"solid-{r}-{g}-{b}".replace(".", "")
    png = os.path.join(WORK, name + ".png")
    if not a.skip_render and not os.path.exists(png):
        render(name, r, g, b)
    im = np.asarray(Image.open(png).convert("RGB")).astype(np.float64)
    meas = np.median(im[480:544, 480:544].reshape(-1, 3), axis=0) / 255.0
    decl = P3_SRGB @ lin(np.array([r, g, b]))  # unclipped linear sRGB
    # measured, expressed in unclipped linear sRGB (mirrored decode)
    ml = P3_SRGB @ lin(meas)
    rows.append(((r, g, b), decl, ml, meas))
    print(f"p3({r},{g},{b})  decl srgb-lin {np.round(decl, 4)}  meas srgb-lin "
          f"{np.round(ml, 4)}  meas p3-coded {np.round(meas * 255, 1)}")
