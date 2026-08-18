#!/usr/bin/env python3
# Follow-up to probe-dark-tint.py: characterize the tint itself.
#   1. gradient canvas: is the tint sampled per-pixel along the gradient?
#   2. luminance threshold: which grays count as "white"?
#   3. near-white saturated colors: do they tint?
#   4. mixed glyph: white + yellow + black elements in one SVG
#   5. alpha: does the tint preserve partial transparency?
#   $PYTHON packages/engine/tools/probe-dark-tint2.py
import json, os, shutil, subprocess
import numpy as np
from PIL import Image

WORK = "/tmp/dark-tint-probe2"
ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool"
os.makedirs(WORK, exist_ok=True)

RED = "srgb:0.80000,0.10000,0.10000,1.00000"
CYAN = "srgb:0.26667,0.91765,0.94902,1.00000"
TEAL = "srgb:0.14510,0.81961,0.85490,1.00000"

def build(name, fill_grad, svg):
    d = os.path.join(WORK, name + ".icon")
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(os.path.join(d, "Assets"))
    open(os.path.join(d, "Assets", "glyph.svg"), "w").write(svg)
    json.dump({"fill": {"linear-gradient": fill_grad,
                        "orientation": {"start": {"x": 0.5, "y": 0}, "stop": {"x": 0.5, "y": 1}}},
               "groups": [{"layers": [{"image-name": "glyph.svg", "name": "glyph", "glass": False,
                                        "position": {"scale": 32, "translation-in-points": [0, 0]}}]}],
               "supported-platforms": {"squares": "shared"}},
              open(os.path.join(d, "icon.json"), "w"))
    return d

def render(bundle, out, rendition):
    subprocess.run([ICTOOL, bundle, "--export-image", "--output-file", out,
                    "--platform", "macOS", "--rendition", rendition,
                    "--width", "256", "--height", "256", "--scale", "1"],
                   check=True, capture_output=True)

def px(png, y0, y1, x0, x1):
    im = np.asarray(Image.open(png).convert("RGB")).astype(float)
    return np.round(np.median(im[y0:y1, x0:x1], axis=(0, 1))).astype(int)

# 1. tall white bar over the amazonmusic gradient — per-pixel tint?
d = build("grad-bar", [CYAN, TEAL],
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
          '<rect x="12" y="6" width="8" height="20" fill="#fff"/></svg>')
render(d, os.path.join(WORK, "grad-bar-dark.png"), "Dark")
p = os.path.join(WORK, "grad-bar-dark.png")
print("gradient bar (y6..26 of 32 => rows 48..208 at 256):")
for y in (56, 96, 128, 160, 196):
    print(f"  row {y:3d}: {px(p, y-3, y+3, 118, 138)}")
print(f"  stops: cyan {np.round(np.array([0.26667,0.91765,0.94902])*255).astype(int)}"
      f" teal {np.round(np.array([0.14510,0.81961,0.85490])*255).astype(int)}")

# 2+3. luminance / saturation ladder on solid red canvas
ladder = ["#8c8c8c", "#a6a6a6", "#bfbfbf", "#d9d9d9", "#f2f2f2",
          "#ffe0e0", "#e0e0ff", "#ffd070", "#c0ffc0"]
print("\nglyph-color ladder over solid red canvas (light glyph -> dark glyph):")
for c in ladder:
    d = build("lad" + c[1:], [RED, RED],
              f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
              f'<circle cx="16" cy="16" r="8" fill="{c}"/></svg>')
    lp = os.path.join(WORK, f"lad{c[1:]}-light.png")
    dp = os.path.join(WORK, f"lad{c[1:]}-dark.png")
    render(d, lp, "Default")
    render(d, dp, "Dark")
    lg = px(lp, 118, 138, 118, 138)
    dg = px(dp, 118, 138, 118, 138)
    print(f"  {c}: {lg} -> {dg} {'TINT' if np.abs(dg-lg).max()>24 else ''}")

# 4. mixed glyph: white disc, yellow disc, black disc side by side
d = build("mixed", [RED, RED],
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
          '<circle cx="8" cy="16" r="3.5" fill="#fff"/>'
          '<circle cx="16" cy="16" r="3.5" fill="#f2c200"/>'
          '<circle cx="24" cy="16" r="3.5" fill="#000"/></svg>')
render(d, os.path.join(WORK, "mixed-dark.png"), "Dark")
p = os.path.join(WORK, "mixed-dark.png")
print("\nmixed glyph on red, Dark: white disc", px(p, 122, 134, 58, 70),
      "yellow disc", px(p, 122, 134, 122, 134),
      "black disc", px(p, 122, 134, 186, 198))

# 5. half-transparent white disc
d = build("alpha", [RED, RED],
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
          '<circle cx="16" cy="16" r="8" fill="#fff" fill-opacity="0.5"/></svg>')
render(d, os.path.join(WORK, "alpha-dark.png"), "Dark")
print("\nhalf-alpha white disc on red, Dark center:", px(os.path.join(WORK, "alpha-dark.png"), 118, 138, 118, 138),
      "(canvas at that spot would be ~23,23,23)")
