#!/usr/bin/env python3
# Fit the analytic body squircle used by MetalPodcastsFull.
#
# SHAPE TRUTH (established 2026-07-05): the body is the full 1024 canvas
# rectangle intersected with four corner curves — the flat sides have NO
# boundary of their own (the canvas clips them; alpha is 255 to the very
# edge). So the SDF is  d = min(x, y, 1024-x, 1024-y, d_corner).
#
# The corner curve is fit as an even polynomial GRAPH in the 45-degree
# corner frame (s along the corner tangent, q toward the corner origin):
#   q(s) = sum coef[k] * (s/smax)^(2k)
# Fit on angle-binned means of boundary points extracted from the 4096
# squircle-exploration render's EDT zero contour: boundary rms 0.035 px
# (the raw point scatter is ~0.15 px = ictool's dithered edge AA, so bin
# first). Rejected along the way: global superellipse (0.6-1 px), Lp-corner
# rounded box (0.64 px), polar Fourier about a center (center assumption
# costs ~0.14 px and the flats poison the fit via pad-frame artifacts).
#
# The shader does 3 Newton steps for the foot point; distance via normal
# projection. NOTE: the resulting distances are TRUER than a chamfer EDT
# (chamfer overestimates ~1% angle-dependently), so any (angle x depth)
# material LUT must be (re)measured in these analytic coordinates
# (calibration/body-light-lut-analytic.npy), not against a chamfer EDT.
#
# Usage (repo root; needs <scratch>/squircle-4096.png + its padded EDT
# bsd4_padded.npy from measure_body_lut.py):
#   python3 tools/calibration/fit_body_squircle.py --scratch <dir>
# Prints the smax/coef constants embedded in MetalPodcastsFull.swift.
import numpy as np, argparse, os

ap = argparse.ArgumentParser()
ap.add_argument("--scratch", required=True)
a = ap.parse_args()

bsd4 = np.load(os.path.join(a.scratch, "bsd4_padded.npy"))
N = 4096
pts = []
for i in range(0, N, 2):
    for arr, swap in ((bsd4[i], False), (bsd4[:, i], True)):
        s = np.sign(arr)
        for j in np.nonzero(np.diff(s) != 0)[0]:
            f = arr[j]/(arr[j]-arr[j+1])
            xy = ((j+f)/4.0, i/4.0)
            pts.append((xy[1], xy[0]) if swap else xy)
P = np.array(pts)
m = (P[:, 0] > 1.0) & (P[:, 0] < 1023.0) & (P[:, 1] > 1.0) & (P[:, 1] < 1023.0)
Q = P[m]   # true corner points only (flats are canvas-clipped -> pad artifacts)
dx = np.minimum(Q[:, 0], 1024.0-Q[:, 0]); dy = np.minimum(Q[:, 1], 1024.0-Q[:, 1])
s = (dx - dy)/np.sqrt(2.0); q = (dx + dy)/np.sqrt(2.0)
smax = float(np.abs(s).max())
NB = 160
bi = np.clip(((s+smax)/(2*smax)*NB).astype(int), 0, NB-1)
sums = np.zeros(NB); cnt = np.zeros(NB)
np.add.at(sums, bi, q); np.add.at(cnt, bi, 1)
mm = cnt > 2
sb = -smax + (np.nonzero(mm)[0]+0.5)/NB*2*smax
qb = sums[mm]/cnt[mm]
ORDER = 7
A = np.stack([(sb/smax)**(2*k) for k in range(ORDER)], axis=1)
coef, *_ = np.linalg.lstsq(A, qb, rcond=None)
res = qb - A@coef
print(f"corner fit: rms {np.sqrt((res**2).mean()):.4f} max {np.abs(res).max():.4f}")
print(f"SMAX = {smax:.6f}")
print("CPOLY = {" + ", ".join(f"{c:.8f}" for c in coef) + "}")
np.save("calibration/body-corner-poly.npy", np.concatenate([[smax], coef]))
