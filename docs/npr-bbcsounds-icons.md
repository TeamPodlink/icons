# NPR and BBC Sounds icons

Adds canonical IDs `npr` and `bbcsounds` to the main package catalog
(110 IDs). The normal generator includes them in `PlatformId`, core lookup,
React `PlatformIcon` / `PlatformBadge`, and static icons and light/dark badges.
Both badges use the default “Listen on” label. `BBC Sounds` and `bbc-sounds`
resolve to `bbcsounds` through the existing normaliser, so no alias is needed.
Available in the 0.6.0 release; package dependencies are unchanged.

## NPR

Source: https://prod-eks-static-assets.npr.org/chrome_svg/npr-logo-2025.svg,
the logo npr.org loads in its header (the same paths are inlined there as
`<symbol id="icon-npr-logo-color">`). Retrieved 2026-11-26.

- Original SVG SHA-256: `420bdafdc238356468a313b962abe04a9771b3eda5cd75bdb0ea25bb38cae131`.
- All six paths and their fills (#d62021, #237bbd, black, white) are copied
  verbatim. The 3000×1000 logo is scaled uniformly by `26/3000` and translated
  to `(3, 11.6667)`, centred on a full-bleed white plate as on the NPR app icon.
- SHA-256 of the six `d="…"` attributes, newline-joined:
  `1e90b8d6aa3dfa05572097121d07831d0bfb0a66a79541facc1c51a4e66355d1`.

## BBC Sounds

Sources, both from https://www.bbc.co.uk/sounds, retrieved 2026-11-26:

- BBC blocks: the inline `<svg viewBox="0 0 112 32">` in the BBC site header
  (one even-odd path: three squares with the letters cut out).
  `d` SHA-256: `64a4782a761489dcab2678d276caeba422b1ad58a030e409cefecfd82c5e7654`.
- SOUNDS wordmark: the inline `<svg viewBox="0 0 608 111">` in the BBC Sounds
  navigation (one path). `d` SHA-256:
  `8c9f3eb98dfe2179aee5c93a9f65c400aaf5565d74da0f37aa038a1f5f5536a3`.
- Orange: `--color-contrast-accent: #fa6400` in the page's stylesheet.

Composition follows the service's sharing image,
https://ichef.bbci.co.uk/images/ic/raw/p0bwmc67.jpg (SHA-256
`651c3bb44042077d7e6f128ecbb7c6a7aa22a6f5474e330a6f937a7efc94aa2b`), measured
only for proportions: blocks 314 px wide, wordmark 449 px wide, a 34 px gap,
both centred. In the icon the wordmark is 24 units wide (scale `24/608`), the
blocks 16.784 units (scale 0.14985682), the gap 1.817 units, and the lockup is
centred vertically on a full-bleed black plate. Paths are not redrawn or traced.

The site's older touch icon (three orange bars on black) is a PNG only; no
official vector of it was found, so it is not used.

## Review

[Rendered contact sheet](review/npr-bbcsounds.png) shows React's three shapes,
static output, and light/dark badges at 16, 20, 24, 32, 48 and 64px. Both
wordmarks are legible from 24px; at 16–20px they read as the brand shapes only,
as the services' own app icons do.

```sh
pnpm validate
pnpm build
pnpm test
pnpm lint
pnpm exec tsc --noEmit
node scripts/review-social-icons.mjs /tmp/npr-bbcsounds-preview npr,bbcsounds
```

`src/core/npr-bbcsounds.test.ts` checks the original paths and colours by hash,
name lookup and the default “Listen on” badge label.
