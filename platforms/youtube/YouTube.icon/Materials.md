# Store artwork material review — October 2026

Compared with the refreshed App Store raster using Icon Composer 27.1, design generation 27.

Default appearance: glass on, specular on, translucency 0.25, layer-color shadow at 0.5 opacity. Dark and tinted material specializations retain their prior values. Existing watchOS geometry, background coverage, and intentional bleed are preserved.

Central 60% RGB RMSE against the store raster at 256px: 21.59 → 11.60. This measures native Liquid Glass against store artwork, unlike the directory’s vector-versus-store drift score.

The play triangle is an even-odd cutout in the red plate, not a white foreground layer. Native glass shading and the chromatic shadow extend into this opening over the white canvas, matching the recessed appearance of the official raster. The original combined asset remains for dark/tinted appearances.
