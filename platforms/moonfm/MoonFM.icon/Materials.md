# Moon FM materials

The Default appearance is fitted against the refreshed App Store artwork, retaining the fitted 253→244 sRGB gray background and all glyph paths.

- Colored glyph group translucency: **0.504** (previously 0.5).
- Clear `M` overlay translucency: **0.7** (previously 0.5).
- Colored glyph group shadow: **layer-color**, opacity **0.5** (previously neutral, 0.5).
- Specular highlights, layering, geometry, and other settings are unchanged.

The Store's purple shadow accounts for most of the improvement. Translucency alone only reduced RMSE from 4.23 to 4.18; the fitted combination reaches **2.31**. These values use native Icon Composer generation 27, ICC-converted to sRGB, at 256px over the central 60% square.

Dark and Tinted specializations explicitly retain their previous 0.5 translucency and neutral shadow. Default watchOS circles inherit the updated materials.
