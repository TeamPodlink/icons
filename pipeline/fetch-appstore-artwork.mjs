// Fetch the official store artwork for every bundle that carries a store
// id, into apps/web/public/raster/<slug>.png — the dev-only "Raster" facet
// on the site: the App Store's 1024 marketing icon for an `appStoreId`,
// or, for an Android-only platform with a `playStoreId` (the Play package
// name), Google Play's 512 icon (the listing's og:image at =s512, the
// largest the store serves; normalised to PNG). Generated, gitignored, cached: a file that
// exists is kept unless --refresh. Needs the network; a failed lookup is
// reported and skipped so `pnpm dev` keeps working offline.
//
//   node pipeline/fetch-appstore-artwork.mjs [--only <slug>] [--ios-only] [--refresh] [--quiet] [--report <path>]
//
// Prefer the icon displayed on the current App Store page: the lookup API
// can still return an older rendition after the page adopts Liquid Glass.
// Fall back to the lookup rendition if the page cannot be read, and record
// that fallback in the optional provenance report.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import sharp from "sharp";
import { readBundles, root } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
const only = flag("--only"), refresh = args.includes("--refresh"), quiet = args.includes("--quiet");
const iosOnly = args.includes("--ios-only"), reportPath = flag("--report");
const report = { fetchedAt: new Date().toISOString(), entries: [] };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function get(url) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (response.status === 429 && attempt < 2) {
      const retryAfter = response.headers.get("retry-after");
      const retryMs = retryAfter == null ? 0 : /^\d+$/.test(retryAfter)
        ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
      // Do not retry sooner than a server-specified cooldown. If it asks
      // for more than a minute, report this source as unavailable.
      if (retryMs > 60_000) {
        await response.body?.cancel();
        throw new Error(`HTTP 429 (Retry-After ${retryAfter}): ${url}`);
      }
      const delay = retryMs > 0 ? retryMs : 10_000 * (attempt + 1);
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response;
  }
}

function fullSizeAppStoreArt(url) {
  const parsed = new URL(url.replaceAll("&amp;", "&"));
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".mzstatic.com")) {
    throw new Error("unexpected App Store artwork host");
  }
  if (!/\/\d+x\d+[^/]*\.(png|jpg|jpeg|webp)$/.test(parsed.pathname)) {
    throw new Error("unrecognized App Store artwork rendition");
  }
  parsed.pathname = parsed.pathname.replace(/\/[^/]+$/, "/1024x1024bb.png");
  return parsed.href;
}

async function pixelComparison(before, after) {
  if (!before) return null;
  const [a, b] = await Promise.all([before, after].map((bytes) =>
    sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    return { pixelsChanged: true, dimensionsChanged: true };
  }
  let squared = 0, differingPixels = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    let changed = false;
    for (let c = 0; c < 4; c++) {
      const delta = a.data[i + c] - b.data[i + c];
      squared += delta * delta;
      changed ||= delta !== 0;
    }
    if (changed) differingPixels++;
  }
  return { pixelsChanged: differingPixels > 0, differingPixels, rgbaRmse: Math.sqrt(squared / a.data.length) };
}
const out = join(root, "apps/web/public/raster");
mkdirSync(out, { recursive: true });

let fetched = 0, kept = 0, failed = 0;
for (const b of readBundles()) {
  if ((!b.appStoreId && !b.playStoreId) || (iosOnly && !b.appStoreId) || (only && b.slug !== only)) continue;
  const file = join(out, `${b.slug}.png`);
  if (existsSync(file) && !refresh) { kept++; continue; }
  try {
    if (b.appStoreId) {
      const country = b.appStoreCountry ?? "us";
      const lookupUrl = `https://itunes.apple.com/lookup?id=${b.appStoreId}&country=${encodeURIComponent(country)}`;
      const r = await get(lookupUrl);
      const j = await r.json();
      const app = j.results?.[0];
      const art = app?.artworkUrl512;
      if (!art) throw new Error("no artwork in the lookup result");
      const pageUrl = `https://apps.apple.com/${encodeURIComponent(country)}/app/id${b.appStoreId}`;
      let url, fallbackReason;
      try {
        const html = await (await get(pageUrl)).text();
        // Select the primary app-icon container, not screenshot or
        // recommendation pictures. Ignore social/JSON-LD
        // images: those can retain the same stale asset as the lookup API.
        const icon = html.match(/<div\b[^>]*class="app-icon\s[^">]*"[^>]*>([\s\S]*?<\/picture>)/i)?.[1];
        const picture = icon?.match(/<picture\b[^>]*>[\s\S]*?<\/picture>/i)?.[0];
        const src = picture?.match(/\bsrcset="([^"\s,]+)/i)?.[1];
        if (!src) throw new Error("no primary icon in App Store page");
        url = fullSizeAppStoreArt(src);
      } catch (e) {
        fallbackReason = e.message;
        url = fullSizeAppStoreArt(art);
        console.error(`${b.slug}: using lookup fallback (${fallbackReason})`);
      }
      const bytes = Buffer.from(await (await get(url)).arrayBuffer());
      const metadata = await sharp(bytes).metadata();
      if (metadata.format !== "png" || metadata.width !== 1024 || metadata.height !== 1024) {
        throw new Error("App Store artwork is not a 1024×1024 PNG");
      }
      const before = existsSync(file) ? readFileSync(file) : null;
      const comparison = reportPath ? await pixelComparison(before, bytes) : null;
      const temporary = `${file}.${process.pid}.tmp`;
      try {
        writeFileSync(temporary, bytes);
        renameSync(temporary, file);
      } finally {
        rmSync(temporary, { force: true });
      }
      report.entries.push({ slug: b.slug, appStoreId: b.appStoreId, country, status: "fetched",
        source: fallbackReason ? "lookup-fallback" : "app-store-page", fallbackReason,
        trackName: app.trackName, version: app.version, currentVersionReleaseDate: app.currentVersionReleaseDate,
        lookupUrl, pageUrl, artworkUrl: url, lookupArtworkUrl: fullSizeAppStoreArt(art),
        previousSha256: before ? hash(before) : null, sha256: hash(bytes), ...comparison });
      if (!quiet) console.log(`${b.slug}: ${app.trackName} (App Store ${b.appStoreId}; ${fallbackReason ? "lookup fallback" : "page icon"})`);
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
    await new Promise((res) => setTimeout(res, b.appStoreId ? 3000 : 1200));
  } catch (e) {
    failed++;
    report.entries.push({ slug: b.slug, appStoreId: b.appStoreId, status: "failed", error: e.message });
    console.error(`${b.slug}: ${e.message}`);
  }
}
if (reportPath) writeFileSync(reportPath, JSON.stringify({ ...report, fetched, kept, failed }, null, 2) + "\n");
console.log(`store artwork: ${fetched} fetched, ${kept} cached, ${failed} failed → ${out.replace(root + "/", "")}`);
