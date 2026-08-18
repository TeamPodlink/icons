#!/usr/bin/env python3
# Instrument: solve CoreSVG's gradient interpolation law by direct
# measurement. Renders vertical 2-stop gradient bundles through ictool
# (t = y, 1000+ clean samples per curve), then tests candidate
# interpolation spaces against every measured curve.
#
# Findings feed translate_icon.py; see "flat-icon player" in
# pipeline/README.md. macOS + Icon Composer; PYTHON venv with numpy+PIL.
#
#   python3 probe-gradient-law.py [--skip-render]

import argparse
import json
import os
import shutil
import subprocess
import sys

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("--skip-render", action="store_true")
a = ap.parse_args()

WORK = "/tmp/gradient-law"
ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool"

# stop pairs (sRGB hex to keep parsing trivial; the anomaly is
# syntax-independent — measured 2026-08-17)
PAIRS = [
    ("bw", "#000000", "#ffffff"),
    ("wb", "#ffffff", "#000000"),
    ("g25-g75", "#404040", "#c0c0c0"),
    ("red-green", "#ff0000", "#00ff00"),
    ("green-blue", "#00ff00", "#0000ff"),
    ("blue-red", "#0000ff", "#ff0000"),
    ("violet-teal", "#7214F6", "#00ECDE"),
    ("red-white", "#ff0000", "#ffffff"),
    ("blue-black", "#0000ff", "#000000"),
    ("orange-cyan", "#ff8000", "#00c0ff"),
]


def make_and_render(name, s0, s1):
    d = os.path.join(WORK, name + ".icon")
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(os.path.join(d, "Assets"))
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
        '<defs><linearGradient id="a" x1="16" x2="16" y1="0" y2="32" '
        'gradientUnits="userSpaceOnUse">'
        f'<stop stop-color="{s0}"/><stop offset="1" stop-color="{s1}"/>'
        "</linearGradient></defs>"
        '<path fill="url(#a)" d="M0 0h32v32H0z"/></svg>'
    )
    open(os.path.join(d, "Assets", "icon.svg"), "w").write(svg)
    json.dump(
        {"groups": [{"layers": [{"image-name": "icon.svg", "name": "icon",
          "glass": False, "position": {"scale": 32, "translation-in-points": [0, 0]}}]}],
         "supported-platforms": {"squares": "shared"}},
        open(os.path.join(d, "icon.json"), "w"))
    out = os.path.join(WORK, name + ".png")
    subprocess.run([ICTOOL, d, "--export-image", "--output-file", out,
                    "--platform", "macOS", "--rendition", "Default",
                    "--width", "1024", "--height", "1024", "--scale", "1"],
                   check=True, capture_output=True)
    return out


def curve(png):
    # median over the central columns per row -> (t, P3-coded rgb)
    im = np.asarray(Image.open(png).convert("RGBA")).astype(np.float64)
    rows = np.arange(40, 984)  # clear of the squircle top/bottom edges
    c = np.median(im[40:984, 384:640, :3], axis=1)
    t = (rows + 0.5) / 1024.0
    return t, c


# ---------------- candidate spaces ----------------
M_P3 = np.array([[0.4865709, 0.2656677, 0.1982173],
                 [0.2289746, 0.6917385, 0.0792869],
                 [0.0, 0.0451134, 1.0439444]])
M_SR = np.array([[0.4123908, 0.3575843, 0.1804808],
                 [0.2126390, 0.7151687, 0.0721923],
                 [0.0193308, 0.1191948, 0.9505322]])
P3_SRGB = np.linalg.inv(M_SR) @ M_P3
SRGB_P3 = np.linalg.inv(P3_SRGB)
lin = lambda u: np.where(np.asarray(u) <= 0.04045, np.asarray(u) / 12.92,
                         ((np.abs(np.asarray(u)) + 0.055) / 1.055) ** 2.4 * np.sign(u))
enc = lambda u: np.where(np.clip(u, 0, 1) <= 0.0031308, 12.92 * np.clip(u, 0, 1),
                         1.055 * np.clip(u, 0, 1) ** (1 / 2.4) - 0.055)
OK1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929],
                [0.2119034982, 0.6806995451, 0.1073969566],
                [0.0883024619, 0.2817188376, 0.6299787005]])
OK2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468],
                [1.9779984951, -2.4285922050, 0.4505937099],
                [0.0259040371, 0.7827717662, -0.8086757660]])

def hex_to_srgb(h):
    return np.array([int(h[i:i+2], 16) / 255 for i in (1, 3, 5)])

def render_space(srgb_lin_batch):
    # composite result (sRGB linear) -> P3-coded 0..255
    return enc((SRGB_P3 @ np.clip(srgb_lin_batch, 0, 1).T).T) * 255

def model_curves(s0, s1, T):
    c0, c1 = lin(hex_to_srgb(s0)), lin(hex_to_srgb(s1))  # sRGB linear
    Tc = T[:, None]
    out = {}
    out["srgb-encoded"] = render_space(lin(enc(c0)[None] * (1 - Tc) + enc(c1)[None] * Tc))
    out["srgb-linear"] = render_space(c0[None] * (1 - Tc) + c1[None] * Tc)
    p0, p1 = SRGB_P3 @ c0, SRGB_P3 @ c1  # P3 linear
    out["p3-linear"] = render_space((P3_SRGB @ (p0[None] * (1 - Tc) + p1[None] * Tc).T).T)
    out["p3-encoded"] = render_space((P3_SRGB @ lin(enc(p0)[None] * (1 - Tc) + enc(p1)[None] * Tc).T).T)
    xyz0, xyz1 = M_SR @ c0, M_SR @ c1
    out["xyz-linear"] = render_space((np.linalg.inv(M_SR) @ (xyz0[None] * (1 - Tc) + xyz1[None] * Tc).T).T)
    def to_ok(c): return OK2 @ np.cbrt(np.maximum(OK1 @ c, 0))
    def from_ok_b(lab): return (np.linalg.inv(OK1) @ ((np.linalg.inv(OK2) @ lab.T) ** 3)).T
    la, lb = to_ok(c0), to_ok(c1)
    out["oklab"] = render_space(from_ok_b(la[None] * (1 - Tc) + lb[None] * Tc))
    # CIELAB (D65)
    def f_lab(x):
        d = 6/29
        return np.where(x > d**3, np.cbrt(x), x / (3 * d * d) + 4 / 29)
    def fi_lab(x):
        d = 6/29
        return np.where(x > d, x ** 3, 3 * d * d * (x - 4 / 29))
    WN = M_SR @ np.ones(3)
    def to_lab(c):
        xr = f_lab((M_SR @ c) / WN)
        return np.array([116 * xr[1] - 16, 500 * (xr[0] - xr[1]), 200 * (xr[1] - xr[2])])
    def from_lab_b(labs):
        fy = (labs[:, 0] + 16) / 116
        fx = fy + labs[:, 1] / 500
        fz = fy - labs[:, 2] / 200
        xyz = np.stack([fi_lab(fx), fi_lab(fy), fi_lab(fz)], 1) * WN[None]
        return (np.linalg.inv(M_SR) @ xyz.T).T
    La, Lb = to_lab(c0), to_lab(c1)
    out["cielab"] = render_space(from_lab_b(La[None] * (1 - Tc) + Lb[None] * Tc))
    return out


if not a.skip_render:
    os.makedirs(WORK, exist_ok=True)
    for name, s0, s1 in PAIRS:
        make_and_render(name, s0, s1)
        print("rendered", name)

print(f"\n{'pair':12s} " + " ".join(f"{k:>13s}" for k in
      ["srgb-encoded", "srgb-linear", "p3-linear", "p3-encoded", "xyz-linear", "oklab", "cielab"]))
totals = {}
for name, s0, s1 in PAIRS:
    t, gt = curve(os.path.join(WORK, name + ".png"))
    models = model_curves(s0, s1, t)
    row = f"{name:12s} "
    for k in ["srgb-encoded", "srgb-linear", "p3-linear", "p3-encoded", "xyz-linear", "oklab", "cielab"]:
        r = float(np.sqrt(np.mean((models[k] - gt) ** 2)))
        totals[k] = totals.get(k, 0) + r
        row += f" {r:13.2f}"
    print(row)
print(f"{'TOTAL':12s} " + " ".join(f"{totals[k]:13.2f}" for k in
      ["srgb-encoded", "srgb-linear", "p3-linear", "p3-encoded", "xyz-linear", "oklab", "cielab"]))
