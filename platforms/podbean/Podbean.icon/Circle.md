# Circle layout

The vector background and glyph are separate layers. The background compensates for the watchOS inset and reaches the circular canvas edge. The glyph retains the native 0.94 inset, matching the reviewed 6% reduction in `icon-circle.svg`.

The watchOS overrides are native Icon Composer specializations in icon.json.
Both SVGs use 32-unit canvases: default scale 32, with background-only watchOS scale 32/0.94. Square-platform positions are unchanged.
