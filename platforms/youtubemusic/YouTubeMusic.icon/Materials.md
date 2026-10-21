# Store artwork material review — October 2026

## Shadow refinement

The chromatic shadow opacity drops from 0.75 to 0.45 and translucency moves from 0.30 to 0.28. The red disc, ring and play cutouts, their geometry, and the separate full-bleed watchOS circle asset are unchanged. Less shadow spill more closely matches the Store ring and triangle.

Default settings: specular on, translucency 0.28, layer-color shadow at 0.45 opacity.

Native design-generation 27, ICC-converted to sRGB, central 60% RGB RMSE at 256 px against the refreshed App Store reference: **6.21 → 4.02**. Tests compared no shadow, neutral and chromatic shadows across multiple opacities, then refined translucency and specular.

Dark, TintedLight and TintedDark native renders are pixel-identical to the previous bundle. The separate watchOS circle is also pixel-identical. See ShadowRefinement.json for settings and measurements.

## Previous pass

Compared with the refreshed App Store raster using Icon Composer 27.1, design generation 27.

Default appearance: glass on, specular on, translucency 0.3, layer-color shadow at 0.75 opacity. Dark and tinted material specializations retain their prior values. Existing watchOS geometry, background coverage, and intentional bleed are preserved.

The ring and play triangle are even-odd cutouts in the red disc, exposing the background and receiving the disc’s chromatic shadow. They are not separate white foreground layers. The original combined asset remains for dark/tinted appearances. The watchOS circle retains its separate, full-bleed branding composition.

Central 60% RGB RMSE against the store raster at 256px: initial material review 15.73 → 7.24; cutout follow-up 7.24 → 6.21. Triangle-only measured 6.98 and ring-only 6.51, so both openings are adopted. This measures native Liquid Glass against store artwork, unlike the directory’s vector-versus-store drift score.
