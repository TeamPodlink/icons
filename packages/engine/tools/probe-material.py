#!/usr/bin/env python3
# Instrument: measure the glass MATERIAL RESPONSE as a function of the
# DECLARED parameters (translucency, specular) — the go/no-go for a
# universal material model that retires per-icon two-gray measurement.
#
# A centered glass circle renders over two flat-gray canvases (0.25 /
# 0.75); glass-hidden variants give the background references. Per row of
# the glass interior the affine response out = k*bg + c solves exactly;
# alpha(y) = 1 - k(y) is the engine's per-row material ramp, c captures
# the overlay. Sweeps translucency {0,.25,.5,.75,1} x specular
# {false,true,inside,outside} at t=0.5. macOS + Icon Composer.
#
#   $PYTHON packages/engine/tools/probe-material.py

import json
import os
import shutil
import subprocess

import numpy as np
from PIL import Image

WORK = "/tmp/probe-material"
shutil.rmtree(WORK, ignore_errors=True)
os.makedirs(WORK)
ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool"

CIRCLE_SVG = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
              '<circle cx="16" cy="16" r="10.5" fill="#fff"/></svg>')


def bundle(name, gray, glass_hidden, translucency, specular):
    d = os.path.join(WORK, name + ".icon")
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(os.path.join(d, "Assets"))
    open(os.path.join(d, "Assets", "icon.svg"), "w").write(CIRCLE_SVG)
    group = {
        "hidden": glass_hidden,
        "translucency": {"enabled": True, "value": translucency},
        "specular": specular,
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


# interior mask: circle r=336 at (512,512), eroded 48px clear of the
# refraction band at the silhouette
ys, xs = np.mgrid[0:1024, 0:1024]
RR = np.hypot(xs - 512, ys - 512)
INTERIOR = RR < (10.5 * 32 - 48)

print("rendering background references...")
bg25 = bundle("bg25", 0.25, True, 0.5, False)
bg75 = bundle("bg75", 0.75, True, 0.5, False)

CASES = ([("t", v, False) for v in (0.0, 0.25, 0.5, 0.75, 1.0)] +
         [("s", 0.5, sp) for sp in (True, "inside", "outside")])

results = {}
for kind, tv, sp in CASES:
    key = f"t{tv}" if kind == "t" else f"spec-{sp}"
    g25 = bundle(key + "-25", 0.25, False, tv, sp)
    g75 = bundle(key + "-75", 0.75, False, tv, sp)
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
        rows.append((y, float(k.mean()), float(c.mean()),
                     float(k.max() - k.min())))
    ks = np.array([r[1] for r in rows])
    cs = np.array([r[2] for r in rows])
    chroma = max(r[3] for r in rows)
    al = 1 - ks
    results[key] = {
        "y0": rows[0][0], "y1": rows[-1][0],
        "alpha_top": round(float(al[:40].mean()), 4),
        "alpha_mid": round(float(al[len(al)//2-20:len(al)//2+20].mean()), 4),
        "alpha_bot": round(float(al[-40:].mean()), 4),
        "c_top": round(float(cs[:40].mean()), 2),
        "c_mid": round(float(cs[len(cs)//2-20:len(cs)//2+20].mean()), 2),
        "c_bot": round(float(cs[-40:].mean()), 2),
        "k_chroma_max": round(chroma, 4),
        "alpha_full": [round(float(v), 4) for v in al[::16]],
    }
    r = results[key]
    print(f"{key:14s} alpha top/mid/bot {r['alpha_top']:.3f}/{r['alpha_mid']:.3f}/{r['alpha_bot']:.3f}"
          f"   c {r['c_top']:6.1f}/{r['c_mid']:6.1f}/{r['c_bot']:6.1f}   kchroma {r['k_chroma_max']:.3f}")

json.dump(results, open(os.path.join(WORK, "material.json"), "w"), indent=1)
print("wrote", os.path.join(WORK, "material.json"))
