// Copy built rasters + flat SVG icons into the website's public dir for
// local dev and self-contained deploys. Run automatically before web
// dev/build. Non-fatal when a source is missing.
//
// When VITE_ASSET_BASE is set (production builds: the site loads Liquid
// Glass rasters from R2), the library copy is skipped — flat icons and
// badges are always copied, since the site serves those itself.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
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
