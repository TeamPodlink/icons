// Emit the merged platform dataset the website consumes:
// apps/web/lib/platforms.gen.json (gitignored). Run before web dev/build.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readPlatforms, root } from "./lib.mjs";

// Committed OP3 download-share snapshot (pipeline/fetch-popularity.mjs).
const popularityPath = join(root, "apps/web/lib/op3-popularity.json");
const op3 = existsSync(popularityPath)
  ? JSON.parse(readFileSync(popularityPath, "utf8"))
  : { shares: {}, adjustments: {} };
const popularity = op3.shares ?? {};
// Rank order: curated pins (adjustments, cited in the snapshot) occupy
// their pinRank positions; measured platforms follow by share desc.
const pinned = Object.entries(op3.adjustments ?? {}).sort(
  (a, b) => a[1].pinRank - b[1].pinRank
);
const measured = Object.entries(popularity)
  .filter(([id]) => !(op3.adjustments ?? {})[id])
  .sort((a, b) => b[1] - a[1])
  .map(([id]) => id);
for (const [id, adj] of pinned)
  measured.splice(Math.max(0, adj.pinRank - 1), 0, id);
const popularityRank = Object.fromEntries(measured.map((id, i) => [id, i + 1]));

// Facet-drift snapshot (pipeline/audit-facet-drift.mjs --write): central
// RMSE between the light Liquid Glass master and the flat, per bundle slug.
// Optional — absent until the audit has been run with --write.
const driftPath = join(root, "apps/web/lib/facet-drift.json");
const drift = existsSync(driftPath) ? JSON.parse(readFileSync(driftPath, "utf8")).central ?? {} : {};
// Drift-diagnosis snapshot (pipeline/audit-drift-diagnosis.mjs --write):
// per bundle slug, what the residual is (primary cause + all causes).
// Drives the dev-only "drift: …" lenses. Optional.
const diagPath = join(root, "apps/web/lib/drift-diagnosis.json");
const diagnosis = existsSync(diagPath) ? JSON.parse(readFileSync(diagPath, "utf8")).bundles ?? {} : {};

// Which of a platform's facets carry raster (pixel) assets rather than
// vectors: a Liquid Glass bundle whose Assets/ holds anything but SVG, or
// a flat/badge SVG that embeds an <image>. Drives the dev-only "raster
// elements" lens — the vectorisation backlog.
const svgHasImage = (file) =>
  existsSync(file) && /<image\b/i.test(readFileSync(file, "utf8"));
function rasterFacets(dir, meta) {
  const facets = [];
  const bundles = meta.liquidGlass?.bundles ?? [];
  if (
    bundles.some((b) => {
      const assets = join(dir, b.file, "Assets");
      return (
        existsSync(assets) &&
        readdirSync(assets).some((f) => !f.startsWith(".") && !/\.svg$/i.test(f))
      );
    })
  )
    facets.push("glass");
  if (svgHasImage(join(dir, "icon.svg"))) facets.push("flat");
  if (svgHasImage(join(dir, "badge.svg")) || svgHasImage(join(dir, "badge-dark.svg")))
    facets.push("badge");
  return facets;
}

const out = readPlatforms().map(({ id, dir, meta }) => ({
  id,
  name: meta.name,
  active: meta.active !== false,
  aliases: meta.aliases ?? [],
  url: meta.url ?? null,
  added: meta.added ?? null,
  popularity: popularity[id] ?? null,
  popularityRank: popularityRank[id] ?? null,
  guidelinesUrl: meta.guidelinesUrl ?? null,
  hasFlat: existsSync(join(dir, "icon.svg")),
  hasBadge: existsSync(join(dir, "badge.svg")),
  flatSource: meta.flatSource ?? null,
  rasterFacets: rasterFacets(dir, meta),
  bundles: (meta.liquidGlass?.bundles ?? []).map((b) => ({
    slug: b.slug,
    title: b.title,
    variant: b.variant ?? null,
    recipe: b.recipe ?? false,
    rmse: b.rmse ?? null,
    hasDark: b.hasDark ?? false,
    darkStatus: b.darkStatus ?? null,
    source: b.source ?? null,
    drift: drift[b.slug] ?? null,
    diagnosis: diagnosis[b.slug] ? { primary: diagnosis[b.slug].primary, causes: diagnosis[b.slug].causes } : null,
  })),
}));

mkdirSync(join(root, "apps/web/lib"), { recursive: true });
writeFileSync(
  join(root, "apps/web/lib/platforms.gen.json"),
  JSON.stringify(out, null, 2) + "\n"
);
const glass = out.reduce((n, p) => n + p.bundles.length, 0);
console.log(
  `platforms.gen.json: ${out.length} platforms, ${glass} liquid glass bundles`
);
