# Liquid Glass background review — October 2026

Default backgrounds were fitted to exposed canvas pixels in the refreshed App Store artwork, excluding icon edges and foreground artwork. Native Icon Composer renders supplied the fitting feedback. Geometry, size, and foreground materials were retained. Each bundle stores its native fill and `BackgroundFit.json`/`Background.md` measurements.

| Platform | Background RGB RMSE before → after | Central icon RMSE before → after |
| --- | ---: | ---: |
| BBC Sounds | 40.24 → 0.84 | 53.23 → 38.56 |
| iCatcher | 12.61 → 0.70 | 10.81 → 7.33 |
| Podcast Republic | 12.40 → 0.51 | 9.30 → 1.03 |
| Spotify | 6.61 → 0.07 | 5.92 → 5.49 |
| Moon FM | 4.22 → 0.62 | 3.57 → 4.23 |

Background scores use platform-specific exposed-canvas masks, so they measure improvement within each platform, not a cross-platform ranking. Central icon scores use the directory's 256px central-60% RGB metric.

BBC Sounds now has the Store's charcoal ramp. Its remaining large error is the Google Play-derived foreground geometry. iCatcher has the Store's stronger blue; Podcast Republic uses a nearly constant blue instead of the automatic lighter ramp. Spotify's canvas is black rather than an automatically lifted gray. Moon FM's canvas is lighter, matching the Store; this changes the native translucent glyph's appearance enough to increase the whole-icon score slightly. Trial changes to foreground translucency were not adopted.

Prior dark and tinted background values are explicitly preserved. All tested TintedDark renders are pixel-identical; Dark is pixel-identical except iCatcher, whose glyph auto-tint originally inherited the Default canvas hue. Pinning its prior blue in the Dark fill keeps its whole-frame RGBA difference to 0.325 at 1024px. Native circles were rebuilt, retaining iCatcher's safe-area fit and Spotify's separate full-bleed green composition.

The color-space guard in `audit-facet-drift.mjs` now checks the iCatcher master against its new declared sRGB color and the vector against its existing P3-to-sRGB reference. Different authored colors no longer falsely fail the shared coding-space check. Native renders, refreshed comparison scores/4× sheets, bundle validation, and the web build were verified.

Review image: `dist/background-gradients/comparison.png` (App Store, before, updated).

## BBC Sounds and Moon FM foreground follow-up

BBC Sounds' three orange sound bars now match the App Store bounding boxes; its independently sized BBC lettering remains intact. Clean rectangular paths replace the Google Play trace's undersized bars and edge slivers. The native geometry applies to light, dark, tinted, and watchOS circle appearances. The Liquid Glass-versus-Store central RMSE improves **38.56 → 4.19**.

Moon FM now uses a layer-colored shadow at opacity 0.5, matching the Store's purple shadow. Colored-layer translucency is 0.504 and the clear overlay is 0.7. Translucency alone only reached 4.18; combining it with the chromatic shadow improves **4.23 → 2.31**. Its Dark, TintedLight, and TintedDark native renders are pixel-identical to their prior versions. The fitted light background is retained.

Settings and measurements are saved in `BBCSounds.icon/Glyph.md` and `MoonFM.icon/Materials.md`/`MaterialFit.json`. Both native shapes, Compare graphics and scores, and web assets are regenerated. Validation passed for all 86 bundles. Review image: `dist/bbc-moon-refinement/comparison.png`.

## Vector background parity

BBC Sounds, Podcast Republic, and iCatcher now use the native Default background stops in their vector square, squircle, and circle variants. BBC Sounds and Podcast Republic badges share those backgrounds; iCatcher's badge is a standalone glyph with no background. Podcast Republic's source generator reads the Default `.icon` fill to preserve the match on regeneration. iCatcher's circle safe-area transform is retained.

Vector-versus-Liquid Glass central RMSE improves from **27.91 → 1.32** for BBC Sounds, **12.73 → 6.73** for Podcast Republic, and **11.03 → 7.47** for iCatcher. iCatcher's material-off score improves **8.06 → 0.79**, isolating the remaining material difference. Compare scores and 4× graphics, generated assets, and both Figma exports are refreshed. The iCatcher color-frame guard checks the shared authored sRGB blue.
