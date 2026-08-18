#!/usr/bin/env python3
# Instrument: what color path do PNG raster layer pixels take through
# ictool, and where do position-less raster layers land?
#
# The layer-content color law was measured for DECLARED colors (SVG
# fills, icon.json overrides). Raster pixels may differ: PNGs can be
# untagged, sRGB-tagged, Display-P3-tagged, or gray-gamma-2.2 (the
# catalog has all four), the dark-full-bleed raw-leak classifier may or
# may not apply to bitmap artwork, and PNG alpha needs a measured
# compositing space.
#
# Sections (each authored as a minimal .icon bundle, rendered via
# ictool, patches read back at known 1:1 positions):
#   color-<tag>-<bgvar>  10-color patch grid; tag in {untag, srgb, p3,
#                        gray}; bgvar in {trans, dark, white} (dark =
#                        opaque full-bleed (20,20,30) — the raw-leak
#                        classifier trigger for SVG artwork)
#   alpha                patches at alpha {64,128,191,255} over a
#                        declared canvas fill; which space does the
#                        lerp happen in?
#   place-<case>         non-1024 PNGs, no position / scale / translation
#
#   $PYTHON probe-raster.py [--skip-render] [--section color|alpha|place]
import argparse
import json
import os
import shutil
import subprocess

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("--skip-render", action="store_true")
ap.add_argument("--section", default=None)
a = ap.parse_args()

WORK = "/tmp/raster-probe"
ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool"
P3_ICC = "/System/Library/ColorSync/Profiles/Display P3.icc"

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
    return np.where(u <= 0.04045, u / 12.92, ((u + 0.055) / 1.055) ** 2.4)


def enc(u):
    u = np.clip(np.asarray(u, np.float64), 0, 1)
    return np.where(u <= 0.0031308, 12.92 * u, 1.055 * u ** (1 / 2.4) - 0.055)


def srgb_to_p3coded(v255):
    return enc(SRGB_P3 @ lin(np.asarray(v255, np.float64) / 255)) * 255


COLORS = [(0, 0, 0), (128, 128, 128), (255, 255, 255),
          (178, 7, 15),    # netflix red — the SVG raw-leak anchor
          (26, 26, 46),    # dark navy
          (30, 215, 96),   # spotify green
          (0, 122, 255), (255, 149, 0), (64, 0, 128), (0, 206, 209)]
# patch grid: 4 cols x 3 rows, 120px squares, >=200px from every edge
# (body-light material reaches ~48px in from the body edge)
POS = [(200 + (i % 4) * 160, 200 + (i // 4) * 160) for i in range(len(COLORS))]


def author(name, art, canvas_fill=None, icc=None, position=None):
    d = os.path.join(WORK, name + ".icon")
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(os.path.join(d, "Assets"))
    kw = {"icc_profile": icc} if icc else {}
    art.save(os.path.join(d, "Assets", "art.png"), **kw)
    layer = {"image-name": "art.png", "name": "art", "glass": False}
    if position:
        layer["position"] = position
    doc = {"groups": [{"layers": [layer]}],
           "supported-platforms": {"squares": "shared"}}
    if canvas_fill:
        doc["fill"] = canvas_fill
    json.dump(doc, open(os.path.join(d, "icon.json"), "w"))
    out = os.path.join(WORK, name + ".png")
    if not (a.skip_render and os.path.exists(out)):
        subprocess.run([ICTOOL, d, "--export-image", "--output-file", out,
                        "--platform", "macOS", "--rendition", "Default",
                        "--width", "1024", "--height", "1024", "--scale", "1"],
                       check=True, capture_output=True)
    return np.asarray(Image.open(out).convert("RGB")).astype(np.float64)


def read_patch(im, i):
    x, y = POS[i]
    return np.median(im[y + 30:y + 90, x + 30:x + 90].reshape(-1, 3), axis=0)


os.makedirs(WORK, exist_ok=True)
want = lambda s: a.section in (None, s)

# ---------------- color paths ---------------------------------------------
if want("color"):
    srgb_icc = None
    try:
        from PIL import ImageCms
        srgb_icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    except Exception:
        pass
    p3_icc = open(P3_ICC, "rb").read() if os.path.exists(P3_ICC) else None
    gray_icc = None
    gp = "platforms/neuecast/Neuecast.icon/Assets/light.png"
    for base in (os.getcwd(), os.path.join(os.path.dirname(__file__), "..", "..", "..")):
        f = os.path.join(base, gp)
        if os.path.exists(f):
            gray_icc = Image.open(f).info.get("icc_profile")
            break

    def grid_png(bgvar, mode="RGBA"):
        if mode == "RGBA":
            arr = np.zeros((1024, 1024, 4), np.uint8)
            if bgvar == "dark":
                arr[:, :] = (20, 20, 30, 255)
            elif bgvar == "white":
                arr[:, :] = (255, 255, 255, 255)
            for i, c in enumerate(COLORS):
                x, y = POS[i]
                arr[y:y + 120, x:x + 120] = (*c, 255)
            return Image.fromarray(arr, "RGBA")
        # LA: gray ladder
        arr = np.zeros((1024, 1024, 2), np.uint8)
        if bgvar == "dark":
            arr[:, :] = (20, 255)
        for i, c in enumerate(COLORS):
            x, y = POS[i]
            g = round(sum(c) / 3)
            arr[y:y + 120, x:x + 120] = (g, 255)
        return Image.fromarray(arr, "LA")

    cases = [("untag", None, "RGBA"), ("srgb", srgb_icc, "RGBA"),
             ("p3", p3_icc, "RGBA"), ("gray", gray_icc, "LA")]
    for tag, icc, mode in cases:
        if tag != "untag" and icc is None:
            print(f"[color] SKIP {tag}: no ICC available")
            continue
        for bgvar in ("trans", "dark", "white"):
            im = author(f"color-{tag}-{bgvar}", grid_png(bgvar, mode), icc=icc)
            print(f"\n[color] {tag} / {bgvar}")
            err_conv = []
            err_raw = []
            for i, c in enumerate(COLORS):
                v = np.array([sum(c) / 3] * 3 if mode == "LA" else c, np.float64)
                meas = read_patch(im, i)
                h_conv = srgb_to_p3coded(v)          # sRGB-composite path
                h_raw = v                             # raw bytes as P3 coords
                # gray-gamma-2.2 decode then sRGB-composite
                h_g22 = enc(SRGB_P3 @ ((v / 255) ** 2.2)) * 255
                err_conv.append(np.abs(h_conv - meas).max())
                err_raw.append(np.abs(h_raw - meas).max())
                print(f"  png {v.astype(int)}  meas {np.round(meas, 1)}  "
                      f"conv {np.round(h_conv, 1)} (d{np.abs(h_conv - meas).max():.1f})  "
                      f"raw d{np.abs(h_raw - meas).max():.1f}  "
                      f"g22 d{np.abs(h_g22 - meas).max():.1f}")
            print(f"  => max|err| convert {max(err_conv):.1f}  raw {max(err_raw):.1f}")

# ---------------- alpha compositing ---------------------------------------
if want("alpha"):
    ALPHAS = [64, 128, 191, 255]
    FG = (30, 215, 96)
    arr = np.zeros((1024, 1024, 4), np.uint8)
    for i, al in enumerate(ALPHAS):
        x, y = POS[i]
        arr[y:y + 120, x:x + 120] = (*FG, al)
    im = author("alpha", Image.fromarray(arr, "RGBA"),
                canvas_fill={"solid": "srgb:0.1,0.1,0.4,1"})
    B = np.median(im[40:120, 400:624].reshape(-1, 3), axis=0)  # canvas bg
    F = read_patch(im, 3)                                       # opaque fg
    print(f"\n[alpha] canvas bg meas {np.round(B, 1)}  opaque fg meas {np.round(F, 1)}")
    for i, al in enumerate(ALPHAS[:3]):
        t = al / 255.0
        meas = read_patch(im, i)
        h_p3 = B + (F - B) * t                                   # P3-coded lerp
        eB, eF = lin(B / 255), lin(F / 255)                      # P3->linear
        h_linp3 = enc(eB + (eF - eB) * t) * 255                  # linear-P3 lerp
        sB, sF = enc(P3_SRGB @ lin(B / 255)), enc(P3_SRGB @ lin(F / 255))
        h_esr = enc(SRGB_P3 @ lin(sB + (sF - sB) * t)) * 255     # encoded-sRGB lerp
        lB, lF = P3_SRGB @ lin(B / 255), P3_SRGB @ lin(F / 255)
        h_lsr = enc(SRGB_P3 @ (lB + (lF - lB) * t)) * 255        # linear-sRGB lerp
        print(f"  a={al}  meas {np.round(meas, 1)}  "
              f"p3lerp d{np.abs(h_p3 - meas).max():.1f}  "
              f"linP3 d{np.abs(h_linp3 - meas).max():.1f}  "
              f"encSRGB d{np.abs(h_esr - meas).max():.1f}  "
              f"linSRGB d{np.abs(h_lsr - meas).max():.1f}")

# ---------------- placement -----------------------------------------------
if want("place"):
    C = (60, 60, 200)

    def solid_png(w, h):
        arr = np.zeros((h, w, 4), np.uint8)
        arr[:, :] = (*C, 255)
        return Image.fromarray(arr, "RGBA")

    cases = [
        ("512", 512, 512, None),
        ("800x400", 800, 400, None),
        ("1200x500", 1200, 500, None),
        ("512-s2", 512, 512, {"scale": 2.0, "translation-in-points": [0.0, 0.0]}),
        ("512-t100", 512, 512, {"scale": 1.0, "translation-in-points": [100.0, 50.0]}),
    ]
    for name, w, h, pos in cases:
        im = author(f"place-{name}", solid_png(w, h),
                    canvas_fill={"solid": "srgb:1,1,1,1"}, position=pos)
        tgt = srgb_to_p3coded(np.array(C, np.float64))
        mask = (np.abs(im - tgt).max(axis=2) < 30) | (np.abs(im - np.array(C, np.float64)).max(axis=2) < 30)
        ys, xs = np.nonzero(mask)
        if len(xs) == 0:
            print(f"[place] {name}: no patch pixels found")
            continue
        print(f"[place] {name} ({w}x{h} pos={pos}): bbox x [{xs.min()},{xs.max()}] "
              f"y [{ys.min()},{ys.max()}]  (expect centered scale-1: "
              f"x [{(1024 - w) // 2},{(1024 + w) // 2 - 1}])")

# ---------------- dark-classifier bracketing ------------------------------
# Which statistic and threshold flip a raster layer to the raw path?
# Discriminator: the netflix red (178,7,15) patch — raw keeps G=7,
# convert lifts G to 35.
if want("classify"):
    RED = (178, 7, 15)

    def case_png(bg, hole=None, toprow=False):
        arr = np.zeros((1024, 1024, 4), np.uint8)
        arr[:, :] = (*bg, 255)
        x, y = POS[0]
        arr[y:y + 120, x:x + 120] = (*RED, 255)
        if hole:
            hx, hy, hw = hole
            arr[hy:hy + hw, hx:hx + hw] = 0
        if toprow:
            arr[0:1, :] = 0
        return Image.fromarray(arr, "RGBA")

    cases = [(f"g{g}", (g, g, g), None, False) for g in (64, 72, 77, 80, 85)]
    cases += [("green", (0, 204, 0), None, False),
              ("blue", (0, 0, 204), None, False),
              ("hole", (20, 20, 30), (700, 300, 60), False),
              ("toprow", (20, 20, 30), None, True),
              ("twotone", None, None, False)]  # per-channel-mean vs pixel-max-mean
    for name, bg, hole, toprow in cases:
        if name == "twotone":
            # left half (102,0,0), right half (0,0,102): per-channel means
            # (0.2, 0, 0.2) -> RAW under max-channel-mean; mean of per-pixel
            # max channel = 0.4 -> CONVERT under that statistic
            arr = np.zeros((1024, 1024, 4), np.uint8)
            arr[:, :512] = (102, 0, 0, 255)
            arr[:, 512:] = (0, 0, 102, 255)
            x, y = POS[0]
            arr[y:y + 120, x:x + 120] = (*RED, 255)
            img = Image.fromarray(arr, "RGBA")
        else:
            img = case_png(bg, hole, toprow)
        im = author(f"classify-{name}", img)
        meas = read_patch(im, 0)
        h_conv = srgb_to_p3coded(np.array(RED, np.float64))
        verdict = "RAW" if abs(meas[1] - 7) < 6 else ("CONVERT" if abs(meas[1] - h_conv[1]) < 6 else "??")
        arr = np.asarray(img).astype(np.float64) / 255
        cm = float(arr[..., :3].mean())
        lm = float((arr[..., :3] @ np.array([0.2126, 0.7152, 0.0722])).mean())
        print(f"[classify] {name:8s} meas {np.round(meas,1)}  {verdict}  "
              f"(chan-mean {cm:.3f}  luma {lm:.3f})")
