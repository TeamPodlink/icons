# Store artwork material review — October 2026

Compared with the refreshed App Store raster using Icon Composer 27.1, design generation 27.

Default appearance: glass on, specular on, translucency 0.28, neutral shadow at 0.55 opacity. Dark and tinted material specializations retain their prior values (including neutral shadow at 0.5). The watchOS rendition uses this same glyph with Icon Composer's native circle layout.

The initial material pass reduced central 60% RGB RMSE against the store raster at 256px from 10.84 to 1.88. The fresh glyph trace and material refinement reduce it further to 1.58 (15.9%); whole-frame RMSE improves from 1.38 to 1.22. These are native Liquid Glass-versus-Store measurements.

## App Store glyph trace

The [official SVG](https://radio.thmanyah.com/icons/eight.svg) has narrower tips and necks than the current App Store artwork. The new outline fits mirrored cubic curves to the raster's subpixel half-contrast boundary, then refines placement, edge offsets, translucency, and shadow against native Icon Composer renders. The fitted curves have about 0.12px outer-edge and 0.09px inner-edge horizontal residual at the 1024px source size, before native-render refinement.

`Assets/glyph.svg` replaces the former raster extraction and its baked-in red edge pixels. `Assets/glyph-dark.svg` uses the same outline in red. Both use a 1024px canvas; the platform vector and badge reuse that outline at 1/32 scale. The background remains a separate full-canvas fill.

`GlyphTrace.json` records the App Store reference hash, curve parameters, final offsets, material settings, and measured scores. Experimental whole-frame scores there use a gray alpha background; the production audit uses its standard alpha handling, giving the whole-frame figures above. The central score is identical in both measurements.
