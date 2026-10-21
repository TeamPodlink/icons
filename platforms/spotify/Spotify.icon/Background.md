# App Store background match — October 2026

Default canvas fill was measured against the refreshed App Store reference. The fitted native gradient uses sRGB endpoints [0, 0, 0] → [0, 0, 0]. Dark and tinted fills retain their prior values, and foreground geometry and material settings are unchanged. Native circle fills use the same background; Spotify's separate full-bleed green circle artwork remains intact.

Central 60% RGB RMSE at 256px versus Store: 5.92 → 5.49. Background-only RMSE on exposed interior canvas pixels: 6.61 → 0.07. `BackgroundFit.json` records the measurements and sample count.
