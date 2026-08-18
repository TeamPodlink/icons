#!/usr/bin/env python3
# Build the SHARED per-contour glass edge-lighting LUT — the committed
# calibration artifact behind zero-measurement glass translation
# (calibration/glass-edge-lut.json, consumed by translate_icon.py).
#
# The model is probe-layer-lightmap.py's measured verdict (ledger:
# "per-layer glass lighting", conditional GO): the residual lighting of a
# glass icon (GT minus the engine's material-only render) is an ADDITIVE
# field of per-contour edge kernels K(signed distance x normal angle x
# thickness class), SHARED across contours, layers, and bundles, once the
# material y-ramp is removed (the ramp is carried by the translated
# recipes' family alpha curves, not by this LUT). K is fit by shared-bin
# least squares over the ramp-removed residual fields of a measured
# corpus: the authored instrument bundles (disk/rings/bars/wedge x
# artwork grays) plus the catalog glass bundles.
#
# Corpus data comes from a probe-layer-lightmap.py `gen` workdir
# ($PROBE_WORK) — ictool ground truths, pass-1 measured recipes, residual
# fields. Regenerating it needs macOS + Icon Composer + node (see the
# probe's header); the committed artifact makes the translator
# independent of that workdir.
#
#   $PYTHON packages/engine/tools/build_glass_lut.py            # full fit -> calibration/
#   $PYTHON ... --exclude overcast --out /tmp/lut.json          # leave-target-out (validation)
import argparse
import importlib.util
import json
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    "probelm", os.path.join(HERE, "probe-layer-lightmap.py"))
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)

ap = argparse.ArgumentParser()
ap.add_argument("--work", default=os.environ.get("PROBE_WORK", "/tmp/probe-layer-lightmap"))
ap.add_argument("--sources", nargs="*", default=list(P.REAL) + P.INSTRUMENTS)
ap.add_argument("--exclude", nargs="*", default=[])
ap.add_argument("--anchor", default="bounds", choices=["bounds", "canvas"],
                help="ramp-removal anchor (bounds is the measured law; see probe-ramp-anchor)")
ap.add_argument("--out", default=os.path.join(HERE, "..", "calibration", "glass-edge-lut.json"))
a = ap.parse_args()

sources = [s for s in a.sources if s not in a.exclude]
model = "contourT"

data = {}
for slug in sources:
    print(f"fields: {slug}", flush=True)
    data[slug] = P.bundle_fields(a.work, slug)

nb = P.nbins(model)
ATA = np.zeros((nb, nb))
ATb = np.zeros(nb)
cnt = np.zeros(nb)
for slug in sources:
    Yo, Lo, _ = data[slug]
    Yr = P.ramp_removed(data, slug, model=model, anchor=a.anchor)[1]
    P.accumulate(ATA, ATb, cnt, P.contributions(Lo, model), Yr)
K = P.solve(ATA, ATb)

# white-restore blend for the predicted lightmap: mean of the adopted
# recipes' fitted b (the zero-measurement choice validated by the probe's
# endtoend runs)
bs = []
recdir = os.path.join(P.ENGDIR, "recipes")
for f in sorted(os.listdir(recdir)):
    src = open(os.path.join(recdir, f)).read()
    rec = json.loads(re.search(r"export const recipe = (\{.*\});", src, re.S).group(1))
    if rec.get("lm"):
        bs.append(rec["lm"].get("b", 1.0))
bmean = float(np.mean(bs)) if bs else 1.0

out = {
    "model": model,
    "grid": P.GRID,
    "db": [float(v) for v in P.DB],
    "nphi": P.NPHI,
    "tclass": [float(v) for v in P.TCLASS],
    "anchor": a.anchor,
    "b": round(bmean, 3),
    "sources": sources,
    "k": [round(float(v), 3) for v in K],
    "counts": [int(v) for v in cnt],
    "note": ("Shared per-contour glass edge-lighting LUT, fit by "
             "build_glass_lut.py on ramp-removed residual fields from a "
             "probe-layer-lightmap.py workdir. K is luma (0..255 units) "
             "added per contour, indexed (thicknessClass, signedDistBin, "
             "normalAngleBin) flattened as (ti*nd + di)*nphi + pi."),
}
os.makedirs(os.path.dirname(a.out), exist_ok=True)
json.dump(out, open(a.out, "w"))
print(f"wrote {a.out}: {os.path.getsize(a.out)} bytes, {nb} bins, "
      f"{int((cnt > 0).sum())} sampled, b={bmean:.3f}, sources={len(sources)}")
