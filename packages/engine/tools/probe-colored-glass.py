#!/usr/bin/env python3
# Instrument: the glass MATERIAL RESPONSE of COLORED declared fills — is
# the interior response the family's scalar alpha (k equal per channel,
# overlay = fill*alpha), or per-channel transmission?
#
# Motivation: overcast's tower (navy->black gradient glass fill) renders
# in ground truth with k_R ~0.12, k_G ~0.05, k_B ~0.005 at the bottom —
# per-CHANNEL k tracking the fill — while the family model (measured on
# white fills) predicts one scalar k. This probe measures per-row
# per-channel (k_c, c_c) for dark/colored solid fills at t=0.1 and t=0.5
# with the standard two-gray instrument. macOS + Icon Composer.
#
#   $PYTHON packages/engine/tools/probe-colored-glass.py

import json
import os
import shutil
import subprocess

import numpy as np
from PIL import Image

WORK = os.environ.get("PROBE_WORK", "/tmp/probe-colored-glass")
os.makedirs(WORK, exist_ok=True)
ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool"

CIRCLE_SVG = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
              '<circle cx="16" cy="16" r="10.5" fill="#fff"/></svg>')


def bundle(name, gray, glass_hidden, transl, fill):
    d = os.path.join(WORK, name + ".icon")
    out = os.path.join(WORK, name + ".png")
    if not os.path.exists(out):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(os.path.join(d, "Assets"))
        open(os.path.join(d, "Assets", "icon.svg"), "w").write(CIRCLE_SVG)
        group = {
            "hidden": glass_hidden,
            "translucency": {"enabled": True, "value": transl},
            "specular": True,
            "layers": [{
                "image-name": "icon.svg", "name": "icon", "glass": True,
                "fill": {"solid": fill},
                "position": {"scale": 32, "translation-in-points": [0, 0]},
            }],
        }
        doc = {
            "fill": {"solid": f"srgb:{gray:.5f},{gray:.5f},{gray:.5f},1.00000"},
            "groups": [group],
            "supported-platforms": {"squares": "shared"},
        }
        json.dump(doc, open(os.path.join(d, "icon.json"), "w"))
        subprocess.run([ICTOOL, d, "--export-image", "--output-file", out,
                        "--platform", "macOS", "--rendition", "Default",
                        "--width", "1024", "--height", "1024", "--scale", "1"],
                       check=True, capture_output=True)
    return np.asarray(Image.open(out).convert("RGB")).astype(np.float64)


ys, xs = np.mgrid[0:1024, 0:1024]
INTERIOR = np.hypot(xs - 512, ys - 512) < (10.5 * 32 - 48)

print("rendering background references...")
bg25 = bundle("bg25", 0.25, True, 0.5, "srgb:1.00000,1.00000,1.00000,1.00000")
bg75 = bundle("bg75", 0.75, True, 0.5, "srgb:1.00000,1.00000,1.00000,1.00000")

CASES = [
    ("black-t0.1", 0.1, "srgb:0.00000,0.00000,0.00000,1.00000"),
    ("navy-t0.1", 0.1, "display-p3:0.08000,0.12000,0.20000,1.00000"),
    ("black-t0.5", 0.5, "srgb:0.00000,0.00000,0.00000,1.00000"),
    ("red-t0.5", 0.5, "srgb:0.80000,0.10000,0.10000,1.00000"),
    ("white-t0.1", 0.1, "srgb:1.00000,1.00000,1.00000,1.00000"),
]

results = {}
for key, tv, fill in CASES:
    g25 = bundle(key + "-25", 0.25, False, tv, fill)
    g75 = bundle(key + "-75", 0.75, False, tv, fill)
    rows = []
    for y in range(1024):
        m = INTERIOR[y]
        if m.sum() < 60:
            continue
        i25 = np.median(g25[y][m], axis=0)
        i75 = np.median(g75[y][m], axis=0)
        b25 = np.median(bg25[y][m], axis=0)
        b75 = np.median(bg75[y][m], axis=0)
        k = (i75 - i25) / np.maximum(b75 - b25, 1e-6)
        c = i25 - k * b25
        rows.append((y, k, c))
    r = {"y0": rows[0][0], "y1": rows[-1][0]}
    for tag, sl in (("top", slice(0, 40)), ("mid", slice(len(rows)//2 - 20, len(rows)//2 + 20)),
                    ("bot", slice(-40, None))):
        ks = np.stack([k for _, k, _ in rows[sl]])
        cs = np.stack([c for _, _, c in rows[sl]])
        r["k_" + tag] = [round(float(v), 4) for v in ks.mean(0)]
        r["c_" + tag] = [round(float(v), 2) for v in cs.mean(0)]
    al_rows = 1.0 - np.array([float(np.mean(k)) for _, k, _ in rows])
    r["alpha_full"] = [round(float(v), 4) for v in al_rows[::16]]
    results[key] = r
    print(f"{key:12s} k top {r['k_top']} mid {r['k_mid']} bot {r['k_bot']}")
    print(f"{'':12s} c top {r['c_top']} mid {r['c_mid']} bot {r['c_bot']}")

json.dump(results, open(os.path.join(WORK, "colored-glass.json"), "w"), indent=1)
print("wrote", os.path.join(WORK, "colored-glass.json"))
