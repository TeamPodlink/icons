# Measured vector translucency — October 2026

The vector foregrounds below now use editable SVG opacity masks measured from their native Liquid Glass Default renders. Backgrounds, path geometry, circle safe areas, and intentional edge bleed retain their existing treatment. Each platform’s `VectorMaterial.json` records its native source hash, sampled opacity curve, regeneration command, and before/after scores.

`material-flat.mjs measure --translucency-only` renders with and without translucency, then measures the blend toward the group backdrop. Material-free renders isolate the glyph bounds from native highlights and shadows. Ten vertical samples become gradient stops at each band’s midpoint. Masks use explicit user-space coordinates so the Figma importer can preserve them.

Scores use the existing audit: central 60% RGB RMSE at 256 pixels, with both assets rendered at 1024 pixels and ICC-converted to sRGB. Lower is closer. The baseline for Castro and YouTube Music already includes their new native shadow treatments.

| Platform | Before | After |
| --- | ---: | ---: |
| icatcher | 7.47 | 0.91 |
| playerfm | 11.08 | 4.60 |
| kkbox | 8.02 | 7.02 |
| pocketcasts | 8.44 | 5.96 |
| snipd | 14.54 | 3.31 |
| siriusxm | 15.74 | 3.59 |
| podcastapp | 7.91 | 6.78 |
| youtube | 14.42 | 7.40 |
| ivoox | 9.85 | 4.28 |
| youtubemusic | 14.21 | 7.53 |
| gaana | 8.33 | 5.15 |
| audacy | 11.33 | 4.08 |
| listnr | 8.10 | 6.26 |
| rssradio | 7.65 | 5.69 |
| podimo | 8.18 | 5.83 |
| radiothmanyah | 10.91 | 5.24 |
| castro | 14.18 | 10.52 |
| yoto | 13.80 | 7.04 |
| wavlake | 13.32 | 1.28 |
| podhome | 9.95 | 1.05 |
| tidal | 6.14 | 1.22 |
| overcast | 10.91 | 10.47 |
| xiaoyuzhou | 12.96 | 10.09 |

All 22 affected circular variants also improved against their existing native circle references. YouTube Music’s separate full-bleed circle remains unchanged. Circle geometry differences remain outside the scope of this material pass.

Existing treatments on Apple Podcasts, Castamatic, RSS, Moon FM, Podcast Republic, and ’sodes were retained after candidate remeasurement produced no improvement. TuneIn and Podcast Parrot have no eligible Default glass group to which this fade should be added.

Castro and YouTube Music native shadow experiments and appearance verification are recorded in each `.icon` bundle’s `ShadowRefinement.json` and `Materials.md`. Castro’s baked shadow artwork was removed from the Default layer in favor of one native shadow; its App Store RMSE improved from 10.02 to 3.13. YouTube Music’s chromatic shadow opacity changed from 0.75 to 0.45 and translucency from 0.30 to 0.28, improving App Store RMSE from 6.21 to 4.02. Dark and tinted renders were pixel-identical.
