#!/usr/bin/env python3
# Instrument: colored-input `automatic-gradient` canvases (the gray
# ladder in probe-autogradient.mjs is exact for grays only). Renders 12
# colored canvases and extracts the derived top/bottom stops in
# P3-coded space by per-channel linear extrapolation of the center
# column.
#
# Measured verdict 2026-08-17 (see the ledger): the BOTTOM stop equals
# the solid soft-knee conversion of the input (spotify-green gains
# +45/255 red on both stops — the p3 solid law, not a gradient effect);
# the top lift rides the dominant channels; but the lift's total span
# depends on saturation AND interacts with the gray ladder's sawtooth
# (gray 0.25 -> 8.9/255 vs saturated colors at the same lightness ->
# 24-28/255; the best 2-parameter model fits at only ~5/255 rms).
# Recorded as a bounded limitation — tunein (3.98) is its only
# in-scope bundle.
#
#   $PYTHON probe-autogradient-colored.py
import json, os, shutil, subprocess
import numpy as np
from PIL import Image

WORK="/tmp/ag-colored"
ICTOOL="/Applications/Icon Composer.app/Contents/Executables/ictool"
os.makedirs(WORK,exist_ok=True)
BLANK='<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#000" fill-opacity="0"/></svg>'
COLORS=[(0.11,0.125,0.235),(0.11,0.725,0.329),(0.8,0.2,0.2),(0.2,0.3,0.8),
        (0.5,0.25,0.1),(0.1,0.4,0.4),(0.6,0.6,0.1),(0.3,0.1,0.5),
        (0.05,0.05,0.4),(0.4,0.05,0.05),(0.25,0.25,0.25),(0.7,0.4,0.6)]
for c in COLORS:
    name="ag-"+"-".join(str(v).replace(".","") for v in c)
    png=os.path.join(WORK,name+".png")
    if not os.path.exists(png):
        d=os.path.join(WORK,"probe.icon")
        shutil.rmtree(d,ignore_errors=True); os.makedirs(os.path.join(d,"Assets"))
        open(os.path.join(d,"Assets","blank.svg"),"w").write(BLANK)
        json.dump({"fill":{"automatic-gradient":"display-p3:%.5f,%.5f,%.5f,1.00000"%c},
                   "groups":[{"layers":[{"name":"blank","image-name":"blank.svg","glass":False}]}],
                   "supported-platforms":{"squares":"shared"}},open(os.path.join(d,"icon.json"),"w"))
        subprocess.run([ICTOOL,d,"--export-image","--output-file",png,"--platform","macOS",
                        "--rendition","Default","--width","1024","--height","1024","--scale","1"],
                       check=True,capture_output=True)
    im=np.asarray(Image.open(png).convert("RGB")).astype(float)
    col=np.median(im[:,384:640,:],axis=1)
    # extrapolate rows 40..984 to y=0 and y=1024 (linear fit per channel)
    ys=np.arange(40,984); A=np.stack([np.ones(len(ys)),(ys+0.5)/1024],1)
    coef,_,_,_=np.linalg.lstsq(A,col[40:984],rcond=None)
    top=coef[0]; bot=coef[0]+coef[1]
    base=np.array(c)*255
    print(f"p3{c}: base {np.round(base,1)} top {np.round(top,1)} bot {np.round(bot,1)} "
          f"dTop {np.round(top-base,1)} dBot {np.round(bot-base,1)}")
