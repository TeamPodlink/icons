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
//              opaque AND passes ictool's own dark-artwork gate, which
//              is a hue-dependent CHROMA bound, not a brightness
//              threshold (measured 2026-09-13, probe-ring-law.py;
//              ledger: "The ring law is a hue-dependent chroma bound"):
//
//                  max(c) < 0.308
//                  AND max(c) − min(c) < CHROMA_BY_HUE[hue(c)]
//
//              The gate is genuinely non-monotone — (0.08, 0.30, 0.08)
//              renders raw while (0, 0.116, 0), dimmer in every
//              channel, converts — so the old "max encoded channel <
//              0.308" was optimistic for saturated rings: on 400 random
//              dark canvases it claimed raw 29 times where ictool
//              converts. The table is read at the lower of the two
//              bracketing hue samples, making this an inner bound: 0
//              unsound over the same 400.
//   meanLuma   mean encoded luminance (Rec. 709 on encoded values)
//              over the composite — the SVG-era whole-background dark
//              law's statistic (bracket (0.282, 0.314)).
//
//   darkStatus = "native"  ⇔  ringRaw OR meanLuma < 0.30
//
// The composite is built in ENCODED sRGB, and so are both statistics
// and their brackets: declared `display-p3` colors are converted
// (p3ToSrgb, measured byte-exact against Chrome), raster layers are
// read as bytes (the measured raster color law), and everything else —
// 63 of 70 bundles' sRGB/gray declarations — is already there. Reading
// P3 components as sRGB bytes, as this script used to, mis-stated a
// saturated color by up to 46/255 and put two coordinate systems in
// one buffer (measured 2026-09-13; see the ledger).
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
// The cap on the max encoded channel. Neutrals flip in (0.3096, 0.3105)
// and no measured direction flips below 0.3086, so the recorded 0.308
// survives the re-measurement — it is the CHROMA bound below that the
// recorded law was missing.
const RING_CAP = 0.308;

// Chroma bound at 2.5° hue steps, measured on the S=1 circle where chroma
// IS the max channel (probe-ring-law.py --section hue). Entries near 0.311
// are hues where no chroma bound binds before the cap. 2.5° and not 10°:
// the bound climbs 0.09 between hue 205 and 220, and a 10° table read
// conservatively rejects greatpods' own ring color, which renders raw.
const HUE_STEP = 2.5;
const CHROMA_BY_HUE = [
  0.2817, 0.2925, 0.3071, 0.3101, 0.3120, 0.3120,  // 0-12.5
  0.3110, 0.3101, 0.3120, 0.3022, 0.2886, 0.2788,  // 15-27.5
  0.2681, 0.2583, 0.2466, 0.2378, 0.2280, 0.2183,  // 30-42.5
  0.2104, 0.2026, 0.1958, 0.1880, 0.1812, 0.1753,  // 45-57.5
  0.1685, 0.1704, 0.1724, 0.1724, 0.1733, 0.1753,  // 60-72.5
  0.1763, 0.1782, 0.1782, 0.1792, 0.1802, 0.1812,  // 75-87.5
  0.1821, 0.1831, 0.1831, 0.1831, 0.1841, 0.1567,  // 90-102.5
  0.1499, 0.1411, 0.1323, 0.1255, 0.1216, 0.1147,  // 105-117.5
  0.1118, 0.1118, 0.1118, 0.1118, 0.1118, 0.1118,  // 120-132.5
  0.1118, 0.1118, 0.1118, 0.1118, 0.1118, 0.1118,  // 135-147.5
  0.1118, 0.1118, 0.1118, 0.1118, 0.1118, 0.1118,  // 150-162.5
  0.1118, 0.1118, 0.1118, 0.1118, 0.1118, 0.1118,  // 165-177.5
  0.1118, 0.1167, 0.1216, 0.1274, 0.1343, 0.1411,  // 180-192.5
  0.1489, 0.1577, 0.1675, 0.1782, 0.1919, 0.2065,  // 195-207.5
  0.2231, 0.2437, 0.2681, 0.2974, 0.3110, 0.3091,  // 210-222.5
  0.3101, 0.3101, 0.3101, 0.3101, 0.3101, 0.3110,  // 225-237.5
  0.3110, 0.3110, 0.3110, 0.3110, 0.3110, 0.3110,  // 240-252.5
  0.3101, 0.3101, 0.3101, 0.3101, 0.3101, 0.3101,  // 255-267.5
  0.3101, 0.3101, 0.3101, 0.3101, 0.3091, 0.3110,  // 270-282.5
  0.3110, 0.3110, 0.3110, 0.3110, 0.3081, 0.2944,  // 285-297.5
  0.2817, 0.2817, 0.2817, 0.2817, 0.2817, 0.2817,  // 300-312.5
  0.2817, 0.2817, 0.2817, 0.2817, 0.2817, 0.2817,  // 315-327.5
  0.2817, 0.2817, 0.2817, 0.2817, 0.2817, 0.2817,  // 330-342.5
  0.2817, 0.2817, 0.2817, 0.2817, 0.2817, 0.2817,  // 345-357.5
];

/** Is one encoded-sRGB ring pixel (0..255) dark by ictool's gate? */
function pixelDark(r, g, b) {
  const mx = Math.max(r, g, b) / 255;
  const mn = Math.min(r, g, b) / 255;
  if (mx >= RING_CAP) return false;
  const chroma = mx - mn;
  if (chroma === 0) return true; // neutral: no hue, no chroma bound
  let h;
  if (mx * 255 === r) h = (60 * ((g - b) / 255 / chroma)) % 360;
  else if (mx * 255 === g) h = 60 * ((b - r) / 255 / chroma + 2);
  else h = 60 * ((r - g) / 255 / chroma + 4);
  const n = CHROMA_BY_HUE.length;
  const i = Math.floor((((h % 360) + 360) % 360) / HUE_STEP) % n;
  // lower of the two bracketing samples — never optimistic between them
  return chroma < Math.min(CHROMA_BY_HUE[i], CHROMA_BY_HUE[(i + 1) % n]);
}
const LUMA_THRESHOLD = 0.3; // SVG-era bracket (0.282, 0.314)

const args = process.argv.slice(2);
const flag = (name) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : null;
const write = args.includes("--write");
const only = flag("--only");
const assetsDir = flag("--assets") ?? join(root, "packages/refraction/assets");

/** display-p3 -> sRGB, both encoded (the CSS Color 4 / ICC conversion:
 *  sRGB transfer function, P3->sRGB primaries matrix, clipped).
 *
 *  This is the scalar twin of the delivery path's RASTER conversion
 *  (`withIccProfile("srgb", { attach: false })` — build-assets' toSrgb,
 *  build-svg-icons' centralRmse). Nothing in the repo converted a
 *  declared COLOR, so this is a new implementation, not a shared one;
 *  it is instrumented against both of the repo's ground truths
 *  (measured 2026-09-13):
 *    - headless Chrome rendering the same `color(display-p3 …)` fills:
 *      BYTE-EXACT, max |Δ| 0/255 over 13 swatches (the naive
 *      components-as-sRGB reading this replaces: max |Δ| 46/255);
 *    - sharp's ICC transform on an ictool master (icatcher's canvas,
 *      P3-coded 42,86,166): sharp 21,87,172 vs 21,87,173 here. */
const srgbEotf = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const srgbOetf = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const P3_TO_SRGB = [
  [1.2249401762, -0.2249401762, 0.0],
  [-0.0420569547, 1.0420569547, 0.0],
  [-0.0196375546, -0.0786360454, 1.0982736093],
];
const clamp = (v) => Math.min(1, Math.max(0, v));
function p3ToSrgb(r, g, b) {
  const l = [r, g, b].map(srgbEotf);
  return P3_TO_SRGB.map((row) =>
    clamp(srgbOetf(clamp(row[0] * l[0] + row[1] * l[1] + row[2] * l[2])))
  );
}

/** Parse an icon.json color string into [r,g,b,a] 0-1 encoded values.
 *  Everything is returned in sRGB — the one space the composite's two
 *  statistics and their calibrated brackets live in (63 of 70 bundles
 *  declare their colors in sRGB or gray, where this is the identity). */
function parseColor(str) {
  const num = (s) => Number(s);
  let m;
  if ((m = str.match(/^display-p3:([\d.]+),([\d.]+),([\d.]+)(?:,([\d.]+))?$/)))
    return [
      ...p3ToSrgb(num(m[1]), num(m[2]), num(m[3])),
      m[4] ? num(m[4]) : 1,
    ];
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

/** The paint a bundle's canvas shows in the DEFAULT (light) rendition.
 *  Icon Composer writes three shapes — `solid` (15 catalog bundles),
 *  `linear-gradient` (44) and `automatic-gradient` (4) — each optionally
 *  alongside `fill-specializations`, whose appearance-less entry is the
 *  default (it restates the top-level paint in every catalog bundle;
 *  read anyway, so a spec-only fill can't read as "no canvas"). */
function defaultFillPaint(fill) {
  if (!fill) return null;
  if (typeof fill === "string") return { solid: fill };
  if (fill.solid || fill["linear-gradient"] || fill["automatic-gradient"])
    return fill;
  const dflt = (fill["fill-specializations"] ?? []).find((s) => !s.appearance);
  return dflt?.value ?? null;
}

/** RGBA buffer (CANVAS²·4) for a canvas fill; null when the bundle
 *  declares none.
 *
 *  Gradients always ramp top-to-bottom over the full canvas height:
 *  ictool IGNORES a canvas fill's `orientation` (measured fill-
 *  orientation law, pipeline/README.md), so neither does this.
 *
 *  `automatic-gradient` is painted as its flat base color. The measured
 *  model (same ledger) is base at the bottom plus a per-channel top
 *  lift of 9/255 (gray) to 28/255 (saturated); leaving the lift out
 *  under-reads ringMax by at most 0.11 on the top row and meanLuma by
 *  at most ~0.03, always toward "native". No hasDark:false bundle uses
 *  this fill shape today. */
function canvasFillBuffer(fill) {
  const paint = defaultFillPaint(fill);
  if (!paint) return null;
  let top, bottom;
  if (typeof paint === "string") top = bottom = parseColor(paint);
  else if (paint.solid) top = bottom = parseColor(paint.solid);
  else if (paint["automatic-gradient"])
    top = bottom = parseColor(paint["automatic-gradient"]);
  else if (paint["linear-gradient"]) {
    top = parseColor(paint["linear-gradient"][0]);
    bottom = parseColor(paint["linear-gradient"][1]);
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

/** Substitute CSS Color 4 display-p3 colors for librsvg, which paints
 *  them fully transparent: the converted sRGB rgb()/rgba() equivalent,
 *  same convention as parseColor. Applies anywhere in the document —
 *  the catalog's 238 occurrences are `fill`/`stroke` attributes and
 *  `stop-color`s inside gradients (tunestr's 19 are all gradient
 *  stops), and a text substitution reaches all of them alike.
 *
 *  This is the audit's own librsvg workaround; build-svg-icons.mjs
 *  answers the same librsvg limitation by rasterizing in headless
 *  Chrome instead (the P3 reference-raster trap, pipeline/README.md).
 *  Chrome is not available to this script by design — it runs on any
 *  platform, with no renderer — so the conversion is done in numbers
 *  here, instrumented against that same Chrome path (see p3ToSrgb). */
function preprocessSvg(text) {
  return text.replace(
    /color\(\s*display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)/g,
    (_, r, g, b, a) => {
      const c = p3ToSrgb(Number(r), Number(g), Number(b))
        .map((v) => Math.round(v * 255))
        .join(",");
      return a ? `rgba(${c},${a})` : `rgb(${c})`;
    }
  );
}

/** A layer's opacity in the DEFAULT (light) rendition: the
 *  appearance-less entry of `opacity-specializations`. 37 catalog
 *  layers pin it to 0 — the dark twins of split bundles, which must
 *  not appear in the light composite at all — and apple's three carry
 *  0.95/0.18/0.17. Compositing those at full strength was measuring
 *  artwork the Default rendition never shows. */
function defaultOpacity(layer) {
  const specs = layer["opacity-specializations"];
  if (!specs) return 1;
  return specs.find((s) => !s.appearance)?.value ?? 1;
}

/** Rasterize one layer at its placed size per the measured placement
 *  law (1 unit = 1 canvas unit, centered, canvas-clipped; scale
 *  multiplies, translation offsets). Returns a sharp composite spec.
 *
 *  Raster layers are read as raw bytes, which is the measured law: the
 *  catalog's PNGs are untagged (56), sRGB-chunk-tagged (25) or
 *  gray-gamma-2.2-tagged (7), and all three composite as encoded sRGB
 *  ("Raster layers", pipeline/README.md — the 2.2 decode is refuted at
 *  6/255). No catalog PNG carries a Display-P3 profile; one that did
 *  would need the p3ToSrgb treatment, like a declared P3 color. */
async function layerComposite(bundlePath, layer, opacity) {
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
  let input = await img.ensureAlpha().png().toBuffer();
  if (opacity < 1) {
    const { data, info } = await sharp(input)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4)
      data[i] = Math.round(data[i] * opacity);
    input = await sharp(data, { raw: info }).png().toBuffer();
  }
  return { input, left, top };
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
      const opacity = defaultOpacity(layer);
      if (opacity === 0) continue; // invisible in the Default rendition
      specs.push(await layerComposite(bundlePath, layer, opacity));
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
  let ringDark = true; // every ring pixel passes ictool's gate
  let ringChroma = 0; // worst max−min on the ring
  const ringPx = (x, y) => {
    const i = (y * CANVAS + x) * 4;
    const [r, g, b] = [buf[i], buf[i + 1], buf[i + 2]];
    if (buf[i + 3] < 255) ringOpaque = false;
    ringMax = Math.max(ringMax, r, g, b);
    if (!pixelDark(r, g, b)) ringDark = false;
    ringChroma = Math.max(
      ringChroma,
      (Math.max(r, g, b) - Math.min(r, g, b)) / 255
    );
    ringLumaSum += luma(r, g, b);
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
    ringDark,
    ringChroma,
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
    const ringRaw = m.ringOpaque && m.ringDark;
    const status = ringRaw || m.meanLuma < LUMA_THRESHOLD ? "native" : "missing";
    const borderline =
      (m.ringOpaque && m.ringMax > 0.28 && m.ringMax < 0.34) ||
      (m.ringOpaque && m.ringDark && m.ringChroma > 0.09) ||
      (m.meanLuma > 0.27 && m.meanLuma < 0.33);
    const master = await masterStats(b.slug);
    rows.push({
      slug: b.slug,
      status,
      ringRaw,
      ringOpaque: m.ringOpaque,
      ringMax: m.ringMax,
      ringChroma: m.ringChroma,
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
    "ringChr".padEnd(9) +
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
      fmt(r.ringChroma).padEnd(9) +
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
