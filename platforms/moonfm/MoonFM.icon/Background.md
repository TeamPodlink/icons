# App Store background match — October 2026

Default canvas fill was measured against the refreshed App Store reference. The fitted native gradient uses sRGB endpoints [253, 253, 253] → [244, 244, 244]. Dark and tinted fills retain their prior values, and foreground geometry and material settings are unchanged. Native circle fills use the same background.

Central 60% RGB RMSE at 256px versus Store: 3.57 → 4.23. Background-only RMSE on exposed interior canvas pixels: 4.22 → 0.62. `BackgroundFit.json` records the measurements and sample count.

The background match improves, but whole-icon RMSE increases slightly because the native translucent glyph responds to the lighter canvas. Foreground settings are deliberately retained for a separate material pass.
