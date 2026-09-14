// Emit the merged platform dataset the website consumes:
// apps/web/lib/platforms.gen.json (gitignored). Run before web dev/build.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
