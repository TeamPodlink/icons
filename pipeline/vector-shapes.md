# Vector shapes

The Vector directory and detail view offer Square, Squircle (default), and
Circle. `?shape=square` and `?shape=circle` are shareable; omitting the
parameter keeps the existing squircle output. Copy and Download resolve
to the same static SVG shown in the preview.

Static files are `flat/<id>.svg` (squircle), `flat/<id>-square.svg`, and
`flat/<id>-circle.svg`. Shape-specific source files follow the conventions
in CONTRIBUTING.md. The React `PlatformIcon` uses those same source files
via `shapeVariants`; its existing squircle API spelling is `superellipse`.

## Shape controls and Liquid Glass

Both facets use icon-only radio controls with accessible names and tooltips.
Vector uses Lucide's SquareDashed, SquircleDashed, and CircleDashed. Liquid
Glass offers Squircle (default) and Circle in the directory and detail view,
using the same `shape` query parameter.

Liquid Glass Circle uses native watchOS renders from the same `.icon`
bundles, with Icon Composer's platform-specific geometry, materials, and
Default/Dark appearances. It does not clip the squircle bitmap or apply
Vector foreground adjustments automatically. Bundle-specific layouts use native watchOS specializations in icon.json. A staged copy declares watchOS circle
support because ictool otherwise silently renders a squircle for documents
that only declare squares. Circle output is checked for transparent pixels
at (10%, 10%) and the corresponding other corners. A watchOS
render of a reconstructed bundle is not evidence of an official watch app.

`node pipeline/build-assets.mjs` builds both shapes. Use `--shape circle`
to refresh watchOS assets without touching the existing squircle renders,
and `--only <slug>` to render one bundle. The tool uses standalone Icon
Composer when installed, otherwise Xcode's bundled `ictool`.

Circle filenames are `<slug>-circle.png` and `<slug>-circle-dark.png` for
1024px masters, plus `<slug>-circle[-dark]-<size>.avif` and `.webp` at
32, 64, 128, 256, and 512px. They use the same P3-to-sRGB delivery conversion
as squircles. Identical Default/Dark renders are deduplicated separately;
`hasCircleDark` overrides `hasDark` only when their measured result differs.
Global Player adds a circle-only 96-point rightward translation to its
`icon` foreground layer through a native watchOS position specialization, matching
the maintainer’s requested optical centering; its plate stays fixed.
The October 2026 render pass with Icon Composer 27.1 produced identical
Default and Dark pixels for all 86 watchOS bundles, so Circle uses that
native rendition in both themes.
Previews, PNG clipboard copies, PNG/AVIF/WebP downloads, and `<picture>`
embeds all reference these same files. Procedural squircle previews are
not offered for Circle.

`sync-web-assets.mjs` copies the new files into the local library. The
existing release uploader automatically includes them in a future R2
release and ZIP. Production deployment must reference a new immutable
asset release containing Circle files; this change does not upload assets
or overwrite an existing release.

### Opt-in circle safe area

iCatcher and RSS opt into `safeArea` in circle-layout.json inside each .icon bundle:
`{ "inset": 0.1, "layers": ["icon"] }` (RSS selects `mark`). The inset
is a fraction of the canvas diameter: 10% on each side leaves an 80%-diameter
safe circle. This is a layout policy, not a platform requirement.

`circle-safe-area.mjs` rasterizes only the selected SVG foreground layers
at 2048px and measures their furthest nontransparent pixel from the canvas
center, including the layer's scale and translation. Pixel corners are
included conservatively. A common factor `min(1, safeRadius / inkRadius)`
scales both geometry and offsets around the center. This fits the actual
silhouette radially rather than fitting a rectangular bounding box, and
never enlarges small artwork. The factor is recomputed from source on each
build, so edits do not accumulate reductions. Raster layers and specialized
positions/assets are rejected until their measurement is supported.

The fit is saved as a native watchOS position specialization in the 1024-point Icon Composer document before
native watchOS rendering. Its own framing can add more space; the measured
budget applies to glyph geometry, not the renderer's soft shadows or rim.
Backgrounds and default Square/Squircle positions stay intact.
The helper recalculates from the default position, so repeated builds never compound a reduction.

For RSS and iCatcher, the same bundle policy also declares
`"vector": { "group": "circle-safe-area" }`. Vector codegen runs
`sync-circle-layouts.mjs`, which applies the computed factor to that foreground
group in `icon-circle.svg`. Their vector geometry matches the native layer;
the shared fit replaces the former fixed 0.94 reduction. Figma exports and the
Vector facet both consume these generated Circle sources.

All other bundles keep their authored framing unless explicitly opted in.
In particular, Podcast Parrot, Subscribe on Android, TrueFans, and Podcast
Index intentionally meet or bleed through the lower edge and must not be
added to this fitting policy. Global Player's optical offset is independent.

Run `node --test pipeline/circle-safe-area.test.mjs` to verify radial fitting,
plate preservation, translation handling, and the no-enlargement rule.

## Reviewed circular variants

- **Apple Podcasts:** its decanted `ApplePodcasts.icon` explicitly lists
  watchOS under `supported-platforms.circles`. It has no per-platform
  position overrides. Rendering the bundle at 1024px with Icon Composer
  for iOS and watchOS puts the outer foreground ring's upper edge at about
  y=102 and y=127 respectively. Relative to the center at 512, that is
  385/410 ≈ 0.94. `icon-circle.svg` applies this measured 0.94 scale to the
  existing foreground around (16,16), leaving its plate full bleed. This
  is a flat adaptation guided by the official render, not an extracted
  watchOS vector export.
- **JioSaavn:** the existing source contains the circular brand artwork
  inside `translate(5.71875 5.71875) scale(.642578125)`, surrounded by a
  dark square plate and baked shadows. Its circle variant uses those
  existing brand paths at native scale. No new glyph or inferred
  watchOS variant is introduced.

### Remaining official bundles (2026-10-16)

Reviewed every other bundle whose metadata records `source: "decanted"`.
All nine declare watchOS circle support. None contains an explicit
watchOS position specialization; Icon Composer's platform render supplies
the adjustment. Each was rendered at 1024×1024, scale 1, Default rendition,
for both iOS and watchOS using Xcode's bundled `ictool`:

```sh
ictool platforms/<id>/<bundle>.icon --export-image --output-file <output>.png \
  --platform <iOS|watchOS> --rendition Default --width 1024 --height 1024 --scale 1
```

Measured foreground bounds in the rendered images confirm approximately
0.94 scaling. Pixel thresholds and material effects account for the small
variation; this is a measured adaptation, not an authored JSON override.

| Platform | Measured feature | iOS → watchOS (px) | Ratio |
| --- | --- | --- | --- |
| Airshow | Balloon width | 602 → 566 | 0.940 |
| Netflix | Red mark height | 706 → 664 | 0.941 |
| Overcast | Dark ring width | 819 → 769 | 0.939 |
| Podcast Parrot | Colored artwork height | 886 → 832 | 0.939 |
| Podcast Republic | Light mark width | 820 → 770 | 0.939 |
| ’sodes | Light mark width | 550 → 517 | 0.940 |
| Spotify | Green disc width | 821 → 771 | 0.939 |
| TuneIn | Cyan mark width | 848 → 796 | 0.939 |
| Xiaoyuzhou | Dark orbit width | 754 → 708 | 0.939 |

Their `icon-circle.svg` files scale the existing foreground, including
associated masks and shadows, to 0.94 around (16,16). Background plates
remain full bleed. Podcast Parrot still meets the circular edge at its
lower-left feathers, as in the official watchOS rendition; an extra
arbitrary reduction would change that composition.

Xiaoyuzhou's official bundle also shrinks its square background image,
exposing slivers of the underlying blue canvas on watchOS. Its flat Circle
keeps the existing pale plate full bleed and adjusts only the planet/orbit.

Bundles rebuilt from flat SVGs, store artwork, or Android resources were
excluded: their declared watchOS support is not evidence of an official
watchOS layout. Square and Squircle artwork remain unchanged.

Other platforms retain their source scale until there is evidence for a
specific adjustment. A bundle supporting watchOS alone is not evidence
that every layer needs the same scale correction.

## Maintainer refinements (2026-10-16)

These are requested optical adjustments, not newly discovered platform
requirements. They take precedence over the watchOS adaptation above:

- Audacy, Global Player, Goodpods, gPodder, iCatcher!, iVoox, Podbean, RSS,
  and SiriusXM: foreground at 0.94 around (16,16), plates full bleed.
- Global Player: additionally shift the Circle foreground right by 3 SVG
  units for optical centering. The plate and 0.94 foreground scale stay fixed.
  Its Liquid Glass Circle stores the corresponding 96-point native watchOS layer offset.
- Podcast Index: foreground at 0.94 around **(16,32)** so its stem remains
  attached to the bottom edge. Its white plate and clipping bounds stay fixed.
- TuneIn: a further 0.94 on its prior 0.94 Circle framing, giving **0.8836**
  relative to `icon.svg`.
- Podchaser: expand its red disc from radius 12.667 to 16; fill the plate
  with that red and retain the white/dark glyph geometry.
- Spotify: supersede the watchOS reduction with a full-bleed green plate.
  Scale the native disc's 673.202-unit diameter to 32 and preserve its three
  negative-space contours as black paths. This removes the black surround.
- Sonnet: expand the yellow disc's measured 27.6847-unit maximum diameter
  to 32, recenter it, and retain the blue mark. The plate uses its yellow.
- YouTube Music: expand the source red disc from radius 11 to 16, retaining
  the white ring and play glyph; the plate uses the same red.

Every reviewed Circle source is included automatically in the React/static
parity test. Square and Squircle still use the existing source artwork.

See [Android APK review](android-circle-review-2026-10.md) for the separate
inspection of shipped adaptive and round resources.

## Hungama glyph-only artwork (2026-10-17)

At the maintainer’s request, removed all wordmark subpaths (including
colored tracing fringes) from the existing Google Play vector trace. Kept
the four glyph paths and their colors, fitted the glyph to 24/32 canvas
height, centered vertically, and used its ink centroid for horizontal
placement. The original source URL remains in
`pipeline/platform-additions-2026-10/sources.json`.

The Vector square/squircle/circle, plated badge, and `.icon` foreground
share the same placement. Rebuilt light/dark squircle and native watchOS
assets. The official App Store raster stays intact as a reference, so its
122.12 store RMSE intentionally reflects the omitted text and enlarged
glyph. Vector versus our updated light master measures 0.77 central RMSE.
Do not restore the wordmark to reduce the store score.

## Portable native Circle layouts (2026-10-17)

The .icon bundles now carry native `idiom: "watchOS"` specializations.
Icon Composer uses `idiom`, not `platform`, inside specialization entries.
A direct property takes precedence over its specialization array: move its
original value into the unqualified entry and remove the direct property.
These behaviors were verified by saving a temporary bundle in Icon Composer.

- Xiaoyuzhou: only background layers compensate for the native 0.94 inset.
- Snipd, Podbean, Tunestr: flattened raster layers restore full-canvas framing.
- Great Pods, Pocket Casts, Deezer, Parasocial, Neuecast: circle.svg keeps
  the glyph at its previous watchOS size while its plate fills the canvas.
- TrueFans: full background coverage and authored bottom bleed.
- Podchaser, Spotify, Sonnet, YouTube Music: the reviewed Vector circle
  composition supplies the full-bleed brand disc and expanded central mark.
  A watchOS-only group carries it; the original groups remain on square platforms.
- iCatcher/RSS: circle-layout.json records the safe-area policy, and
  circle-layout.mjs saves its computed native positions before rendering.
- Global Player: the 96-point optical offset is saved in icon.json.

Each affected bundle includes Circle.md documenting its intent. Intentional
bottom bleed is recorded for Podcast Parrot, Subscribe on Android, TrueFans,
and Podcast Index. All 40 before/after default and dark macOS comparisons
for the 20 touched bundles were pixel-identical at 256px.
