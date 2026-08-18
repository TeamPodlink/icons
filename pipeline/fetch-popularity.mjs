// Fetch OP3's top-apps query (percent shares of podcast downloads by
// app, https://op3.dev) and write the COMMITTED snapshot
// apps/web/lib/op3-popularity.json — the same committed-snapshot
// convention as icon-spec-survey.json: a maintainer (or the deploy
// workflow) refreshes it explicitly; dev and CI builds read the
// committed baseline and never touch the network.
//
// Shape: { "fetched": "YYYY-MM-DD", "shares": { "<platformId>": <pct> } }
// Only OP3 apps that map to a catalog platform appear; several OP3
// entries may sum into one platform (e.g. iTunes → apple). On any
// fetch/parse failure this exits nonzero WITHOUT touching the existing
// snapshot, so deploys fall back to the committed baseline.
//
// Env: OP3_TOKEN — API token; defaults to OP3's public preview token.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { readPlatforms, root } from "./lib.mjs";

const TOKEN = process.env.OP3_TOKEN || "preview07ce";
const API = `https://op3.dev/api/1/queries/top-apps?token=${TOKEN}`;
const OUT = join(root, "apps/web/lib/op3-popularity.json");

/** Match key: lowercase, non-alphanumerics stripped ("Pocket Casts" → "pocketcasts"). */
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Judgment-call OP3 names → catalog platform ids that normalization
 * alone can't (or shouldn't be trusted to) resolve. iTunes is Apple
 * Podcasts' legacy desktop client — its share SUMS into apple's.
 */
const OVERRIDES = {
  iTunes: "apple",
  "The Podcast App": "podcastapp", // podcast.app; "Podcast.app" also maps here
  "Podcast.app": "podcastapp",
  "Pocket Casts": "pocketcasts",
  "RSS Radio": "rssradio",
  "Player FM": "playerfm",
  iCatcher: "icatcher",
  "Podcast Addict": "podcastaddict",
  "Podcast Guru": "podcastguru",
  "Podcast Republic": "podcastrepublic",
  MoonFM: "moonfm",
  "Anytime Podcast Player": "anytimeplayer",
  "Podkicker Pro": "podkicker",
  "PodLP podcast app for KaiOS": "podlp",
};

/**
 * Known non-podcast-app user agents (browsers, OS media stacks,
 * devices, player libraries, social/mail apps): silently ignored, and
 * excluded from the unmatched-but-plausible FYI list.
 */
const NON_APPS = new Set([
  // Browsers / webviews
  "Chrome", "Safari", "Firefox", "Edge", "Opera", "Brave", "DuckDuckGo",
  "Internet Explorer", "Generic WebKit", "iOS WebView",
  "Safari View Service (SFSafariViewController)",
  // OS media stacks / player libraries / download managers
  "AppleCoreMedia", "stagefright", "Dalvik", "ExoPlayer (Android)",
  "ExoMedia", "Jetpack Media3 (Android)", "Just Audio",
  "react-native-track-player", "GStreamer", "Ktor (kotlin)", "libsoup",
  "ruby", "AndroidDownloadManager", "FileDownloader (Android)",
  "Android License Verification Library", "Free Download Manager",
  "Iframely",
  // Devices / smart speakers / TVs / wearables
  "Alexa-enabled device", "Apple HomePod", "Apple AirPlay",
  "Chromecast device", "Roku", "Sonos", "VictorReader", "Storybutton",
  "LG webOS TV", "LG Player", "Sony PlayStation 5", "Amazon Fire",
  "Bose SoundTouch", "Cinemo Infotainment System", "Garmin Forerunner",
  "Garmin fenix", "Garmin Venu", "Garmin Vivoactive", "Garmin tactix",
  // Social / messaging / mail
  "Facebook", "Twitter", "Instagram", "TikTok", "LinkedIn", "WhatsApp",
  "Discord", "Flipboard", "Apple iMessage", "Apple Mail", "MobileSMS",
  "Microsoft Outlook", "Mozilla Thunderbird",
  // Desktop music players
  "VLC media player", "Windows Media Player", "MusicBee", "MediaMonkey",
  "Rhythmbox", "foobar2000", "mpv", "MPlayer", "Kodi", "Winamp", "Zune",
  "Clementine Music Player", "JRiver Media Center", "Audacious",
  "Swinsian", "doubleTwist CloudPlayer",
]);

/** Unmatched entries below this share (%) are too small to bother flagging. */
const FYI_MIN_SHARE = 0.01;

let payload;
try {
  const res = await fetch(API);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  payload = await res.json();
} catch (err) {
  console.error(`fetch-popularity: OP3 fetch failed (${err.message}); snapshot untouched`);
  process.exit(1);
}

const appShares = payload?.appShares;
if (!appShares || typeof appShares !== "object" || Object.keys(appShares).length === 0) {
  console.error("fetch-popularity: unexpected payload (no appShares); snapshot untouched");
  process.exit(1);
}

// name/id/alias → platform id index over the catalog.
const catalog = readPlatforms();
const index = new Map();
for (const { id, meta } of catalog)
  for (const key of [id, meta.name, ...(meta.aliases ?? [])])
    index.set(norm(key), id);

const sums = new Map(); // platform id → summed share
const fyi = []; // unmatched but plausibly a podcast app
for (const [name, share] of Object.entries(appShares)) {
  const id = OVERRIDES[name] ?? index.get(norm(name));
  if (id) sums.set(id, (sums.get(id) ?? 0) + share);
  else if (!NON_APPS.has(name) && share >= FYI_MIN_SHARE)
    fyi.push([name, share]);
}

const shares = Object.fromEntries(
  [...sums.entries()]
    .map(([id, share]) => [id, Math.round(share * 1e4) / 1e4])
    .sort(([ia, a], [ib, b]) => b - a || ia.localeCompare(ib))
);

writeFileSync(
  OUT,
  JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), shares }, null, 2) + "\n"
);

console.log(
  `op3-popularity.json: ${Object.keys(shares).length} platforms matched ` +
    `(of ${catalog.length} in catalog, ${Object.keys(appShares).length} OP3 entries)`
);
if (fyi.length) {
  console.error(
    "FYI — unmatched OP3 entries that look like podcast apps we don't carry:"
  );
  for (const [name, share] of fyi.sort((a, b) => b[1] - a[1]))
    console.error(`  ${share.toFixed(3).padStart(7)}  ${name}`);
}
