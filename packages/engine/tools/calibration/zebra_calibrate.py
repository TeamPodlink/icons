        # Stage 1: measure true ring boundary radii + center from the folding render,
# using only pixels far outside the person (unwarped background).
import numpy as np
from PIL import Image
S = "/tmp/liquid-glass-calibration"  # scratch dir — re-point, see README.md

img = np.asarray(Image.open(f"{S}/folding-4096.png").convert("L")).astype(np.float32)
mask = np.asarray(Image.open(f"{S}/person-mask-4096.png").convert("L")).astype(np.float32) / 255.0

# distance from person (outside): quick chamfer via repeated dilation is slow;
# use scipy-free trick: person bbox + radial exclusion is enough. Instead just
# exclude a dilated person box: person spans roughly x 1664-2432, y 1408-3712 at 4096.
# Safer: exclude any pixel within 120px of the mask via coarse blocks.
from numpy.lib.stride_tricks import sliding_window_view
m = (mask > 0.1).astype(np.uint8)
# coarse dilation: max-pool to 64px blocks, then mark neighbors
blk = m.reshape(64, 64, 64, 64).max(axis=(1, 3))  # 64x64 grid of 64px blocks
big = np.zeros((66, 66), np.uint8); big[1:65, 1:65] = blk
dil = np.zeros_like(blk)
for dy in (0, 1, 2):
    for dx in (0, 1, 2):
        dil |= big[dy:dy+64, dx:dx+64]
excl = np.kron(dil, np.ones((64, 64), np.uint8)).astype(bool)

cx0, cy0 = 2048.0, 1896.0
NOM = np.array([130.5, 165.5, 199.5, 233.5, 266.5, 300.5, 333.5, 371.5, 408.5, 463.5]) * 4.0

yy, xx = np.mgrid[0:4096, 0:4096].astype(np.float32)

def bilin(im, x, y):
    x0 = np.clip(np.floor(x).astype(np.int32), 0, 4094); y0 = np.clip(np.floor(y).astype(np.int32), 0, 4094)
    fx = x - x0; fy = y - y0
    return (im[y0, x0]*(1-fx)*(1-fy) + im[y0, x0+1]*fx*(1-fy) +
            im[y0+1, x0]*(1-fx)*fy + im[y0+1, x0+1]*fx*fy)

def excl_at(x, y):
    return excl[np.clip(y.astype(np.int32), 0, 4095), np.clip(x.astype(np.int32), 0, 4095)]

# for each nominal boundary, sample rays at many angles, find mid-crossing subpixel
report = {}
centers = []
for rn in NOM:
    ths = np.arange(0, 2*np.pi, np.pi/1800)
    rs = np.arange(rn-30, rn+30, 0.25)
    T, R = np.meshgrid(ths, rs, indexing="ij")
    X = cx0 + R*np.cos(T); Y = cy0 + R*np.sin(T)
    L = bilin(img, X, Y)
    bad = excl_at(X, Y).any(axis=1)
    lo = L.min(axis=1); hi = L.max(axis=1)
    ok = (~bad) & (hi - lo > 100)
    mid = (lo + hi)[:, None] / 2
    sgn = L > mid
    flips = sgn[:, 1:] != sgn[:, :-1]
    nf = flips.sum(axis=1)
    ok &= (nf == 1)
    idx = np.argmax(flips, axis=1)
    # linear interp subpixel
    i0 = idx; L0 = L[np.arange(len(ths)), i0]; L1 = L[np.arange(len(ths)), i0+1]
    m2 = mid[:, 0]
    frac = np.clip((m2 - L0) / np.where(np.abs(L1-L0) < 1e-6, 1e-6, L1-L0), 0, 1)
    rcross = rs[i0] + 0.25*frac
    th_ok = ths[ok]; rc_ok = rcross[ok]
    # fit circle center + radius: x=cx+r cos, treat as r(theta) ≈ r0 - dx cos - dy sin
    A = np.stack([np.ones_like(th_ok), np.cos(th_ok), np.sin(th_ok)], axis=1)
    sol, *_ = np.linalg.lstsq(A, rc_ok, rcond=None)
    r0, dxc, dyc = sol
    resid = rc_ok - A @ sol
    report[rn/4] = dict(n=int(ok.sum()), r=float(r0/4), dcx=float(-dxc/4), dcy=float(-dyc/4),
                        rms=float(np.sqrt((resid**2).mean())/4))
    centers.append((-dxc, -dyc))

for k, v in report.items():
    print(f"nominal {k:7.2f}: fit r {v['r']:8.3f}  center offset ({v['dcx']:+.3f},{v['dcy']:+.3f})  rms {v['rms']:.3f}px(1024)  n {v['n']}")

# ring colors: sample midpoints between boundaries along theta=180deg (left, no person)
edges = [0] + [report[k]["r"]*4 for k in sorted(report)] + [1900]
print("\nring colors (left ray):")
for i in range(len(edges)-1):
    rm = (edges[i] + edges[i+1]) / 2
    v = bilin(img, np.array([cx0 - rm]), np.array([cy0]))[0]
    print(f"  ring {i}: r {edges[i]/4:.1f}-{edges[i+1]/4:.1f}  lum {v:.1f}")
import json
json.dump(report, open(f"{S}/ring_calib.json", "w"), indent=1, default=float)
