# Store artwork material review — October 2026

Compared with the refreshed App Store raster using Icon Composer 27.1, design generation 27.

Default appearance: glass on, specular on, translucency 0.45, layer-color shadow at 0.75 opacity. Dark and tinted material specializations retain their prior values. Existing watchOS geometry, background coverage, and intentional bleed are preserved.

Central 60% RGB RMSE against the store raster at 256px: 14.96 → 6.34. This measures native Liquid Glass against store artwork, unlike the directory’s vector-versus-store drift score.

The foreground and full-canvas plate are separated; material applies only to the foreground. Default artwork and material settings are unchanged by the vector migration below.

## Dark and tinted vector migration

`Assets/alternate.svg` replaces `light.png` for Dark, TintedLight, and TintedDark. It retains the existing non-glass alternate group, native tint processing, and watchOS framing. Default still uses its original material foreground and plate and renders pixel-identically.

The alternate glyph's circular arcs were remeasured from the former 1024px source: top center (551.2173, 472.7949), radius 240.1091; bottom center (471.9351, 551.8992), radius 240.0318. Their diameters follow the original upward diagonal. Each lobe has a fitted linear gradient with 12 color stops, at 97.22° and 110.60° respectively. The plate uses a sampled vertical gradient; the final stop continues the interior color rather than sampling the raster's antialiased bottom edge.

Color stops use hex notation for consistent CoreSVG parsing. The vector retains native tint behavior; exact pixel equivalence with the raster's tint mapping is not expected. `VectorMigration.json` records the source hash and measured rendition differences.
