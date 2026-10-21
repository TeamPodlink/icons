# Circle layout

The icon layer shifts right by 96 points on watchOS for the requested optical centering. Its background stays fixed.

The watchOS overrides are native Icon Composer specializations in icon.json.
Square-platform artwork uses the unchanged default layers and positions.
The 1/0.94 compensation reverses Icon Composer’s measured watchOS layer inset.
