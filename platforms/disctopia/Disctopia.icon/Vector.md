# Vector artwork — October 2026

`Assets/glyph.svg` reuses the measured D/play paths and horizontal color gradient from the platform's vector icon, with the black plate removed. Its 32-unit canvas uses native layer scale 32. A redundant zero-radius arc was removed from the glyph, vector icon, and badge to avoid a CoreSVG warning; it traced a zero-length segment.

The separate background fill and dark specialization are retained. watchOS uses Icon Composer's normal foreground inset; the background fill covers the circle. The former `glyph.png` is removed.

Central 60% RGB RMSE at 256px against the App Store reference changes from 0.74 to 1.94. This small fidelity cost was accepted for the vector migration.
