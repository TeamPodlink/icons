// Classify every hasDark:false bundle's "identical light/dark" state
// into two measured groups, recorded as meta.json `darkStatus`:
//
//   "native"   dark as-is — the artwork is already dark, so identical
//              light/dark renditions are the correct final state.
//   "missing"  light artwork whose Apple-darkened rendition we simply
//              don't have yet (unsplittable art, colorful glyph,
//              knockout design, ...): the dark-variant backlog.
//
// Classification is MEASURED, not eyeballed, from the bundle's own
// 1024 layer composite (canvas fill + placed layer artwork — the same
// composite ictool's raster color-path classifier sees; ledger:
// "Raster layers", pipeline/README.md):
//
//   ringRaw    every pixel of the composite's 1-px border ring is
//              opaque AND has max encoded channel < 0.308 (measured
//              bracket (0.302, 0.314)) — ictool's own dark-artwork
//              gate. ringRaw artwork is dark by Apple's own classifier.
//   meanLuma   mean encoded luminance (Rec. 709 on encoded values)
//              over the composite — the SVG-era whole-background dark
//              law's statistic (bracket (0.282, 0.314)).
//
//   darkStatus = "native"  ⇔  ringRaw OR meanLuma < 0.30
//
// Runs on any platform (no ictool: the composite is built from the
// committed bundle sources via sharp). When a rendered 1024 light
// master exists (packages/refraction/assets/<slug>.png, or --assets
// <dir>), its opaque-area and border-band luminance are reported as
// corroboration — they never enter the verdict.
//
// hasDark:true bundles have a real rendered dark rendition; darkStatus
// does not apply to them (--write removes any stale field). Re-derive
// after adding platforms or reworking artwork:
//
//   node pipeline/audit-dark-status.mjs          report only
//   node pipeline/audit-dark-status.mjs --write  record into meta.json
//   [--only <slug>] [--assets <dir>]
//
// Borderline verdicts (ring max-channel inside (0.28, 0.34) or
// meanLuma inside (0.27, 0.33)) are flagged for per-bundle review.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { readPlatforms, root } from "./lib.mjs";

const CANVAS = 1024;
const RING_BRACKET = 0.308; // measured (0.302, 0.314)
const LUMA_THRESHOLD = 0.3; // SVG-era bracket (0.282, 0.314)

const args = process.argv.slice(2);
const flag = (name) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : null;
const write = args.includes("--write");
const only = flag("--only");
const assetsDir = flag("--assets") ?? join(root, "packages/refraction/assets");

/** Parse an icon.json color string into [r,g,b,a] 0-1 encoded values.
 *  Declared numbers are used as encoded channels regardless of the
 *  srgb/display-p3 coordinate space — the dark gate's bracket is wide
 *  relative to that coding difference. */
function parseColor(str) {
  const num = (s) => Number(s);
  let m;
  if ((m = str.match(/^display-p3:([\d.]+),([\d.]+),([\d.]+)(?:,([\d.]+))?$/)))
    return [num(m[1]), num(m[2]), num(m[3]), m[4] ? num(m[4]) : 1];
  if ((m = str.match(/^srgb:([\d.]+),([\d.]+),([\d.]+)(?:,([\d.]+))?$/)))
    return [num(m[1]), num(m[2]), num(m[3]), m[4] ? num(m[4]) : 1];
  if ((m = str.match(/^gray:([\d.]+)(?:,([\d.]+))?$/)))
    return [num(m[1]), num(m[1]), num(m[1]), m[2] ? num(m[2]) : 1];
  if ((m = str.match(/^#([0-9a-f]{6})$/i))) {
    const v = parseInt(m[1], 16);
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255, 1];
  }
  throw new Error(`unparsed color: ${str}`);
}

/** RGBA buffer (CANVAS²·4) for a canvas fill (solid or 2-stop vertical
 *  linear gradient); null when the bundle declares none. */
function canvasFillBuffer(fill) {
  if (!fill) return null;
  let top, bottom;
  if (typeof fill === "string") top = bottom = parseColor(fill);
  else if (fill["linear-gradient"]) {
    top = parseColor(fill["linear-gradient"][0]);
    bottom = parseColor(fill["linear-gradient"][1]);
  } else return null;
  const buf = Buffer.alloc(CANVAS * CANVAS * 4);
  for (let y = 0; y < CANVAS; y++) {
    const t = y / (CANVAS - 1);
    const px = [0, 1, 2, 3].map((i) =>
      Math.round((top[i] + (bottom[i] - top[i]) * t) * 255)
    );
    for (let x = 0; x < CANVAS; x++) buf.set(px, (y * CANVAS + x) * 4);
  }
  return buf;
}

/** Neutralize CSS Color 4 display-p3 fills for librsvg (which drops
 *  them): encoded-channel rgb() approximation, same convention as
 *  parseColor. */
function preprocessSvg(text) {
  return text.replace(
    /color\(\s*display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)/g,
    (_, r, g, b, a) => {
      const c = [r, g, b].map((v) => Math.round(Number(v) * 255)).join(",");
      return a ? `rgba(${c},${a})` : `rgb(${c})`;
    }
  );
}

/** Rasterize one layer at its placed size per the measured placement
 *  law (1 unit = 1 canvas unit, centered, canvas-clipped; scale
 *  multiplies, translation offsets). Returns a sharp composite spec. */
async function layerComposite(bundlePath, layer) {
  const file = join(bundlePath, "Assets", layer["image-name"]);
  const scale = layer.position?.scale ?? 1;
  const [tx, ty] = layer.position?.["translation-in-points"] ?? [0, 0];
  let img, w, h;
  if (/\.svg$/i.test(file)) {
    const text = preprocessSvg(readFileSync(file, "utf8"));
    const meta = await sharp(Buffer.from(text)).metadata();
    w = Math.round(meta.width * scale);
    h = Math.round(meta.height * scale);
    img = sharp(Buffer.from(text), {
      density: (meta.density ?? 72) * (w / meta.width),
    }).resize(w, h);
  } else {
    const meta = await sharp(file).metadata();
    w = Math.round(meta.width * scale);
    h = Math.round(meta.height * scale);
    img = sharp(file);
    if (scale !== 1) img = img.resize(w, h, { kernel: "nearest" });
  }
  let left = Math.round((CANVAS - w) / 2 + tx);
  let top = Math.round((CANVAS - h) / 2 + ty);
  // canvas-clip
  const cl = Math.max(0, -left);
  const ct = Math.max(0, -top);
  const cw = Math.min(w - cl, CANVAS - Math.max(0, left));
  const ch = Math.min(h - ct, CANVAS - Math.max(0, top));
  if (cl || ct || cw !== w || ch !== h) {
    img = sharp(await img.ensureAlpha().png().toBuffer()).extract({
      left: cl,
      top: ct,
      width: cw,
      height: ch,
    });
    left = Math.max(0, left);
    top = Math.max(0, top);
  }
  return { input: await img.ensureAlpha().png().toBuffer(), left, top };
}

/** Build the bundle's 1024 RGBA layer composite (icon.json order is
 *  top-first; composite bottom-to-top). */
async function buildComposite(bundlePath) {
  const doc = JSON.parse(readFileSync(join(bundlePath, "icon.json"), "utf8"));
  const fill = canvasFillBuffer(doc.fill);
  let base = sharp(
    fill ?? Buffer.alloc(CANVAS * CANVAS * 4), // transparent when undeclared
    { raw: { width: CANVAS, height: CANVAS, channels: 4 } }
  );
  const specs = [];
  const groups = [...(doc.groups ?? [])].reverse();
  for (const g of groups) {
    if (g.hidden) continue;
    for (const layer of [...(g.layers ?? [])].reverse()) {
      if (layer.hidden) continue;
      specs.push(await layerComposite(bundlePath, layer));
    }
  }
  return sharp(await base.composite(specs).png().toBuffer())
    .ensureAlpha()
    .raw()
    .toBuffer();
}

const luma = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** Ring + luminance statistics over a 1024 RGBA buffer. */
function measure(buf) {
  // 1-px border ring
  let ringOpaque = true;
  let ringMax = 0;
  let ringLumaSum = 0;
  let ringN = 0;
  const ringPx = (x, y) => {
    const i = (y * CANVAS + x) * 4;
    if (buf[i + 3] < 255) ringOpaque = false;
    ringMax = Math.max(ringMax, buf[i], buf[i + 1], buf[i + 2]);
    ringLumaSum += luma(buf[i], buf[i + 1], buf[i + 2]);
    ringN++;
  };
  for (let x = 0; x < CANVAS; x++) {
    ringPx(x, 0);
    ringPx(x, CANVAS - 1);
  }
  for (let y = 1; y < CANVAS - 1; y++) {
    ringPx(0, y);
    ringPx(CANVAS - 1, y);
  }
  // whole-composite mean encoded luminance, white-backed where
  // transparent (ictool's undeclared canvas renders light)
  let lumaSum = 0;
  for (let i = 0; i < buf.length; i += 4) {
    const a = buf[i + 3] / 255;
    lumaSum +=
      luma(buf[i], buf[i + 1], buf[i + 2]) * a + (1 - a);
  }
  return {
    ringOpaque,
    ringMax: ringMax / 255,
    ringLuma: ringLumaSum / ringN,
    meanLuma: lumaSum / (CANVAS * CANVAS),
  };
}

/** Corroboration only: opaque-area + border-band luminance of the
 *  rendered light master, when present. */
async function masterStats(slug) {
  const file = join(assetsDir, `${slug}.png`);
  if (!existsSync(file)) return null;
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const BAND = 48;
  let sum = 0,
    n = 0,
    bandSum = 0,
    bandN = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 250) continue;
      const l = luma(data[i], data[i + 1], data[i + 2]);
      sum += l;
      n++;
      if (x < BAND || x >= w - BAND || y < BAND || y >= h - BAND) {
        bandSum += l;
        bandN++;
      }
    }
  return {
    masterLuma: n ? sum / n : null,
    masterBandLuma: bandN ? bandSum / bandN : null,
  };
}

const fmt = (v) => (v == null ? "—" : v.toFixed(3));
const rows = [];
let changed = 0;

for (const { id, dir, meta } of readPlatforms()) {
  let dirty = false;
  for (const b of meta.liquidGlass?.bundles ?? []) {
    if (only && b.slug !== only) continue;
    if (b.hasDark) {
      if (b.darkStatus !== undefined) {
        delete b.darkStatus;
        dirty = true;
      }
      continue;
    }
    const buf = await buildComposite(join(dir, b.file));
    const m = measure(buf);
    const ringRaw = m.ringOpaque && m.ringMax < RING_BRACKET;
    const status = ringRaw || m.meanLuma < LUMA_THRESHOLD ? "native" : "missing";
    const borderline =
      (m.ringOpaque && m.ringMax > 0.28 && m.ringMax < 0.34) ||
      (m.meanLuma > 0.27 && m.meanLuma < 0.33);
    const master = await masterStats(b.slug);
    rows.push({
      slug: b.slug,
      status,
      ringRaw,
      ringOpaque: m.ringOpaque,
      ringMax: m.ringMax,
      ringLuma: m.ringLuma,
      meanLuma: m.meanLuma,
      ...master,
      borderline,
    });
    if (b.darkStatus !== status) {
      b.darkStatus = status;
      dirty = true;
    }
  }
  if (write && dirty) {
    writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
    changed++;
  }
}

console.log(
  "slug".padEnd(16) +
    "status".padEnd(9) +
    "ring".padEnd(6) +
    "ringMax".padEnd(9) +
    "ringLuma".padEnd(10) +
    "meanLuma".padEnd(10) +
    "masterLuma".padEnd(12) +
    "bandLuma".padEnd(10) +
    "flags"
);
for (const r of rows.sort((a, b) => a.slug.localeCompare(b.slug)))
  console.log(
    r.slug.padEnd(16) +
      r.status.padEnd(9) +
      (r.ringRaw ? "raw" : "conv").padEnd(6) +
      fmt(r.ringMax).padEnd(9) +
      fmt(r.ringLuma).padEnd(10) +
      fmt(r.meanLuma).padEnd(10) +
      fmt(r.masterLuma).padEnd(12) +
      fmt(r.masterBandLuma).padEnd(10) +
      (r.borderline ? "BORDERLINE" : "") +
      (r.ringOpaque ? "" : " ring-transparent")
  );
const native = rows.filter((r) => r.status === "native").length;
console.log(
  `\n${rows.length} hasDark:false bundles: ${native} native (dark as-is), ${
    rows.length - native
  } missing${write ? ` — ${changed} meta.json file(s) updated` : " (report only; --write to record)"}`
);
