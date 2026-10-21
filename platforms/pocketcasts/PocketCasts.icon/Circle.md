# Circle layout

Circle artwork separates background coverage from foreground scale. The background reaches the canvas edge while the glyph retains its prior watchOS scale. circle.svg derives from Assets/icon.svg.

The watchOS overrides are native Icon Composer specializations in icon.json.
Square-platform artwork uses the unchanged default layers and positions.
The 1/0.94 compensation reverses Icon Composer’s measured watchOS layer inset.
