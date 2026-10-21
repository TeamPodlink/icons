# Circle layout

Circle artwork separates background coverage from foreground scale. The foreground retains its authored bottom bleed; no safety inset is applied. circle.svg derives from Assets/icon.svg.

The watchOS overrides are native Icon Composer specializations in icon.json.
Square-platform artwork uses the unchanged default layers and positions.
The 1/0.94 compensation reverses Icon Composer’s measured watchOS layer inset.
