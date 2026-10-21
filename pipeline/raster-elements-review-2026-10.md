# Raster elements review — 2026-10-17

11 platforms remain after the Radio Thmanyah trace. All have vector flat/badge artwork; their raster elements are in Liquid Glass bundles. The lens inventories all files in `Assets/`, including unused files and assets used only in alternate appearances.

## Native swap trials

Temporary copies in `dist/raster-review/`; production assets are unchanged. Rendered with Icon Composer 27, Default macOS, 1024px, converted to sRGB, then scored at 256px using the central 60% RGB RMSE used by the directory. Lower is better. These are initial asset swaps, without geometry or material optimization, and do not establish dark/tinted/watchOS parity.

| Platform | Current vs Store | Vector trial vs Store | Assessment |
| --- | ---: | ---: | --- |
| Podverse | 0.87 | 1.53 | Best first migration. Existing measured headphone paths can replace `glyph.png`; retain the separate canvas fill and appearance settings. |
| Disctopia | 0.74 | 1.94 | Another straightforward migration. Existing D/play paths and gradient can replace `glyph.png`. |
| Anytime Player | 0.12 | 4.05 | Simple artwork, but the current raster is an exceptionally close match. Needs real letter cutouts and a dark SVG before adoption; trial uses the full flat for Default only. |
| Podbean | 0.69 | 3.84 | Viable with a small compatibility adjustment. Direct import scored 16.26 because the stroke-opacity glow became an opaque halo. Replacing `stroke-opacity` with `opacity` on the glow's stroke-only `use` elements restores the soft appearance. Preserve the circle's background coverage and glyph layout. |

No trial improved Store RMSE. Podverse and Disctopia are the strongest candidates if vector editability justifies a small rendering difference. Review sheet: `dist/raster-review/review.png`.

## Remaining platforms

| Platform | Raster dependency | Recommendation |
| --- | --- | --- |
| Snipd | `light.png`, used only for dark/tinted fallback; Default already uses SVG foreground/plate | Next after the simple swaps. Reuse the existing vector geometry, but check alternate-appearance shading before removing the PNG. |
| Xiaoyuzhou | Light/dark circular background artwork and three dark foreground PNGs | Promising partial migration. Backgrounds contain concentric rings, and dark lines share the general shapes of existing SVGs. Dark assets also carry gradients/shading; they are not simple solid-color substitutions. |
| Pandora | Dark/tinted fallback PNGs; Default already uses vector material layers | Defer full migration until alternate appearance artwork is matched. `glyph.png` is unreferenced and can be removed as housekeeping, but this alone would not remove Pandora from the lens. |
| Queue | Light/dark full artwork PNGs | Requires replacing the SVG inner-shadow filter with native effects or vector geometry; previous native SVG trials lost the shadow. The sweep gradient is already represented by vector wedges. |
| Tunestr | Browser-rendered PNG of the vector artwork | Requires translating drop/inner-shadow filters into compatible native effects or vector approximations. Geometry is already vector. |
| Airshow | Shaded balloon illustration | Not a quick win. Existing vector is an approximation of a rendered 3D illustration; replacing the raster would lose substantial shading. |
| Podcast Parrot | Shaded parrot illustration | Not a quick win. Existing vector simplifies the artwork; keep the raster until a dedicated fidelity pass. Preserve intentional bottom-edge bleed. |

Suggested order: Podverse, Disctopia, Snipd alternate appearances, Podbean. Treat Anytime Player as a separate fidelity decision and Xiaoyuzhou as a layer-by-layer project.

## Follow-up migration completed

Podverse, Disctopia, Snipd, and Podbean now contain only SVG assets. The earlier trial notes above describe the pre-migration review. The raster-elements lens is now 7 platforms: Airshow, Anytime Player, Pandora, Podcast Parrot, Queue, Tunestr, and Xiaoyuzhou.

- Podverse and Disctopia retain their separate canvas fills and dark styling; native circle support is saved in their bundles. Final Store RMSE: 1.53 and 1.94.
- Snipd retains its Default material layers pixel-identically. Dark/tinted fallback artwork is reconstructed with measured arcs and gradients. Against the former native renditions, central RMSE is 1.97 Dark, 6.32 TintedLight, and 5.02 TintedDark. Native tint processing remains enabled; it does not map SVGs pixel-identically to the former raster. Trace provenance and measurements live in `Snipd.icon/VectorMigration.json`.
- Podbean now uses separate vector glyph and plate layers, with corrected opacity. Its circle retains a full-bleed background and matches the vector facet's reviewed 6% foreground reduction. Final Store RMSE: 3.84.

Default/dark/circle renders and both tinted renditions were inspected. Bundle validation and the web build passed. Comparison scores and both Figma export scopes were regenerated. Verification sheet: `dist/vector-migration-2026-10/verification.png`.

## Xiaoyuzhou follow-up

Xiaoyuzhou's five PNG layers have also been replaced with vector geometry and gradients, after consolidating its proper appearance-specific asset assignments. The raster-elements lens now contains 6 platforms. Light/circle differences versus the former native bundle are about 0.04 central RMSE, tinted renditions are pixel-identical, and Dark shading differs by 3.79. Appearance routing, materials, and full-bleed circle backgrounds are retained. Source hashes and measured differences are stored in `Xiaoyuzhou.icon/VectorMigration.json`.
