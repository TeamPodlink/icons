# The Liquid Glass icon format

Apple's Liquid Glass icon source format, documented empirically from 64
first-party icons extracted from Apple's own apps plus the 92 bundles in
this catalog. Apple publishes no spec; everything here is observed.

> Formerly published at icons.podlink.com/docs/icon-format; now
> maintained here as repository documentation.

## Bundle anatomy

An `.icon` bundle is a directory authored by Icon Composer and compiled
by `actool` into an `IconImageStack` inside an app's `Assets.car`. It
has exactly two parts: a `icon.json` document and an `Assets/` folder of
layer artwork (SVG or PNG).

```
MyApp.icon/
  icon.json          the document below
  Assets/
    glyph.svg        vector layer art (or .png raster art)
    …
```

The document is a canvas *fill* plus a z-ordered list of *groups*, each
holding z-ordered *layers* that reference artwork in `Assets/` by file
name. Observed bounds: 1–4 groups (compiled icons with more exist —
iCloud — but `actool` refuses to validate them) and 1–19 layers per
document.

## Colors and fills

Colors are strings of the form `<colorspace>:<components>` with three
observed colorspaces: `srgb:R,G,B,A`, `display-p3:R,G,B,A`, and
`gray:W,A`, components in 0–1. A fill is one of three shapes:

```json
"fill": { "solid": "srgb:1.00000,1.00000,1.00000,1.00000" }

"fill": {
  "linear-gradient": ["gray:0.19200,1.00000", "gray:0.07800,1.00000"],
  "orientation": { "start": { "x": 0.5, "y": 0 }, "stop": { "x": 0.5, "y": 1 } }
}

"fill": { "automatic-gradient": "display-p3:0.74400,0.29700,0.00000,1.00000" }
```

Every observed gradient is vertical — `orientation` x-coordinates are
0.5 in all 156 surveyed icons, with start.y ∈ [0, 1] and stop.y ∈
[0.3, 1]. `automatic-gradient` takes a single color and derives a
gradient by rules Apple does not document; the measured derivation is in
its own section below. Which colorspace conversion a declared color
actually receives depends on *where* it is declared — the next section
gives the measured resolution paths.

## Color resolution (measured)

There is no undocumented gamut mapping. The renderer composites in sRGB
with plain colorimetric clipping, then encodes the result in Display-P3
coordinates — rendered output is P3-tagged, but its content is
sRGB-gamut. Measured across 23 declared colors: converting rendered P3
pixels back to sRGB matches naive matrix-and-clip conversion to
worst-case 3/255. A conforming player computes fills as pure math in
sRGB. Resolution is not one pipeline but four, split by declaration
site:

```
canvas fills       composite in sRGB; display-p3 values gamut-clipped
sRGB layer colors  composite in sRGB — EXCEPT the raw leak below
display-p3 layer   always convert (with a small unexplained deviation
  colors           from the canvas law on gamut-clipped channels)
gradient stops     transformed by the stop law below, then ramped as a
                   plain lerp in encoded sRGB
```

**The raw leak.** Solid layer colors and fill overrides declared in sRGB
(hex or `srgb:`) pass through *unconverted* — the declared numbers
relabeled as P3 coordinates — when the layer's artwork has an opaque
*exact* full-bleed background with mean encoded luminance below ~0.30
(threshold bracketed to (0.282, 0.314); both `<use>`-referenced and
`<path>` covers trigger it, coverage one pixel short does not, light
backgrounds do not). Almost certainly a dark-artwork classifier choosing
an opaque-blit fast path that skips color conversion. A conforming
player must reproduce it: the same hex color composites in sRGB over a
white background and leaks raw over a dark one.

**The gradient-stop law.** Gradient stops — hex sRGB and
`color(display-p3 …)` declarations produce the identical curve — behave
as if round-tripped through a working space with a different green
primary and clipped there: only the green channel changes, clamped in
linear sRGB to a range set by the other two channels,

```
G' = clamp(G, kR·R + kB·B, span + kR·R + kB·B)
kR = 0.0185   kB = 0.0320   span = 0.9540      (linear light)
```

measured directly from a 4×4×4 constant-stop sweep (64 renders of
color→white gradients); fit RMSE 0.18/255 over the grid, and ten
instrument gradient pairs reproduce at ≤ 1.2 RMSE. The ramp itself is a
plain lerp of the *transformed* stops in encoded sRGB — a blue→black
ramp (both stops zero green) shows the added green perfectly linear in
t. Skipping the law leaves midtones off by up to 45/255 in green while
solid fills of the same colors stay exact.

## The automatic-gradient derivation (measured)

Measured over a 33-color sweep, `automatic-gradient` derives a two-stop
vertical linear ramp in encoded sRGB (mid-ramp deviation < 1 except
where channel clipping bends it), keyed on the declared color's
lightness: below ~0.775 the stops are [lightened(input), input] — the
declared color sits at the bottom, exact; above ~0.775 the ramp flips to
[input, darkened(input)], anchoring the declared color at the top. The
lightening is hue-preserving — it rides the dominant channels, with a
small additive floor near black — and spans 7–18 encoded units, jumping
in a sawtooth at the 0.25/0.50/0.75 lightness quartiles. No closed form
is known; the measured gray and hue ladders make a table-driven
implementation with interpolated anchors viable. The derivation composes
with the color model above exactly once — a player that applies the
transfer a second time for display-p3-declared inputs renders dark
colors near black (measured on a navy canvas).

## The specialization pattern

Any styling property can carry per-appearance overrides via a sibling
key named `<property>-specializations`: an array of
`{ appearance, value }` entries. Exactly two appearances are observed:
`dark` and `tinted` (light is the unspecialized base). The pattern
appears on fills, blend modes, opacity, glass, specular, translucency,
refractivity, blur-material, and lighting.

```json
"fill-specializations": [
  { "appearance": "dark",
    "value": { "linear-gradient": ["gray:0.19200,1.00000", "gray:0.07800,1.00000"],
               "orientation": { "start": { "x": 0.5, "y": 0 },
                                "stop":  { "x": 0.5, "y": 1 } } } }
]
```

When a document omits dark specializations, the system derives a dark
rendition automatically: the canvas is darkened and light-colored glyphs
are tinted toward the former background color. Authoring an explicit
dark fill is how you opt out of that derivation.

## Group properties

Groups carry the material treatment. Observed properties and their value
spaces, most common first:

```
"blend-mode":    "normal" | "multiply" | "screen" | "plus-lighter" |
                 "plus-darker" | "hard-light" | "lighten" | "overlay"
"lighting":      "individual" | "combined"
"specular":      false | true | "inside" | "outside"
"translucency":  { "enabled": true, "value": 0–1 }
"refractivity":  { "enabled": true, "depth": 0–0.5, "strength": −1–0.86 }
"blur-material": 0.01–1
"shadow":        { "kind": "neutral" | "none", "opacity": 0–1.64 }
"opacity":       0.3–0.97
"hidden":        false
```

Several of these barely exist outside Apple's own icons: `refractivity`
appears in 19 of 64 first-party icons and 1 of 92 catalog icons,
`blur-material` in 27 vs 2, and `specular`'s `"inside"`/`"outside"` enum
forms only in first-party documents. Note `refractivity.strength` can be
negative and `shadow.opacity` exceeds 1 in the wild.

## Layer properties

Layers reference artwork and position it. A layer renders at its
artwork's natural size (the SVG viewBox, or pixel size — not the 1024
canvas) multiplied by `position.scale`, centered on the canvas, then
offset by `position.translation-in-points`. When `position` is omitted
entirely, the default is *not* fit-to-canvas: the layer renders at scale
1 — one SVG unit per canvas unit — centered, and clipped to the canvas
(measured with a seven-case viewBox sweep; a 1200×500 viewBox spills and
clips rather than shrinking to fit).

```json
{ "name": "glyph",
  "image-name": "glyph.svg",
  "position": { "scale": 1.6, "translation-in-points": [0, -12] },
  "fill": { "solid": "srgb:1.00000,1.00000,1.00000,1.00000" },
  "glass": true,
  "opacity": 0.9,
  "blend-mode": "plus-lighter" }
```

`glass` marks a layer as Liquid Glass material — it refracts what is
beneath it, takes the material's alpha ramp, and casts the glass shadow.
A layer `fill` overrides the artwork's own colors with a solid or
gradient; observed scale spans 0.24–32 and translations −340–512 points.

## The glass material (measured)

The interior of a glass layer is one universal material family, not a
per-icon effect. Per-row affine solves over two-gray canvases, across
translucency {0, .25, .5, .75, 1} crossed with the specular modes,
measure it as: a neutral response (chroma of the gain term ≤ 0.017), a
*white* overlay (constant term ≈ 255·alpha), with alpha varying smoothly
in both vertical position and translucency — one interpolable 2D family
covers every material setting. `specular` has zero measured effect on
the interior: it is edge lighting only. The vertical axis anchors to the
*glass layer's bounds*, not the canvas: alpha is a function of
(y − boundsTop) / boundsHeight, and the normalized ramp is
size-invariant (144px and 336px circles fit the same curve; bounds-y
fits at the ~1/255 noise floor while canvas-y misses by 37–40×). A
conforming player therefore renders a glass interior as a white overlay
whose alpha it looks up from the (bounds-normalized y, translucency)
family, and treats specular purely as an edge-lighting pass; edge
lighting itself remains unmodeled here.

## Platforms and features

`supported-platforms` declares target shapes: `{ "squares": "shared" }`
in every surveyed icon, plus `"circles": ["watchOS"]` in all first-party
and some catalog documents. First-party documents also carry a
`features` array of capability flags — observed values
`specular-location` and `refractivity` — in 41 of 64 first-party icons
but almost no third-party ones, suggesting it gates newer rendering
behavior.

## Field reference (measured)

Every key path observed across the 156 surveyed documents — 118 paths —
with usage counts per corpus, types, and observed values or ranges.

> Tables generated from `apps/web/lib/icon-spec-survey.json` (64
> first-party + 92 catalog icons). Regenerate the survey with
> `node pipeline/survey-icon-spec.mjs --corpus <dir>`.

### Document root

| key path | 1st party (of 64) | catalog (of 92) | type | observed |
| --- | --- | --- | --- | --- |
| `features` | 41 | 1 | array | 1–2 items |
| `fill` | 64 | 67 | object |  |
| `groups` | 64 | 92 | array | 1–4 items |
| `supported-platforms` | 64 | 92 | object |  |

### Canvas fill

| key path | 1st party (of 64) | catalog (of 92) | type | observed |
| --- | --- | --- | --- | --- |
| `fill.automatic-gradient` | 4 | 5 | string | gray:0.00000,1.00000 · display-p3:0.74400,0.29700,0.000… · srgb:0.00000,0.53300,1.00000,1.0… · display-p3:0.32200,0.52200,0.878… · display-p3:0.11000,0.12500,0.235… · … |
| `fill.fill-specializations` | 50 | 66 | array | 2 items |
| `fill.fill-specializations[]` | 50 | 66 | object |  |
| `fill.fill-specializations[].appearance` | 50 | 66 | string | dark |
| `fill.fill-specializations[].value` | 50 | 66 | object |  |
| `fill.fill-specializations[].value.automatic-gradient` | 2 | 5 | string | display-p3:0.74400,0.29700,0.000… · srgb:0.00000,0.53300,1.00000,1.0… · display-p3:0.32200,0.52200,0.878… · gray:0.00000,1.00000 · display-p3:0.11000,0.12500,0.235… · … |
| `fill.fill-specializations[].value.linear-gradient` | 50 | 66 | array | 2 items |
| `fill.fill-specializations[].value.linear-gradient[]` | 50 | 66 | string | gray:0.19200,1.00000 · gray:0.07800,1.00000 · srgb:1.00000,1.00000,1.00000,1.0… · gray:1.00000,1.00000 · gray:0.92500,1.00000 · … |
| `fill.fill-specializations[].value.orientation` | 50 | 66 | object |  |
| `fill.fill-specializations[].value.orientation.start` | 50 | 66 | object |  |
| `fill.fill-specializations[].value.orientation.start.x` | 50 | 66 | number | 0.5 – 0.5 |
| `fill.fill-specializations[].value.orientation.start.y` | 50 | 66 | number | 0 – 1 |
| `fill.fill-specializations[].value.orientation.stop` | 50 | 66 | object |  |
| `fill.fill-specializations[].value.orientation.stop.x` | 50 | 66 | number | 0.5 – 0.5 |
| `fill.fill-specializations[].value.orientation.stop.y` | 50 | 66 | number | 0.3 – 1 |
| `fill.fill-specializations[].value.solid` | 0 | 7 | string | srgb:1.00000,1.00000,1.00000,1.0… |
| `fill.linear-gradient` | 60 | 55 | array | 2 items |
| `fill.linear-gradient[]` | 60 | 55 | string | srgb:1.00000,1.00000,1.00000,1.0… · gray:1.00000,1.00000 · gray:0.92500,1.00000 · gray:0.19200,1.00000 · gray:0.07800,1.00000 · … |
| `fill.orientation` | 61 | 56 | object |  |
| `fill.orientation.start` | 61 | 56 | object |  |
| `fill.orientation.start.x` | 61 | 56 | number | 0.5 – 0.5 |
| `fill.orientation.start.y` | 61 | 56 | number | 0 – 1 |
| `fill.orientation.stop` | 61 | 56 | object |  |
| `fill.orientation.stop.x` | 61 | 56 | number | 0.5 – 0.5 |
| `fill.orientation.stop.y` | 61 | 56 | number | 0.3 – 1 |
| `fill.solid` | 0 | 7 | string | srgb:1.00000,1.00000,1.00000,1.0… |

### Groups

| key path | 1st party (of 64) | catalog (of 92) | type | observed |
| --- | --- | --- | --- | --- |
| `groups[]` | 64 | 92 | object |  |
| `groups[].blend-mode` | 62 | 92 | string | normal · plus-lighter · multiply · screen · plus-darker |
| `groups[].blend-mode-specializations` | 19 | 2 | array | 2–3 items |
| `groups[].blend-mode-specializations[]` | 19 | 2 | object |  |
| `groups[].blend-mode-specializations[].appearance` | 19 | 2 | string | tinted · dark |
| `groups[].blend-mode-specializations[].value` | 19 | 2 | string | normal · multiply · plus-lighter · screen · hard-light · … |
| `groups[].blur-material` | 27 | 2 | number | 0.01 – 1 |
| `groups[].blur-material-specializations` | 1 | 0 | array | 2 items |
| `groups[].blur-material-specializations[]` | 1 | 0 | object |  |
| `groups[].blur-material-specializations[].appearance` | 1 | 0 | string | dark · tinted |
| `groups[].blur-material-specializations[].value` | 1 | 0 | number | 0.15 – 0.5 |
| `groups[].hidden` | 64 | 92 | boolean | false |
| `groups[].lighting` | 64 | 10 | string | individual · combined |
| `groups[].lighting-specializations` | 0 | 1 | array | 2 items |
| `groups[].lighting-specializations[]` | 0 | 1 | object |  |
| `groups[].lighting-specializations[].appearance` | 0 | 1 | string | dark |
| `groups[].lighting-specializations[].value` | 0 | 1 | string | individual · combined |
| `groups[].opacity` | 11 | 0 | number | 0.3 – 0.97 |
| `groups[].opacity-specializations` | 18 | 2 | array | 2–3 items |
| `groups[].opacity-specializations[]` | 18 | 2 | object |  |
| `groups[].opacity-specializations[].appearance` | 18 | 2 | string | tinted · dark |
| `groups[].opacity-specializations[].value` | 18 | 2 | number | 0 – 1 |
| `groups[].refractivity` | 19 | 1 | object |  |
| `groups[].refractivity-specializations` | 1 | 0 | array | 2 items |
| `groups[].refractivity-specializations[]` | 1 | 0 | object |  |
| `groups[].refractivity-specializations[].appearance` | 1 | 0 | string | dark |
| `groups[].refractivity-specializations[].value` | 1 | 0 | object |  |
| `groups[].refractivity-specializations[].value.depth` | 1 | 0 | number | 0.39 – 0.45 |
| `groups[].refractivity-specializations[].value.enabled` | 1 | 0 | boolean | true |
| `groups[].refractivity-specializations[].value.strength` | 1 | 0 | number | 0.18 – 0.22 |
| `groups[].refractivity.depth` | 19 | 1 | number | 0 – 0.5 |
| `groups[].refractivity.enabled` | 19 | 1 | boolean | true |
| `groups[].refractivity.strength` | 19 | 1 | number | -1 – 0.86 |
| `groups[].shadow` | 64 | 11 | object |  |
| `groups[].shadow.kind` | 64 | 11 | string | neutral · none |
| `groups[].shadow.opacity` | 64 | 11 | number | 0 – 1.64 |
| `groups[].specular` | 62 | 91 | boolean\|string | false · true · outside · inside |
| `groups[].specular-specializations` | 16 | 1 | array | 2–3 items |
| `groups[].specular-specializations[]` | 16 | 1 | object |  |
| `groups[].specular-specializations[].appearance` | 16 | 1 | string | tinted · dark |
| `groups[].specular-specializations[].value` | 16 | 1 | boolean\|string | inside · outside · true · false |
| `groups[].translucency` | 59 | 92 | object |  |
| `groups[].translucency-specializations` | 20 | 3 | array | 2–3 items |
| `groups[].translucency-specializations[]` | 20 | 3 | object |  |
| `groups[].translucency-specializations[].appearance` | 20 | 3 | string | tinted · dark |
| `groups[].translucency-specializations[].value` | 20 | 3 | object |  |
| `groups[].translucency-specializations[].value.enabled` | 20 | 3 | boolean | true |
| `groups[].translucency-specializations[].value.value` | 20 | 3 | number | 0 – 0.85 |
| `groups[].translucency.enabled` | 59 | 92 | boolean | true · false |
| `groups[].translucency.value` | 59 | 92 | number | 0 – 1 |

### Layers

| key path | 1st party (of 64) | catalog (of 92) | type | observed |
| --- | --- | --- | --- | --- |
| `groups[].layers` | 64 | 92 | array | 1–12 items |
| `groups[].layers[]` | 64 | 92 | object |  |
| `groups[].layers[].blend-mode` | 16 | 0 | string | multiply · plus-lighter · plus-darker · screen · hard-light |
| `groups[].layers[].blend-mode-specializations` | 6 | 1 | array | 2–3 items |
| `groups[].layers[].blend-mode-specializations[]` | 6 | 1 | object |  |
| `groups[].layers[].blend-mode-specializations[].appearance` | 6 | 1 | string | dark · tinted |
| `groups[].layers[].blend-mode-specializations[].value` | 6 | 1 | string | normal · plus-lighter · multiply · plus-darker · screen · … |
| `groups[].layers[].fill` | 9 | 2 | object |  |
| `groups[].layers[].fill-specializations` | 58 | 7 | array | 1–3 items |
| `groups[].layers[].fill-specializations[]` | 58 | 7 | object |  |
| `groups[].layers[].fill-specializations[].appearance` | 58 | 7 | string | tinted · dark |
| `groups[].layers[].fill-specializations[].value` | 58 | 7 | object |  |
| `groups[].layers[].fill-specializations[].value.linear-gradient` | 31 | 4 | array | 2 items |
| `groups[].layers[].fill-specializations[].value.linear-gradient[]` | 31 | 4 | string | gray:1.00000,1.00000 · gray:0.92500,1.00000 · display-p3:0.84000,0.89000,0.941… · gray:0.65000,1.00000 · srgb:0.32500,0.94100,0.42700,1.0… · … |
| `groups[].layers[].fill-specializations[].value.solid` | 51 | 6 | string | srgb:1.00000,1.00000,1.00000,1.0… · gray:1.00000,1.00000 · gray:0.00000,1.00000 · display-p3:1.00000,1.00000,1.000… · gray:0.60000,1.00000 · … |
| `groups[].layers[].fill.linear-gradient` | 4 | 1 | array | 2 items |
| `groups[].layers[].fill.linear-gradient[]` | 4 | 1 | string | display-p3:0.38400,0.64800,1.000… · display-p3:1.00000,0.97600,0.921… · srgb:0.43200,0.71200,1.00000,0.0… · srgb:0.24100,0.35700,0.45800,1.0… · display-p3:0.39300,0.70200,0.745… · … |
| `groups[].layers[].fill.solid` | 6 | 2 | string | display-p3:1.00000,1.00000,1.000… · display-p3:0.74300,0.97100,0.992… · display-p3:0.11800,0.84300,0.376… · gray:1.00000,0.99000 · display-p3:0.83700,0.83700,0.837… · … |
| `groups[].layers[].glass` | 63 | 89 | boolean | true · false |
| `groups[].layers[].glass-specializations` | 8 | 5 | array | 2–3 items |
| `groups[].layers[].glass-specializations[]` | 8 | 5 | object |  |
| `groups[].layers[].glass-specializations[].appearance` | 8 | 5 | string | tinted · dark |
| `groups[].layers[].glass-specializations[].value` | 8 | 5 | boolean | false · true |
| `groups[].layers[].image-name` | 64 | 92 | string | icon.svg · light.png · glyph.png · icon-dark.svg · dark.png · … |
| `groups[].layers[].name` | 64 | 92 | string | icon · light · glyph · icon-dark · dark · … |
| `groups[].layers[].opacity` | 17 | 0 | number | 0 – 0.98 |
| `groups[].layers[].opacity-specializations` | 35 | 30 | array | 2–3 items |
| `groups[].layers[].opacity-specializations[]` | 35 | 30 | object |  |
| `groups[].layers[].opacity-specializations[].appearance` | 35 | 30 | string | dark · tinted |
| `groups[].layers[].opacity-specializations[].value` | 35 | 30 | number | 0 – 1 |
| `groups[].layers[].position` | 26 | 40 | object |  |
| `groups[].layers[].position.scale` | 26 | 40 | number | 0.239 – 32 |
| `groups[].layers[].position.translation-in-points` | 26 | 40 | array | 2 items |
| `groups[].layers[].position.translation-in-points[]` | 26 | 40 | number | -340 – 512 |

### Platforms & features

| key path | 1st party (of 64) | catalog (of 92) | type | observed |
| --- | --- | --- | --- | --- |
| `features[]` | 41 | 1 | string | specular-location · refractivity |
| `supported-platforms.circles` | 64 | 11 | array | 1 items |
| `supported-platforms.circles[]` | 64 | 11 | string | watchOS |
| `supported-platforms.squares` | 64 | 92 | string | shared |

## Authoring traps

Hard-won rules for hand-editing `icon.json`, from building the
92-bundle catalog:

```
- ictool rejects invalid documents with one generic error ("The data
  couldn't be read because it is missing"). Bisect your edits.
- Omit "shadow" entirely to express no shadow when hand-authoring;
  ictool has rejected {"kind": "none"} in some contexts even though
  compiled first-party icons contain it.
- Specialized values use [{"value": v}, {"appearance": "dark",
  "value": v2}] — not an object keyed by appearance.
- A glass layer with no effective fill renders with a strong default
  white fill, not as unfilled — never leave fills implicit in
  variant/instrument bundles.
- actool refuses to validate documents with more than 4 groups.
```

## Method

The first-party corpus was extracted from Apple's own app bundles on
macOS with [decant](https://github.com/kylebshr/decant) (host-CoreUI
extraction; refraction and specular-location details may be incomplete
on this path), then surveyed as aggregate facts — key paths, counts,
value spaces. The rendering laws — color resolution, the gradient
derivations, placement, the glass material — were measured by rendering
purpose-built instrument bundles through Apple's own renderer (`ictool`)
and fitting the pixels. Apple's artwork is not redistributed here: the
corpus informs the documentation, and the format itself is documented
for interoperability. Everything on this page is observation, not
specification — Apple can change any of it.
