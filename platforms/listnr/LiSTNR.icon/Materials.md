# Store artwork material review — October 2026

Compared with the refreshed App Store raster using Icon Composer 27.1, design generation 27.

Default appearance: glass on, specular on, translucency 0.25, neutral shadow at 0.25 opacity. Dark and tinted material specializations retain their prior values. Existing watchOS geometry, background coverage, and intentional bleed are preserved.

Central 60% RGB RMSE against the store raster at 256px: 60.13 → 4.63. This measures native Liquid Glass against store artwork, unlike the directory’s vector-versus-store drift score.

Glyph registration: uniform scale 1.035991 around the canvas center, translation (−0.929, −41.996) points on a 1024-point canvas. Applied to all appearances.

The sibling Vector `icon.svg` uses the same glyph transform with its background left full-size. `icon-circle.svg` also includes the native watchOS 0.94 inset, keeping the vector and Liquid Glass circle glyphs aligned.
