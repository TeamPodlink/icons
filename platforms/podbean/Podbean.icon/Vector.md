# Vector artwork — October 2026

`Assets/glyph.svg` and `Assets/plate.svg` replace the former flattened `light.png`, using the platform's vector paths and gradients. Default, dark, and tinted appearances all use vector sources.

The glow's stroke-only `use` elements use `opacity`, not `stroke-opacity`. CoreSVG rendered the latter as an opaque halo in the native trial. Applying opacity to each stroke-only element preserves the intended compositing and also works in the web vector icon and its circle variant.

Central 60% RGB RMSE at 256px against the App Store reference changes from 0.69 to approximately 3.84. The initial uncorrected SVG trial scored 16.26. The remaining difference is accepted for this vector migration.
