# Liquid Glass material review — October 2026

Reviewed LiSTNR plus the 32 platforms from Podcast App through TIDAL in the
Compare view’s store-drift ordering. The range was frozen before edits.

Each platform was tested with 36 combinations: glass on/off, specular on/off,
translucency 0/0.25/0.5, and no/neutral/chromatic shadow. Ten platforms received
additional opacity/translucency refinement. Candidate selection included visual
inspection; pixel error alone can favor material that conceals geometry errors.
Podcast App keeps a lighter 0.2 translucency than the numeric minimum.

Rendered with Icon Composer 27.1 (129), explicitly using design generation 27.
Scores below compare native Liquid Glass against the refreshed store raster:
1024px renders converted from Display P3 to sRGB, resized to 256px, central 60%
RGB RMSE. A second 84% interior check guards against improvements confined to
the center. These are **not** the directory’s vector-versus-store drift scores.

LiSTNR’s silhouette was fitted to the refreshed raster using a uniform similarity
transform: scale 1.035991, translation (-0.929, -41.996) points about the 1024px
canvas center. The dark-glyph silhouette error fell from 0.1397 to 0.00265.
The native layer now has specular highlights, 0.25 translucency and a 0.25-opacity
neutral shadow. Geometry applies to every appearance; material changes apply to
Default and preserve the existing Dark/Tinted settings.

YouTube uses an even-odd play cutout in its red plate, letting the chromatic
shadow fall through the opening onto the white canvas. This follow-up reduced
RMSE inside the play opening from 9.62 to 1.60, with unchanged Dark pixels.
YouTube Music also uses even-odd cutouts for its ring and play triangle. Both
openings match the store raster better than separate white layers (central
RMSE 7.24 → 6.21); the full-bleed watchOS composition is preserved.
Snipd, Pocket Casts and Pandora separate the canvas plate from the foreground;
Castbox’s existing plate also gets its own group. Materials therefore do not
shrink or shade the entire canvas as one glyph. Existing watchOS scale overrides,
iCatcher’s safe-area policy, and YouTube Music’s full-red circle remain intact.
Per-bundle `Materials.md` records the selected settings beside `icon.json`.

## Results

| Platform | Before | After | Decision |
| --- | ---: | ---: | --- |
| LiSTNR | 60.13 | 4.63 | Adopted |
| Podcast App | 26.41 | 25.00 | Adopted |
| Playapod | 25.99 | 25.99 | Retained existing |
| iCatcher! | 24.71 | 10.81 | Adopted |
| YouTube | 21.59 | 11.60 | Adopted; play cutout |
| Audible | 19.03 | 19.03 | Retained existing |
| Goodpods | 16.92 | 16.92 | Retained existing |
| Radio Thmanyah | 10.84 | 1.88 | Adopted |
| Wavlake | 15.60 | 4.01 | Adopted |
| YouTube Music | 15.73 | 6.21 | Adopted; ring and play cutouts |
| Snipd | 14.96 | 6.34 | Adopted |
| SiriusXM | 14.72 | 4.90 | Adopted |
| Podkicker | 14.28 | 14.28 | Retained existing |
| Podcast Addict | 14.03 | 14.03 | Retained existing |
| Airshow | 1.12 | 1.12 | Retained existing |
| Castro | 13.70 | 10.02 | Adopted |
| Audacy | 13.37 | 4.91 | Adopted |
| Yoto | 13.98 | 4.21 | Adopted |
| Xiaoyuzhou | 1.61 | 1.61 | Retained existing |
| Podcast Republic | 9.31 | 9.31 | Retained existing |
| Player FM | 12.51 | 3.40 | Adopted |
| Podhome | 12.25 | 5.00 | Adopted |
| Overcast | 2.47 | 2.47 | Retained existing |
| iVoox | 10.32 | 1.92 | Adopted |
| RSSRadio | 9.93 | 5.67 | Adopted |
| Podimo | 9.89 | 3.77 | Adopted |
| Pocket Casts | 9.74 | 3.24 | Adopted |
| Gaana | 9.27 | 3.15 | Adopted |
| Podcast Parrot | 0.71 | 0.71 | Retained existing |
| KKBOX | 8.76 | 2.88 | Adopted |
| Castbox | 8.57 | 4.92 | Adopted |
| Pandora | 6.26 | 5.74 | Adopted |
| TIDAL | 7.87 | 3.98 | Adopted |

23 platforms improved; 10 retained their existing artwork. Unchanged platforms
include the already close Airshow, Xiaoyuzhou, Overcast and Podcast Parrot, plus
cases where material changes did not yield a convincing improvement. Remaining
error can include source geometry and canvas color; this pass does not claim
pixel-exact reconstruction of every store icon.

## Reproduction and checks

```sh
node pipeline/review-store-materials.mjs
node pipeline/review-store-materials.mjs --only listnr
node pipeline/build-assets.mjs --only listnr
node pipeline/audit-facet-drift.mjs --write --material-off
```

The sweep stages candidates under `dist/material-review-2026-10` and never
adopts them. Its first run snapshots the current sources into `baseline/`; later
runs reuse that baseline. On a fresh checkout, the baseline is the already
updated artwork. The historical before/after numbers and selected parameters
are saved in `liquid-glass-review-results-2026-10.json`.

All 23 saved bundles rendered pixel-identically to the selected Default
candidates. Dark renders were pixel-identical to their prior versions, allowing
only LiSTNR’s requested placement transform. Squircle and native watchOS Circle
assets were rebuilt in Default and Dark at all delivery sizes; circle transparency
assertions passed and the circle contact sheet was visually reviewed. Structural
validation passed for all 86 platforms.
