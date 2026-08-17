        # Forward-render the checkerboard icon with the final law field and score.
# Options probed: white-overlay alpha (person fill is "none" here) and a
# gather blur radius on the through-glass sample.
import numpy as np, json
from PIL import Image
import fit_profile as fp
S = "/tmp/liquid-glass-calibration"  # scratch dir — re-point, see README.md

cal = json.load(open("checker_calib.json"))
PXG, BXG, PYG, BYG = cal["px"], cal["bx"], cal["py"], cal["by"]

def cb_bg(x, y):
    i = np.floor((x-BXG)/PXG).astype(np.int64)
    j = np.floor((y-BYG)/PYG).astype(np.int64)
    return np.where((i+j) % 2 == 1, 255.0, 0.0).astype(np.float32)

TCB = np.asarray(Image.open(f"{S}/refraction-checkerboard-ictool-1024.png").convert("RGBA")).astype(np.float32)
TCBL = TCB[..., :3].mean(axis=2)[fp.Y0:fp.Y1, fp.X0:fp.X1]
VIS_CB = (TCB[..., 3] > 0)[fp.Y0:fp.Y1, fp.X0:fp.X1]
INP = (fp.pm_box > 0.5) & VIS_CB
yy = np.mgrid[fp.Y0:fp.Y1, fp.X0:fp.X1][0]
HEAD = INP & (yy < 555); TORSO = INP & (yy >= 555) & (yy < 880); CAP = INP & (yy >= 880)

h = np.fromfile("hfield_final.f32", dtype=np.float32).reshape(1024, 1024)

def render(alpha_mode, sigma):
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
    col = cb_bg(fp.PX, fp.PY)
    if sigma > 0:
        acc = 0
        J = [(0,0),(-1,0),(1,0),(0,-1),(0,1),(-.7,-.7),(.7,-.7),(-.7,.7),(.7,.7),
             (-.5,0),(.5,0),(0,-.5),(0,.5)]
        for jx, jy in J:
            acc = acc + cb_bg(fp.PX+ox+jx*sigma, fp.PY+oy+jy*sigma)
        disp = acc/len(J)
    else:
        disp = cb_bg(fp.PX+ox, fp.PY+oy)
    if alpha_mode == "fit":
        a = fp.ALPHA_BOX
    else:
        a = float(alpha_mode)
    glass = disp*(1.0-a) + 255.0*a
    return np.where(fp.pm_box > 0, col*(1-fp.pm_box) + glass*fp.pm_box, col)

def score(img, label):
    d = img - TCBL
    print(f"{label:28s} person {np.sqrt(np.mean(d[INP]**2)):6.2f}  head {np.sqrt(np.mean(d[HEAD]**2)):6.2f}  "
          f"torso {np.sqrt(np.mean(d[TORSO]**2)):6.2f}  cap {np.sqrt(np.mean(d[CAP]**2)):6.2f}")
    return img

if __name__ == "__main__":
    score(render(0.0, 0), "alpha 0, no blur")
    score(render("fit", 0), "alpha fit-curve, no blur")
    for s in (2, 4, 6, 9, 12):
        score(render("fit", s), f"alpha fit, blur {s}")
    img = render("fit", 6)
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save("checker-forward.png")
