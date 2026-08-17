# Calibration data provenance

The files in `calibration/` are measured constants, produced by
instrumenting Apple's Liquid Glass renderer (ictool / Icon Composer) with
purpose-built calibration icons (2026-07 research sessions). The engine
consumes three of them (`body-corner-poly.npy`,
`body-light-lut-analytic.npy`, `refraction-profile.json`); they are
universal to Liquid Glass icons — nothing here is specific to any one
app's artwork.

The measurement machinery is archived in-repo: `tools/calibration/`
holds the fit/measure/decode scripts and, in `tools/calibration/icons/`,
the `icon.json` specs of every calibration instrument (the instrument
`.icon` bundles and their ictool renders regenerate from those specs —
see `tools/calibration/README.md` for the workflow and its caveats).
The refraction law's canonical field implementation is
`tools/build_displacement_field.py`. Small measured by-products the
scripts consume (`ring_calib14.json`, `checker_calib.json`,
`checker45_calib.json`, `person-mask-1024.png`,
`person-overlay-alpha*.f32`) are archived alongside the engine's
constants in `calibration/`. Large intermediate arrays (padded body
EDTs, raw body-light LUT, per-disk LUTs) are not stored — they
regenerate from the scripts plus ictool renders.

## `body-corner-poly.npy`

The macOS icon body is the full 1024 canvas rect intersected with four
corner curves; the flats are canvas-clipped (no boundary of their own).
Each corner is an even 7-term polynomial in the 45°-rotated frame
(`SMAX = 216.017655` plus coefficients), fitted against a 4096-px render to
a boundary rms of **0.035 px**. The engine evaluates a signed distance via
3 Newton foot-point iterations.

## `body-light-lut-analytic.npy`

The body's Liquid Glass edge lighting, measured on a *bare gray body*
(an icon with no layers) as a (outward-normal-angle × signed-depth) lookup
table: 180 angle bins × 208 depth bins, depth −4..48 px at 0.25 px steps.
Key measured facts:

- the field is fully parameterized by (normal angle, body distance) — for a
  squircle, normal angle doubles as arc position, so corner behavior is
  captured with no special-case "corner glow" elements;
- it is **neutral** (max chroma deviation ~1/255) and plain **additive
  with clamp** over any fill;
- depth bins < 0.125 px were measured on the premultiplied transparent
  fringe and are bogus — samplers must clamp to d ≥ 0.125 (the engine does).

It must be sampled in analytic-SDF coordinates; approximate distance
transforms bias the angle-dependent lookup visibly.

## `refraction-profile.json`

The glass refraction law: a height field over interior distance `d`,

```
h = A0 · (1 − (1 − min(d/R0, 1))²)^pw ,   box-blurred (radius 3) × 2
A0 = 159.3, R0 = 26.1, pw = 0.14
```

with Snell bending at IOR 1.5 and a deflection-proportional gather blur
(σ = 0.8 + 0.04·|offset|, 13 taps). Calibrated against four independent
instrument backgrounds (flat, zebra rings, checkerboard, 45° checkerboard
as a hold-out); interior rigidity verified to ≤ 0.1 px. The law transfers
across glass materials and silhouettes without refitting — material
differences are absorbed by each recipe's baked lightmap; only geometry
cannot be.

## Everything else is measured per icon, at build time

Fill colors, canvas background gradients, glass material responses
(`k·bg + c`, via the automated two-gray instrument), and residual lighting
fields are all measured from ictool renders of the specific bundle being
converted — see SKILL.md. No per-icon constants live in this repository.
