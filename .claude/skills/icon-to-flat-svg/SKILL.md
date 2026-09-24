---
name: icon-to-flat-svg
description: Assemble a platform's flat facet (icon.svg + badge.svg, 32×32) mechanically from its Liquid Glass .icon bundle or other official vector material — declared fills, verbatim glyph paths, measured placement. Tracing is a documented last resort, taken only after every official vector source is ruled out — by measured primitives, or through QuiverAI's Image-to-SVG endpoint (pipeline/vectorize-quiver.mjs) for shaded artwork. Use when a platform is missing its flat icon, when asked to build icon.svg from a bundle, to convert a .icon to the flat facet, or to add a badge for a bundle-only platform.
---

# .icon → flat facet: mechanical assembly

Build `platforms/<id>/icon.svg` (and `badge.svg`) from a `.icon` bundle
by **assembly, not authorship**: wherever official vector material
exists, every path comes from the developer's own SVG assets, every
color from a declared value in `icon.json`, and every placement from
the bundle's stated layer geometry. The output is an assembly, not an
artwork.

Assembly is always the preferred path. When no official vector
material can be obtained, a traced flat is permitted as a last resort
— see "Falling back to a trace" below.

## When this applies

Mechanical assembly is sanctioned whenever official vector material
exists:

- the decanted bundle ships vector layers (`Assets/*.svg`), or
- the developer publishes official vector assets (press kit, guidelines).

The worked example is `platforms/sodes/` (commit "sodes: flat icon +
badge, mechanically assembled from the decanted bundle").

## Exhaust the official sources first

Before concluding that no official vector exists, check all of these
and record what you found. The `ipatool` skill covers the first two.

1. **iOS** — the decanted `.icon` bundle's own `Assets/*.svg`, and any
   vector in the IPA's asset catalog.
2. **Android** — the official APK's adaptive-icon layers. Developer
   foreground/background layers are frequently true VectorDrawables,
   which convert to SVG losslessly; this is the most commonly missed
   source.
3. **Web** — the app's own site: inline SVG in the markup, sprite
   sheets, an `.svg` favicon, `icons` entries in the web manifest.
4. **Press kit / brand guidelines** — the `guidelinesUrl` in
   `meta.json` when set, or the developer's press, brand, or media
   page.
5. **Ask the developer** — email, support, or their GitHub. Many will
   send the source SVG on request. A pending request is a reason to
   wait, not a reason to trace.

Only when all five come up empty is the fallback open.

## Falling back to a trace

A traced flat is a last resort, not a shortcut, and it ships labeled as
one:

- Say up front, in your reply, which of the five sources you checked
  and what each returned. An unchecked source is not an exhausted one.
- Set `"flatSource": "drawn"` in `meta.json`. Never label a traced flat
  `"official"`.
- Fit **parametrically against the highest-resolution official raster**
  — App Store artwork or the ictool master — rather than eyeballing
  shapes freehand. Prefer geometry you can state in parameters (radii,
  centers, stroke widths) over a bag of digitized points.
- Measure colors off that raster. Do not invent them.
- Report the fit error (e.g. central-crop RMSE against the raster at
  1024) so the next person can judge whether to replace it.
- Leave a comment in `icon.svg` recording what it was fit against, the
  method, the date, and that measured error.

Still out of bounds:

- inventing colors that are neither declared in `icon.json` nor
  measured from official artwork;
- passing a traced flat off as `official`;
- tracing because looking for the vector was inconvenient.

If a fill is not declared in `icon.json` (e.g. an `automatic-gradient`,
or a raster-only layer) and cannot be measured from official artwork,
stop and say so.

### Vectorizing through QuiverAI (an official trace method, 2026-09-23)

When the artwork is a shaded illustration a primitive trace cannot
carry (airshow's balloon: primitives reached 18.84 against the master,
the API 15.42), the sanctioned second trace method is QuiverAI's
Image-to-SVG endpoint through `pipeline/vectorize-quiver.mjs`. It sits
INSIDE the trace rules above — the five sources are exhausted first,
the result ships `"flatSource": "drawn"`, the fit error is reported —
with these additions:

- **Input**: the developer's own layer when the bundle is decanted
  (`--image platforms/<id>/<Name>.icon/Assets/<layer>.png`), else the
  split glyph (`--only <slug>`, the default `--source glyph`) — the
  artwork alone on transparency, so the model vectorizes the mark and
  not the plate. Use `--source master` only when the plate or a shadow
  is part of what must be captured. A decanted layer is also the cue
  to check the bundle itself: airshow's store-artwork split rendered
  the balloon larger than the store does (14 against it); the decanted
  stack renders it at 1.05.
- **Model and effort**: run `arrow-2` at `--effort medium` first (about
  $0.13 for a 1024 glyph); then `--model arrow-2-telos --effort high
  --stream` and keep whichever scores lower against the master once
  plated. Record both figures. `xhigh` does not complete: the endpoint
  sends nothing until the document is done, and the connection is cut
  at about 340 s on every try (three on 2026-09-23, streamed or not),
  which `high` finishes inside (176 s for a 1024 glyph). Always
  `--stream` on telos; `--adopt` strips the background telos adds
  (`--drop <ids>`) and unwraps its nested `<svg>`.
- **Plating**: the endpoint returns a document in the image's pixel box
  (`viewBox="0 0 1024 1024"` for a 1024 input). The flat is the house
  plate (the declared canvas, as ictool paints it) plus that document's
  content in a `<g transform="scale(.03125)">` (1/32 for a 1024 box,
  with the `translate` for a non-zero `minX/minY`), every `id`
  prefixed `<platform>-q-` and every `url(#…)` / `href="#…"` rewritten
  to match; `xlink:href` becomes `href` (the plated root declares no
  xlink namespace, and Chrome draws nothing when it meets the prefix —
  a fully transparent render is that symptom). Copy paths and
  gradients verbatim; do not simplify. A decanted layer is placed by
  the layer law (`--transform`, rendered size = natural × scale, centred,
  plus the translation), then registered with `--fit-bbox "x0 y0 x1
  y1"` (the artwork's box on the master, px): the model does not always
  draw at the frame it was asked for (arrow-2 drew the 1024 × 1379
  balloon at 0.74 of it; telos at 0.999), and the tool reports the
  scale it applied and the aspect error, which should be under 1%.
- **Grade to the master** (`--grade`): the model reads colours its own
  way — arrow-2-telos drew airshow's balloon 4/11/6 brighter than the
  layer it was given, while ictool renders that layer to the master
  within 1 — so the adopt step fits an affine RGB map, master ≈ T·[R G
  B 1], over the document's interior (its own alpha, 3 px eroded) and
  rewrites every colour by it, the pandora precedent. The map goes in
  the header. Check one stop by hand against the map before trusting
  the audit: a scrambled rewrite reads 58, not 13. Skip the grade only
  when the interior means are already under 3/255.
- **Sanitise before shipping**: refuse a document with `<script>`,
  `<image>`, `<foreignObject>`, or any `http(s)` reference in `href` /
  `url()`. The tool's output line lists the element counts; the SVG
  guide at docs.quiver.ai says the same.
- **Provenance**: the `icon.svg` header comment names the endpoint, the
  model, the effort, the response `id` and `request_id`, the date, the
  input image and its source, and the central RMSE against the master
  as plated. The ledger entry repeats them with the token counts.
- **Badge**: as for any trace — the mark bare when it reads on both
  pills (viewBox the mark's bbox + 2%), plated otherwise.
- **The key**: `QUIVERAI_API_KEY` in the repo's gitignored `.env`,
  loaded by the tool with `process.loadEnvFile`; it is never printed
  and never belongs in a file the repo tracks.

An API vectorization is a derived drawing. It never becomes
`"official"`, and a developer's own vector, found later, replaces it.

## House flat-icon format

`icon.svg` is **unmasked full-bleed** 32×32 — the mask is applied by
consumers (`packages/icons` shapes.ts / build-static.ts), never baked in:

```svg
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 32 32">
  <defs><linearGradient id="<id>-unmasked__a" …userSpaceOnUse>…</linearGradient></defs>
  <path fill="url(#<id>-unmasked__a)" d="M0 0h32v32H0z"/>
  <path fill="#fff" d="…glyph…" transform="…placement…"/>
</svg>
```

- viewBox must be exactly `0 0 32 32` (validate-icons.ts enforces).
- Gradient/def ids: `<id>-unmasked__a`, `__b`, … (codegen re-prefixes,
  but keep the convention).
- Single-line, no width/height attributes.

## Reading icon.json → house color syntax

Canvas fill lives at top-level `fill`; layer fills in each layer's
`fill-specializations` (unqualified entry = light appearance,
`"appearance": "dark"` = dark).

| icon.json value | house SVG syntax |
|---|---|
| `"display-p3:0.82000,0.22900,0.94900,1.00000"` | `color(display-p3 .82 .229 .949)` |
| `"gray:1.00000,1.00000"` | `#fff` (gray g → rgb(g,g,g)) |
| `"srgb:r,g,b,a"` | `#RRGGBB` or `rgb()` |

Keep declared component values verbatim (trim trailing zeros, leading
`0.` → `.`). Do NOT gamut-convert for the committed file — the house
convention ships `color(display-p3 …)` as-is.

> **`color(display-p3 …)` is house style, and it used to break the
> builder.** librsvg (what `sharp` rasterizes SVG with) paints P3
> colors **fully transparent** — not "approximately", *gone*. Until
> 2026-09-13 `pipeline/build-svg-icons.mjs` rendered its quality-gate
> reference with librsvg, so a P3 icon was compared against a render
> with the paint missing: icatcher's reference came back 29.1% opaque
> and the honest SVG bundle scored central RMSE 75.66 against a
> threshold of 8, silently diverting it to the raster fallback — which
> the dark-variant split never touches, so the icon shipped with no
> Dark rendition. All 11 P3 icons in the flat-svg family scored 69–164.
> The builder now renders its reference in headless Chrome and aborts
> loudly on an implausible reference, so **you do not need to avoid P3
> syntax** — but never reach for `--threshold` to make a gate pass, and
> never rasterize a house SVG with sharp/librsvg for any purpose where
> the colors matter. See "The P3 reference-raster trap" in
> `pipeline/README.md`.

`linear-gradient` with
`orientation {start,stop}` in unit coords maps to `<linearGradient
gradientUnits="userSpaceOnUse">` with coords × 32 (e.g. start (0.5,0) →
stop (0.5,1) ⇒ `x1="16" x2="16" y1="0" y2="32"`).

## Glyph color resolution

The flat facet is FLAT: the Liquid Glass material (specular, blur,
translucency, shadow) is *not* reproduced. The glyph's color is the
layer's **declared light-appearance fill** — for sodes,
`fill-specializations[0].value.solid = "gray:1.0"` ⇒ `fill="#fff"` —
which matches how the app renders its glyph in flat contexts. If a
layer has no fill-specialization, its SVG's own fills apply (copy them
through unchanged). Dark-appearance specializations exist in the bundle
but the flat facet currently ships light only (badge-dark.svg is the
only dark surface, and only when artwork demands it).

## Layer geometry → 32×32 placement (scale-1 placement law)

A layer renders at `natural_size × position.scale`, **centered** on the
1024-point canvas, then offset by `translation-in-points`. Natural size
is the layer SVG's viewBox size — NOT 1024 (they only coincide when the
asset is authored at 1024, as sodes' is).

Point map for a 1024-viewBox asset on the 32 canvas:

```
q32 = p · (scale · 32/1024) + (512·(1−scale) + tx − 0 … per axis)/32
```

Concretely for sodes (scale 0.95996, translation (−0.5, −0.5)):

```
scale32  = 0.95996 / 32            = .02999875
offset32 = (512·0.04004 − 0.5)/32  = .625015     (both axes)
⇒ <path d="…verbatim bundle path…" transform="translate(.625015 .625015) scale(.02999875)"/>
```

Paste the bundle SVG's path data **verbatim** and place it with a
`transform` — never rewrite coordinates by hand. For a non-1024
viewBox asset of natural size N: rendered size = N·scale points,
top-left = (512 − N·scale/2 + tx), all ÷ 32 for the 32 canvas.

## The two masks

Consumers clip icon.svg at render time. Two measured shapes exist:

**House squircle (CURRENT DEFAULT — all committed icons assume it):**

```
M16 0C30.545 0 32 1.455 32 16S30.545 32 16 32S0 30.545 0 16S1.455 0 16 0Z
```

(one cubic per quarter; canonical source `packages/icons/src/core/shapes.ts`.)

**Apple Liquid Glass superellipse (measured, ready, NOT yet default):**

```
M9.751 0L22.249 0C24.905 0 27.644 .449 29.598 2.402C31.551 4.356 32 7.095 32 9.751L32 22.249C32 24.905 31.551 27.644 29.598 29.598C27.644 31.551 24.905 32 22.249 32L9.751 32C7.095 32 4.356 31.551 2.402 29.598C.449 27.644 0 24.905 0 22.249L0 9.751C0 7.095 .449 4.356 2.402 2.402C4.356 .449 7.095 0 9.751 0Z
```

Fit provenance (2026-08-18): extracted from the alpha channel of ictool
1024 masters (identical across all bundles — ictool stamps one mask).
Model: flat edges + superellipse corners, corner size R = 311.7 px
(9.75/32), exponent n = 2.450. Two cubics per corner; assembled path
deviates ≤ 1.24 px at 1024 (0.039 units at 32) from the measured
silhouette, rms 0.72 px — antialiasing noise level. A *pure* full-body
superellipse does not fit (best n = 4.09, max 2.4 px). The house
squircle deviates from Apple's mask by up to 11 px at 1024 (0.35 units).

> **Re-measure the mask by subpixel contour, never by a hard alpha
> threshold, and never along row 0 / column 0.** The corner meets the
> flat edge with a horizontal tangent, so dx/dy is unbounded there: an
> α ≥ 250 read of row 0 returns x = 331 where the 50%-coverage contour
> is 316.46 and this fit says 311.7 — all three describe the same
> silhouette. On the contour proper (1428 samples, 3 bundles, identical
> shapes) R = 311.7 / n = 2.450 scores rms 1.041 px / max 2.878 px and
> a free refit prefers R ≈ 335 / n ≈ 2.65 at rms 0.712 / max 1.109, so
> R and n are near-degenerate here and R = 311.7 sits at the low end of
> the band. Settle this before standardizing on the Apple mask
> (measured 2026-09-13, `pipeline/README.md`).

Standardizing flat icons on the Apple mask is an **open maintainer
decision** — until it's made, commit nothing that assumes the Apple
path; keep the house default.

## Badge assembly

`badge.svg` = the same unmasked artwork wrapped in an inline house
squircle clip (overcast/castro pattern):

```svg
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 32 32">
  <defs>…same gradient defs…<clipPath id="shape"><path d="M16 0C30.545 0 32 1.455 32 16S30.545 32 16 32S0 30.545 0 16S1.455 0 16 0Z"/></clipPath></defs>
  <g clip-path="url(#shape)">…same content as icon.svg…</g>
</svg>
```

build-static.ts composes the "Listen on" pill (frame + this mark +
text-to-path wordmark) automatically; badge.svg is only the mark.
`badge-dark.svg` is optional and only needed when the light mark fails
on dark frames.

## Verification bar

1. `pnpm --filter @podlink/icons build` — codegen must pick up the id.
2. `pnpm --filter @podlink/icons test` — green.
3. `node pipeline/validate.mjs` — exit 0.
4. Visual: render a review sheet against the ictool 1024 master
   (`packages/refraction/assets/<slug>.png`) — master | icon.svg @256 |
   @32 | badge, in both masks. Rasterize the SVGs with **headless
   Chrome** (copy `chromeRasterize` from `pipeline/build-svg-icons.mjs`)
   — librsvg (sharp) drops `color(display-p3 …)` to transparent, so a
   sharp-rendered sheet lies about every P3 icon. If you must use
   sharp, substitute matrix-converted sRGB values in the *sheet renders
   only*, never in committed files. Comparing a Chrome render against
   an ictool master is cross-color-space: ictool emits P3-coded pixels,
   Chrome sRGB-coded ones, so put the ictool side through
   `withIccProfile("srgb", { attach: false })` first (icatcher: RMSE
   8.82 raw vs 2.95 converted). Glyph silhouette and
   placement must align with the master by eye at 256; the flat fill
   replacing the glass material is expected and correct.
