        # Stage 2: decode the stripe field through the glass person.
# Rays from (512,474); detect luminance transitions with subpixel precision;
# assign each transition to a ring boundary using the CURRENT model field
# (source-space nearest boundary), then check sequential consistency per ray.
# Output: per-transition table with residuals (model source radius - boundary radius).
import numpy as np, json
from PIL import Image
S = "/tmp/liquid-glass-calibration"  # scratch dir — re-point, see README.md

img = np.asarray(Image.open(f"{S}/folding-4096.png").convert("L")).astype(np.float32)
mask4 = np.asarray(Image.open(f"{S}/person-mask-4096.png").convert("L")).astype(np.float32) / 255.0
dist1k = np.load(f"{S}/person-dist.npy")  # 1024 EDT inside person

calib = json.load(open(f"{S}/ring_calib.json"))
# per-boundary circle (1024 units): radius rho_k, center (cx_k, cy_k)
bounds = []
for nom in sorted(calib, key=float):
    v = calib[nom]
    bounds.append((v["r"], 512.0 - v["dcx"], 474.0 - v["dcy"]))  # center = (512,474) - reported offset... see note
# NOTE on signs: calibrate reported dcx=-ex, dcy=-ey where (ex,ey) is center offset
# from (512,474). So center = (512 - dcx, 474 - dcy).
RHO = np.array([b[0] for b in bounds])
BCX = np.array([b[1] for b in bounds])
BCY = np.array([b[2] for b in bounds])
print("boundaries:")
for r, cx, cy in bounds: print(f"  rho {r:8.3f} center ({cx:.3f},{cy:.3f})")

# ---- model displacement field at 1024, replicating the Metal shader ----
h = np.fromfile(f"{S}/hfield.f32", dtype=np.float32).reshape(1024, 1024)
ETA = 1/1.5
e = 0.75
def shift_field(hf):
    # central differences at e=0.75 via bilinear sampling
    def samp(dx, dy):
        yy, xx = np.mgrid[0:1024, 0:1024].astype(np.float32)
        x = np.clip(xx+dx, 0, 1023); y = np.clip(yy+dy, 0, 1023)
        x0 = np.clip(np.floor(x).astype(np.int32), 0, 1022); y0 = np.clip(np.floor(y).astype(np.int32), 0, 1022)
        fx = x-x0; fy = y-y0
        return (hf[y0,x0]*(1-fx)*(1-fy) + hf[y0,x0+1]*fx*(1-fy) + hf[y0+1,x0]*(1-fx)*fy + hf[y0+1,x0+1]*fx*fy)
    hx = (samp(e,0)-samp(-e,0))/(2*e); hy = (samp(0,e)-samp(0,-e))/(2*e)
    nz = 1.0/np.sqrt(hx*hx+hy*hy+1.0); nx, ny = -hx*nz, -hy*nz
    cosi = nz
    k = np.clip(1.0 - ETA*ETA*(1.0-cosi*cosi), 0, None)
    coef = ETA*cosi - np.sqrt(k)
    tz = -ETA + coef*nz
    ox = coef*nx/np.maximum(np.abs(tz), 1e-3)*h
    oy = coef*ny/np.maximum(np.abs(tz), 1e-3)*h
    return ox.astype(np.float32), oy.astype(np.float32)
OX, OY = shift_field(h)

def bilin(im, x, y, n):
    x = np.clip(x, 0, n-1.001); y = np.clip(y, 0, n-1.001)
    x0 = np.floor(x).astype(np.int32); y0 = np.floor(y).astype(np.int32)
    fx = x-x0; fy = y-y0
    return (im[y0,x0]*(1-fx)*(1-fy) + im[y0,x0+1]*fx*(1-fy) + im[y0+1,x0]*(1-fx)*fy + im[y0+1,x0+1]*fx*fy)

# ---- ray sampling (4096 coords) ----
CX4, CY4 = 2048.0, 1896.0
rstep = 0.25
rs = np.arange(80.0, 1900.0, rstep)          # 7280 samples
ths = np.arange(0, 360.0, 0.1) * np.pi/180   # 3600 rays
NR = len(rs)

rows = []  # x1k, y1k, r_obs1k, theta, k, res_model, dist_edge, polarity
CHUNK = 90
for a0 in range(0, len(ths), CHUNK):
    th = ths[a0:a0+CHUNK]
    ct, st = np.cos(th)[:, None], np.sin(th)[:, None]
    X = CX4 + rs[None, :]*ct; Y = CY4 + rs[None, :]*st
    L = bilin(img, X, Y, 4096)
    P = bilin(mask4, X, Y, 4096)
    # block envelope: blocks of 128 samples, window +-3 blocks
    nb = NR // 128
    Lb = L[:, :nb*128].reshape(len(th), nb, 128)
    bmin = Lb.min(axis=2); bmax = Lb.max(axis=2)
    pad = 3
    bmin_p = np.pad(bmin, ((0,0),(pad,pad)), mode="edge")
    bmax_p = np.pad(bmax, ((0,0),(pad,pad)), mode="edge")
    lo = np.stack([bmin_p[:, i:i+nb] for i in range(2*pad+1)]).min(axis=0)
    hi = np.stack([bmax_p[:, i:i+nb] for i in range(2*pad+1)]).max(axis=0)
    lo_f = np.repeat(lo, 128, axis=1); hi_f = np.repeat(hi, 128, axis=1)
    if lo_f.shape[1] < NR:
        lo_f = np.pad(lo_f, ((0,0),(0,NR-lo_f.shape[1])), mode="edge")
        hi_f = np.pad(hi_f, ((0,0),(0,NR-hi_f.shape[1])), mode="edge")
    contrast = hi_f - lo_f
    mid = (hi_f + lo_f)/2
    sgn = L > mid
    flips = (sgn[:, 1:] != sgn[:, :-1]) & (contrast[:, :-1] > 60) & (P[:, :-1] > 0.5) & (P[:, 1:] > 0.5)
    for j in range(len(th)):
        ii = np.nonzero(flips[j])[0]
        if len(ii) == 0: continue
        L0 = L[j, ii]; L1 = L[j, ii+1]; m = mid[j, ii]
        frac = np.clip((m-L0)/np.where(np.abs(L1-L0)<1e-6, 1e-6, L1-L0), 0, 1)
        robs4 = rs[ii] + rstep*frac
        x4 = CX4 + robs4*np.cos(th[j]); y4 = CY4 + robs4*np.sin(th[j])
        x1 = x4/4; y1 = y4/4
        dx = bilin(OX, x1, y1, 1024); dy = bilin(OY, x1, y1, 1024)
        qx = x1 + dx; qy = y1 + dy
        f = np.sqrt((qx[:,None]-BCX)**2 + (qy[:,None]-BCY)**2) - RHO  # (n,10)
        kbest = np.argmin(np.abs(f), axis=1)
        res = f[np.arange(len(kbest)), kbest]
        de = bilin(dist1k, x1, y1, 1024)
        pol = (L1 > L0).astype(int)  # 1 = dark->light with increasing r
        for t in range(len(ii)):
            rows.append((x1[t], y1[t], robs4[t]/4, th[j], int(kbest[t]), res[t], de[t], int(pol[t])))
arr = np.array(rows, dtype=np.float64)
np.save(f"{S}/zebra_transitions.npy", arr)
print("transitions:", len(arr))
de = arr[:, 6]; res = arr[:, 5]
for lbl, m in [("interior d>25", de>25), ("band 15-25", (de>15)&(de<=25)), ("band 8-15", (de>8)&(de<=15)),
               ("band 4-8", (de>4)&(de<=8)), ("band 0-4", de<=4)]:
    if m.sum():
        print(f"{lbl:15s} n {int(m.sum()):5d}  res mean {res[m].mean():+7.3f}  rms {np.sqrt((res[m]**2).mean()):7.3f}  p95|res| {np.percentile(np.abs(res[m]),95):7.3f}")
