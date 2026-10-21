# App Store background match — October 2026

Default canvas fill was measured against the refreshed App Store reference. The fitted native gradient uses sRGB endpoints [64, 134, 229] → [64, 135, 230]. Dark and tinted fills retain their prior values, and foreground geometry and material settings are unchanged. Native circle fills use the same background.

Central 60% RGB RMSE at 256px versus Store: 9.30 → 1.03. Background-only RMSE on exposed interior canvas pixels: 12.40 → 0.51. `BackgroundFit.json` records the measurements and sample count.

Vector backgrounds now share the native Default sRGB stops (#4086e5 → #4087e6) across square, squircle, and circle variants. Foreground geometry and materials are retained.
