# Circle layout

The foreground fits a circular safe area inset by 10% of the canvas diameter. circle-layout.json preserves the measurement policy; pipeline/circle-layout.mjs recomputes the watchOS position from baseline geometry and saves it to icon.json. Backgrounds are not fitted.

The watchOS overrides are native Icon Composer specializations in icon.json.
Square-platform artwork uses the unchanged default layers and positions.
The 1/0.94 compensation reverses Icon Composer’s measured watchOS layer inset.

Vector codegen also applies this policy to the `circle-safe-area` group in the sibling `icon-circle.svg`. The foreground uses the computed safe-area scale; the full-bleed background is unchanged. Figma exports consume that Vector Circle source.
