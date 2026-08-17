#!/usr/bin/env python3
# RMSE score a render against its ictool ground truth (visible pixels only).
#   python3 tools/score.py <render.png> <gt.png> [--side out.png]
import sys
import numpy as np
from PIL import Image

render, gt = sys.argv[1], sys.argv[2]
GT = np.asarray(Image.open(gt).convert("RGBA")).astype(np.float64)
R = np.asarray(Image.open(render).convert("RGBA")).astype(np.float64)
assert GT.shape == R.shape, f"size mismatch {R.shape} vs {GT.shape}"
vis = GT[..., 3] > 0
d = R[..., :3] - GT[..., :3]
rmse = float(np.sqrt(np.mean(d[vis] ** 2)))
print(f"visible RGB RMSE: {rmse:.2f}")
if "--side" in sys.argv:
    out = sys.argv[sys.argv.index("--side") + 1]
    trip = np.concatenate([GT[..., :3], R[..., :3], np.clip(np.abs(d) * 4, 0, 255)], axis=1)
    Image.fromarray(trip.astype(np.uint8)).save(out)
    print(f"wrote {out} (GT | render | diff x4)")
