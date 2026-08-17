---
name: glass-to-lut
description: Convert a macOS Liquid Glass .icon bundle into a portable, procedural "recipe" (engine + LUT/lightmap data) that renders the icon in any JS environment, with RMSE calibration against ictool ground truth. Use when asked to convert, decompile, or recreate a Liquid Glass app icon as web-renderable code, or to add a platform to a recipe-based icon library.
---

# glass-to-LUT: .icon → calibrated procedural recipe

Turn an Icon Composer `.icon` bundle into a **recipe**: a small data module
that a shared, platform-independent JS engine renders procedurally — no
canvas, no rasters, no image decoding — with fidelity measured as RGB RMSE
against Apple's own renderer.

**In this monorepo** the tooling lives in `packages/engine/` (tools/,
calibration/, PROVENANCE.md). The batch harness over all-SVG bundles is
`pipeline/build-recipes.mjs` (measure + report, then `--adopt <maxRmse>`
to copy winners into `packages/engine/recipes` and update meta.json);
use the single-icon commands below for one-off or debugging work. All
commands are CWD-independent (calibration paths resolve relative to the
tools). Regenerating `engine.mjs` is byte-stable: the web-bundler patches
are baked into `build_engine.py`, so `tools/build_engine.py --outdir` on
an unchanged tree reproduces the committed `packages/engine/engine.mjs`
exactly.

The output pair is:

- `engine.mjs` — built once, shared by all icons. Owns everything universal
  to Liquid Glass: the squircle body SDF (analytic corner polynomial), the
  measured body-light material LUT, the calibrated Snell refraction law with
  its gather blur, additive shadows, winding-aware path rasterization, exact
  EDT, IGN output dithering, PNG encoding. Runs in Node ≥ 18, browsers, and
  edge runtimes (`node:zlib` / `DecompressionStream`).
- `recipes/<id>.mjs` — per-icon data: background layer stack, glass layers
  (silhouette paths, materials), and a baked residual lighting field
  ("lightmap") that closes the gap between the model and ground truth.

**Everything structural comes from `icon.json`; everything perceptual is
MEASURED from ictool renders.** That principle — never trust declared
colors, materials, or lighting when you can measure the renderer's actual
output — is what makes the results land at RMSE 2–7 instead of 20–50.

## Prerequisites

- macOS with **Icon Composer** installed (`/Applications/Icon Composer.app`);
  the pipeline drives its CLI renderer:
  `/Applications/Icon Composer.app/Contents/Executables/ictool`
- Node ≥ 18, Python 3 with `numpy` and `Pillow`
- A `.icon` bundle. Either authored in Icon Composer, or decompiled from an
  app's compiled asset catalog with [decant](https://github.com/kylebshr/decant)
  (look for `IconImageStack` entries via `assetutil -I Assets.car`; flat
  `Icon Image` entries have no layer stack and cannot be decanted).

## Step 0 — Render ground truth

Every measurement and score in this pipeline is against ictool's own render
of the bundle. Generate it first:

```sh
"/Applications/Icon Composer.app/Contents/Executables/ictool" MyIcon.icon \
  --export-image --output-file gt.png --platform macOS \
  --rendition Default --width 1024 --height 1024 --scale 1
```

If ictool errors with "The data couldn't be read because it is missing",
the `icon.json` has an invalid key. Known traps: "no shadow" is expressed
by OMITTING the `shadow` key (`{"kind": "none"}` is rejected);
appearance-specialized values use the shape
`[{"value": v}, {"appearance": "dark", "value": v2}]`.

## Step 1 — Build the engine (once)

```sh
python3 packages/engine/tools/build_engine.py --outdir out
```

This embeds the universal calibration data from `packages/engine/calibration/`:
the body corner polynomial (boundary rms 0.035 px vs 4096 renders), the
body-light LUT (normal-angle × depth, measured on a bare gray body), and
the refraction law (`A0=159.3, R0=26.1, pow 0.14, boxblur r3×2` — fitted on
zebra/checkerboard calibration instruments; see PROVENANCE.md).

## Step 2 — Recipe pass 1 (structure + measured materials)

```sh
python3 packages/engine/tools/build_recipe.py \
  --bundle MyIcon.icon --gt gt.png --id myicon --outdir out
node packages/engine/tools/render.mjs out out/recipes/myicon.mjs pass1.png
python3 packages/engine/tools/score.py pass1.png gt.png --side side.png
```

What the builder does, and why each part is the way it is:

1. **Layer geometry from `icon.json`.** Each SVG layer parses to flat cubic
   segments (full path grammar: M/L/H/V/C/S/Q/T/A + transforms; arcs are
   converted via center parameterization). Placement: a layer renders at
   `natural_size × position.scale`, centered, plus
   `translation-in-points` — natural size is the SVG viewBox (or pixel
   size), NOT 1024. Geometry should be pixel-accurate in pass 1; if it
   isn't, fix it here — nothing later can absorb geometric error cleanly.
2. **Fill colors are MEASURED, not converted.** Declared fills are
   Display-P3, and ictool's gamut mapping is not colorimetric clipping
   (Spotify's P3 green renders as (89,215,96), not the clipped (0,219,77)).
   The builder samples ground truth over each layer's eroded coverage:
   median for solids, axis-projected least squares for linear gradients.
3. **The canvas background is fitted, never parsed.** `automatic-gradient`
   semantics are undocumented; instead the builder renders a glass-hidden
   variant bundle through ictool and fits a vertical gradient to it.
4. **Glass materials use the two-gray instrument.** For each glass layer
   the builder renders variant bundles with the canvas fill overridden to
   two flat grays (0.25 and 0.75), with the glass shown and hidden, and
   solves the affine response `composite = k·bg + c` per channel exactly.
   Do NOT regress against the icon's real background — the glass interior
   usually spans too little background variation and the fit is singular
   (this failure mode produces k > 1 nonsense). Stacked glass is measured
   INCREMENTALLY, bottom-up (renders with only the bottom j layers shown);
   a layer whose base is already near-opaque measures k≈0 and correctly
   collapses to its effective flat color.
5. **Refraction** uses the calibrated law as-is. It transfers across
   materials and silhouettes without refitting — verified at translucency
   0.5 vs the 0.4 it was calibrated on — because the phase-2 bake absorbs
   smooth material differences. Only geometry cannot be absorbed.

### Expected pass-1 scores

| Pass 1 RMSE | Meaning |
| --- | --- |
| 2–5 | Non-glass icon, everything structural is right — proceed |
| 8–20 | Glass icon; the gap is specular/lighting — proceed, the bake owns this |
| 20–50 | Something structural is wrong. Diff image first: uniform color offset → a fill wasn't measured (check the builder log); silhouette offset → layer placement; glass far too transparent/opaque → material measurement failed (check the two-gray `k` values are in (0,1)) |

## Step 3 — Bake the lightmap (pass 2)

```sh
python3 packages/engine/tools/build_recipe.py \
  --bundle MyIcon.icon --gt gt.png --id myicon --outdir out \
  --lightmap pass1.png
node packages/engine/tools/render.mjs out out/recipes/myicon.mjs final.png
python3 packages/engine/tools/score.py final.png gt.png --side final-side.png
```

The lightmap is `GT − pass1`, luma-only, deadzone-quantized (step 1.5) at
half resolution, deflated. Chroma ships **zero bytes**: corrections are
applied through the white-restore model — per channel they scale with
`(255 − base)`, blend factor fitted at bake time — because Liquid Glass
corrections are overwhelmingly white-overlay adjustments. (Shipping chroma
planes fails: lossy codecs chroma-subsample thin correction lines into
colored fringes, and downsampled planes can't resolve them.)

The bake is **self-consistent**: it corrects THIS renderer's pass 1, so it
absorbs rasterizer AA differences, material approximations, and law
transfer error — everything smooth. It cannot absorb sharp geometric error;
if the final render shows line ghosts at feature edges, the corresponding
pass-1 feature is misplaced, not under-lit.

**CRITICAL:** the lightmap must be baked against a pass-1 render from the
CURRENT engine + recipe. Re-emitting the engine or rebuilding the recipe
without `--lightmap` produces a lightmap-less recipe; a stale-pass-1 bake
silently degrades. After any engine change: render pass 1 fresh → rebake →
re-score every recipe.

### Quality bar (all scored at 1024 vs ictool)

At the default `--lm-res 128` (adopted set, re-baked 2026-08-17):

| Icon class | Achieved | Example |
| --- | --- | --- |
| Flat art, no glass | ~2.2 | Spotify 2.18 |
| Single glass layer | ~4.4–5 | Podcast Republic 4.44, Apple Podcasts 4.97 |
| Stacked glass (3 layers) | ~7 | Overcast 7.12 |

At `--lm-res 512` (max fidelity, ~5× larger recipes): flat ~1.8, single
glass ~3–4, stacked ~7. The gap between the two settings exists only in
the 1024 master — at display sizes ≤128 they differ by ≤0.12 RMSE.

Scores meaningfully above these for a comparable icon mean a step failed —
find it, don't ship it. Downsampled renders score better still (averaging);
at typical display sizes ≤256 px these are visually indistinguishable.

## Step 4 — Use the recipe

```js
import { createLiquidRenderer, loadRecipe } from "refraction-engine";

const r = createLiquidRenderer(await loadRecipe("myicon"));
const { width, height, pixels } = await r.render({ size: 256 }); // RGBA
const src = await r.dataUri({ size: 256 });                      // PNG data URI
```

(Adopted recipes only — adoption is `pipeline/build-recipes.mjs --adopt`,
which also sets `recipe`/`rmse` in the platform's meta.json and
regenerates `recipeSlugs`.)

First render computes the full 1024² field pipeline (~1 s) and is memoized
per size; sizes 16–1024 are area-averaged from the 1024 master.

## Current limitations

- **Layer art must be SVG.** PNG-art layers need vector sources (trace
  them, or match subpaths from an existing vector version of the logo).
- Fills: solid + linear gradient (radial gradients, images, per-layer blend
  modes other than normal are not implemented).
- Light appearance only; dark/tinted renditions are separate ground truths
  requiring their own recipes.
- Deep glass stacks: layers ≥ 4 deep have near-zero measurable base
  contrast and collapse to flat colors (usually visually correct anyway).
- `blur-material` group settings are ignored (Castamatic-class icons will
  lose that effect to the lightmap's smooth approximation).

## Debugging playbook

- **Always look at the diff image** (`--side`); RMSE alone hides structure.
  Horizontal-band residual = row-structured error (lighting/alpha curves);
  edge-hugging residual = geometry; uniform tint = color measurement.
- Probe pixels beat theories: compare specific coordinates in GT vs render
  before hypothesizing.
- ictool renders `fill: none` as a strong default white fill, not as
  nothing — never leave a glass layer's fill implicit in a variant bundle.
- The EDT must treat the canvas border as outside, and must be the exact
  algorithm (approximate/chamfer EDTs ripple ±0.5 px, which the pow-0.14
  law profile amplifies into visible artifacts).
- Bilinear sampling of any per-pixel field uses texel centers at
  integer+0.5: array index = coordinate − 0.5. Off-by-half errors print
  ghost lines at sharp features.
