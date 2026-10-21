# Store artwork material review — October 2026

Compared with the refreshed App Store raster using Icon Composer 27.1, design generation 27.

Default appearance: glass on, specular on, translucency 0, layer-color shadow at 0.5 opacity. Dark and tinted material specializations retain their prior values. Existing watchOS geometry, background coverage, and intentional bleed are preserved.

Central 60% RGB RMSE against the store raster at 256px: 6.26 → 5.74. This measures native Liquid Glass against store artwork, unlike the directory’s vector-versus-store drift score.

The foreground and full-canvas plate are separated; material applies only to the foreground. The original artwork remains for dark/tinted appearances.
