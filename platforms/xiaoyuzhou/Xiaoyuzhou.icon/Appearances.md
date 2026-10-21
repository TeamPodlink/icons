# Appearance assets

Light, dark, and tinted artwork is assigned through native `image-name-specializations` rather than duplicate layers whose opacity is switched between zero and one.

| Layer | Default | Dark | Tinted |
| --- | --- | --- | --- |
| Outer orbit | `line1.svg` | `line1_dark.svg` | Default SVG with existing tinted fill |
| Planet | `theme.svg` | `theme_dark.svg`, opacity 0.85 | Default SVG with existing tinted fill |
| Inner orbit | `line2.svg` | `line2_dark.svg` | Default SVG with existing tinted fill |
| Background | `bg.svg` | `bg_dark.svg` | `bg_tint.svg` |

The planet outline (`theme_line_dark_tint.svg`) is additional geometry, not a replacement for the planet. Its native `hidden-specializations` hide it in Default and show it in Dark and Tinted. The unused, always-transparent `theme_tint` layer has been removed from the layer tree; its source SVG remains in Assets for reference.

The active artwork keeps its material settings and positions. Both halves of each former orbit pair used glass when visible, so each unified layer uses glass directly. The planet retains its dark opacity and existing per-appearance group materials. The background keeps its watchOS 1/0.94 scale compensation and is glass in all three active appearances. The former dark background no longer participates in Default underneath the light background.

Native rendering comparison (Icon Composer 27): Default, Dark, watchOS Default, and watchOS Dark are pixel-identical at the full 1024px render size. At 256px, TintedLight central RGB RMSE is 0.038 and TintedDark is 0.0075. watchOS Dark continues to render the native light circle, as it did before this change.

The figures above describe the appearance-encoding change before vector migration. The subsequent vector migration is recorded in `VectorMigration.json`: light and circle differences are about 0.04 central RMSE, tinted renders are unchanged, and Dark differs by about 3.79. The five PNG sources have been replaced by editable SVG paths and gradients.

The original orbit paths supply the dark silhouettes. Broad shading uses fitted gradients; edge highlights are outlined paths with measured low opacity. The original PNGs' nearly white edge pixels had very low alpha, so their RGB alone must not be treated as opaque highlights. The planet's baked shadow and glow are replaced with smooth radial gradients; the dark background uses fitted elliptical lighting fields and concentric annuli. This approximates the raster shading without embedding pixels, filters, or a mesh of pixel-sized paths. Default geometry, native materials, appearance routing, and watchOS background compensation remain intact.
