# podcastparrot flat facet

`supplied.svg` is a hand-drawn parrot (maintainer, 2026-09-17). It is never
shipped as drawn: `run.mjs` refits every feature placement and every
colour to the decanted bundle's own raster
(`platforms/podcastparrot/PodcastParrot.icon/Assets/parrot.png`) and
composes the house 32-unit `icon.svg` / `badge.svg`. The measurements,
the stage-by-stage RMSE and what was tried are in `pipeline/README.md`,
"Vector flat facet" under "podcastparrot: decanted".

```sh
node pipeline/podcastparrot-flat/run.mjs
```

Needs headless Chrome and the repo's `sharp`; work files land in
`/tmp/podcastparrot-flat-work` (`$WORK`): per-element masks, colour
classes, `stage2b.svg`, `stage3.svg`, fit JSONs, side-by-side sheets.
