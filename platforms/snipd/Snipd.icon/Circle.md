# Circle layout

Keep the background at the circular canvas edge. The Default appearance uses separate vector foreground and background layers for material shading. Both compensate for the watchOS inset to retain the original full-canvas framing. Dark and tinted appearances use `Assets/alternate.svg`, with the same full-canvas framing as their former raster layer.

The watchOS overrides are native Icon Composer specializations in icon.json.
Square-platform artwork uses the default positions; watchOS overrides only framing.
The 1/0.94 compensation reverses Icon Composer’s measured watchOS layer inset.
