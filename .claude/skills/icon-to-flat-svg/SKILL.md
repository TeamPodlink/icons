---
name: icon-to-flat-svg
description: Assemble a platform's flat facet (icon.svg + badge.svg, 32×32) mechanically from its Liquid Glass .icon bundle or other official vector material — declared fills, verbatim glyph paths, measured placement — never drawing or tracing. Use when a platform is missing its flat icon, when asked to build icon.svg from a bundle, to convert a .icon to the flat facet, or to add a badge for a bundle-only platform.
---

# .icon → flat facet: mechanical assembly

Build `platforms/<id>/icon.svg` (and `badge.svg`) from a `.icon` bundle
with **zero drawn geometry**: every path traces to the developer's own
SVG assets, every color to a declared value in `icon.json`, every
placement to the bundle's stated layer geometry. The output is an
assembly, not an artwork.

## When this applies — and when it does not

Sanctioned ONLY when official vector material exists:

- the decanted bundle ships vector layers (`Assets/*.svg`), or
- the developer publishes official vector assets (press kit, guidelines).

NEVER:

- raster tracing (auto or manual) of screenshots, App Store art, or the
  ictool render;
- drawing "close enough" geometry by eye;
- inventing colors — if a fill is not declared in `icon.json` (e.g. an
  `automatic-gradient`, or a raster-only layer), this skill does not
  apply; stop and say so.

The worked example is `platforms/sodes/` (commit "sodes: flat icon +
badge, mechanically assembled from the decanted bundle").

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
convention ships `color(display-p3 …)` as-is. `linear-gradient` with
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
   @32 | badge, in both masks. librsvg (sharp) cannot parse
   `color(display-p3 …)`: substitute matrix-converted sRGB values in the
   *sheet renders only*, never in committed files. Glyph silhouette and
   placement must align with the master by eye at 256; the flat fill
   replacing the glass material is expected and correct.
