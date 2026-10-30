# PeerTube icon

Adds canonical ID `peertube` to the main package catalog (107 IDs on this branch).
The normal generator includes it in `PlatformId`, core lookup, React
`PlatformIcon` / `PlatformBadge`, and static icons and light/dark badges.
The default badge reads “Watch on PeerTube”. Package version and dependencies
are unchanged. This branch is independent of the unmerged Nostr addition.

## Official artwork and license

Source: `press-kit/peertube-logo.svg` in the [official press kit](https://joinpeertube.org/press-kit.zip),
linked from [PeerTube's website](https://joinpeertube.org/), retrieved 2026-10-30.
The bundled `LICENCE` credits Framasoft and licenses the logo under
[CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
This adaptation uses the same artwork license; the surrounding library code
remains MIT. See the package's `NOTICE.md` for attribution and redistribution terms.

- ZIP SHA-256: `a55860df01d55068e11f81bfae2b4c7203b6d72bbf8697741bbe5fa07ed392e1`.
- SVG SHA-256: `f8e5010f2aa47f59f914b08900a2e238690d0c5aed4dbe246be79eea856dfdcc`.
- All three visible path commands and their transforms are copied verbatim.
- The source colors `#211f20`, `#737373`, and `#f1680d` are unchanged.
- The original 16×22 viewport is centered in a 32×32 white plate using
  `translate(-2791 916)`; scale remains 1. No tracing or raster art.
- Editor metadata, unused CSS and the fully transparent fourth path are removed.
- The existing masks shape the plate. Both badge themes use the same opaque
  source; attribution travels in an SVG comment and the published notice.

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
