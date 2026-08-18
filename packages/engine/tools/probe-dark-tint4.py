#!/usr/bin/env python3
# Last dark-tint cells:
#   1. does a near-black canvas fill still tint the white glyph? (is
#      there a bg-luma floor, or does podhome's white-on-black vanish?)
#   2. tighten the gray glyph threshold between 207 and 217
#   $PYTHON packages/engine/tools/probe-dark-tint4.py
import json, os, shutil, subprocess
import numpy as np
from PIL import Image

WORK = "/tmp/dark-tint-probe4"
ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool"
os.makedirs(WORK, exist_ok=True)

def build(name, fill_stop, glyph_fill):
    d = os.path.join(WORK, name + ".icon")
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(os.path.join(d, "Assets"))
    open(os.path.join(d, "Assets", "glyph.svg"), "w").write(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
        f'<circle cx="16" cy="16" r="8" fill="{glyph_fill}"/></svg>')
    json.dump({"fill": {"linear-gradient": [fill_stop, fill_stop],
                        "orientation": {"start": {"x": 0.5, "y": 0}, "stop": {"x": 0.5, "y": 1}}},
               "groups": [{"layers": [{"image-name": "glyph.svg", "name": "glyph", "glass": False,
                                        "position": {"scale": 32, "translation-in-points": [0, 0]}}]}],
               "supported-platforms": {"squares": "shared"}},
              open(os.path.join(d, "icon.json"), "w"))
    return d

def dark_center(d, name):
    p = os.path.join(WORK, name + "-dark.png")
    subprocess.run([ICTOOL, d, "--export-image", "--output-file", p,
                    "--platform", "macOS", "--rendition", "Dark",
                    "--width", "256", "--height", "256", "--scale", "1"],
                   check=True, capture_output=True)
    im = np.asarray(Image.open(p).convert("RGB")).astype(float)
    return np.round(np.median(im[118:138, 118:138], axis=(0, 1))).astype(int)

print("bg-luma floor (white glyph):")
for name, stop in [("black", "srgb:0.00000,0.00000,0.00000,1.00000"),
                   ("g05", "gray:0.05000,1.00000"),
                   ("g10", "gray:0.10000,1.00000"),
                   ("g20", "gray:0.20000,1.00000"),
                   ("white", "srgb:1.00000,1.00000,1.00000,1.00000")]:
    d = build("bg-" + name, stop, "#fff")
    print(f"  bg {name}: dark glyph {dark_center(d, 'bg-' + name)}")

print("gray glyph threshold (red canvas):")
RED = "srgb:0.80000,0.10000,0.10000,1.00000"
for c in ("#d2d2d2", "#d4d4d4", "#d6d6d6", "#d8d8d8"):
    d = build("th" + c[1:], RED, c)
    print(f"  {c}: dark glyph {dark_center(d, 'th' + c[1:])}")
