# App Store background match — October 2026

Default canvas fill was measured against the refreshed App Store reference. The fitted native gradient uses sRGB endpoints [57, 60, 62] → [19, 21, 23]. Dark and tinted fills retain their prior values, and foreground geometry and material settings are unchanged. Native circle fills use the same background.

Central 60% RGB RMSE at 256px versus Store: 53.23 → 38.56. Background-only RMSE on exposed interior canvas pixels: 40.24 → 0.84. `BackgroundFit.json` records the measurements and sample count.

The remaining large error is primarily the Google Play-derived glyph layout, which differs from the App Store reference; this pass changes only the background.

The vector icon and badge share the Default canvas stops as an explicit sRGB SVG gradient (#393c3e → #131517), spanning the full 32-unit canvas vertically. All generated vector shapes and Figma exports inherit it.
