# Exact EDT inside the person silhouette, from the repo's calibration mask.
# Always use this, never a cached person-dist.npy (old scratchpads hold a
# stale octagonal integer EDT that is +-1px off at the silhouette, which is
# fatal at profile pow 0.14).
import numpy as np
from PIL import Image
import os
_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def person_dist():
    maskA = np.asarray(Image.open(os.path.join(_REPO, "calibration/person-mask-1024.png")).convert("L")).astype(np.float32)/255.0
    inside = maskA > 0.5
    INF = 1e6; S2 = 2**0.5
    idx = np.arange(1024, dtype=np.float64)
    d0 = np.where(inside, INF, 0.0).astype(np.float64)
    b = inside & ((~inside[np.r_[0, 0:1023], :]) | (~inside[np.r_[1:1024, 1023], :]) |
                  (~inside[:, np.r_[0, 0:1023]]) | (~inside[:, np.r_[1:1024, 1023]]))
    d0[b] = np.clip(maskA[b]-0.5, 0.01, 1.0)
    def _scan(d, top_down):
        rng = range(1, 1024) if top_down else range(1022, -1, -1)
        step = -1 if top_down else 1
        for i in rng:
            prev = d[i+step]
            cand = np.minimum(d[i], prev+1.0)
            cand[1:] = np.minimum(cand[1:], prev[:-1]+S2)
            cand[:-1] = np.minimum(cand[:-1], prev[1:]+S2)
            a = np.minimum.accumulate(cand-idx)+idx
            bb = (np.minimum.accumulate((cand+idx)[::-1]))[::-1]-idx
            d[i] = np.minimum(a, np.minimum(bb, cand))
        return d
    d0 = _scan(d0, True); d0 = _scan(d0, False); d0 = _scan(d0, True)
    return d0.astype(np.float32), maskA
