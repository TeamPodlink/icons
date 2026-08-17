        # Demodulate the checkerboard through-glass image: at each interior point,
# find the local pattern shift (dx,dy) and contrast by correlating against the
# analytic parity pattern over a Gaussian window. Gives the full 2D warp field
# plus a blur/contrast map — the measurement the zebra rings couldn't make.
import numpy as np, json, sys
from PIL import Image
import fit_profile as fp
S = "/tmp/liquid-glass-calibration"  # scratch dir — re-point, see README.md

cal = json.load(open("checker_calib.json"))
PXG, BXG, PYG, BYG = cal["px"], cal["bx"], cal["py"], cal["by"]

def parity(x, y):
    i = np.floor((x-BXG)/PXG).astype(np.int64)
    j = np.floor((y-BYG)/PYG).astype(np.int64)
    return np.where((i+j) % 2 == 1, 1.0, -1.0).astype(np.float32)

def demod(imgL, step=4, shifts=np.arange(-8, 8.01, 1.0), win=10):
    # imgL: 1024 luminance. Returns maps on a step-grid inside the person bbox.
    Y0, Y1, X0, X1 = fp.Y0, fp.Y1, fp.X0, fp.X1
    yy, xx = np.mgrid[Y0:Y1, X0:X1].astype(np.float32)
    I = imgL[Y0:Y1, X0:X1].astype(np.float32)
    Izm = I - fp.boxblur(I.copy(), 8)   # remove local mean (kills alpha offset)
    best_c = np.full(I.shape, -1e9, np.float32)
    best_dx = np.zeros(I.shape, np.float32)
    best_dy = np.zeros(I.shape, np.float32)
    corr = {}
    for dx in shifts:
        for dy in shifts:
            P = parity(xx+0.5-dx, yy+0.5-dy)
            Pzm = P - fp.boxblur(P.copy(), 8)
            c = fp.boxblur((Izm*Pzm).astype(np.float32), win)
            corr[(dx, dy)] = c
            m = c > best_c
            best_c = np.where(m, c, best_c)
            best_dx = np.where(m, dx, best_dx)
            best_dy = np.where(m, dy, best_dy)
    # normalization: contrast = corr / boxblur(Pzm^2) ~ half-amplitude
    Pn = parity(xx+0.5, yy+0.5)
    Pzm = Pn - fp.boxblur(Pn.copy(), 8)
    norm = fp.boxblur((Pzm*Pzm).astype(np.float32), win)
    contrast = best_c/np.maximum(norm, 1e-3)
    return best_dx, best_dy, contrast

if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "target"
    if which == "target":
        img = np.asarray(Image.open(f"{S}/refraction-checkerboard-ictool-1024.png").convert("L")).astype(np.float32)
    else:
        img = np.asarray(Image.open(which).convert("L")).astype(np.float32)
    dx, dy, con = demod(img)
    np.savez(f"demod_{'target' if which=='target' else 'render'}.npz", dx=dx, dy=dy, con=con)
    # report on a coarse grid of interior points
    dist_box = fp.dist[fp.Y0:fp.Y1, fp.X0:fp.X1]
    print("interior (dist>25) shift stats:")
    m = (dist_box > 25) & fp.inperson
    print(f"  dx mean {dx[m].mean():+.2f} rms {np.sqrt((dx[m]**2).mean()):.2f}   dy mean {dy[m].mean():+.2f} rms {np.sqrt((dy[m]**2).mean()):.2f}")
    print("sample rows (x=475..545 step 14, contrast/dx/dy):")
    for y in (410, 458, 500, 620, 700, 780, 860, 900):
        row = []
        for x in (475, 496, 512, 528, 549):
            r, c = y-fp.Y0, x-fp.X0
            row.append(f"({dx[r,c]:+.0f},{dy[r,c]:+.0f},{con[r,c]:.2f})")
        print(f"  y {y}: " + " ".join(row))
