// Copy built rasters + flat SVG icons into the website's public dir for
// local dev and self-contained deploys. Run automatically before web
// dev/build. Non-fatal when a source is missing.
//
// When VITE_ASSET_BASE is set (production builds: the site loads Liquid
// Glass rasters from R2), the library copy is skipped — flat icons and
// badges are always copied, since the site serves those itself.

import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./lib.mjs";

const jobs = [
  ...(process.env.VITE_ASSET_BASE
    ? [] // rasters come from VITE_ASSET_BASE, not /library
    : [
        {
          src: join(root, "packages/refraction/assets"),
          dest: join(root, "apps/web/public/library"),
          hint: "node pipeline/build-assets.mjs (macOS)",
        },
      ]),
  {
    src: join(root, "packages/icons/static/icons"),
    dest: join(root, "apps/web/public/flat"),
    hint: "pnpm --filter @podlink/icons build",
  },
  {
    src: join(root, "packages/icons/static/badges"),
    dest: join(root, "apps/web/public/badges"),
    hint: "pnpm --filter @podlink/icons build",
  },
];

for (const { src, dest, hint } of jobs) {
  if (!existsSync(src)) {
    console.warn(`skip: ${src} missing — run \`${hint}\``);
    continue;
  }
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  // MIRROR, don't merge. cpSync only adds and overwrites, so a file the
  // source no longer has would linger here forever — and these dirs are
  // gitignored, so review never sees it while the site still ships it.
  // Measured 2026-09-14: splitting the generic RSS mark out of rssradio
  // left rssradio-{light,dark}.svg in public/badges, a badge for a
  // platform with no badge artwork.
  const keep = new Set(readdirSync(src));
  let swept = 0;
  for (const f of readdirSync(dest))
    if (!keep.has(f)) { rmSync(join(dest, f), { recursive: true, force: true }); swept++; }
  console.log(
    `synced ${src.replace(root + "/", "")} -> ${dest.replace(root + "/", "")}` +
      (swept ? ` (${swept} stale file(s) swept)` : "")
  );
}

// Compare draws into a canvas, so replacing a file at the same URL does
// not rerun its image-loading effect. Content versions refresh both the
// browser image cache and the canvas when any comparison input changes.
const revisions = {};
for (const directory of ["library", "flat", "raster"]) {
  const dir = join(root, "apps/web/public", directory);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).sort()) {
    if (!/\.(png|svg)$/.test(file)) continue;
    revisions[`/${directory}/${file}`] = createHash("sha256")
      .update(readFileSync(join(dir, file))).digest("hex").slice(0, 16);
  }
}
const revisionsFile = join(root, "apps/web/lib/asset-revisions.gen.json");
const revisionsJson = JSON.stringify(revisions, null, 2) + "\n";
if (!existsSync(revisionsFile) || readFileSync(revisionsFile, "utf8") !== revisionsJson)
  writeFileSync(revisionsFile, revisionsJson);
