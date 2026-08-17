#!/usr/bin/env python3
# Measure the body Liquid Glass lighting field from squircle-exploration.icon
# (bare gray body, no layers) as a (normal-angle x depth) LUT.
#
# Key facts this measurement established (2026-07-05):
#   - the field is fully parameterized by (outward-normal angle, signed body
#     distance): for a squircle, normal angle == arc position, so corners are
#     captured implicitly (no separate "corner glow" elements needed)
#   - the field is NEUTRAL (max chroma deviation ~1/255) and plain-ADDITIVE
#     with clamp over any fill (verified on the purple L0: R/G scale ~1.0,
#     B "scale" 0.77 is just 255-saturation)
#   - the EDT must treat the canvas border as outside (the body touches the
#     canvas top/bottom; without padding, the flat-section rims read as deep
#     interior and the LUT top/bottom rows are wrong)
#   - d<0 LUT bins are garbage (premultiplied transparent fringe) — the
#     shader clamps its lookup to d>=0
#
# Usage: run from the repo root after reconstituting squircle-exploration.icon
# (spec: tools/calibration/icons/, see its README) and rendering it at 4096
# (ictool) to <scratch>/squircle-4096.png. Writes
# calibration/body-light-lut.npy (180 angle bins x 208 depth bins,
# d = -4..48 px @0.25, row = (phi+pi)/2pi*180).
import numpy as np, argparse, os
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("--scratch", required=True)
a = ap.parse_args()

img4 = np.asarray(Image.open(os.path.join(a.scratch, "squircle-4096.png")).convert("RGBA")).astype(np.float32)
A4 = img4[..., 3]/255.0
N = 4098
INF = 1e7; S2 = 2**0.5
idx = np.arange(N, dtype=np.float64)

def scan(d, top_down):
    rng = range(1, N) if top_down else range(N-2, -1, -1)
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

def edt(mask):
    inside = mask > 0.5
    d0 = np.where(inside, INF, 0.0)
    b = inside & ((~inside[np.r_[0, 0:N-1], :]) | (~inside[np.r_[1:N, N-1], :]) |
                  (~inside[:, np.r_[0, 0:N-1]]) | (~inside[:, np.r_[1:N, N-1]]))
    d0[b] = np.clip(mask[b]-0.5, 0.01, 1.0)
    d0 = scan(d0, True); d0 = scan(d0, False); d0 = scan(d0, True)
    return d0

Ap = np.zeros((N, N)); Ap[1:-1, 1:-1] = A4   # canvas border = outside
bsd4 = (np.where(Ap > 0.5, edt(Ap), -edt(1.0-Ap))[1:-1, 1:-1]).astype(np.float32)/4.0

def boxblur(arr, r):
    for ax in (0, 1):
        c = np.cumsum(np.pad(arr, [(r+1, r) if k == ax else (0, 0) for k in (0, 1)], mode="edge"), axis=ax)
        arr = (c[2*r+1:, :]-c[:-2*r-1, :])/(2*r+1) if ax == 0 else (c[:, 2*r+1:]-c[:, :-2*r-1])/(2*r+1)
    return arr
bs = boxblur(boxblur(bsd4.astype(np.float64), 6), 6)
gy, gx = np.gradient(bs)
phi4 = np.arctan2(-gy, -gx).astype(np.float32)

F = img4[..., :3].mean(axis=2) - 128.0
NB = 180; D0, D1, DS = -4.0, 48.0, 0.25
ND = int((D1-D0)/DS)
sel = (bsd4 > D0) & (bsd4 < D1)
pi_idx = ((phi4[sel]+np.pi)/(2*np.pi)*NB).astype(int) % NB
d_idx = np.clip(((bsd4[sel]-D0)/DS).astype(int), 0, ND-1)
H = np.zeros((NB, ND)); C = np.zeros((NB, ND))
np.add.at(H, (pi_idx, d_idx), F[sel]); np.add.at(C, (pi_idx, d_idx), 1)
P = H/np.maximum(C, 1)
P = (np.roll(P, 1, 0) + 2*P + np.roll(P, -1, 0))/4
np.save("calibration/body-light-lut.npy", P.astype(np.float32))
print(f"wrote calibration/body-light-lut.npy ({NB}x{ND}, range {P.min():.1f}..{P.max():.1f})")
