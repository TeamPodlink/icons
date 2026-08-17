Calibration/decode machinery from the 2026-07-05 sessions (archived from the
session scratchpad — expect to adjust paths before running):

- every script has a hardcoded `S = <scratchpad>` (or `SCRATCH`) constant
  pointing at a session scratch dir: re-point it at yours, then populate it
  with `python3 ../build_displacement_field.py --scratch <dir>` plus the
  ictool renders of the calibration icons (assemble `.icon` bundles from
  the specs in `icons/`, render 4096 targets `folding-4096.png`,
  `checkerboard-4096.png`, ... and the 1024 fit targets
  `refraction-folding-ictool-1024.png` /
  `refraction-exploration-ictool-1024.png`) and `ring_calib.json`-style
  outputs; small measured by-products are archived in `../../calibration/`
  (`ring_calib14.json`, `checker_calib.json`, `person-mask-1024.png`,
  `person-overlay-alpha*.f32`).
- `fit_profile.py` — forward numpy replica of the Metal pipeline (bbox
  renders, flat/zebra backgrounds, line-position probes, objective). Import
  this from fit scripts. Patched here to compute the exact EDT via
  `_dist.py` (the original loaded a stale `person-dist.npy`).
- `zebra_calibrate.py` / `zebra_decode.py` — ring-boundary calibration and
  per-ray stripe decode for the folding icon.
- `checker_demod.py` — checkerboard demodulation (per-point shift +
  contrast); `checker_test.py` — checkerboard forward scoring.
- `head_decode.py` — head ray decode (written against the WRONG 10-ring
  background model; superseded, kept for the ray-root machinery).

The final fitted law itself needs none of this: it is fully specified by
`calibration/refraction-profile.json` + `tools/build_displacement_field.py`.

Deliverable-tuning additions (2026-07-05):
- `real_person_model.py` — model-generates the REAL icon's person block
  (L2 background through the calibrated field + fitted real overlay alpha);
  its residual vs ground truth is the lighting field. Produced
  `calibration/person-overlay-alpha-realicon.f32` (0.82 head -> 0.54 cap).
- `svg_tune.py` — not archived here: it tuned the standalone-SVG
  recreation deliverable, which stayed with that project.

Body-lighting LUT (2026-07-05):
- `measure_body_lut.py` — measures the body Liquid Glass lighting field
  from a 4096 ictool render of `squircle-exploration.icon` as a
  (normal-angle x depth) LUT -> `calibration/body-light-lut.npy`.
  Run from the repo root; see the script header for the traps
  (canvas-border padding, d<0 fringe bins, additive-with-clamp transfer).

Disk material LUTs (2026-07-05):
- `measure_disk_luts.py` — builds/renders per-disk calibration icons (real
  circle-layer params over gray 0.25 AND 0.75; two backgrounds solve the
  per-pixel AFFINE response out = k*bg + fill + c) and writes
  `calibration/disk-lut-d{1,2}.npy`. Covers spec rims, dark contour, and
  drop shadow in one lookup. Requires the padded 4096 body EDT + body LUT
  (run measure_body_lut.py first, keep bsd4_padded.npy/phi4_padded.npy in
  the scratch dir). Keep the plain fill analytic in the shader — baking it
  into the LUT double-softens the edge AA.

Shadow calibration (2026-07-05):
- shadows-exploration.icon A/B variants (shadows-{off,person,c2,c1}) isolate
  per-layer shadow fields exactly; kernel fits live in the session notes and
  the shader/builder constants (real person: sigma 23, dy +33, alpha 0.1014,
  multiply toward black, OUTSIDE the silhouette only). The under-glass
  behavior is material-dependent (visible at translucency 1.0, absent at
  0.4) — always A/B the REAL icon before transferring compositing semantics.

Analytic body squircle (2026-07-05):
- `fit_body_squircle.py` — fits the corner-curve polynomial (see header for
  the shape truth: canvas-clipped flats + corner graphs) ->
  `calibration/body-corner-poly.npy`; constants embedded in
  MetalPodcastsFull.swift. Re-measure any body material LUT in analytic
  coordinates afterwards (body-light-lut-analytic.npy).
