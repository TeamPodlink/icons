#!/usr/bin/env python3
# Final refinement of the dark-tint law:
#   1. pin the min-channel threshold (191 vs 192 vs 193)
#   2. does a tiny non-white speck kill the layer's tint? (gate scope)
#   3. per-LAYER or per-ICON gate? (white layer + separate yellow layer)
#   4. edge/alpha handling: profile across the tinted disc's AA edge
#   $PYTHON packages/engine/tools/probe-dark-tint3.py
import json, os, shutil, subprocess
import numpy as np
from PIL import Image

WORK = "/tmp/dark-tint-probe3"
ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool"
os.makedirs(WORK, exist_ok=True)
RED = "srgb:0.80000,0.10000,0.10000,1.00000"

def build(name, layers, assets):
    d = os.path.join(WORK, name + ".icon")
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(os.path.join(d, "Assets"))
    for fn, content in assets.items():
        open(os.path.join(d, "Assets", fn), "w").write(content)
    json.dump({"fill": {"linear-gradient": [RED, RED],
                        "orientation": {"start": {"x": 0.5, "y": 0}, "stop": {"x": 0.5, "y": 1}}},
               "groups": [{"layers": layers}],
               "supported-platforms": {"squares": "shared"}},
              open(os.path.join(d, "icon.json"), "w"))
    return d

def render(bundle, out, rendition):
    subprocess.run([ICTOOL, bundle, "--export-image", "--output-file", out,
                    "--platform", "macOS", "--rendition", rendition,
                    "--width", "256", "--height", "256", "--scale", "1"],
                   check=True, capture_output=True)

def med(png, y0, y1, x0, x1):
    im = np.asarray(Image.open(png).convert("RGB")).astype(float)
    return np.round(np.median(im[y0:y1, x0:x1], axis=(0, 1))).astype(int)

LYR = lambda n: {"image-name": n, "name": n[:-4], "glass": False,
                 "position": {"scale": 32, "translation-in-points": [0, 0]}}
disc = lambda fill, cx=16, r=8: (f'<circle cx="{cx}" cy="16" r="{r}" fill="{fill}"/>')
svg = lambda *els: ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
                    + "".join(els) + '</svg>')

# 1. threshold pinning
print("threshold ladder:")
for c in ("#bfbfbf", "#c0c0c0", "#c1c1c1", "#c8c8c8", "#d0d0d0"):
    d = build("t" + c[1:], [LYR("glyph.svg")], {"glyph.svg": svg(disc(c))})
    dp = os.path.join(WORK, f"t{c[1:]}-dark.png")
    render(d, dp, "Dark")
    dg = med(dp, 118, 138, 118, 138)
    print(f"  {c}: dark {dg} {'TINT' if dg[0] != dg[1] else ''}")

# 2. tiny speck: white disc + r=0.4 black dot (~0.2% of glyph area)
d = build("speck", [LYR("glyph.svg")],
          {"glyph.svg": svg(disc("#fff"), '<circle cx="16" cy="16" r="0.4" fill="#000"/>')})
dp = os.path.join(WORK, "speck-dark.png")
render(d, dp, "Dark")
print("\nwhite disc + tiny black speck, Dark ring at (108,128):",
      med(dp, 124, 132, 104, 112))

# 3. two layers: white disc layer + yellow disc layer (separate SVGs)
d = build("twolayer", [LYR("white.svg"), LYR("yellow.svg")],
          {"white.svg": svg(disc("#fff", cx=10, r=4)),
           "yellow.svg": svg(disc("#f2c200", cx=22, r=4))})
dp = os.path.join(WORK, "twolayer-dark.png")
render(d, dp, "Dark")
print("two layers, Dark: white layer", med(dp, 122, 134, 74, 86),
      "yellow layer", med(dp, 122, 134, 170, 182))

# 4. AA edge profile of the tinted disc (row 128, crossing edge at x=192)
d = build("edge", [LYR("glyph.svg")], {"glyph.svg": svg(disc("#fff"))})
for r in ("Default", "Dark"):
    p = os.path.join(WORK, f"edge-{r}.png")
    render(d, p, r)
    im = np.asarray(Image.open(p).convert("RGB")).astype(int)
    print(f"edge profile {r}, row 128 x186..198:", [list(im[128, x]) for x in range(186, 199, 2)])
