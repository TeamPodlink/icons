# Vector artwork — October 2026

`Assets/glyph.svg` reuses the measured headphone paths from the platform's vector icon, with the black plate removed. Its 32-unit canvas uses native layer scale 32. The separate background fill and dark specialization are retained. watchOS uses Icon Composer's normal foreground inset; the background fill covers the circle.

The former `glyph.png` is removed. Central 60% RGB RMSE at 256px against the App Store reference changes from 0.87 to 1.53. This small fidelity cost was accepted for the vector migration.
