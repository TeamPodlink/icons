#!/usr/bin/env python3
# Measure each disk layer's Liquid Glass material as an AFFINE response LUT:
#   out(p) = k(angle,d) * bg(p) + fill(p) + c(angle,d),   d = r - R in [-40, 70]
#
# Method: build per-disk calibration icons with the REAL circle-layer params
# (from Podcasts-decant.icon) over TWO body grays (0.25, 0.75); two renders
# solve per-pixel k (absorption) and c (emission). This captures the spec
# rims, the dark contour, AND the drop shadow in one lookup, and transfers to
# any background (unlike an additive-only field — the dark contour is an
# alpha blend, k<1). The plain fill is subtracted and kept analytic in the
# shader so the fill-edge AA stays crisp under supersampling.
#
# c must be measured relative to the BODY-LIT background (gray + body-light
# LUT field), not raw gray. c is neutral (chroma < 0.5/255).
#
# Usage (repo root; needs the squircle body LUT + padded 4096 body EDT from
# measure_body_lut.py in the scratch dir):
#   python3 tools/calibration/measure_disk_luts.py --scratch <dir>
# Writes calibration/disk-lut-d{1,2}.npy (2 x 180 x 440: k, c).
import numpy as np, json, os, shutil, subprocess, argparse
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("--scratch", required=True)
ap.add_argument("--ictool", default="/Applications/Icon Composer.app/Contents/Executables/ictool")
a = ap.parse_args()
S = a.scratch

CONFIGS = {
    "d1": dict(asset="3_circle1.svg", ctr=(512.0, 474.0), R=372.0,
               fill=(102.0, 744.0, 0.18, 0.125),
               group={"hidden": False, "shadow": {"kind": "neutral", "opacity": 0.4},
                      "blend-mode-specializations": [{"value": "plus-lighter"}],
                      "lighting": "individual", "specular": True,
                      "translucency-specializations": [{"value": {"enabled": True, "value": 0.36}}]},
               layer={"image-name": "3_circle1.svg", "name": "3_circle1",
                      "opacity-specializations": [{"value": 0.17}], "glass": True}),
    "d2": dict(asset="2_circle2.svg", ctr=(512.0, 466.0), R=232.0,
               fill=(234.0, 464.0, 0.175, 0.128),
               group={"hidden": False, "shadow": {"kind": "neutral", "opacity": 1.44},
                      "blend-mode-specializations": [{"value": "plus-lighter"}],
                      "lighting": "individual", "specular": True,
                      "translucency-specializations": [{"value": {"enabled": True, "value": 0.36}}],
                      "refractivity": {"enabled": True, "strength": 0.5, "depth": 0}},
               layer={"image-name": "2_circle2.svg", "name": "2_circle2",
                      "opacity-specializations": [{"value": 0.18}], "glass": True}),
}

# 1. build + render calibration icons
for dk, cfg in CONFIGS.items():
    for bg in (0.25, 0.75):
        name = f"{S}/diskcal-{dk}-{int(bg*100)}.icon"
        os.makedirs(f"{name}/Assets", exist_ok=True)
        shutil.copy(f"Podcasts-decant.icon/Assets/{cfg['asset']}", f"{name}/Assets/{cfg['asset']}")
        g = dict(cfg["group"]); g["layers"] = [cfg["layer"]]
        json.dump({"fill": {"solid": f"extended-gray:{bg:.5f},1.00000"}, "groups": [g],
                   "supported-platforms": {"circles": ["watchOS"], "squares": "shared"}},
                  open(f"{name}/icon.json", "w"), indent=1)
        out = f"{S}/diskcal-{dk}-{int(bg*100)}-4096.png"
        if not os.path.exists(out):
            subprocess.run([a.ictool, name, "--export-image", "--output-file", out,
                            "--platform", "macOS", "--rendition", "Default",
                            "--width", "4096", "--height", "4096", "--scale", "1"],
                           check=True, capture_output=True)
        print("rendered", out)

# 2. body-lit background field B at 4096 (from the body LUT + padded EDT)
bsd4 = np.load(f"{S}/bsd4_padded.npy"); phi4 = np.load(f"{S}/phi4_padded.npy")
P = np.load("calibration/body-light-lut.npy")
NB, D0, DS, ND = 180, -4.0, 0.25, 208
pf = (phi4+np.pi)/(2*np.pi)*NB
di = np.clip((bsd4-D0)/DS, 16.0, ND-1.001)
p0 = np.floor(pf).astype(int) % NB; p1 = (p0+1) % NB
fp = (pf-np.floor(pf)).astype(np.float32)
d0i = np.floor(di).astype(int); d1i = np.clip(d0i+1, 0, ND-1)
fd = (di-np.floor(di)).astype(np.float32)
B = (P[p0,d0i]*(1-fp)*(1-fd)+P[p1,d0i]*fp*(1-fd)+P[p0,d1i]*(1-fp)*fd+P[p1,d1i]*fp*fd)
B = np.where(bsd4 >= 48.0, 0.0, B).astype(np.float32)
del pf, di, p0, p1, fp, d0i, d1i, fd

# 3. measure per-disk LUTs
yy, xx = np.mgrid[0:4096, 0:4096].astype(np.float32)
for dk, cfg in CONFIGS.items():
    cx, cy = cfg["ctr"]; R = cfg["R"]
    fy0, fspan, fa0, fa1 = cfg["fill"]
    I25 = np.asarray(Image.open(f"{S}/diskcal-{dk}-25-4096.png").convert("RGBA")).astype(np.float32)
    I75 = np.asarray(Image.open(f"{S}/diskcal-{dk}-75-4096.png").convert("RGBA")).astype(np.float32)
    A25 = I25[..., 3]; I25 = I25[..., :3]; I75 = I75[..., :3]
    r = np.sqrt((xx/4-cx)**2 + (yy/4-cy)**2)
    dband = r - R
    clean = (dband > 95) & (bsd4 > 60)
    g25 = I25[..., 1][clean].mean(); g75 = I75[..., 1][clean].mean()
    k = ((I75 - I25)/(g75 - g25)).mean(axis=2)
    vfill = np.clip((yy/4 - fy0)/fspan, 0, 1)
    fillterm = 255.0*(fa0 + (fa1-fa0)*vfill)*np.clip(R - r + 0.5, 0, 1)
    c = I25.mean(axis=2) - k*(g25 + B) - fillterm
    ang = np.arctan2(yy/4-cy, xx/4-cx)
    NA, DD0, DDS = 180, -40.0, 0.25
    NDD = int((70.0-DD0)/DDS)
    sel = (dband > DD0) & (dband < 70.0) & (A25 > 250)
    ai = ((ang[sel]+np.pi)/(2*np.pi)*NA).astype(int) % NA
    ddi = np.clip(((dband[sel]-DD0)/DDS).astype(int), 0, NDD-1)
    CNT = np.zeros((NA, NDD)); KL = np.zeros((NA, NDD)); CL = np.zeros((NA, NDD))
    np.add.at(CNT, (ai, ddi), 1)
    np.add.at(KL, (ai, ddi), k[sel]); np.add.at(CL, (ai, ddi), c[sel])
    KL = KL/np.maximum(CNT, 1); CL = CL/np.maximum(CNT, 1)
    KL = (np.roll(KL, 1, 0)+2*KL+np.roll(KL, -1, 0))/4
    CL = (np.roll(CL, 1, 0)+2*CL+np.roll(CL, -1, 0))/4
    np.save(f"calibration/disk-lut-{dk}.npy", np.stack([KL, CL]).astype(np.float32))
    pred = KL[ai, ddi]*(g25 + B)[sel] + CL[ai, ddi] + fillterm[sel]
    print(f"{dk}: wrote calibration/disk-lut-{dk}.npy  band recon rms "
          f"{np.sqrt(((pred - I25.mean(axis=2)[sel])**2).mean()):.2f}")
