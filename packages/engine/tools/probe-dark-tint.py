#!/usr/bin/env python3
# Instrument: WHEN does ictool's Dark rendition auto-derive (darken the
# canvas + tint a white glyph with the former background color), and
# what color does the tint use?
#
# Context: split bundles (build-svg-icons.mjs / split-raster-icons.mjs)
# emit a colored canvas fill with an explicit dark fill-specialization
# (gray 0.192->0.078) and a white/whitened glyph layer. Their Dark
# renditions ship a WHITE glyph on the dark canvas — Apple's tint never
# happens — contradicting the prior belief that the tint "ALWAYS"
# applies even against fill-specializations.
#
# Matrix: minimal probe bundles, white disc glyph over a colored
# canvas, varying (a) canvas fill-specializations (none / dark-gray /
# light-only / dark-colored / dark same-as-light), (b) SVG vs PNG
# glyph, (c) glyph opacity-specializations (none / explicit dark /
# dark-only twin), (d) glyph color (white / 90% gray / 50% gray /
# black / yellow), (e) default fill != light specialization (which
# color feeds the tint?), (f) gradient canvas (which stop tints?),
# (g) pipeline-style group fields vs minimal.
#
# Render Default + Dark, sample glyph center + canvas, print the cell.
#
#   $PYTHON packages/engine/tools/probe-dark-tint.py
import json, os, shutil, subprocess
import numpy as np
from PIL import Image

WORK = "/tmp/dark-tint-probe"
ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool"
os.makedirs(WORK, exist_ok=True)

RED = "srgb:0.80000,0.10000,0.10000,1.00000"
BLUE = "srgb:0.10000,0.20000,0.80000,1.00000"
CYAN = "srgb:0.26667,0.91765,0.94902,1.00000"   # amazonmusic top stop
TEAL = "srgb:0.14510,0.81961,0.85490,1.00000"   # amazonmusic bottom stop
NAVY = "srgb:0.07840,0.15690,0.35290,1.00000"   # apollo-ish dim bg
DARK_GRADIENT = {
    "linear-gradient": ["gray:0.19200,1.00000", "gray:0.07800,1.00000"],
    "orientation": {"start": {"x": 0.5, "y": 0}, "stop": {"x": 0.5, "y": 1}},
}

def solid(c):
    return {"linear-gradient": [c, c],
            "orientation": {"start": {"x": 0.5, "y": 0}, "stop": {"x": 0.5, "y": 1}}}

def gradient(a, b):
    return {"linear-gradient": [a, b],
            "orientation": {"start": {"x": 0.5, "y": 0}, "stop": {"x": 0.5, "y": 1}}}

def disc_svg(fill):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
            f'<circle cx="16" cy="16" r="8" fill="{fill}"/></svg>')

def disc_png(path, rgb):
    im = np.zeros((1024, 1024, 4), np.uint8)
    yy, xx = np.mgrid[0:1024, 0:1024]
    m = (xx - 512) ** 2 + (yy - 512) ** 2 <= 256 ** 2
    im[m] = [*rgb, 255]
    Image.fromarray(im).save(path)

def build(name, fill, layers, assets, group_extra=None):
    d = os.path.join(WORK, name + ".icon")
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(os.path.join(d, "Assets"))
    for fname, content in assets.items():
        p = os.path.join(d, "Assets", fname)
        if isinstance(content, str):
            open(p, "w").write(content)
        else:
            content(p)
    group = {"layers": layers}
    if group_extra:
        group.update(group_extra)
    json.dump({"fill": fill, "groups": [group],
               "supported-platforms": {"squares": "shared"}},
              open(os.path.join(d, "icon.json"), "w"))
    return d

def render(bundle, out, rendition):
    subprocess.run([ICTOOL, bundle, "--export-image", "--output-file", out,
                    "--platform", "macOS", "--rendition", rendition,
                    "--width", "256", "--height", "256", "--scale", "1"],
                   check=True, capture_output=True)

def sample(png):
    im = np.asarray(Image.open(png).convert("RGB")).astype(float)
    glyph = np.round(np.median(im[118:138, 118:138], axis=(0, 1))).astype(int)
    canvas = np.round(np.median(im[24:34, 118:138], axis=(0, 1))).astype(int)
    canvas_bot = np.round(np.median(im[222:232, 118:138], axis=(0, 1))).astype(int)
    return glyph, canvas, canvas_bot

SVG_LAYER = {"image-name": "glyph.svg", "name": "glyph", "glass": False,
             "position": {"scale": 32, "translation-in-points": [0, 0]}}
PNG_LAYER = {"image-name": "glyph.png", "name": "glyph", "glass": False}
PIPE_GROUP = {"hidden": False, "blend-mode": "normal", "specular": False,
              "translucency": {"enabled": False, "value": 0}}

def specs(default, dark=None, light_only=False):
    fill = dict(default)
    fs = [{"value": default}]
    if dark is not None:
        fs.append({"appearance": "dark", "value": dark})
    if dark is not None or light_only:
        fill["fill-specializations"] = fs
    return fill

white_svg = {"glyph.svg": disc_svg("#ffffff")}
white_png = {"glyph.png": lambda p: disc_png(p, (255, 255, 255))}

cells = []
def cell(name, fill, layers, assets, group_extra=None):
    cells.append((name, fill, layers, assets, group_extra))

# --- (a) canvas fill-specializations ---------------------------------
cell("a1-nospec-svg",       specs(solid(RED)),                          [SVG_LAYER], white_svg)
cell("a2-darkgray-svg",     specs(solid(RED), DARK_GRADIENT),           [SVG_LAYER], white_svg)
cell("a3-lightonly-svg",    specs(solid(RED), light_only=True),         [SVG_LAYER], white_svg)
cell("a4-darkcolored-svg",  specs(solid(RED), solid(BLUE)),             [SVG_LAYER], white_svg)
cell("a5-darksame-svg",     specs(solid(RED), solid(RED)),              [SVG_LAYER], white_svg)
# --- (b) PNG glyph ---------------------------------------------------
cell("b1-nospec-png",       specs(solid(RED)),                          [PNG_LAYER], white_png)
cell("b2-darkgray-png",     specs(solid(RED), DARK_GRADIENT),           [PNG_LAYER], white_png)
# --- (c) opacity-specializations -------------------------------------
cell("c1-nospec-opaq11",    specs(solid(RED)),
     [{**SVG_LAYER, "opacity-specializations": [{"value": 1}, {"appearance": "dark", "value": 1}]}],
     white_svg)
cell("c2-nospec-darktwin",  specs(solid(RED)),
     [{**SVG_LAYER, "name": "glyph-dark",
       "opacity-specializations": [{"value": 0}, {"appearance": "dark", "value": 1}]},
      {**SVG_LAYER,
       "opacity-specializations": [{"value": 1}, {"appearance": "dark", "value": 0}]}],
     white_svg)
cell("c3-darkgray-darktwin", specs(solid(RED), DARK_GRADIENT),
     [{**SVG_LAYER, "name": "glyph-dark",
       "opacity-specializations": [{"value": 0}, {"appearance": "dark", "value": 1}]},
      {**SVG_LAYER,
       "opacity-specializations": [{"value": 1}, {"appearance": "dark", "value": 0}]}],
     white_svg)
# --- (d) glyph color -------------------------------------------------
cell("d1-nospec-gray90",    specs(solid(RED)), [SVG_LAYER], {"glyph.svg": disc_svg("#e6e6e6")})
cell("d2-nospec-gray50",    specs(solid(RED)), [SVG_LAYER], {"glyph.svg": disc_svg("#808080")})
cell("d3-nospec-black",     specs(solid(RED)), [SVG_LAYER], {"glyph.svg": disc_svg("#000000")})
cell("d4-nospec-yellow",    specs(solid(RED)), [SVG_LAYER], {"glyph.svg": disc_svg("#f2c200")})
cell("d5-darkgray-gray90",  specs(solid(RED), DARK_GRADIENT), [SVG_LAYER], {"glyph.svg": disc_svg("#e6e6e6")})
# --- (e) which color feeds the tint? ---------------------------------
# default fill RED but the light specialization BLUE (no dark entry)
fill_e1 = dict(solid(RED)); fill_e1["fill-specializations"] = [{"value": solid(BLUE)}]
cell("e1-defred-lightblue", fill_e1, [SVG_LAYER], white_svg)
# --- (f) gradient canvas ---------------------------------------------
cell("f1-nospec-gradient",  specs(gradient(CYAN, TEAL)),                [SVG_LAYER], white_svg)
cell("f2-nospec-navy",      specs(solid(NAVY)),                         [SVG_LAYER], white_svg)
# --- (g) pipeline-style group fields ---------------------------------
cell("g1-nospec-pipegroup", specs(solid(RED)), [SVG_LAYER], white_svg, PIPE_GROUP)
cell("g2-darkgray-pipegroup", specs(solid(RED), DARK_GRADIENT), [SVG_LAYER], white_svg, PIPE_GROUP)

print(f"{'cell':26s}  {'light glyph':>13s} {'dark glyph':>13s} {'dark canvas':>13s} {'dark cnv bot':>13s}  tint?")
for name, fill, layers, assets, extra in cells:
    d = build(name, fill, layers, assets, extra)
    lp = os.path.join(WORK, name + "-light.png")
    dp = os.path.join(WORK, name + "-dark.png")
    render(d, lp, "Default")
    render(d, dp, "Dark")
    lg, _, _ = sample(lp)
    dg, dc, dcb = sample(dp)
    tinted = "TINT" if np.abs(dg - lg).max() > 24 else "same"
    fmt = lambda v: ",".join(f"{x:3d}" for x in v)
    print(f"{name:26s}  {fmt(lg):>13s} {fmt(dg):>13s} {fmt(dc):>13s} {fmt(dcb):>13s}  {tinted}")
