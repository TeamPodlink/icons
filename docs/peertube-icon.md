# PeerTube icon

Adds canonical ID `peertube` to the main package catalog (107 IDs on this branch).
The normal generator includes it in `PlatformId`, core lookup, React
`PlatformIcon` / `PlatformBadge`, and static icons and light/dark badges.
The default badge reads “Watch on PeerTube”. Package version and dependencies
are unchanged. This branch is independent of the unmerged Nostr addition.

## Original Android app artwork and license

The icon is David Revoy's Sepia mascot from his
[2025-04-15 Sepia-vector source collection](https://www.peppercarrot.com/en/viewer/framasoft__2025-04-15_Sepia-vector_by-David-Revoy.html).
The [source ZIP](https://www.peppercarrot.com/0_sources/0ther/framasoft/zip/2025-04-15_Sepia-vector_by-David-Revoy.zip)
contains `2025-04-15_Sepia-vector.svg`. Retrieved 2026-10-30.
Framasoft's [app-v1 announcement](https://joinpeertube.org/news/app-v1) identifies
this icon as David Revoy's work under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The artwork retains that license; library code remains MIT. Preserve attribution,
source/license links and change notices as documented in `NOTICE.md`.

The composition was visually compared with the official Android app's
[v2.3.0 icon](https://framagit.org/framasoft/peertube/mobile-application/-/blob/v2.3.0/assets/icon_with_background.png)
and its Google Play listing. The mobile repository ships PNGs; this addition
uses the artist's original vectors instead, without tracing or redrawing.
The artist's current gallery also requests no AI-generated derivatives; this
uses the existing human-authored paths without generating artwork.

- ZIP SHA-256: `ce79f01818f27d2765b542bcc10e273812675d65a7996a7989292d2707a4747f`.
- Original SVG SHA-256: `57182ab2a04ac88a6272a45ce3de5be0624e3a748884340767847c927d645a0b`.
- Extracted from `layer2`: plate `rect101607-4` and its mascot/shadow nodes
  `path122936` through `path112826-6-79` (13 consecutive top-level nodes).
- All original geometry, transforms, colors and styles remain. Editor namespace
  attributes are removed. The `linearGradient122954` dependency is retained
  with its unchanged stops resolved from `linearGradient122952`.
- Source plate: `(419.89633, 221.67352, 37.268597, 37.085304)`. Uniform scale
  `32 / 37.268597`; y origin `221.5818735` centers the slightly shorter plate
  inside a square without stretching. An opaque white underlay completes the
  canvas; the authored white plate and shadow remain above it.
- The package's existing masks apply square, circle or superellipse shapes.
  The Android launcher applies its own adaptive mask/inset, so this uses the
  source app-icon composition rather than imitating a particular device launcher.
- No embedded images, external resources or filters are required.

## Verification

[Rendered contact sheet](review/peertube.png) shows React's three shapes, static
output, and both badge themes at 16, 20, 24, 32, 48 and 64px.

```sh
pnpm validate
pnpm build
pnpm test
pnpm lint
pnpm exec tsc --noEmit
node scripts/review-social-icons.mjs /tmp/peertube-preview peertube
```

The original artwork compatibility fixtures are unchanged. The existing tests
now cover PeerTube lookup, typed IDs, all React shapes, static output and badge
label overrides. Consumer PR TeamPodlink/podlink-v3#260 can use
`<PlatformIcon platform="peertube" />`, `<PlatformBadge platform="peertube" />`
and `getIconData('peertube')` after a separately authorized package release.
