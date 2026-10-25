# Social and supporter platform icons

Additive 0.4.0 release based on `v0.3.0`, commit
`a1d16f89738b3dc7ee5eec6c34ec8ee849cf3a01`. No dependencies changed.

## Integration

The eleven canonical IDs are `threads`, `bluesky`, `mastodon`, `discord`, `reddit`,
`whatsapp`, `kofi`, `paypal`, `buymeacoffee`, `venmo`, and `cashapp`. All are active
and carry official guideline URLs. The catalog now contains 106 IDs. The existing
95 metadata entries, aliases, icon sources, API exports and rendered outputs
remain unchanged. The normal generator discovers the new 32×32 SVG sources,
adds them to `PlatformId`, and generates core data, static icons and light/dark
badges. React supports square, circle and superellipse at arbitrary sizes.
Generated code, static assets and library bundles remain gitignored.

Like the previous ten additions, these use the existing badge fallback. No
separate badge artwork or dark source is needed because each icon has an opaque
plate. An optional `badgeLabel` metadata field supplies “Follow on” for the six new
social/community services and “Support on” for the five new supporter services.
Static generation and React use it, while existing overrides/defaults are retained.
React callers can still override `label`, including with an empty string. There are no per-icon named
component exports, no separate static circle/square variants, and no standalone
web app on this release branch. GitHub Pages publishes the `static/` build.
The existing preview workflow discovers source directories automatically.

## Official vectors and placement

Retrieved 2026-10-25. Paths are copied verbatim, with uniform scale and translation;
there is no tracing or generated artwork. Root styles are resolved explicitly.

| ID | Official source | Placement on 32×32 |
| --- | --- | --- |
| `threads` | [Threads Brand Resource Center](https://www.meta.com/brand/resources/threads/), `Threads-Brand-Resource-Center/01 White/Logo/threads-logo-white.svg` from its current ZIP (May 2026 refreshed symbol) | White on black; 22 high; translate (6.067670979667, 5), scale 22/1082. Minimum one-quarter-width clear space is retained. |
| `bluesky` | [Official white butterfly SVG](https://bsky.social/about/brand-assets/butterfly/bluesky_media_kit_logo_transparent_3.svg), linked from [Brand Assets](https://bsky.social/about/support/icons) | White on current guideline Blue500 `#0560FF`; scale 1/32, translate (7.125, 8.171875). Butterfly width matches the official square PNG's 1136/2048 ratio. The PNG's older blue is intentionally superseded by the current written palette. |
| `mastodon` | [Official purple SVG](https://joinmastodon.org/logos/logo-purple.svg), linked from [Brand Toolkit](https://joinmastodon.org/branding) | White silhouette on the official `#6364FF` accent plate, with the interior in that same accent. Original path geometry and placement retained: 22 high; translate (5.556962025316, 5), scale 22/79. White-on-accent follows the Brand Toolkit; `logo-white.svg` was checked as a treatment reference. |

Original-file SHA-256:

```text
threads.zip       4528eaccd3f0500fad585bce736f1d84444352f445c0dfbd2ba01e29ec58bf27
threads.svg       2d569c12fb51499e296ebae0178ea928bce5abf4695f31edceee7b3d22d1a894
bluesky-white.svg 12066aa5fc7f451d00c130b1fea88bf5c1d3d33b79048f4a5f2a0da7670c009b
mastodon.svg      7364fa0c83fcbf9220f80b1ea5ca3b118ca5f8807178b5e75267a0a6c48133e7
```

`NOTICE.md` ships with the package and records ownership and applicable policies.
Bluesky's `ASSETS.md` at official repository commit
`4e4ad9c5f5cc584bd06473ab6f16318fd0bd8465` expressly excludes its marks from MIT.
Its older embed SVG was investigated but not used. Consumers remain responsible
for brand context and external clear space. Mastodon's 36px guideline and
Bluesky's external clear-space rule cannot be enforced inside a small icon API.
The marks are service identifiers, not @podlink branding or endorsement.

## Verification

`released-0.3.0.json` was captured from an unmodified build of the exact release
commit before edits. Do not refresh it to accommodate artwork regressions.
The compatibility test pins all 95 metadata records, core data, public exports,
1,995 React renders (three shapes, five icon sizes, two badge themes) and all
285 existing static files. The original 0.2.0 consumer compatibility suite is
also retained, including the approved gPodder/Podurama corrections.

```sh
pnpm validate
pnpm build
pnpm test
pnpm lint
pnpm exec tsc --noEmit
node scripts/review-social-icons.mjs ../artifacts/social-preview
```

The visual review uses the built package and installed Chrome with a fresh
isolated profile, checks image decode and Display-P3 support, and saves HTML,
PNG, and JSON verification results. All eleven icons appear at 16/24/32/48/64px (Venmo uses 20px instead of 16px),
in each React shape and the existing static mask, on both white and dark
backgrounds. Static and React badges are shown in both themes. The legacy
static mask differs from the React default; this pre-existing behavior remains.

Final local result: 451 tests in eight files passed; SVG validation returned zero
errors/warnings; full build, ESLint and TypeScript checks passed. The browser
decoded all 462 preview images. Manual review found no clipping or missing
fills at the sampled sizes. All 285 old static files remain byte-identical.
The local npm archive contains 318 static SVGs, NOTICE, ESM/CJS and both
declaration formats. Imports and 330 new React icon and 132 badge render variants passed from the
actual extracted archive. The release candidate manifest reads 0.4.0. Generated assets are rebuilt by the
existing `prepublishOnly` lifecycle before publication.

Mastodon color revision: only its fills and obsolete gradient definition changed.
Its original paths and placement are preserved. Compared with the first social
candidate, all other 97 icon data objects and 291 static SVGs are byte-identical.
The full checks and visual inspection above passed again after this revision.

## Additional official sources

The eight later additions preserve the approved Threads/Bluesky/Mastodon
artwork exactly, including Mastodon white on #6364FF. The separate
`approved-social-icons.json` fixture pins those three icons and their React artwork with the original label.
The requested badge wording change is tested separately against actual outlined text. `Ko-fi`, `Buy Me a Coffee`,
`Cash App`, and capitalized brand names already resolve through the existing
normalizer; no new alias table entries are necessary. Telegram, Supercast and
Fourthwall were not added. Existing Patreon/Substack were retained.

| ID | Original official vector | Treatment |
| --- | --- | --- |
| discord | `Discord_Symbol_White/Discord-Symbol-White.svg` in the white-symbol ZIP linked by https://discord.com/branding | 22px wide white symbol on #5865F2. |
| reddit | `Reddit_Icon_FullColor_Bleed.svg`, https://redditbrand.lingoapp.com/s/PXzmWE?v=46, Social → Share icons | Exact 256px full-bleed artwork scaled 1/8; all gradients retained. The published guidelines permit circular and square framing. |
| whatsapp | `Brand Resource Center Page Downloads/01_Glyph/01_Digital RGB/03_SVG/Digital_Glyph_White_RGB_2026.svg` in the official Meta pack | 22px white glyph on #25D366 from its green counterpart. |
| kofi | `kofi_brandasset/kofi_symbol.svg` from https://storage.ko-fi.com/cdn/brandasset/v2/kofi_brandasset.zip | 24px wide cup with original black/white/orange on #72A5F2, matching the official blue palette and supporter badge. |
| paypal | https://www.paypalobjects.com/marketing/web/logos/paypal-mark-color_new.svg, linked by the official home page | Current Android listing colors: #0E319F plate, #B9C6EA rear P, #FFFFFF front P, #EAEEF9 overlap; original glyph paths and 22px height retained. |
| buymeacoffee | `SVG Files/bmc-logo.svg` in the Dropbox kit linked from https://buymeacoffee.com/brand | 24px high vector on its native #FFDD00 yellow. |
| venmo | `Venmo Logos and Guidelines/Venmo_Monogram.ai` from https://newsroom.paypal-corp.com/download/Venmo_Logos_and_Guidelines.zip | Direct vector conversion using `pdftocairo -svg`, original layout scaled 0.032; #008CFF resolved from supplied guidelines. |
| cashapp | `SVG (RGB)/RGB_CashApp_Symbol.svg` from https://cash-f.squarecdn.com/static/press-kits/logos-2025-06.zip | Original paths scaled 32/210, matching #00E013 plate behind the native rounded background. |

CSS class fills are resolved into explicit SVG attributes; IDs and their
references are namespaced before generation. SVG geometry is unchanged except
for the documented uniform transforms. No raster imagery is embedded. Venmo's
PDF-compatible Illustrator artwork is converted mechanically by Poppler; the
conversion preserves curves without tracing. Original files remain in the
local review artifacts. All new icons use the existing opaque-plate badge fallback.
Static and React badges now use the per-platform default label described above;
React users can still supply custom labels.
These files are destination identifiers, not functional payment controls.

Venmo's supplied minimum 10px monogram width requires this plated icon to be at
least 20px. Its contact-sheet samples begin at 20px; generated static icons are
32px and badges use a 24px icon. React consumers must use `size >= 20` for icons
and `height >= 34` for badges. Consumers provide
surrounding clear space and any required brand context. Brand restrictions,
including Reddit commercial licensing and Venmo marketing approval rules,
are recorded in the packaged NOTICE; no additional owner permission is claimed.

Source SHA-256 and exact placement (translate x/y; uniform scale):

```text
discord        de4cc484cdc0e3a8f3a58a84b0c80c5ac8acefeebf730930545ff3b279b5d0a3  (5, 7.66166577177); 0.173715296421
reddit         b4b5a80b2b6b5f9735328a10b0fe122b5eae221cd885d67bbf538f01da347946  (0, 0); 0.125
whatsapp       7fb054c0f4bea644b4a4a014d6d8581aad7e6dcb639049d17a578dc44f8e6fd4  (5, 5); 0.0305555555556
kofi           f5a2d5f1abb5c7f13392ecf6e7d5dffc8bef77917ab59c28a6080deab52f5078  (4, 6.34024896266); 0.0995850622407
paypal         8766a4211434d2c318fbfa412ea9633b385ecf1cab6119f8894019d91ed7e027  (3.4204, 3.53333333333); 0.488888888889
buymeacoffee   94c3b0f6e002f33ee9dc742cd48d5e767eef84ca876fac27573519e40e3b7bba  (7.70602032838, 4); 0.0187646598905
venmo          344165d51a2ef3716011e91ce34061f4af67954338847f3f6f3e3f09954fdb3d  (0, 0); 0.032
cashapp        9933135a3860b02308c0635703338bebe065dfa62677a62e1615ec7cdf45be99  (0, 0); 0.152380952381
```

The Venmo hash above is the mechanically converted SVG. Original Illustrator SHA-256: `6ed20d1f7fc93959316111ed16414a44dad6444ffb0734ead6f0f764f6456121`.

## Badge wording and colored-background revision

Only the eleven new metadata entries receive `badgeLabel`; the generator keeps
its pre-existing text overrides and all other platforms' fallback behavior.
React resolves explicit `label` first, then metadata, then “Listen on”. Tests
inspect the actual generated text outlines in both static themes, visible and
accessible React labels, custom/empty overrides, and the unchanged release fixtures.
The original 95-platform fixture is never regenerated.

Ko-fi's original cup, outline and heart are unchanged. Its plate is #72A5F2,
listed in the official [brand palette](https://more.ko-fi.com/brand-assets) and
shown in `support_me_on_kofi_badge_blue.png` in the downloaded creator kit.
The actual supplied blue badge was visually inspected before the vector edit.

PayPal retains its existing path geometry, clipping and transforms. The colors
now match the actual current Android app icon, superseding the SDK reverse palette:

| Element | Color | Sample coordinate in the 512px PNG |
| --- | --- | --- |
| Plate | #0E319F | (256, 20) |
| Rear / upper-left P | #B9C6EA | (200, 100) |
| Front / lower-right P | #FFFFFF | (300, 300) |
| Overlap | #EAEEF9 | (280, 180) |

Verified 2026-10-25 against PayPal Mobile's official Google Play listing for
`com.paypal.android.p2pmobile`: [US](https://play.google.com/store/apps/details?id=com.paypal.android.p2pmobile&hl=en_US&gl=US)
and [UK](https://play.google.com/store/apps/details?id=com.paypal.android.p2pmobile&hl=en_GB&gl=GB).
Both listing HTML files resolve to the same [original-size icon asset](https://play-lh.googleusercontent.com/9SeHb3IaNFm7sXRQmWZaL5MHqVn4qcBGz12sPgjBisZCFMyZPOCXUFOZIttUu-CiTqQz3alXL7jxxGW1Y4fn=s0-br30).
The PNG was opened and visually inspected; flat interior pixels and dominant-color
counts confirm each layer, rather than inferring colors from another logo variant.
It is 512×512 RGBA with no embedded color profile. Both downloaded files have
SHA-256 `760da9ff91bf552cc5a840d7e1c19a2f29003bab8ee237e0daa6cb0b345a5bfb`.
The listing reports an app update on October 16, 2026; that date does not prove
when the icon itself changed. This verifies the US/UK store artwork at retrieval,
not every region, installed APK, Android themed icon or launcher treatment.

Only SVG fill values changed. No pixels were traced or embedded, and no generative
art was used. The original monogram vector geometry remains from PayPal's hosted
SVG; its current Android palette is applied with the existing Podlink sizing and
shape masks. The downloaded listing PNG is a reference, not a shipped asset.
