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
- `node pipeline/vectorize-quiver.mjs --only <slug>` — QuiverAI Image-to-SVG
  trace of a platform's raster (key: QUIVERAI_API_KEY in .env); `--adopt`
  writes the facets. Method: the icon-to-flat-svg skill.

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
- Squircles: two ship — the iOS squircle (ictool's mask on every Liquid
  Glass rendition) and the house squircle (the 10/11 shape in
  `packages/icons/src/core/shapes.ts`: static flats, React components,
  badge plates — `M16 0C30.545 0 32 1.455 32 16S…`). The legacy
  squircle (77.2% handles) was retired 2026-09-14. Geometry:
  pipeline/README.md, "The three squircles".
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
