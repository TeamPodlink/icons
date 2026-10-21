# Store artwork material review — October 2026

## Shadow refinement

The old light.svg contains baked-in glow and shadow paths. Default now uses light-material.svg containing only the unchanged white mark, so Icon Composer applies one native shadow to the actual glyph silhouette. The original light.svg remains selected explicitly for tinted appearances; dark.svg remains selected for dark. The native circle uses the same clean glyph and material.

Default settings: specular on, translucency 0.26, neutral shadow at 0.75 opacity.

Native design-generation 27, ICC-converted to sRGB, central 60% RGB RMSE at 256 px against the refreshed App Store reference: **10.02 → 3.13**. Tests compared no shadow, neutral and chromatic shadows across multiple opacities, then refined translucency and specular.

Dark, TintedLight and TintedDark native renders are pixel-identical to the previous bundle. See ShadowRefinement.json for settings and measurements.

## Previous pass

Compared with the refreshed App Store raster using Icon Composer 27.1, design generation 27.

Default appearance: glass on, specular off, translucency 0.25, none shadow at 0.5 opacity. Dark and tinted material specializations retain their prior values. Existing watchOS geometry, background coverage, and intentional bleed are preserved.

Central 60% RGB RMSE against the store raster at 256px: 13.70 → 10.02. This measures native Liquid Glass against store artwork, unlike the directory’s vector-versus-store drift score.
