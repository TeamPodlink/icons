#!/usr/bin/env python3
# Rebuild the scratch inputs MetalFlatExploration needs (hfield.f32, alpha.f32,
# person.u8, bodyA.u8) from repo artifacts, using the corrected refraction
# profile (calibration/refraction-profile.json):
#
#   h = A0 * (1 - (1 - min(dist/R0, 1))^2)^pw,  boxblur smooth_r x smooth_n
#
# dist = exact EDT inside the person silhouette (calibration/person-mask-1024.png).
#
#   python3 tools/build_displacement_field.py --scratch <dir>
import numpy as np, json, argparse, os
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("--scratch", required=True)
ap.add_argument("--profile", default="calibration/refraction-profile.json")
a = ap.parse_args()

prof = json.load(open(a.profile))
A0, R0, PW = prof["A0"], prof["R0"], prof["pw"]
SR, SN = prof.get("smooth_r", 3), prof.get("smooth_n", 2)

maskA = np.asarray(Image.open("calibration/person-mask-1024.png").convert("L")).astype(np.float32)/255.0
inside = maskA > 0.5
INF = 1e6; S2 = 2**0.5
idx = np.arange(1024, dtype=np.float64)
d0 = np.where(inside, INF, 0.0).astype(np.float64)
b = inside & ((~inside[np.r_[0, 0:1023], :]) | (~inside[np.r_[1:1024, 1023], :]) |
              (~inside[:, np.r_[0, 0:1023]]) | (~inside[:, np.r_[1:1024, 1023]]))
d0[b] = np.clip(maskA[b]-0.5, 0.01, 1.0)
def _scan(d, top_down):
    rng = range(1, 1024) if top_down else range(1022, -1, -1)
    step = -1 if top_down else 1
    for i in rng:
        prev = d[i+step]
        cand = np.minimum(d[i], prev+1.0)
        cand[1:] = np.minimum(cand[1:], prev[:-1]+S2)
        cand[:-1] = np.minimum(cand[:-1], prev[1:]+S2)
        aa = np.minimum.accumulate(cand-idx)+idx
        bb = (np.minimum.accumulate((cand+idx)[::-1]))[::-1]-idx
        d[i] = np.minimum(aa, np.minimum(bb, cand))
    return d
d0 = _scan(d0, True); d0 = _scan(d0, False); d0 = _scan(d0, True)
dist = d0.astype(np.float32)

def boxblur(arr, r):
    for ax in (0, 1):
        c = np.cumsum(np.pad(arr, [(r+1, r) if k == ax else (0, 0) for k in (0, 1)], mode="edge"), axis=ax)
        arr = (c[2*r+1:, :]-c[:-2*r-1, :])/(2*r+1) if ax == 0 else (c[:, 2*r+1:]-c[:, :-2*r-1])/(2*r+1)
    return arr

t = np.clip(dist/R0, 0, 1)
h = A0*np.power(np.clip(1-(1-t)**2, 0, 1), PW)
for _ in range(SN):
    h = boxblur(h, SR)
h = h.astype(np.float32)
h *= (dist > 0)

os.makedirs(a.scratch, exist_ok=True)
h.tofile(os.path.join(a.scratch, "hfield.f32"))
(np.clip(maskA*255, 0, 255).astype(np.uint8)).tofile(os.path.join(a.scratch, "person.u8"))
alpha = np.fromfile("calibration/person-overlay-alpha.f32", dtype=np.float32)
alpha.tofile(os.path.join(a.scratch, "alpha.f32"))
# real-icon overlay alpha (for MetalPodcastsFull)
if os.path.exists("calibration/person-overlay-alpha-realicon.f32"):
    np.fromfile("calibration/person-overlay-alpha-realicon.f32", dtype=np.float32).tofile(
        os.path.join(a.scratch, "alpha_real.f32"))
# bodyA: opaque squircle body alpha; approximate from the decant target's alpha
body = np.asarray(Image.open("comparison/Podcasts-decant-ictool-1024.png").convert("RGBA"))[..., 3]
body.astype(np.uint8).tofile(os.path.join(a.scratch, "bodyA.u8"))

# ---- extra inputs for the full-icon renderer (MetalPodcastsFull) ----
def edt_of(mask):
    inside2 = mask > 0.5
    dd = np.where(inside2, INF, 0.0).astype(np.float64)
    bb2 = inside2 & ((~inside2[np.r_[0, 0:1023], :]) | (~inside2[np.r_[1:1024, 1023], :]) |
                     (~inside2[:, np.r_[0, 0:1023]]) | (~inside2[:, np.r_[1:1024, 1023]]))
    dd[bb2] = np.clip(mask[bb2]-0.5, 0.01, 1.0)
    dd = _scan(dd, True); dd = _scan(dd, False); dd = _scan(dd, True)
    return dd.astype(np.float32)
# body signed distance: prefer the canonical high-res version (4096-native
# padded EDT box-downsampled to 1024) — a 1024 chamfer EDT ripples +-0.5px
# along the near-flat squircle sections, which pulses the rim LUT into
# visible scallops at the corner-to-flat transitions
if os.path.exists("calibration/body-sd-1024.npy"):
    bsd = np.load("calibration/body-sd-1024.npy")
else:
    bodyF = body.astype(np.float32)/255.0
    bodyP = bodyF.copy()   # canvas border = outside (body touches top/bottom)
    bodyP[0, :] = 0; bodyP[-1, :] = 0; bodyP[:, 0] = 0; bodyP[:, -1] = 0
    bsd = np.where(bodyP > 0.5, edt_of(bodyP), -edt_of(1.0-bodyP))
bsd.astype(np.float32).tofile(os.path.join(a.scratch, "body_sd.f32"))
# body lighting LUT (normal-angle x depth, measured on squircle-exploration.icon)
lutP = np.load("calibration/body-light-lut-analytic.npy")
np.concatenate([lutP, lutP[:1]], axis=0).astype(np.float32).tofile(
    os.path.join(a.scratch, "body_lut.f32"))
# disk affine-response LUTs (angle x radial-d, measured on the diskcal icons)
for dk in ("d1", "d2"):
    kc = np.load(f"calibration/disk-lut-{dk}.npy")  # (2, 180, 440): k, c
    kw = np.concatenate([kc[0], kc[0][:1]], axis=0)
    cw = np.concatenate([kc[1], kc[1][:1]], axis=0)
    np.stack([kw, cw], axis=2).astype(np.float32).tofile(
        os.path.join(a.scratch, f"disk_lut_{dk}.rg32f"))
# person outside-distance (lightmap bake region) + drop shadow (offset 17, ~sigma 14)
edt_of(1.0-maskA).astype(np.float32).tofile(os.path.join(a.scratch, "person_dout.f32"))
# person shadow kernel fit on the REAL icon (A/B shadow-off decant render):
# gaussian sigma 23, offset +29, ADDITIVE-CONSTANT amplitude 17.385/255
# (ictool shadows darken by a fixed amount, background-independent), OUTSIDE
# the silhouette only (the translucency-0.4 glass does not show the shadow
# beneath it, unlike the translucency-1.0 exploration icon)
sh = np.roll(maskA, 29, axis=0)
for _ in range(3):
    sh = boxblur(sh, 23)
sh.astype(np.float32).tofile(os.path.join(a.scratch, "person_shadow.f32"))
print(f"wrote hfield.f32 (A0={A0} R0={R0} pw={PW}), person.u8, alpha.f32, alpha_real.f32, "
      f"bodyA.u8, body_sd.f32, person_dout.f32, person_shadow.f32 -> {a.scratch}")
