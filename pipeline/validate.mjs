// Structural validation for PRs — runs on any platform (no ictool).
// Rendering/visual verification happens on a maintainer's Mac at release.
//
// Usage: node pipeline/validate.mjs

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { readPlatforms, root } from "./lib.mjs";

const BUNDLE_SIZE_CAP = 8 * 1024 * 1024; // 8 MB per .icon bundle
const errors = [];
const err = (m) => errors.push(m);

function dirSize(p) {
  let total = 0;
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const f = join(p, e.name);
    total += e.isDirectory() ? dirSize(f) : statSync(f).size;
  }
  return total;
}

const platforms = readPlatforms();
const slugs = new Set();
let bundleCount = 0;

for (const { id, dir, meta } of platforms) {
  if (!/^[a-z0-9]+$/.test(id)) err(`${id}: folder name must be flat lowercase alphanumeric`);
  if (!meta.name) err(`${id}: meta.json missing "name"`);
  if (meta.url && !/^https:\/\//.test(meta.url)) err(`${id}: url must be https`);
  if (meta.categories && !Array.isArray(meta.categories))
    err(`${id}: categories must be an array`);

  for (const b of meta.liquidGlass?.bundles ?? []) {
    bundleCount++;
    const bid = `${id}/${b.slug ?? "<missing slug>"}`;
    for (const field of ["slug", "title", "file"])
      if (b[field] == null) err(`${bid}: bundle missing "${field}"`);
    if (b.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(b.slug))
      err(`${bid}: bundle slug must be kebab-case`);
    if (b.slug && !b.slug.startsWith(id))
      err(`${bid}: bundle slug must start with the platform id`);
    if (slugs.has(b.slug)) err(`${bid}: duplicate bundle slug`);
    slugs.add(b.slug);

    // darkStatus: measured classification of hasDark:false bundles
    // (pipeline/audit-dark-status.mjs) — "native" (artwork already
    // dark; identical light/dark is correct) or "missing" (dark
    // rendition backlog). Inapplicable when a real dark rendition
    // exists.
    if (b.darkStatus != null && !["native", "missing"].includes(b.darkStatus))
      err(`${bid}: darkStatus must be "native" or "missing"`);
    if (b.darkStatus != null && b.hasDark)
      err(`${bid}: darkStatus is set but hasDark is true (stale audit — rerun audit-dark-status.mjs --write)`);

    const bundle = join(dir, b.file ?? "");
    if (!existsSync(bundle)) {
      err(`${bid}: bundle dir not found: ${b.file}`);
      continue;
    }
    const size = dirSize(bundle);
    if (size > BUNDLE_SIZE_CAP)
      err(`${bid}: bundle is ${(size / 1e6).toFixed(1)} MB (cap 8 MB)`);

    const iconJsonPath = join(bundle, "icon.json");
    if (!existsSync(iconJsonPath)) {
      err(`${bid}: bundle has no icon.json`);
      continue;
    }
    let doc;
    try {
      doc = JSON.parse(readFileSync(iconJsonPath, "utf8"));
    } catch (e) {
      err(`${bid}: icon.json does not parse (${e.message})`);
      continue;
    }
    const assets = new Set(
      existsSync(join(bundle, "Assets")) ? readdirSync(join(bundle, "Assets")) : []
    );
    const names = JSON.stringify(doc).match(/"image-name"\s*:\s*"([^"]+)"/g) ?? [];
    for (const m of names) {
      const file = m.match(/"image-name"\s*:\s*"([^"]+)"/)[1];
      if (!assets.has(file)) err(`${bid}: layer asset missing: Assets/${file}`);
    }

    if (b.recipe) {
      if (!existsSync(join(root, `packages/engine/recipes/${b.slug}.mjs`)))
        err(`${bid}: recipe: true but no recipe module`);
      if (b.rmse == null) err(`${bid}: recipe: true but no rmse recorded`);
    }
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`✓ ${platforms.length} platforms, ${bundleCount} liquid glass bundles validated`);
