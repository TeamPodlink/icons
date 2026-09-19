// Fetch the official App Store artwork (the developer's own 1024 marketing
// icon, as the store serves it) for every bundle that carries an
// `appStoreId`, into apps/web/public/raster/<slug>.png — the dev-only
// "Raster" facet on the site. Generated, gitignored, cached: a file that
// exists is kept unless --refresh. Needs the network; a failed lookup is
// reported and skipped so `pnpm dev` keeps working offline.
//
//   node pipeline/fetch-appstore-artwork.mjs [--only <slug>] [--refresh] [--quiet]
//
// The lookup is itunes.apple.com/lookup?id=…; the 512 artwork URL it returns
// is rewritten to the 1024 rendition the ledger's store cross-checks used
// ("Which side is stale: the App Store cross-check", 2026-09-13).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readBundles, root } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
const only = flag("--only"), refresh = args.includes("--refresh"), quiet = args.includes("--quiet");
const out = join(root, "apps/web/public/raster");
mkdirSync(out, { recursive: true });

let fetched = 0, kept = 0, failed = 0;
for (const b of readBundles()) {
  if (!b.appStoreId || (only && b.slug !== only)) continue;
  const file = join(out, `${b.slug}.png`);
  if (existsSync(file) && !refresh) { kept++; continue; }
  try {
    const r = await fetch(`https://itunes.apple.com/lookup?id=${b.appStoreId}&country=us`);
    const j = await r.json();
    const art = j.results?.[0]?.artworkUrl512;
    if (!art) throw new Error("no artwork in the lookup result");
    const url = art.replace(/\/[0-9]+x[0-9]+bb\.[a-z]+$/, "/1024x1024bb.png");
    const png = await fetch(url);
    if (!png.ok) throw new Error(`artwork ${png.status}`);
    writeFileSync(file, Buffer.from(await png.arrayBuffer()));
    fetched++;
    if (!quiet) console.log(`${b.slug}: ${j.results[0].trackName} (${b.appStoreId})`);
    await new Promise((res) => setTimeout(res, 1200));
  } catch (e) {
    failed++;
    console.error(`${b.slug}: ${e.message}`);
  }
}
console.log(`appstore artwork: ${fetched} fetched, ${kept} cached, ${failed} failed → ${out.replace(root + "/", "")}`);
