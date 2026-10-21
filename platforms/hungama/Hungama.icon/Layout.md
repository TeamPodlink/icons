# Optical placement

The complete play glyph is translated 1.3 SVG units left (41.6 points on a 1024-point canvas, 4.0625% of the width), preserving its scale and vertical placement. The prior placement centered its filled area but left the long right-hand tip visually crowded against the edge. The revised placement balances the silhouette’s bounds with the rightward optical allowance of a play triangle.

The same transform is stored in this bundle’s Assets/icon.svg, ../icon.svg, and ../badge.svg. Square, Squircle, and their dark renders inherit it. Keep the background full bleed and do not independently reposition the white center or colored ribbons.

## Circle radial alignment

Circle uses a separate glyph asset and native watchOS visibility specializations. Its three rounded outer corners have equal radial clearance from the circular boundary. The center was solved from the silhouette, rather than its bounding box or visual mass; measurements and the source-coordinate offset are in circle-alignment.json. The Vector Circle has a corner radius of 13.44285 units, leaving 2.55715 units of clearance on the 32-unit canvas. Native watchOS preserves its existing 0.94 inset uniformly, so all three corner clearances remain equal.

This overrides the Square/Squircle optical adjustment only for Circle; size, colors, and the full-bleed background are preserved.
