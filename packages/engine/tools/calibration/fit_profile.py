        # Fit the glass height-field profile h = f(dist) (monotone spline knots) against:
#   - zebra folding icon person RMSE (geometry-rich b/w target)
#   - flat exploration icon person RMSE (tone guardrail)
#   - line-position probes on the flat render (waterline, hooks, bubble)
import numpy as np, json, time
from PIL import Image
S = "/tmp/liquid-glass-calibration"  # scratch dir — re-point, see README.md

# ---------- static data ----------
calib = json.load(open(f"{S}/ring_calib14.json"))
RHO, BCX, BCY = [], [], []
for nom in sorted(calib, key=float):
    v = calib[nom]
    RHO.append(v["r"]); BCX.append(v["cx"]); BCY.append(v["cy"])
RHO = np.array(RHO); BCX = np.array(BCX); BCY = np.array(BCY)

mask = np.asarray(Image.open(f"{S}/person-mask.png").convert("L")).astype(np.float32)/255.0
alpha = np.fromfile(f"{S}/alpha.f32", dtype=np.float32)
from _dist import person_dist
dist, _maskA_exact = person_dist()  # exact EDT; never use person-dist.npy

tz = np.asarray(Image.open(f"{S}/refraction-folding-ictool-1024.png").convert("RGBA")).astype(np.float32)
tf = np.asarray(Image.open(f"{S}/refraction-exploration-ictool-1024.png").convert("RGBA")).astype(np.float32)
TZ = tz[..., :3].mean(axis=2); TF = tf[..., :3].mean(axis=2)
VIS = (tz[..., 3] > 0) & (tf[..., 3] > 0)

X0, X1, Y0, Y1 = 390, 634, 350, 942   # person bbox
pm_box = mask[Y0:Y1, X0:X1]
vis_box = VIS[Y0:Y1, X0:X1]
inperson = (pm_box > 0.5) & vis_box
yy, xx = np.mgrid[Y0:Y1, X0:X1].astype(np.float32)
PX = xx + 0.5; PY = yy + 0.5
ALPHA_BOX = alpha[np.clip(PY.astype(np.int32), 0, 1023)]
HEAD = inperson & (yy < 555); TORSO = inperson & (yy >= 555) & (yy < 880); CAP = inperson & (yy >= 880)

def zebra_bg(x, y):
    # 14 alternating disks (innermost black core); count containing disks:
    # 1 disk = outermost white ring; 0 disks = gray body.
    cnt = np.zeros(x.shape, np.int32)
    for k in range(len(RHO)):
        cnt += ((x-BCX[k])**2 + (y-BCY[k])**2 <= RHO[k]**2)
    col = np.where(cnt % 2 == 1, 255.0, 0.0)
    col = np.where(cnt == 0, 128.6, col)
    return col.astype(np.float32)

def flat_bg(x, y):
    v = np.full(x.shape, 128.6, np.float32)
    v[(x-512.0)**2 + (y-474.0)**2 <= 372.0**2] = 172.0
    v[(x-512.0)**2 + (y-466.0)**2 <= 232.0**2] = 218.0
    return v

ETA = 1/1.5; EPS = 0.75

def boxblur(a, r):
    for ax in (0, 1):
        c = np.cumsum(np.pad(a, [(r+1, r) if k == ax else (0, 0) for k in (0, 1)], mode="edge"), axis=ax)
        a = (c[2*r+1:, :]-c[:-2*r-1, :])/(2*r+1) if ax == 0 else (c[:, 2*r+1:]-c[:, :-2*r-1])/(2*r+1)
    return a

def build_h(knots_d, knots_v):
    h = np.interp(dist, knots_d, knots_v).astype(np.float32)
    h = boxblur(boxblur(h, 2), 2).astype(np.float32)
    h *= (dist > 0)
    return h

# per-blob machinery: head blob (y<560) vs torso blob
YY_FULL = np.mgrid[0:1024, 0:1024][0]
HEADBLOB = (dist > 0) & (YY_FULL < 560)
TORSOBLOB = (dist > 0) & (YY_FULL >= 560)

def build_h2(kd_t, kv_t, kd_h, kv_h):
    ht = np.interp(dist, kd_t, kv_t)
    hh = np.interp(dist, kd_h, kv_h)
    h = np.where(HEADBLOB, hh, np.where(TORSOBLOB, ht, 0.0)).astype(np.float32)
    h = boxblur(boxblur(h, 2), 2).astype(np.float32)
    h *= (dist > 0)
    return h

LMAP_BOX_HEAD = (PY < 560)  # in box coords: head rows

def bilin_box(im, x, y):
    x = np.clip(x, 0, 1023.001); y = np.clip(y, 0, 1023.001)
    x0 = np.clip(np.floor(x).astype(np.int32), 0, 1022); y0 = np.clip(np.floor(y).astype(np.int32), 0, 1022)
    fx = x-x0; fy = y-y0
    return (im[y0, x0]*(1-fx)*(1-fy) + im[y0, x0+1]*fx*(1-fy) + im[y0+1, x0]*(1-fx)*fy + im[y0+1, x0+1]*fx*fy)

def offsets(h, L_head=0.0, L_torso=0.0):
    hc = bilin_box(h, PX, PY)
    hx = (bilin_box(h, PX+EPS, PY) - bilin_box(h, PX-EPS, PY))/(2*EPS)
    hy = (bilin_box(h, PX, PY+EPS) - bilin_box(h, PX, PY-EPS))/(2*EPS)
    nz = 1.0/np.sqrt(hx*hx+hy*hy+1.0); nx, ny = -hx*nz, -hy*nz
    cosi = nz
    k = np.clip(1.0-ETA*ETA*(1.0-cosi*cosi), 0, None)
    coef = ETA*cosi - np.sqrt(k)
    tzz = -ETA + coef*nz
    # the refracted ray traverses the glass (hc) plus an extra gap L to the
    # background; L is what lets a small blob behave as a strong (inverting) lens
    reach = hc + np.where(LMAP_BOX_HEAD, L_head, L_torso)*(hc > 0.5)
    ox = coef*nx/np.maximum(np.abs(tzz), 1e-3)*reach
    oy = coef*ny/np.maximum(np.abs(tzz), 1e-3)*reach
    return ox, oy

def render_box(h, bgfun, L_head=0.0, L_torso=0.0):
    ox, oy = offsets(h, L_head, L_torso)
    col = bgfun(PX, PY)
    disp = bgfun(PX+ox, PY+oy)
    glass = disp*(1.0-ALPHA_BOX) + 255.0*ALPHA_BOX
    return np.where(pm_box > 0, col*(1-pm_box) + glass*pm_box, col)

# ---------- line-position probes on the flat render ----------
def line_pos(img_box, x, y_lo, y_hi, global_coords=True):
    # subpixel position of max |d/dy| within window, on column x (1024 coords)
    c = img_box[:, int(x)-X0]
    ys = np.arange(Y0, Y1)
    w = (ys >= y_lo) & (ys < y_hi)
    g = np.abs(np.diff(c))
    wg = w[:-1]
    gw = g[wg]
    if gw.max() < 1.0: return None
    i = np.argmax(gw); base = ys[:-1][wg][i]
    # parabola on g
    ii = np.nonzero(w[:-1])[0][i]
    if 0 < ii < len(g)-1:
        a, b, cc = g[ii-1], g[ii], g[ii+1]
        d = (a - cc)/(2*(a - 2*b + cc)) if (a-2*b+cc) != 0 else 0.0
    else: d = 0.0
    return base + 0.5 + d

PROBES = [  # (x, ylo, yhi) on the flat icon
    (512, 688, 708),   # waterline center
    (460, 688, 712),   # waterline mid-left
    (437, 685, 712),   # hook left
    (588, 685, 712),   # hook right
    (512, 838, 856),   # bubble top
    (512, 903, 918),   # bubble bottom
]
TF_BOX = TF[Y0:Y1, X0:X1]
probe_targets = [line_pos(TF_BOX, *p) for p in PROBES]
print("probe targets (flat ictool):", [f"{v:.2f}" if v else "?" for v in probe_targets])

def evaluate(h, detail=False, L_head=0.0, L_torso=0.0):
    zb = render_box(h, zebra_bg, L_head, L_torso)
    fl = render_box(h, flat_bg, L_head, L_torso)
    dz = zb - TZ[Y0:Y1, X0:X1]; df = fl - TF[Y0:Y1, X0:X1]
    z_rmse = np.sqrt(np.mean(dz[inperson]**2))
    f_rmse = np.sqrt(np.mean(df[inperson]**2))
    perr = []
    for p, t in zip(PROBES, probe_targets):
        if t is None: continue
        v = line_pos(fl, *p)
        perr.append(abs(v - t) if v is not None else 8.0)
    pmean = np.mean(perr)
    h_rmse = np.sqrt(np.mean(dz[HEAD]**2))
    obj = z_rmse/4.0 + h_rmse/6.0 + f_rmse + 2.0*pmean
    if detail:
        zz = dict(zebra=z_rmse, flat=f_rmse, probes=[round(e,2) for e in perr],
                  head=np.sqrt(np.mean(dz[HEAD]**2)), torso=np.sqrt(np.mean(dz[TORSO]**2)),
                  cap=np.sqrt(np.mean(dz[CAP]**2)),
                  fhead=np.sqrt(np.mean(df[HEAD]**2)), ftorso=np.sqrt(np.mean(df[TORSO]**2)),
                  fcap=np.sqrt(np.mean(df[CAP]**2)))
        return obj, zz
    return obj

if __name__ == "__main__":
    # init knots from radial profile of the validated law field
    h0 = np.fromfile(f"{S}/hfield_law.f32", dtype=np.float32).reshape(1024, 1024)
    KD = np.array([0., 1.5, 3, 5, 8, 12, 17, 23, 30, 40, 52, 66, 80, 96])
    kv = []
    for d in KD:
        m = (np.abs(dist - d) < 1.0) & (dist > 0)
        kv.append(float(h0[m].mean()) if m.sum() else (kv[-1] if kv else 0.0))
    kv = np.array(kv); kv[0] = 0.0
    h = build_h(KD, kv)
    obj, det = evaluate(h, detail=True)
    print("init knots:", np.round(kv, 1).tolist())
    print(f"init obj {obj:.3f}", det)

    best = kv.copy(); bobj = obj
    t0 = time.time()
    for sweep in range(6):
        step = [24, 16, 10, 6, 4, 2.5][sweep]
        for i in range(1, len(KD)):
            for sgn in (+1, -1):
                cand = best.copy(); cand[i] = max(0.0, cand[i] + sgn*step)
                cand = np.maximum.accumulate(cand)  # enforce monotone
                o = evaluate(build_h(KD, cand))
                if o < bobj - 1e-4:
                    bobj = o; best = cand
        obj, det = evaluate(build_h(KD, best), detail=True)
        print(f"sweep {sweep} (step {step}) obj {bobj:.3f}  [{time.time()-t0:.0f}s]", det)
        print("  knots:", np.round(best, 1).tolist())
    np.save(f"{S}/fit_knots.npy", np.stack([KD, best]))
    hbest = build_h(KD, best)
    hbest.astype(np.float32).tofile(f"{S}/hfield_fit.f32")
    print("saved fit_knots.npy / hfield_fit.f32")
