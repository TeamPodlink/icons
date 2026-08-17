        # Model-generate the REAL icon's person block: sample the L2 background
# (person hidden) through the calibrated displacement field + gather blur,
# fit the real white-overlay alpha per row, and compare against ground truth
# and the current SVG deliverable. The residual after the overlay fit is the
# lighting field (specular etc.) that the SVG bakes by hand.
import numpy as np, json
from PIL import Image
import fit_profile as fp

S = fp.S
h = np.fromfile(f"{S}/hfield_final.f32", dtype=np.float32).reshape(1024, 1024)

L2 = np.asarray(Image.open(f"{S}/Podcasts-L2-ictool-1024.png").convert("RGB")).astype(np.float32)
GT = np.asarray(Image.open(f"{S}/Podcasts-decant-ictool-1024.png").convert("RGBA")).astype(np.float32)
SVG = np.asarray(Image.open(f"{S}/Podcasts-Liquid-svg-1024.png").convert("RGBA")).astype(np.float32)

def bilin_rgb(im, x, y):
    x = np.clip(x, 0, 1023.001); y = np.clip(y, 0, 1023.001)
    x0 = np.clip(np.floor(x).astype(np.int32), 0, 1022); y0 = np.clip(np.floor(y).astype(np.int32), 0, 1022)
    fx = (x-x0)[..., None]; fy = (y-y0)[..., None]
    return (im[y0, x0]*(1-fx)*(1-fy) + im[y0, x0+1]*fx*(1-fy) +
            im[y0+1, x0]*(1-fx)*fy + im[y0+1, x0+1]*fx*fy)

# offsets + gather blur (13 taps), on the person bbox grid
ox, oy = None, None
hc = fp.bilin_box(h, fp.PX, fp.PY)
hx = (fp.bilin_box(h, fp.PX+fp.EPS, fp.PY) - fp.bilin_box(h, fp.PX-fp.EPS, fp.PY))/(2*fp.EPS)
hy = (fp.bilin_box(h, fp.PX, fp.PY+fp.EPS) - fp.bilin_box(h, fp.PX, fp.PY-fp.EPS))/(2*fp.EPS)
nz = 1.0/np.sqrt(hx*hx+hy*hy+1.0); nx, ny = -hx*nz, -hy*nz
cosi = nz
k = np.clip(1.0-fp.ETA**2*(1.0-cosi*cosi), 0, None)
coef = fp.ETA*cosi - np.sqrt(k)
tzz = -fp.ETA + coef*nz
ox = coef*nx/np.maximum(np.abs(tzz), 1e-3)*hc
oy = coef*ny/np.maximum(np.abs(tzz), 1e-3)*hc
sig = 0.8 + 0.04*np.sqrt(ox*ox+oy*oy)
TAPS = [(0,0),(-1,0),(1,0),(0,-1),(0,1),(-.7,-.7),(.7,-.7),(-.7,.7),(.7,.7),(-.5,0),(.5,0),(0,-.5),(0,.5)]
acc = 0
for jx, jy in TAPS:
    acc = acc + bilin_rgb(L2, fp.PX+ox+jx*sig, fp.PY+oy+jy*sig)
disp = acc/len(TAPS)   # (H,W,3) displaced background

GT_BOX = GT[fp.Y0:fp.Y1, fp.X0:fp.X1, :3]
SVG_BOX = SVG[fp.Y0:fp.Y1, fp.X0:fp.X1, :3]
dist_box = fp.dist[fp.Y0:fp.Y1, fp.X0:fp.X1]

# fit per-row overlay alpha (white overlay) on interior columns, robust median over RGB
alpha_real = np.zeros(1024, np.float32)
for y in range(fp.Y0, fp.Y1):
    r = y - fp.Y0
    m = dist_box[r] > 12
    if m.sum() < 20: continue
    t = GT_BOX[r][m]; dd = disp[r][m]
    denom = 255.0 - dd
    # per-pixel scalar alpha, channels weighted by headroom^2 (a channel near
    # saturation carries no information but must not veto the row)
    w = np.maximum(denom, 1.0)**2
    a_pix = np.clip((w*(t-dd)/np.maximum(denom, 1.0)).sum(axis=1)/w.sum(axis=1), 0, 1)
    alpha_real[y] = np.median(a_pix)
# smooth
ker = np.ones(7)/7
sm = alpha_real.copy()
sm[fp.Y0+3:fp.Y1-3] = np.convolve(alpha_real[fp.Y0:fp.Y1], ker, mode="valid")
sm.astype(np.float32).tofile(f"{S}/alpha_real.f32")
AL = sm[np.clip(fp.PY.astype(np.int32), 0, 1023)][..., None]

C = disp*(1.0-AL) + 255.0*AL     # model person block (refraction+overlay, no lighting)

pmask3 = fp.inperson
d_model = (C - GT_BOX)
d_svg = (SVG_BOX - GT_BOX)
def rm(d, m): return float(np.sqrt(np.mean(d[m]**2)))
yy = np.mgrid[fp.Y0:fp.Y1, fp.X0:fp.X1][0]
HEAD = pmask3 & (yy < 555); TORSO = pmask3 & (yy >= 555) & (yy < 880); CAP = pmask3 & (yy >= 880)
print("person-region RGB RMSE vs decant ground truth:")
print(f"  model (refr+overlay, NO lighting): {rm(d_model, pmask3):.2f}  head {rm(d_model, HEAD):.2f} torso {rm(d_model, TORSO):.2f} cap {rm(d_model, CAP):.2f}")
print(f"  current SVG (with baked lighting): {rm(d_svg, pmask3):.2f}  head {rm(d_svg, HEAD):.2f} torso {rm(d_svg, TORSO):.2f} cap {rm(d_svg, CAP):.2f}")
print("alpha_real samples:", [(y, round(float(sm[y]),3)) for y in (400, 500, 600, 700, 800, 900)])

# lighting residual map (what specular adds) and comparison images
resid = GT_BOX.mean(axis=2) - C.mean(axis=2)
np.save(f"{S}/lighting_residual.npy", resid)
vis = np.clip(np.abs(resid)*2, 0, 255).astype(np.uint8)
combo = np.concatenate([np.clip(GT_BOX,0,255).astype(np.uint8),
                        np.clip(C,0,255).astype(np.uint8),
                        np.clip(SVG_BOX,0,255).astype(np.uint8),
                        np.dstack([vis]*3)], axis=1)
Image.fromarray(combo).save(f"{S}/real-person-model-sbs.png")
print("saved real-person-model-sbs.png (GT | model | SVG | lighting residual x2)")
