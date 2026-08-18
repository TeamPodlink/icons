// Generate the static JSON API served by the website:
//   apps/web/public/api/platforms.json        all platforms
//   apps/web/public/api/platforms/<id>.json   one platform
//
// The shapes match the retired Next /api/platforms routes (query filtering
// retired with the server: consumers fetch the full list and filter
// client-side). Runs after build-data.mjs (it reads platforms.gen.json).
//
// URLs: SITE_URL sets the site origin for flat/badge URLs
// (default http://localhost:4173); Liquid Glass asset URLs come from
// VITE_ASSET_BASE when set (production: the immutable R2 release prefix),
// else <origin>/library.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./lib.mjs";

const OUT = join(root, "apps/web/public/api");
const SITE_URL = process.env.SITE_URL ?? "http://localhost:4173";
const GLASS_BASE = process.env.VITE_ASSET_BASE ?? `${SITE_URL}/library`;

const platforms = JSON.parse(
  readFileSync(join(root, "apps/web/lib/platforms.gen.json"), "utf8")
);

// --- QA-lens categories: keep in sync with debugCategories() in
// apps/web/lib/platforms.ts (the site computes the same lenses).
// Problems-only: every category is an actionable worklist; informational
// facts (provenance, recipe/dark coverage) stay as data fields below. ---
const HAND_DRAWN_SOURCES = new Set([
  "flat-svg",
  "flat-svg-split",
  "flat-svg-browser",
  "flat-svg-raster",
]);

function debugCategories(p, b) {
  const cats = [];
  if (b) {
    if (!b.hasDark && b.darkStatus !== "native") cats.push("missing dark");
    if (b.source && HAND_DRAWN_SOURCES.has(b.source))
      cats.push("hand-drawn art");
  }
  if (!p.hasFlat) cats.push("missing flat");
  if (!p.hasBadge) cats.push("missing badge");
  if (!p.url) cats.push("missing url");
  if (!p.active) cats.push("inactive");
  return cats;
}

const SIZES = [32, 64, 128, 256, 512];
const FORMATS = ["avif", "webp"];
function glassAssets(slug, hasDark) {
  const out = { png1024: `${GLASS_BASE}/${slug}.png` };
  for (const f of FORMATS)
    for (const s of SIZES) out[`${f}${s}`] = `${GLASS_BASE}/${slug}-${s}.${f}`;
  if (hasDark) {
    out.darkPng1024 = `${GLASS_BASE}/${slug}-dark.png`;
    for (const f of FORMATS)
      for (const s of SIZES)
        out[`dark${f[0].toUpperCase()}${f.slice(1)}${s}`] =
          `${GLASS_BASE}/${slug}-dark-${s}.${f}`;
  }
  return out;
}

function platformJson(p) {
  return {
    id: p.id,
    name: p.name,
    url: p.url,
    active: p.active,
    /** Computed QA lenses (problems only): platform-level problems plus
     *  the union over bundles. Not editorial taxonomy. */
    categories: [
      ...new Set([
        ...debugCategories(p, null),
        ...p.bundles.flatMap((b) => debugCategories(p, b)),
      ]),
    ],
    flatIcon: p.hasFlat ? `${SITE_URL}/flat/${p.id}.svg` : null,
    badges: p.hasBadge
      ? {
          light: `${SITE_URL}/badges/${p.id}-light.svg`,
          dark: `${SITE_URL}/badges/${p.id}-dark.svg`,
        }
      : null,
    liquidGlass: p.bundles.map((b) => ({
      slug: b.slug,
      title: b.title,
      variant: b.variant,
      recipe: b.recipe,
      rmse: b.rmse,
      hasDark: b.hasDark,
      darkStatus: b.darkStatus,
      source: b.source,
      assets: glassAssets(b.slug, b.hasDark),
    })),
  };
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "platforms"), { recursive: true });

const list = platforms.map(platformJson);
writeFileSync(join(OUT, "platforms.json"), JSON.stringify(list, null, 2));
for (const p of list)
  writeFileSync(
    join(OUT, "platforms", `${p.id}.json`),
    JSON.stringify(p, null, 2)
  );

console.log(
  `api: ${list.length} platforms -> apps/web/public/api (glass assets: ${GLASS_BASE})`
);
