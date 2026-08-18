// Emit the merged platform dataset the website consumes:
// apps/web/lib/platforms.gen.json (gitignored). Run before web dev/build.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readPlatforms, root } from "./lib.mjs";

const out = readPlatforms().map(({ id, dir, meta }) => ({
  id,
  name: meta.name,
  active: meta.active !== false,
  url: meta.url ?? null,
  added: meta.added ?? null,
  guidelinesUrl: meta.guidelinesUrl ?? null,
  hasFlat: existsSync(join(dir, "icon.svg")),
  hasBadge: existsSync(join(dir, "badge.svg")),
  bundles: (meta.liquidGlass?.bundles ?? []).map((b) => ({
    slug: b.slug,
    title: b.title,
    variant: b.variant ?? null,
    recipe: b.recipe ?? false,
    rmse: b.rmse ?? null,
    hasDark: b.hasDark ?? false,
    darkStatus: b.darkStatus ?? null,
    source: b.source ?? null,
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
