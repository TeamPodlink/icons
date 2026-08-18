#!/usr/bin/env python3
# Instrument: GLASS LAYERS WITH PNG ARTWORK — the composition cell the
# raster and glass workstreams left unmeasured when they merged.
#
# Questions, each answered by direct ictool measurement:
#   1. Does raster-artwork glass take the material family the same way as
#      SVG-artwork glass?  (white full-alpha PNG disk, t0.5, two-gray
#      solve -> alpha(y) vs glass-material-family.json)
#   2. What is the material color, through WHICH color path?  (red PNG
#      disk; overlay c(y)/alpha(y) vs candidates: raw bytes | sRGB->P3
#      composite | p3 soft-knee)
#   3. Is the material color PER-PIXEL or area-weighted?  (half-red/
#      half-white disk: crisp boundary = per-pixel)
#   4. How does ARTWORK ALPHA feed the material?  (uniform alpha 128/64
#      white disks: candidate al_eff = a * family(y))
#   5. Does the raster dark classifier see GLASS layers?  Two cells:
#      (a) a light glass frame covering a dark ring: does a non-glass
#          raster underneath flip raw->convert?
#      (b) glass artwork itself under a dark ring: raw or converted?
#
# macOS + Icon Composer.
#   $PYTHON packages/engine/tools/probe-raster-glass.py

import json
import os
import shutil
import subprocess

import numpy as np
from PIL import Image

WORK = os.environ.get("PROBE_WORK", "/tmp/probe-raster-glass")
os.makedirs(WORK, exist_ok=True)
ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool"

# ---------------- color candidates (copies of translate_icon.py's laws) ---
_M_P3_XYZ = np.array([[0.4865709, 0.2656677, 0.1982173],
                      [0.2289746, 0.6917385, 0.0792869],
                      [0.0000000, 0.0451134, 1.0439444]])
_M_SRGB_XYZ = np.array([[0.4123908, 0.3575843, 0.1804808],
                        [0.2126390, 0.7151687, 0.0721923],
                        [0.0193308, 0.1191948, 0.9505322]])
_P3_TO_SRGB = np.linalg.inv(_M_SRGB_XYZ) @ _M_P3_XYZ
_SRGB_TO_P3 = np.linalg.inv(_P3_TO_SRGB)


def _lin(u):
    u = np.asarray(u, np.float64)
    return np.where(u <= 0.04045, u / 12.92, ((u + 0.055) / 1.055) ** 2.4)


def _enc(u):
    u = np.clip(np.asarray(u, np.float64), 0, 1)
    return np.where(u <= 0.0031308, 12.92 * u, 1.055 * u ** (1 / 2.4) - 0.055)


def srgb_to_render(rgb01):
    return _enc(_SRGB_TO_P3 @ _lin(np.clip(rgb01, 0, 1))) * 255


# ---------------- bundle authoring ----------------------------------------
def write_png(path, rgba):
    Image.fromarray(rgba, "RGBA").save(path)


def disk_png(rgb, alpha=255, half_rgb=None, r=336, size=1024):
    ys, xs = np.mgrid[0:size, 0:size]
    m = np.hypot(xs - size / 2, ys - size / 2) < r
    out = np.zeros((size, size, 4), np.uint8)
    out[m, 0], out[m, 1], out[m, 2] = rgb
    if half_rgb is not None:
        hm = m & (xs >= size / 2)
        out[hm, 0], out[hm, 1], out[hm, 2] = half_rgb
    out[m, 3] = alpha
    return out


def frame_png(rgb, w=24, size=1024):
    out = np.zeros((size, size, 4), np.uint8)
    m = np.zeros((size, size), bool)
    m[:w] = m[-w:] = True
    m[:, :w] = m[:, -w:] = True
    out[m, 0], out[m, 1], out[m, 2] = rgb
    out[m, 3] = 255
    return out


def patch_png(rgb, size=512):
    out = np.zeros((size, size, 4), np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = rgb
    out[..., 3] = 255
    return out


def bundle(name, canvas, layers, transl=0.5):
    """layers: list of (png_array|svg_str, glass, scale, tr)"""
    d = os.path.join(WORK, name + ".icon")
    out = os.path.join(WORK, name + ".png")
    if not os.path.exists(out):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(os.path.join(d, "Assets"))
        ldefs = []
        for i, (art, glass, scale, tr) in enumerate(layers):
            if isinstance(art, str):
                fn = f"l{i}.svg"
                open(os.path.join(d, "Assets", fn), "w").write(art)
            else:
                fn = f"l{i}.png"
                write_png(os.path.join(d, "Assets", fn), art)
            ld = {"image-name": fn, "name": f"l{i}", "glass": glass}
            if scale is not None:
                ld["position"] = {"scale": scale,
                                  "translation-in-points": list(tr)}
            ldefs.append(ld)
        doc = {
            "fill": {"solid": canvas},
            "groups": [{
                "hidden": False,
                "translucency": {"enabled": True, "value": transl},
                "specular": True,
                "layers": ldefs,
            }],
            "supported-platforms": {"squares": "shared"},
        }
        json.dump(doc, open(os.path.join(d, "icon.json"), "w"))
        subprocess.run([ICTOOL, d, "--export-image", "--output-file", out,
                        "--platform", "macOS", "--rendition", "Default",
                        "--width", "1024", "--height", "1024", "--scale", "1"],
                       check=True, capture_output=True)
    return np.asarray(Image.open(out).convert("RGB")).astype(np.float64)


def gray(v):
    return f"srgb:{v:.5f},{v:.5f},{v:.5f},1.00000"


ys, xs = np.mgrid[0:1024, 0:1024]
INTERIOR = np.hypot(xs - 512, ys - 512) < (336 - 48)
IN_L = INTERIOR & (xs < 512 - 40)
IN_R = INTERIOR & (xs >= 512 + 40)


def solve_rows(g25, g75, b25, b75, mask):
    rows = []
    for y in range(1024):
        m = mask[y]
        if m.sum() < 60:
            continue
        i25 = np.median(g25[y][m], axis=0)
        i75 = np.median(g75[y][m], axis=0)
        r25 = np.median(b25[y][m], axis=0)
        r75 = np.median(b75[y][m], axis=0)
        k = (i75 - i25) / np.maximum(r75 - r25, 1e-6)
        c = i25 - k * r25
        rows.append((y, k, c))
    return rows


def summarize(tag, rows):
    out = {"y0": rows[0][0], "y1": rows[-1][0]}
    for name, sl in (("top", slice(0, 40)),
                     ("mid", slice(len(rows) // 2 - 20, len(rows) // 2 + 20)),
                     ("bot", slice(-40, None))):
        ks = np.stack([k for _, k, _ in rows[sl]])
        cs = np.stack([c for _, _, c in rows[sl]])
        out["k_" + name] = [round(float(v), 4) for v in ks.mean(0)]
        out["c_" + name] = [round(float(v), 2) for v in cs.mean(0)]
    out["alpha_full"] = [round(1 - float(np.mean(k)), 4)
                        for _, k, _ in rows][::16]
    return out


RED = (204, 26, 26)      # srgb 0.8,0.1,0.1 — raw vs converted differ a lot
results = {}

print("backgrounds (glass hidden via empty group == plain canvases)...")
b25 = bundle("bg25", gray(0.25), [])
b75 = bundle("bg75", gray(0.75), [])

print("[1] white full-alpha PNG disk, t0.5 — family conformance")
g25 = bundle("white-25", gray(0.25), [(disk_png((255, 255, 255)), True, None, None)])
g75 = bundle("white-75", gray(0.75), [(disk_png((255, 255, 255)), True, None, None)])
rows = solve_rows(g25, g75, b25, b75, INTERIOR)
results["white-a255"] = summarize("white", rows)
fam = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                  "..", "calibration",
                                  "glass-material-family.json")))
print("  measured alpha(y):", results["white-a255"]["alpha_full"][:6], "...")
print("  family t0.5     :", fam["t0.5"]["alpha_full"][:6], "...")

print("[2] red PNG disk — material color path")
g25 = bundle("red-25", gray(0.25), [(disk_png(RED), True, None, None)])
g75 = bundle("red-75", gray(0.75), [(disk_png(RED), True, None, None)])
rows = solve_rows(g25, g75, b25, b75, INTERIOR)
results["red-a255"] = summarize("red", rows)
r = results["red-a255"]
for name in ("top", "mid", "bot"):
    k = np.array(r["k_" + name])
    c = np.array(r["c_" + name])
    al = 1 - k.mean()
    print(f"  {name}: implied material color {np.round(c / max(al, 1e-6), 1)}")
print("  candidates: raw", RED,
      " srgb->p3", np.round(srgb_to_render(np.array(RED) / 255), 1))

print("[3] half red / half white disk — per-pixel?")
g25 = bundle("half-25", gray(0.25),
             [(disk_png(RED, half_rgb=(255, 255, 255)), True, None, None)])
g75 = bundle("half-75", gray(0.75),
             [(disk_png(RED, half_rgb=(255, 255, 255)), True, None, None)])
for side, mask in (("left(red)", IN_L), ("right(white)", IN_R)):
    rows = solve_rows(g25, g75, b25, b75, mask)
    s = summarize("half-" + side, rows)
    results["half-" + side] = s
    k = np.array(s["k_mid"]); c = np.array(s["c_mid"]); al = 1 - k.mean()
    print(f"  {side}: mid implied color {np.round(c / max(al, 1e-6), 1)} alpha {al:.3f}")
# boundary sharpness: horizontal profile across x=512 at y=512
prof = g75[512, 472:552]
print("  boundary profile R (x 472..552, step 8):",
      [int(v) for v in prof[::8, 0]])

print("[4] uniform partial alpha — white disk a128 / a64")
for aval in (128, 64):
    g25 = bundle(f"wa{aval}-25", gray(0.25), [(disk_png((255, 255, 255), alpha=aval), True, None, None)])
    g75 = bundle(f"wa{aval}-75", gray(0.75), [(disk_png((255, 255, 255), alpha=aval), True, None, None)])
    rows = solve_rows(g25, g75, b25, b75, INTERIOR)
    s = summarize(f"wa{aval}", rows)
    results[f"white-a{aval}"] = s
    al = np.array([1 - np.mean(k) for _, k, _ in rows])
    famc = np.array(fam["t0.5"]["alpha_full"], np.float64)
    # candidate: al_eff = (a/255) * family (resampled to our rows)
    cand = (aval / 255) * np.interp(np.linspace(0, 1, len(al)),
                                    np.linspace(0, 1, len(famc)), famc)
    print(f"  a={aval}: measured alpha top/mid/bot "
          f"{al[:30].mean():.3f}/{al[len(al)//2-15:len(al)//2+15].mean():.3f}/{al[-30:].mean():.3f}"
          f" vs a*family {cand[:30].mean():.3f}/{cand[len(cand)//2-15:len(cand)//2+15].mean():.3f}/{cand[-30:].mean():.3f}"
          f" | rms(meas-cand) {np.sqrt(((al-cand)**2).mean()):.4f}")

print("[5a] classifier: does a light GLASS frame un-darken the ring?")
DK = (30, 30, 30)        # canvas handled via fill; patch discriminates
PR = (128, 26, 26)       # srgb 0.5,0.1,0.1
base = bundle("cls-base", gray(0.10),
              [(patch_png(PR), False, 1.0, (0, 0))])
withg = bundle("cls-glassframe", gray(0.10),
               [(patch_png(PR), False, 1.0, (0, 0)),
                (frame_png((240, 240, 240)), True, 1.0, (0, 0))])
c_base = np.median(base[502:522, 502:522].reshape(-1, 3), axis=0)
c_withg = np.median(withg[502:522, 502:522].reshape(-1, 3), axis=0)
print("  patch center, no glass   :", np.round(c_base, 1))
print("  patch center, glass frame:", np.round(c_withg, 1))
print("  raw candidate:", PR, " converted:", np.round(srgb_to_render(np.array(PR) / 255), 1))
results["cls-frame"] = {"base": list(np.round(c_base, 2)),
                        "withglass": list(np.round(c_withg, 2))}

print("[5b] classifier: glass artwork itself under a dark ring")
gA = bundle("clsg-15", gray(0.15), [(disk_png(RED), True, None, None)])
gB = bundle("clsg-28", gray(0.28), [(disk_png(RED), True, None, None)])
bA = bundle("clsbg-15", gray(0.15), [])
bB = bundle("clsbg-28", gray(0.28), [])
rows = solve_rows(gA, gB, bA, bB, INTERIOR)
s = summarize("clsg", rows)
results["cls-glass-dark"] = s
k = np.array(s["k_mid"]); c = np.array(s["c_mid"]); al = 1 - k.mean()
print(f"  dark-ring glass red: mid implied color {np.round(c / max(al, 1e-6), 1)}")

json.dump(results, open(os.path.join(WORK, "raster-glass.json"), "w"), indent=1)
print("wrote", os.path.join(WORK, "raster-glass.json"))
