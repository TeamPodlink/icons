// Copy built rasters + flat SVG icons into the website's public dir for
// local dev and self-contained deploys. Run automatically before web
// dev/build. Non-fatal when a source is missing.

import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { root } from "./lib.mjs";

const jobs = [
  {
    src: join(root, "packages/refraction/assets"),
    dest: join(root, "apps/web/public/library"),
    hint: "node pipeline/build-assets.mjs (macOS)",
  },
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
  console.log(`synced ${src.replace(root + "/", "")} -> ${dest.replace(root + "/", "")}`);
}
