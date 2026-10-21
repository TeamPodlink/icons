# Figma component library

From the repository root, using Node 24 and the project's pnpm version:

```sh
pnpm install
pnpm export:figma
# Optional destination:
pnpm export:figma --out ./dist/Podcast-Apps.fig
# Full repository collection, including tools and other platforms:
pnpm export:figma --all
```

Import `dist/figma/Podcast-Apps.fig` into Figma. Each platform has its own named
component set with a **Shape** property: **Square** or **Circle**. Both variants
are 32 × 32. The default collection has 65 component sets and 130 variants.
Use Figma's Scale tool to resize instances.

Each component set has a clickable documentation link to the platform's `url`
from `platforms/<id>/meta.json`, labeled with the platform name and “website”.
The sets match the supplied `component-set-example.fig`: native Figma variant-set
metadata, Square/Circle ordering, and a purple dashed outline with 5px corners.
The exporter explicitly writes Figma's `isStateGroup` and
`stateGroupPropertyValueOrders` fields because OpenPencil 0.16's default writer
only marks newly created component sets through its own plugin metadata.

## Podcast linkapp scope

The default export includes 39 platforms/actions from
[Linktree's published Podcast list](https://linktr.ee/help/en/articles/5471369-supported-platforms-for-music-and-podcast-links)
that are represented in this repository, plus 26 additional destinations.
Sonnet is included. Discontinued services and creator tools from the published
list are not restored. This is a design-library selection, not a claim that
Linktree has implemented the additions or that every service accepts every feed.

The additions are AntennaPod, Anytime Player, Audacy, Castamatic, Downcast,
Fountain, Global Player, Hark, iCatcher, Moon FM, Netflix, Neuecast, Playapod,
Podcast App, Podimo, Podkicker, Podurama, Podverse, Queue, Radio Thmanyah,
RSSRadio, SiriusXM, Snipd, TrueFans, Xiaoyuzhou, and Yoto. Evidence covers public
show links, feed subscription links, app URL schemes, and official podcast
catalogs. Queue, Neuecast, Netflix, and Yoto are included by explicit user request.
App-only schemes and subscription/market restrictions still need integration handling.

[figma-podcast-linkapp.json](figma-podcast-linkapp.json) records the selection,
sources, and exclusions, reviewed October 17, 2026. Research/discovery services,
hosting tools, email utilities, and unrelated or narrowly focused ecosystems are
outside this export except for the explicitly included Netflix and Yoto.
Airshow and ’sodes are held for verification
of a show/feed handoff; this does not mark them discontinued. New repository
platforms stay out until explicitly added to the manifest. Queue and Neuecast
are included while verification of their show/feed handoffs remains pending.

gPodder, podStation, CurioCaster, Wavlake, PodLP, Parasocial, Podcast Parrot,
and Metacast are excluded from this scope by explicit user request. They remain
in the full repository catalog; exclusion does not mark them discontinued.

`--all` exports all 86 active repository platforms (172 variants) to
`dist/figma/Podcast-Apps-All.fig`. `--out` works with either scope. The website
and icon packages continue to use the full catalog.

## Artwork and verification

Apple Podcasts is the only raster exception, in both the default and `--all`
exports. It embeds the existing 1024 × 1024 Liquid Glass PNG masters:

- `packages/refraction/assets/apple.png` for **Square**, retaining Apple's native
  squircle silhouette rather than modifying the artwork to fill square corners.
- `packages/refraction/assets/apple-circle.png` for **Circle**, rendered for watchOS.

Both remain in the Apple Podcasts component set and display at 32 × 32. Their
original resolution, transparency, and image bytes are preserved in the `.fig`.
These are native renders from the repository's `ApplePodcasts.icon` bundle;
they are not the App Store comparison rasters. If the masters are missing, run
`node pipeline/build-assets.mjs --only apple` before exporting. The exporter
fails rather than substituting vector artwork for Apple.

Every other platform uses editable vector artwork. The command rebuilds the
Vector package first, including platform-specific Circle
scale and alignment choices. RSS and iCatcher use the safe-area policy saved
inside their `.icon` bundles; codegen synchronizes their Vector Circle sources.
It outlines every SVG stroke before transforms and preserves its paint, caps,
and joins. This includes inherited strokes on reused shapes. The source SVGs
retain their authored strokes. It imports paths, gradients, clipping and masks as
editable vector layers. All generation is
local and requires no Figma account or API token.

Alongside the `.fig`, it writes:

- `.png`: a preview rendered from the serialized file after reading it back.
- `.json`: scope, inclusion/exclusion reasons, source assets and their raster/vector
  formats, embedded image hashes and dimensions, counts, and SVG filters approximated as native
  effects. Complex shadows on Castro, Queue, and Tunestr may differ from the SVG.

The export validates each platform's native Figma component-set flag, variant
ordering, documentation link, outline, and two Shape variants.
After serialization, only Apple's two variants may contain image fills, and their
embedded PNG bytes must match the source masters exactly. All other artwork must
remain vector, without live vector strokes. The exporter uses the pinned OpenPencil `.fig`
writer; these checks verify its round trip, not an import into Figma itself.

Run the mask and gradient regression checks with:

```sh
node --test pipeline/figma-svg.test.mjs pipeline/figma-component-set.test.mjs
```
