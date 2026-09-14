# refraction (monorepo)

Podcast platform icons in three facets — flat vectors, badges, Liquid
Glass — plus the directory website.

## Commands

- `pnpm install` — workspace install
- `pnpm --filter @podlink/icons build` — codegen + static SVGs + lib
- `pnpm --filter @podlink/icons test` — vitest (runs codegen first)
- `pnpm dev` — website on :4173 (runs data/asset/api generation first)
- `node pipeline/validate.mjs` — structural validation (any platform)
- `node pipeline/build-assets.mjs` — render Liquid Glass rasters (macOS + Icon Composer ONLY)

## Architecture

```
platforms/<id>/            ← SOURCE OF TRUTH, one folder per platform
  meta.json                  name, url, categories, aliases, guidelinesUrl,
                             flatSource (official | drawn: icon.svg provenance),
                             liquidGlass.bundles[] (slug/title/variant/file/
                             recipe/rmse/hasDark)
  icon.svg                   flat 32×32 (viewBox "0 0 32 32")
  badge.svg[, badge-dark]    badge artwork
  <Name>.icon/               Liquid Glass bundles (Icon Composer format)

packages/icons             @podlink/icons (published). Its codegen ASSEMBLES
                           src/data/platforms.json from platforms/*/meta.json
                           (lib fields only) — that file is generated+ignored.
packages/refraction        @podlink/refraction (private) — render staging +
                           release-tag holder. assets/ + manifest.json
                           generated, gitignored; releases upload to R2 via
                           pipeline/upload-assets.mjs and serve from
                           https://assets.icons.podlink.com/<version>/
                           (immutable prefixes; version = the release).
packages/engine            refraction-engine (private) — procedural engine +
                           recipes keyed by bundle slug, plus the glass-to-LUT
                           research tools (tools/, calibration/) that generate
                           engine.mjs and build recipes. Regeneration is
                           byte-stable (see pipeline/README.md); the
                           glass-to-lut skill is the conversion playbook.
apps/web                   Vite + React SPA (Cloudflare static assets,
                           icons.podlink.com — zero server code). Reads
                           lib/platforms.gen.json (pipeline/build-data.mjs).
                           Serves the static JSON API from public/api/
                           (generated).
pipeline/                  lib.mjs (readPlatforms/readBundles) + generators.
```

## Conventions

- Platform ids: flat lowercase alphanumeric (`pocketcasts`). Bundle
  slugs: platform id, `-variant` suffix for alternates (none today).
- Aliases for old/alternate spellings live in meta.json `aliases`.
- Generated files are NEVER committed: web public/{library,flat,badges,api},
  lib/platforms.gen.json, packages/refraction/{assets,manifest.json},
  packages/icons/{src/generated,src/data/platforms.json,static,dist}.
- Rendering runs ONLY on a maintainer Mac (ictool). CI validates
  structure and builds; it never renders.
- Squircles: three ship — the iOS squircle (ictool's mask on every
  Liquid Glass rendition), and two of ours whose naming is pending:
  the 77.2%-handle path masking the static flats (build-static
  `SQUIRCLE_32`) and the 90.9%-handle path in
  `packages/icons/src/core/shapes.ts` (React shapes, badge plates).
  Geometry and the open inconsistency: pipeline/README.md, "The three
  squircles".
- Color: ictool renders are P3-coded sRGB-gamut content. Everything
  shipped (rasters, engine output) is converted P3→sRGB untagged; only
  the calibration/scoring loop stays in P3 coded space
  (`render.mjs --p3`, engine `colorSpace: "display-p3"`). See
  "Delivery encodings" in pipeline/README.md.
- Distribution: `npm i @podlink/icons` is the one programmatic consumer
  path (flat icons + badges); Liquid Glass icons are downloaded per
  icon from the live site. Asset URLs pin the immutable R2 release
  prefix `https://assets.icons.podlink.com/<version>` (version =
  packages/refraction/package.json; upload with `pnpm release:assets`).
