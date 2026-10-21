# BBC Sounds glyph geometry

The three sound bars are measured from the refreshed 1024px App Store reference (`apps/web/public/raster/bbcsounds.png`, app 1380676511). The previous Google Play trace made them approximately 12% too small. BBC lettering is retained independently.

Pixel bounds, with exclusive right/bottom edges:

| Bar | Left | Top | Right | Bottom |
| --- | ---: | ---: | ---: | ---: |
| Large | 512 | 354 | 785 | 900 |
| Medium | 336 | 432 | 473 | 822 |
| Small | 219 | 549 | 298 | 705 |

`Assets/icon.svg` divides these coordinates by 32 for its 32-unit viewBox. Clean rectangular paths replace the old traced bars and their edge slivers. Existing foreground colors and background fill are retained. The geometry applies to all native appearances and watchOS circles.

Default Liquid Glass versus App Store central RGB RMSE: **38.56 → 4.19** (256px, central 60%). Remaining differences include the retained traced lettering and native rendering. The flat vector icon and badge now reuse the same glyph paths. Generated Square, Squircle, and Circle variants inherit this geometry, using the same top-to-bottom charcoal gradient as the Default native appearance (#393c3e → #131517).
