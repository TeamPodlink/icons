# Nostr icon

Adds canonical ID `nostr` to the main package catalog (107 IDs).
The normal generator includes it in `PlatformId`, core lookup, React
`PlatformIcon` / `PlatformBadge`, and static icons and light/dark badges.
The default badge reads “Follow on Nostr”. No package version or dependencies
change; consuming applications can adopt it after a separately approved release.

## Vector provenance

Andrea Nicolini (Bembureda)'s [community Nostr icon](https://github.com/mbarulli/nostr-logo)
is explicitly released under [CC0-1.0](https://github.com/mbarulli/nostr-logo/blob/234544f9308c48afe0f4be7c19f1406c7fe9e37c/LICENSE).
[Nostr Design](https://nostrdesign.org/docs/resources/) notes that Nostr has
community icons rather than a single agreed official logo.

Source: [white-on-purple SVG](https://github.com/mbarulli/nostr-logo/blob/234544f9308c48afe0f4be7c19f1406c7fe9e37c/SVG/nostr-icon-white-on-purple.svg), retrieved 2026-10-30.

- Original SHA-256: `164b5a3b1598b4f262e3d13365e4d1cf468632c8fcdeed7729cf24e147aa66db`.
- White glyph path copied verbatim; uniform scale `0.125`, translation
  `(-0.43125, 0.2125)` into the package's 32×32 canvas. No tracing or raster assets.
- Purple `#662482` comes from the author's supplied background. The plate
  fills the canvas and receives the package's square/circle/superellipse mask.
- Opaque purple and white work on both page themes; badge fallback reuses
  the same source without a separate dark variant.

## Review

[Rendered contact sheet](review/nostr.png) compares React's three shapes,
static output, and light/dark badges at 16, 20, 24, 32, 48 and 64px.

```sh
pnpm validate
pnpm build
pnpm test
pnpm lint
pnpm exec tsc --noEmit
node scripts/review-social-icons.mjs /tmp/nostr-preview nostr
```

The existing compatibility fixtures remain unchanged. Tests cover Nostr's
lookup, generated types, React shapes, static outputs and “Follow on” label
while retaining the artwork/export checks for all existing platforms.
