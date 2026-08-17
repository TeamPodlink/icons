        # Decode the head ball-lens: rays from the head center (512,458).
# Along each ray the source position s(r) (signed, along the ray) starts at 0,
# sweeps down (possibly negative = inversion), then rises to +90 at the rim.
# Each observed stripe transition must sit at a root s where the ray line
# crosses a ring boundary circle. The down-then-up sweep makes assignment
# combinatorial: choose the turning point s*, events = roots in (s*,0] in
# decreasing order, then roots in (s*, +90) in increasing order.
import numpy as np, json
from PIL import Image
S = "/tmp/liquid-glass-calibration"  # scratch dir — re-point, see README.md

img = np.asarray(Image.open(f"{S}/folding-4096.png").convert("L")).astype(np.float32)
calib = json.load(open(f"{S}/ring_calib.json"))
B = []
for nom in sorted(calib, key=float):
    v = calib[nom]
    B.append((v["r"], 512.0-v["dcx"], 474.0-v["dcy"]))

HC = np.array([512.0, 458.0])   # head center, radius 90
RHEAD = 90.0

def bilin(x, y):
    x = np.asarray(x)*4; y = np.asarray(y)*4
    x0 = np.clip(np.floor(x).astype(np.int32), 0, 4094); y0 = np.clip(np.floor(y).astype(np.int32), 0, 4094)
    fx = x-x0; fy = y-y0
    return (img[y0,x0]*(1-fx)*(1-fy) + img[y0,x0+1]*fx*(1-fy) + img[y0+1,x0]*(1-fx)*fy + img[y0+1,x0+1]*fx*fy)

def ring_color_at_s(u, s):
    # color of the point head_c + s*u  (0=dark,255=white)
    p = HC + s*u
    cnt = sum(1 for rho, cx, cy in B if (p[0]-cx)**2 + (p[1]-cy)**2 <= rho*rho)
    return 0.0 if cnt % 2 == 1 else 255.0

def roots_on_ray(u):
    # all s where line head_c + s*u crosses each boundary circle
    out = []
    for k, (rho, cx, cy) in enumerate(B):
        w = np.array([cx, cy]) - HC
        b = w @ u
        c = w @ w - rho*rho
        disc = b*b - c
        if disc > 0:
            for s in (b - np.sqrt(disc), b + np.sqrt(disc)):
                out.append((s, k))
    return sorted(out)

results = []   # theta, r_obs, s_source, k
report_rays = {}
for deg in range(0, 360, 2):
    th = np.deg2rad(deg)
    u = np.array([np.cos(th), np.sin(th)])
    rs = np.arange(0.5, 89.0, 0.25)
    P = HC[None, :] + rs[:, None]*u[None, :]
    L = bilin(P[:, 0], P[:, 1])
    # envelope threshold
    n = len(L); lo = np.zeros(n); hi = np.zeros(n)
    for i in range(n):
        a = max(0, i-40); bb = min(n, i+40)
        lo[i] = L[a:bb].min(); hi[i] = L[a:bb].max()
    mid = (lo+hi)/2; ctr = hi-lo
    sgn = L > mid
    fl = np.nonzero((sgn[1:] != sgn[:-1]) & (ctr[:-1] > 40))[0]
    ev = []
    for i in fl:
        L0, L1 = L[i], L[i+1]
        f = (mid[i]-L0)/(L1-L0) if abs(L1-L0) > 1e-6 else 0.5
        ev.append((rs[i]+0.25*f, int(L1 > L0)))
    if not ev: continue
    roots = roots_on_ray(u)
    neg = [r for r in roots if r[0] <= 0][::-1]     # decreasing from 0
    pos = [r for r in roots if 0 < r[0] < 90]       # increasing
    # try all turning points: down-phase takes first j of neg, up-phase all pos
    best = None
    for j in range(0, len(neg)+1):
        seq = neg[:j] + neg[:j][::-1][1:len(neg[:j])] if False else None
        # down phase: neg[:j]; up phase: re-cross neg[j-1::-1][1:]? After turning at s* in
        # (neg[j][0] if j<len(neg) else -inf, neg[j-1][0]), the up sweep re-crosses
        # neg[j-1], neg[j-2], ..., neg[0] then pos[0], pos[1], ...
        up = neg[:j][::-1] + pos
        seq = neg[:j] + up
        if len(seq) != len(ev): continue
        # check polarity: color after each crossing alternates correctly.
        # start color at s=0
        ok = True
        cur = ring_color_at_s(u, 0.0)
        sarr = []
        # walk: for crossing to root (s,k): color flips
        for (rr, pol), (sv, kk) in zip(ev, seq):
            newc = 255.0 - cur
            want = 1 if newc > cur else 0
            if want != pol: ok = False; break
            cur = newc
            sarr.append((rr, sv, kk))
        if ok:
            best = sarr; break
    if best is not None:
        for rr, sv, kk in best:
            results.append((deg, rr, sv, kk))
        report_rays[deg] = len(best)
res = np.array(results)
np.save(f"{S}/head_map.npy", res)
print(f"decoded {len(report_rays)}/180 rays, {len(res)} samples")
# radial mapping m(r) = r - s aggregated
if len(res):
    import collections
    binr = collections.defaultdict(list)
    for deg, rr, sv, kk in res:
        binr[round(rr/5)*5].append(rr - sv)
    print(" r_obs :  m = r - s (mean +- std, n)")
    for r in sorted(binr):
        v = np.array(binr[r])
        print(f"  {r:5.0f} : {v.mean():+8.1f} +- {v.std():5.1f}  n {len(v)}")
