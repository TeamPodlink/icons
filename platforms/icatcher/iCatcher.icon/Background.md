# App Store background match — October 2026

Default canvas fill was measured against the refreshed App Store reference. The fitted native gradient uses sRGB endpoints [0, 88, 178] → [0, 88, 179]. Dark and tinted fills retain their prior values, and foreground geometry and material settings are unchanged. Native circle fills use the same background.

Central 60% RGB RMSE at 256px versus Store: 10.81 → 7.33. Background-only RMSE on exposed interior canvas pixels: 12.61 → 0.70. `BackgroundFit.json` records the measurements and sample count.

Icon Composer automatically derives the white glyph's Dark color from the Default canvas color. The Dark layer fill is now explicitly pinned to its previous P3 blue so the corrected light canvas does not recolor the dark glyph. The pinned dark render differs by only 0.325 whole-frame RGBA RMSE at 1024px; the dark canvas and material settings are unchanged.

Vector backgrounds now share the native Default sRGB stops (#0058b2 → #0058b3) across square, squircle, and circle variants. Foreground geometry and materials are retained.
