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
  // added: the platform's first-addition date (mined from git history —
  // the original TeamPodlink/badges repo or this repo). Drives the
  // site's "Sort by latest".
  if (!meta.added) err(`${id}: meta.json missing "added" (YYYY-MM-DD first-addition date)`);
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.added))
    err(`${id}: added must be a YYYY-MM-DD date, got ${JSON.stringify(meta.added)}`);
  if (meta.flatSource !== undefined && !["official", "drawn"].includes(meta.flatSource))
    err(`${id}: flatSource must be "official" or "drawn", got ${JSON.stringify(meta.flatSource)}`);
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
    const layerFiles = [
      ...JSON.stringify(doc).matchAll(/"image-name"\s*:\s*"([^"]+)"/g),
    ].map((m) => m[1]);
    for (const file of layerFiles)
      if (!assets.has(file)) err(`${bid}: layer asset missing: Assets/${file}`);

    // The recorded `source` must match what the bundle actually holds.
    // build-svg-icons.mjs picks between an SVG-layer bundle and a
    // Chrome-raster fallback on a measured RMSE gate, and only the SVG
    // modes go through the dark-variant split — so a bundle that says
    // flat-svg-split while holding a PNG is an icon that silently lost
    // its Dark rendition. (That regression was real: a rasterizer blind
    // to color(display-p3 …) scored honest SVG bundles at RMSE 75-164
    // and diverted them. Fixed at the root 2026-09-13; this is the
    // structural backstop. See the pipeline/README.md ledger.)
    const SVG_LAYER_SOURCES = ["flat-svg", "flat-svg-split", "official-svg"];
    const isSvg = (f) => f.toLowerCase().endsWith(".svg");
    if (SVG_LAYER_SOURCES.includes(b.source) && layerFiles.length) {
      const raster = layerFiles.filter((f) => !isSvg(f));
      if (raster.length)
        err(
          `${bid}: source "${b.source}" promises SVG layers but the bundle ` +
            `has raster layer(s): ${raster.join(", ")} — either the build ` +
            `was diverted to the raster fallback (rerun ` +
            `build-svg-icons.mjs) or the source is mislabelled`
        );
    }
    if (b.source === "flat-svg-browser" && layerFiles.some(isSvg))
      err(
        `${bid}: source "flat-svg-browser" is the raster fallback but the ` +
          `bundle has SVG layer(s): ${layerFiles.filter(isSvg).join(", ")}`
      );

    if (b.recipe) {
      if (!existsSync(join(root, `packages/engine/recipes/${b.slug}.mjs`)))
        err(`${bid}: recipe: true but no recipe module`);
      if (b.rmse == null) err(`${bid}: recipe: true but no rmse recorded`);
    }
  }
}

// The same-triple wrong-space check. An icon.svg that declares
// `color(display-p3 R G B)` whose triple is an exact n/255 in EVERY channel
// is almost certainly an sRGB value written into the wrong colour function:
// Chrome converts P3 -> sRGB and paints something the bundle never shipped.
// 164 of 168 declarations carried this signature before the 2026-09-13
// sweep, and 20 were proven wrong against their rendered masters.
//
// A real wide-gamut colour does not land on n/255 in all three channels, so
// the signature is the cheap half of the test and needs no ictool, no
// masters, and no network — which is why it can live here. The expensive
// half, deciding whether a flagged declaration is ACTUALLY wrong, needs the
// rendered master and lives in pipeline/audit-declared-colors.mjs.
//
// Everything already in the tree is allowlisted, so this is a ratchet: it
// cannot fail on existing artwork, only on newly introduced declarations.
{
  const P3 = /color\(display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g;
  const allowPath = join(root, "pipeline/p3-allowlist.json");
  const allow = existsSync(allowPath)
    ? JSON.parse(readFileSync(allowPath, "utf8")).allow ?? {}
    : {};
  for (const { id, dir } of platforms) {
    for (const f of ["icon.svg", "badge.svg", "badge-dark.svg"]) {
      const p = join(dir, f);
      if (!existsSync(p)) continue;
      const permitted = new Set(allow[`${id}/${f}`] ?? []);
      for (const m of readFileSync(p, "utf8").matchAll(P3)) {
        const v = m.slice(1, 4).map(Number);
        if (!v.every((x) => Math.abs(x * 255 - Math.round(x * 255)) <= 0.02)) continue;
        const key = v.join(" ");
        if (permitted.has(key)) continue;
        const hex = "#" + v.map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
        err(
          `${id}/${f}: color(display-p3 ${key}) is an exact n/255 in every ` +
            `channel — the same-triple signature. Read as sRGB it is ${hex}. ` +
            `Chrome will paint a DIFFERENT colour than that. Either declare ` +
            `${hex}, or confirm it with ` +
            `\`node pipeline/audit-declared-colors.mjs --only ${id}\` and add ` +
            `it to pipeline/p3-allowlist.json`
        );
      }
    }
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`✓ ${platforms.length} platforms, ${bundleCount} liquid glass bundles validated`);
