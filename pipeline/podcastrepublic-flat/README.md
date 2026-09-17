# Podcast Republic flat — build recipe

The flat (`platforms/podcastrepublic/icon.svg`, and `badge.svg` = the same
art on a circular plate, as the old badge and the Play Store icon) is not a trace of the
Liquid Glass bundle's asset; it is the two constructions that asset is a
trace OF, rebuilt exactly and carried through the bundle's own layer
transforms. No measurement feeds the geometry — only the background
colours are fitted (on the sRGB master). Reproduce:

```sh
node pipeline/podcastrepublic-flat/generate.mjs           # writes platforms/podcastrepublic/{icon,badge}.svg
```

| element | construction (asset units) | placement (from the bundle) |
| --- | --- | --- |
| ring | annulus, outer 10 / inner 8, centre (12,12), minus two width-2 slots whose near edge lies on the two diagonals through the centre | `matrix(-0.110203 19.0817 -19.0817 -0.110203 486.1 28.4)` — scale 19.082, rotation **90.331°** (shipped as-is; `--square` snaps to 90°) |
| play | equilateral triangle, corner radius 10, rounded height 89.1, bounding box centred on the origin | `matrix(0 1.54739 -1.54739 0 276.85 255.5)` — scale 1.547, exact 90°, apex right |
| layer | `app_icon_512.svg` (viewBox 512) | icon.json: scale 2.15039, translation −0.5 pt: canvas = 512 + (p − 256)·2.15039 − 0.5 |
| canvas | `automatic-gradient` on display-p3 0.322 0.522 0.878 | the ramp ictool paints, fitted on the master: #569DFF → #3D85E4 |

Verification against `packages/refraction/assets/podcastrepublic.png`
(1024): every edge within 0.5 px (triangle base 408.0 vs 407.9, apex
704.4 vs ~704, ring outer 921.2 vs 921); the 0.33° tilt costs 680
mismatched footprint pixels in the gap wedges vs 953 snapped to 90°.
Score with `node pipeline/audit-facet-drift.mjs --only podcastrepublic`
after `pnpm --filter @podlink/icons build`.

`--glyph ramp` paints the glass material's measured vertical ramp on the
mark (white held to row ~213, then to #9DC1F3) — scores 7.58 against
the shipped white's 14.89, but the tint is material, not artwork, so it
is not shipped. Ledger: pipeline/README.md, "podcastrepublic: the Liquid
Glass constructions as the flat".
