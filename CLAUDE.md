# @podlink/icons

Podcast platform icons and "Listen on" badges — framework-agnostic SVG strings + React components.

## Commands

- `pnpm build` — full build (codegen → static → lib)
- `pnpm codegen` — generate `src/generated/` from `src/source-icons/`
- `pnpm build:static` — generate `static/icons/` and `static/badges/` from source icons
- `pnpm build:lib` — compile TypeScript library to `dist/`
- `pnpm test` — run tests (vitest, jsdom environment)
- `pnpm clean` — remove all generated/built files

## Architecture

```
src/source-icons/{platform}/   ← SOURCE OF TRUTH for all icon art
  icon.svg                     ← required, 32x32 square icon (viewBox="0 0 32 32")
  badge.svg                    ← optional, badge icon variant (may have different shape/clip)
  badge-dark.svg               ← optional, only if dark badge differs from light

src/data/platforms.json        ← platform metadata (id, display name, active, guidelinesUrl)

scripts/codegen.ts             ← reads source-icons/ → writes src/generated/icons.ts
scripts/build-static.ts        ← reads source-icons/ → writes static/icons/ + static/badges/

src/generated/                 ← GENERATED, gitignored — icon data as TS (rebuilt by codegen)
static/                        ← GENERATED, gitignored — SVG files (rebuilt by build:static)
dist/                          ← GENERATED, gitignored — compiled library (rebuilt by build:lib)

src/core/                      ← framework-agnostic library code
  types.ts                     ← Platform, IconData, IconShape, ShapeDefinition
  platforms.ts                 ← platform lookup from platforms.json
  shapes.ts                    ← superellipse/circle/square shape definitions
  resolve.ts                   ← badge content resolution (dark → light → icon fallback)
  svg.ts                       ← SVG string utilities (extract content, viewBox, prefix IDs)
  index.ts                     ← public API re-exports

src/react/                     ← React components (optional peer dep)
  PlatformIcon.tsx             ← <PlatformIcon platform="spotify" shape="superellipse" />
  PlatformBadge.tsx            ← <PlatformBadge platform="spotify" theme="dark" />
  PodlinkProvider.tsx          ← context provider for default config
```

## Badge system

There are three badge icon categories based on the clip shape baked into badge.svg:

- **Squircle** (15 platforms): badge.svg contains `<clipPath><path d="M16 0C30.545..."/></clipPath>` — iOS-style superellipse
- **Circle** (9 platforms): badge.svg contains `<clipPath><circle cx="16" cy="16" r="16"/></clipPath>`
- **No-clip / glyph** (59 platforms): badge.svg has `viewBox="8 8 24 24"` with raw icon paths, no clipping

The build-static script renders badge.svg content directly (it already has correct clipping). Only icon.svg fallbacks get a squircle mask applied.

24 platforms have a separate `badge-dark.svg` because their dark icon differs from light (color swaps, structural differences). All others use the same badge.svg for both variants.

### Badge text overrides

Most badges say "Listen on {Platform}". Exceptions are configured in `BADGE_TEXT_OVERRIDES` in `build-static.ts`:
- rss → "Get the / RSS Feed"
- subscribebyemail → "Subscribe by / Email"
- subscribeonandroid → "Subscribe on / Android"
- youtube → "Watch on / YouTube"

## Adding a new platform

1. Create `src/source-icons/{id}/icon.svg` (32x32, viewBox="0 0 32 32")
2. Optionally create `badge.svg` if the badge icon needs different clipping than a squircle
3. Optionally create `badge-dark.svg` if the dark variant differs
4. Add entry to `src/data/platforms.json`
5. Run `pnpm build`

## Key conventions

- Source SVGs use `fill="none"` on root `<svg>` when paths use stroke without explicit fill — this is preserved by the build scripts onto nested `<svg>` elements
- IDs in SVG content are prefixed at build time to avoid collisions when multiple icons are embedded
- The `static/` directory is included in the npm package (`files` in package.json) but gitignored — `prepublishOnly` runs the build before publish
- Superellipse ratio: `1.455 / 16` (iOS 26 style squircle)
