// Fetch the official store artwork for every bundle that carries a store
// id, into apps/web/public/raster/<slug>.png — the dev-only "Raster" facet
// on the site: the App Store's 1024 marketing icon for an `appStoreId`,
// or, for an Android-only platform with a `playStoreId` (the Play package
// name), Google Play's 512 icon (the listing's og:image at =s512, the
// largest the store serves; normalised to PNG). Generated, gitignored, cached: a file that
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
import sharp from "sharp";
import { readBundles, root } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
const only = flag("--only"), refresh = args.includes("--refresh"), quiet = args.includes("--quiet");
const out = join(root, "apps/web/public/raster");
mkdirSync(out, { recursive: true });

let fetched = 0, kept = 0, failed = 0;
for (const b of readBundles()) {
  if ((!b.appStoreId && !b.playStoreId) || (only && b.slug !== only)) continue;
  const file = join(out, `${b.slug}.png`);
  if (existsSync(file) && !refresh) { kept++; continue; }
  try {
    if (b.appStoreId) {
      const r = await fetch(`https://itunes.apple.com/lookup?id=${b.appStoreId}&country=us`);
      const j = await r.json();
      const art = j.results?.[0]?.artworkUrl512;
      if (!art) throw new Error("no artwork in the lookup result");
      const url = art.replace(/\/[0-9]+x[0-9]+bb\.[a-z]+$/, "/1024x1024bb.png");
      const png = await fetch(url);
      if (!png.ok) throw new Error(`artwork ${png.status}`);
      writeFileSync(file, Buffer.from(await png.arrayBuffer()));
      if (!quiet) console.log(`${b.slug}: ${j.results[0].trackName} (App Store ${b.appStoreId})`);
    } else {
      const r = await fetch(`https://play.google.com/store/apps/details?id=${encodeURIComponent(b.playStoreId)}&hl=en&gl=us`, { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36" } });
      if (!r.ok) throw new Error(`Play listing ${r.status}`);
      const html = await r.text();
      const og = html.match(/<meta property="og:image" content="(https:\/\/play-lh\.googleusercontent\.com\/[^"=]+)/);
      if (!og) throw new Error("no og:image on the Play listing");
      const img = await fetch(`${og[1]}=s512`, { headers: { Accept: "image/png,image/*" } });
      if (!img.ok) throw new Error(`Play icon ${img.status}`);
      // Play serves WebP or PNG by negotiation; keep one format on disk
      writeFileSync(file, await sharp(Buffer.from(await img.arrayBuffer())).png().toBuffer());
      if (!quiet) console.log(`${b.slug}: Google Play ${b.playStoreId}`);
    }
    fetched++;
    await new Promise((res) => setTimeout(res, 1200));
  } catch (e) {
    failed++;
    console.error(`${b.slug}: ${e.message}`);
  }
}
console.log(`store artwork: ${fetched} fetched, ${kept} cached, ${failed} failed → ${out.replace(root + "/", "")}`);
