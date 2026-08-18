#!/usr/bin/env python3
# Instrument: how does CoreSVG interpolate gradients whose stops are
# declared as color(display-p3 ...) — especially stops OUTSIDE the sRGB
# gamut (podvine's teal has sRGB R = -0.19)? The solved stop law
# (probe-gradient-law.py) was measured with in-gamut sRGB hex stops;
# podvine showed its encoded-sRGB lerp misses out-of-gamut p3 ramps by
# up to 37/255 in red.
#
# Renders vertical 2-stop ramps through ictool (t = y), extracts the
# per-row curve, and scores candidate models per channel.
#
#   $PYTHON probe-p3-gradient.py [--skip-render]

import argparse
import json
import os
import shutil
import subprocess

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("--skip-render", action="store_true")
ap.add_argument("--grid", action="store_true",
                help="C->white grid: extract each C's TRANSFORMED stop by "
                     "extrapolating the unclipped encoded-linear ramp to t=0, "
                     "then regress per-channel floor/ceiling laws")
a = ap.parse_args()

WORK = "/tmp/p3-gradient"
ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool"


def p3(r, g, b):
    return f"color(display-p3 {r} {g} {b})"


# (name, stop0, stop1) — mix of in-gamut controls and out-of-gamut probes
PAIRS = [
    ("p3-bw", p3(0, 0, 0), p3(1, 1, 1)),          # in-gamut control: encoded vs linear lerp
    ("hex-bw", "#000000", "#ffffff"),              # syntax control
    ("podvine", p3(.4392, 0, 1), p3(0, .9255, .8706)),
    ("p3-red-blue", p3(1, 0, 0), p3(0, 0, 1)),     # both out (R>1 / R<0 in sRGB)
    ("p3-green-black", p3(0, 1, 0), p3(0, 0, 0)),  # G>1 out high
    ("p3-red-white", p3(1, 0, 0), p3(1, 1, 1)),
    ("p3-teal-hexviolet", "#7214F6", p3(0, .9255, .8706)),  # mixed syntax
    ("p3-ingamut", p3(.3, .5, .7), p3(.8, .6, .2)),  # in-gamut colored control
]

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


def enc(u):
    u = np.clip(np.asarray(u, np.float64), 0, 1)
    return np.where(u <= 0.0031308, 12.92 * u, 1.055 * u ** (1 / 2.4) - 0.055)


KR, KB, SPAN = 0.0185, 0.0320, 0.9540  # green stop law (linear sRGB)


def stop_srgb_lin(spec):
    # declared stop -> UNCLIPPED linear sRGB
    if spec.startswith("#"):
        return lin(np.array([int(spec[i:i+2], 16) / 255 for i in (1, 3, 5)]))
    v = [float(x) for x in spec[len("color(display-p3 "):-1].split()]
    return P3_SRGB @ lin(np.array(v))


def green_law(c):
    lo = KR * c[0] + KB * c[2]
    return np.array([c[0], np.clip(c[1], lo, lo + SPAN), c[2]])


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
    im = np.asarray(Image.open(png).convert("RGBA")).astype(np.float64)
    rows = np.arange(40, 984)
    c = np.median(im[40:984, 384:640, :3], axis=1)
    t = (rows + 0.5) / 1024.0
    return t, c


def finalize(srgb_lin_batch):
    # composite (linear sRGB) -> clip -> P3-coded 0..255
    return enc((SRGB_P3 @ np.clip(srgb_lin_batch, 0, 1).T).T) * 255


def models(s0, s1, T):
    c0, c1 = stop_srgb_lin(s0), stop_srgb_lin(s1)  # unclipped linear sRGB
    Tc = T[:, None]
    out = {}
    # current translator law: clip stops, green law, lerp encoded
    a0, a1 = green_law(np.clip(c0, 0, 1)), green_law(np.clip(c1, 0, 1))
    out["enc-clipped"] = finalize(lin(enc(a0)[None] * (1 - Tc) + enc(a1)[None] * Tc))
    # unclipped linear lerp, per-pixel clip
    out["lin-unclipped"] = finalize(c0[None] * (1 - Tc) + c1[None] * Tc)
    # unclipped linear lerp with green law on stops
    b0, b1 = green_law(c0), green_law(c1)
    out["lin-unclip+gl"] = finalize(b0[None] * (1 - Tc) + b1[None] * Tc)
    # hybrid: encoded lerp of clipped stops, but out-of-gamut channels
    # ride the unclipped linear ramp (per-channel switch)
    encr = lin(enc(a0)[None] * (1 - Tc) + enc(a1)[None] * Tc)
    linr = c0[None] * (1 - Tc) + c1[None] * Tc
    oog = (c0 < -1e-6) | (c0 > 1 + 1e-6) | (c1 < -1e-6) | (c1 > 1 + 1e-6)
    hyb = np.where(oog[None, :], linr, encr)
    out["hybrid-oog-lin"] = finalize(hyb)
    return out


if a.grid:
    # ---- grid mode: measure the stop transform over out-of-gamut p3 space
    os.makedirs(WORK, exist_ok=True)
    LV = [0.0, 0.5, 1.0]
    grid = [(r, g, b) for r in LV for g in LV for b in LV if (r, g, b) != (1, 1, 1)]
    results = []
    for (r, g, b) in grid:
        name = f"grid-{r}-{g}-{b}".replace(".", "")
        png = os.path.join(WORK, name + ".png")
        if not a.skip_render and not os.path.exists(png):
            make_and_render(name, p3(r, g, b), p3(1, 1, 1))
        t, c = curve(png)
        c = c / 255.0
        # GT (P3-coded) -> encoded sRGB curve
        gl = (P3_SRGB @ lin(c).T).T
        ge = np.where(gl <= 0.0031308, 12.92 * np.clip(gl, 0, None),
                      1.055 * np.clip(gl, 1e-9, None) ** (1 / 2.4) - 0.055)
        meas = []
        for ch in range(3):
            y = ge[:, ch]
            m = (y > 0.02) & (y < 0.98)
            if m.sum() < 50:  # flat channel (constant 0/1): read directly
                meas.append(float(np.median(y)))
                continue
            A = np.stack([np.ones(m.sum()), t[m]], 1)
            coef, *_ = np.linalg.lstsq(A, y[m], rcond=None)
            meas.append(float(coef[0]))  # extrapolated t=0 endpoint (C' encoded)
        decl = P3_SRGB @ lin(np.array([r, g, b]))  # unclipped linear sRGB
        # mirrored decode of the measured encoded endpoint -> linear
        ml = [float(np.sign(v) * lin(abs(v))) for v in meas]
        results.append(((r, g, b), decl, ml))
        print(f"p3({r},{g},{b}) decl lin {np.round(decl,4)}  meas lin {np.round(ml,4)}")
    # regress: for each channel, over samples where declared is OUT of [0,1],
    # measured = floor(other) or ceil(other); fit floor = k0*o0 + k1*o1 (+c)
    for ch, o1, o2 in [(0, 1, 2), (1, 0, 2), (2, 0, 1)]:
        lo_pts = [(d[o1], d[o2], m[ch]) for _, d, m in results if d[ch] < -1e-4]
        hi_pts = [(d[o1], d[o2], m[ch], d[ch]) for _, d, m in results if d[ch] > 1 + 1e-4]
        nm = "RGB"[ch]
        if lo_pts:
            X = np.array([[p[0], p[1], 1] for p in lo_pts])
            Y = np.array([p[2] for p in lo_pts])
            k, *_ = np.linalg.lstsq(X, Y, rcond=None)
            pred = X @ k
            print(f"{nm} floor: k_{'RGB'[o1]}={k[0]:+.4f} k_{'RGB'[o2]}={k[1]:+.4f} "
                  f"c={k[2]:+.5f}  rms {np.abs(pred-Y).max():.5f}  (n={len(lo_pts)})")
            for p, pr in zip(lo_pts, pred):
                print(f"    o=({p[0]:+.3f},{p[1]:+.3f}) meas {p[2]:+.4f} pred {pr:+.4f}")
        if hi_pts:
            X = np.array([[p[0], p[1], 1] for p in hi_pts])
            Y = np.array([p[2] for p in hi_pts])
            k, *_ = np.linalg.lstsq(X, Y, rcond=None)
            print(f"{nm} ceil : k_{'RGB'[o1]}={k[0]:+.4f} k_{'RGB'[o2]}={k[1]:+.4f} "
                  f"c={k[2]:+.5f}  (n={len(hi_pts)})")
            for p in hi_pts:
                print(f"    o=({p[0]:+.3f},{p[1]:+.3f}) decl {p[3]:.4f} meas {p[2]:+.4f}")
    raise SystemExit(0)

if not a.skip_render:
    os.makedirs(WORK, exist_ok=True)
    for name, s0, s1 in PAIRS:
        make_and_render(name, s0, s1)
        print("rendered", name)

keys = ["enc-clipped", "lin-unclipped", "lin-unclip+gl", "hybrid-oog-lin"]
print(f"\n{'pair':18s} " + " ".join(f"{k:>15s}" for k in keys))
for name, s0, s1 in PAIRS:
    t, gt = curve(os.path.join(WORK, name + ".png"))
    ms = models(s0, s1, t)
    row = f"{name:18s} "
    for k in keys:
        row += f" {float(np.sqrt(np.mean((ms[k] - gt) ** 2))):15.2f}"
    print(row)

# per-channel detail for the interesting pairs
print("\nper-channel RMSE (model / channel):")
for name, s0, s1 in PAIRS:
    t, gt = curve(os.path.join(WORK, name + ".png"))
    ms = models(s0, s1, t)
    for k in keys:
        r = np.sqrt(((ms[k] - gt) ** 2).mean(axis=0))
        print(f"  {name:18s} {k:15s} R {r[0]:6.2f}  G {r[1]:6.2f}  B {r[2]:6.2f}")
