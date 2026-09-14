// Score every platform's LIGHT Liquid Glass rendition against its flat
// icon, rank the catalog by RMSE, and separate "the glass material is
// doing its job" from "the two facets show different artwork".
//
// The two sides (both already 8-bit, untagged sRGB — see trap 2):
//   glass  packages/refraction/assets/<slug>.png — the 1024 ictool
//          light master after build-assets.mjs's P3->sRGB squash
//   flat   packages/icons/static/icons/<id>.svg — icon.svg wrapped in
//          the SQUIRCLE_32 alpha mask by build-static.ts generateIcon()
//          (regenerate: pnpm --filter @podlink/icons build)
// Dark renditions are out of scope. Platforms with only one side are
// listed and skipped — nothing is synthesized.
//
// Method (both metrics at 256, the ledger's scoring size):
//   1. The flat SVG is rasterized at 1024 by headless Chrome
//      (chromeRasterize, verbatim from build-svg-icons.mjs).
//   2. Both 1024 rasters go through the IDENTICAL sharp resize to 256
//      (lanczos3, alpha premultiplied by sharp on both).
//   3. Alpha: both frames are composited over the same mid-gray
//      (128,128,128) before scoring, so a pixel that is opaque on one
//      side and transparent on the other costs |artwork - gray| —
//      the same on light and dark artwork — instead of an undefined
//      RGB under a zero alpha. Inside the central crop every catalog
//      pair is fully opaque (the `crop α` columns say so), where this
//      is numerically the ledger's centralRmse() (resize, extract,
//      removeAlpha) — so `central` stays comparable to every other
//      figure in pipeline/README.md.
//   central  RMSE over the central 60% square (rows/cols 51..204),
//            RGB — inside both masks, so it is artwork + material only
//   frame    RMSE over the whole 256 frame, RGB over gray — includes
//            the two masks' disagreement (`maskΔ` = fraction of frame
//            pixels opaque on exactly one side, ≥128 alpha)
//   Diagnostics per pair, all over the central crop: mean signed
//   glass-minus-flat per channel (a brand-color or gamma shift reads
//   here), the luma share of the residual energy (material shading
//   is luma-heavy; a wrong hue is chroma-heavy), and the fraction of
//   crop pixels whose max channel differs by > 40 (a moved, missing
//   or extra element is localized and large; material is diffuse).
//   --sheets writes flat | glass | 4x |diff| triptychs for the eye.
//
// The three traps this instrument guards (all measured in the ledger):
//   1. NEVER rasterize the SVG with sharp/librsvg: it paints
//      color(display-p3 ...) fills fully transparent (45 of 67 icon.svg
//      files use them). Chrome only. A reference-sanity check aborts
//      the run if a full-bleed icon rasterizes < 80% visible (the
//      SQUIRCLE_32 mask alone covers 87.2%, measured).
//   2. NEVER compare P3-coded pixels with sRGB. Verified here at
//      startup rather than assumed: icatcher's canvas is declared
//      display-p3 0.1647,0.3373,0.6549 on BOTH facets; if the master
//      were still P3-coded it would read [42,86,167]; the sRGB
//      conversion reads [21,87,173]. The check samples the master and
//      the Chrome raster at a canvas point and aborts unless both are
//      within 4/255 of the sRGB value (measured: flat [21,87,173],
//      master [20,86,171]; a raw P3 master would miss by 21).
//   3. Resampling asymmetry has a floor. Chrome@1024->256 vs Chrome@256
//      of the same SVG costs central RMSE 9.04 (ledger, tunestr) with
//      no artwork difference at all. So the flat side is rendered at
//      1024 like the master and both take the same resize; --floor
//      reproduces that number with this script's own resizer so the
//      figure can be re-checked against the ledger.
//
// Usage:
//   node pipeline/audit-facet-drift.mjs                report (worst first)
//   node pipeline/audit-facet-drift.mjs --only <slug>
//     [--sheets] [--json <file>] [--floor] [--work <dir>]
//
// VERDICT (measured 2026-09-13, 67 pairs; full table and per-pair
// diagnoses in the ledger, "Facet drift: flat vs light Liquid Glass"):
//   central RMSE min 0.47, q1 1.68, median 25.67, q3 46.59, max 147.42.
//   The material's cost is read off pairs whose artwork is the same on
//   both sides BY CONSTRUCTION: the 16 flat-svg* bundles with glass off
//   (their layer IS icon.svg) score 0.47-1.68 — the instrument's noise
//   floor; icatcher, the same construction with glass on, scores
//   26.67; the 8 decanted bundles (flat assembled from the bundle's
//   own layers) score 24.67-55.32 (apple's three translucent glass
//   layers are the top). So material alone costs ~25-55 and never
//   more. The `glass` column shows the bundle's glass layers / specular:
//   the 44 appstore/adaptive/catalog raster bundles have neither, and
//   ictool hands their raster through unchanged (master vs the App
//   Store's own PNG: RMSE 0.1-1.9 on 16 of them), so on those pairs the
//   score is entirely artwork drift. The whole-frame `frame` metric
//   carries the two masks' 6.5% disagreement in every pair (15.8-31.4
//   on its own for identical artwork), so `central` is the ranking
//   metric and `frame` is reported for completeness. The distribution's
//   largest gap is 77.46 -> 97.35 (12 pairs above), the next 55.32 ->
//   73.75; all 15 pairs above 55 are artwork mismatches (different
//   generation of the brand's icon, inverted plate, wrong brand red,
//   glyph scale), and for every one the App Store's current artwork
//   matches the GLASS side (RMSE 0.1-1.9, same crop) — the flat
//   icon.svg is the stale side.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { readBundles, root } from "./lib.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MASTER = 1024;
const SIZE = 256;
const CROP_OFF = Math.round(SIZE * 0.2); // 51 — centralRmse's own crop
const CROP_W = SIZE - 2 * CROP_OFF; // 154
const GRAY = 128;
const STRUCT_T = 40;

const args = process.argv.slice(2);
const flag = (name) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : null;
const only = flag("--only");
const sheets = args.includes("--sheets");
const jsonOut = flag("--json");
const floor = args.includes("--floor");
const work = flag("--work") ?? "/tmp/facet-drift-work";
const assetsDir = join(root, "packages/refraction/assets");
const flatDir = join(root, "packages/icons/static/icons");

mkdirSync(join(work, "flat"), { recursive: true });
if (sheets) mkdirSync(join(work, "sheets"), { recursive: true });

// ------------------------------------------------------------ Chrome

// Verbatim from build-svg-icons.mjs: the ONLY SVG rasterizer here.
// sharp/librsvg drops color(display-p3 …) fills entirely (trap 1).
function chromeRasterize(svgText, outPng, size) {
  const dir = join(work, `chrome-${Math.floor(Math.random() * 1e9)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "icon.svg"), svgText);
  writeFileSync(
    join(dir, "wrap.html"),
    `<!doctype html><html><head><style>html,body{margin:0;padding:0}img{width:${size}px;height:${size}px;display:block}</style></head><body><img src="icon.svg"></body></html>`
  );
  rmSync(outPng, { force: true });
  execFileSync(CHROME, [
    "--headless=new", "--disable-gpu", `--screenshot=${outPng}`,
    `--window-size=${size},${size}`, "--default-background-color=00000000",
    join(dir, "wrap.html"),
  ], { stdio: "ignore" });
  rmSync(dir, { recursive: true, force: true });
  if (!existsSync(outPng))
    throw new Error(
      `headless Chrome wrote no screenshot to ${outPng} — is ${CHROME} installed?`
    );
}

/** Chrome raster of a flat SVG at `size`, cached by content hash. */
function flatRaster(svgText, id, size) {
  const hash = createHash("sha1").update(svgText).digest("hex").slice(0, 12);
  const out = join(work, "flat", `${id}-${size}-${hash}.png`);
  if (!existsSync(out)) chromeRasterize(svgText, out, size);
  return out;
}

// ----------------------------------------------------------- pixels

/** 256² RGBA (resized identically for both sides). */
async function rgba256(png) {
  const { data, info } = await sharp(png)
    .resize(SIZE, SIZE)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== SIZE || info.height !== SIZE)
    throw new Error(`unexpected ${info.width}x${info.height} from ${png}`);
  return data;
}

/** Composite RGBA over the common gray; returns RGB (3 per pixel). */
function overGray(rgba) {
  const out = new Uint8Array((rgba.length / 4) * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    const a = rgba[i + 3] / 255;
    out[j] = Math.round(rgba[i] * a + GRAY * (1 - a));
    out[j + 1] = Math.round(rgba[i + 1] * a + GRAY * (1 - a));
    out[j + 2] = Math.round(rgba[i + 2] * a + GRAY * (1 - a));
  }
  return out;
}

const inCrop = (x, y) =>
  x >= CROP_OFF && x < CROP_OFF + CROP_W && y >= CROP_OFF && y < CROP_OFF + CROP_W;

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

function score(flatRgba, glassRgba) {
  const f = overGray(flatRgba);
  const g = overGray(glassRgba);
  let frameSum = 0;
  let cropSum = 0;
  let cropN = 0;
  let maskDiff = 0;
  let cropOpaqueF = 0;
  let cropOpaqueG = 0;
  const signed = [0, 0, 0];
  let lumaSum = 0;
  let structN = 0;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const p = y * SIZE + x;
      const i = p * 3;
      const d0 = g[i] - f[i];
      const d1 = g[i + 1] - f[i + 1];
      const d2 = g[i + 2] - f[i + 2];
      const e = d0 * d0 + d1 * d1 + d2 * d2;
      frameSum += e;
      const af = flatRgba[p * 4 + 3] >= 128;
      const ag = glassRgba[p * 4 + 3] >= 128;
      if (af !== ag) maskDiff++;
      if (!inCrop(x, y)) continue;
      cropN++;
      cropSum += e;
      if (flatRgba[p * 4 + 3] >= 250) cropOpaqueF++;
      if (glassRgba[p * 4 + 3] >= 250) cropOpaqueG++;
      signed[0] += d0;
      signed[1] += d1;
      signed[2] += d2;
      const dl = luma(d0, d1, d2);
      lumaSum += 3 * dl * dl; // luma component's share of the 3-ch energy
      if (Math.max(Math.abs(d0), Math.abs(d1), Math.abs(d2)) > STRUCT_T)
        structN++;
    }
  return {
    frame: Math.sqrt(frameSum / (SIZE * SIZE * 3)),
    central: Math.sqrt(cropSum / (cropN * 3)),
    maskDiff: maskDiff / (SIZE * SIZE),
    cropOpaqueFlat: cropOpaqueF / cropN,
    cropOpaqueGlass: cropOpaqueG / cropN,
    signed: signed.map((s) => s / cropN),
    lumaShare: cropSum ? Math.min(1, lumaSum / cropSum) : 0,
    struct: structN / cropN,
  };
}

/** flat | glass | 4x|diff| triptych over gray, 256 each. */
async function writeSheet(slug, flatRgba, glassRgba) {
  const f = overGray(flatRgba);
  const g = overGray(glassRgba);
  const d = new Uint8Array(f.length);
  for (let i = 0; i < f.length; i++)
    d[i] = Math.min(255, 4 * Math.abs(g[i] - f[i]));
  const tile = (rgb) =>
    sharp(Buffer.from(rgb), { raw: { width: SIZE, height: SIZE, channels: 3 } })
      .png()
      .toBuffer();
  const [tf, tg, td] = await Promise.all([tile(f), tile(g), tile(d)]);
  await sharp({
    create: { width: SIZE * 3, height: SIZE, channels: 3, background: "#808080" },
  })
    .composite([
      { input: tf, left: 0, top: 0 },
      { input: tg, left: SIZE, top: 0 },
      { input: td, left: SIZE * 2, top: 0 },
    ])
    .png()
    .toFile(join(work, "sheets", `${slug}.png`));
}

/** "<glass layers>/<visible layers>[+s]" from the bundle's icon.json,
 *  for the DEFAULT (light) rendition: a layer is glass when `glass` is
 *  true or its `glass-specializations` appearance-less entry is
 *  (overcast declares its three that way); an absent key counts as
 *  off, which is how the catalog's own builders write "off". +s marks
 *  a group with specular on. Material (glass, specular, shadow,
 *  translucency, an automatic-gradient canvas) is what separates the
 *  master from its own layer artwork; the 44 raster-sourced bundles
 *  have none of it, and ictool passes their raster through unchanged
 *  (measured: master vs the App Store's own PNG, RMSE 0.1-1.9), so on
 *  those pairs the whole score is artwork. */
function glassLayers(bundlePath) {
  const doc = JSON.parse(readFileSync(join(bundlePath, "icon.json"), "utf8"));
  let g = 0, n = 0, spec = false;
  for (const grp of doc.groups ?? []) {
    if (grp.hidden) continue;
    if (grp.specular) spec = true;
    for (const l of grp.layers ?? []) {
      if (l.hidden) continue;
      n++;
      const dflt = (l["glass-specializations"] ?? []).find((s) => !s.appearance);
      if (l.glass === true || (l.glass == null && dflt?.value === true)) g++;
    }
  }
  return `${g}/${n}${spec ? "+s" : ""}`;
}

// ------------------------------------------------- startup checks

/** Trap 2, verified rather than assumed: a declared-P3 canvas must
 *  read as its sRGB conversion on BOTH sides. */
async function assertSrgbFrame(masterPng, flatPng) {
  const P3_RAW = [42, 86, 167];
  const SRGB = [21, 87, 173];
  const sample = async (png) => {
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const i = (512 * info.width + 80) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  for (const [name, png] of [["master", masterPng], ["flat", flatPng]]) {
    const px = await sample(png);
    const off = Math.max(...px.map((v, k) => Math.abs(v - SRGB[k])));
    const offP3 = Math.max(...px.map((v, k) => Math.abs(v - P3_RAW[k])));
    if (off > 4)
      throw new Error(
        `${name} icatcher canvas reads [${px}] — expected sRGB [${SRGB}] ` +
          `(P3-coded would be [${P3_RAW}], off by ${offP3}). The two ` +
          `sides are not in one coding space; do not score them.`
      );
  }
}

/** Trap 1 guard: a full-bleed flat icon must rasterize opaque. */
async function assertFlatSane(png, svg, id) {
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let visible = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] >= 128) visible++;
  const cov = visible / (data.length / 4);
  // Measured (Chrome, 1024): SQUIRCLE_32 alone covers 0.8722 of the
  // square (Apple's mask on the glass side: 0.938). A full-bleed icon
  // under it lands at 0.872, never at the ~0.3 a dropped P3 fill leaves.
  // Visibility (alpha >= 128), not full opacity: castamatic's canvas
  // gradient is declared at stop-opacity .964-.994 and rasterizes at
  // alpha 247-251 — honest paint that a > 250 bar misread as dropped.
  const fullBleed = /d="[Mm]0[ ,]0\s*h\s*32\s*v\s*32\s*[Hh]0\s*[zZ]"|<rect[^>]*\bwidth="(?:32|100%)"[^>]*\bheight="(?:32|100%)"/.test(svg);
  if (cov < 0.02 || (fullBleed && cov < 0.8))
    throw new Error(
      `${id}: flat raster is ${(cov * 100).toFixed(1)}% opaque — the ` +
        `rasterizer dropped paint (librsvg-style P3 loss?). Aborting.`
    );
  return cov;
}

// --------------------------------------------------------------- run

const pairs = [];
const skipped = [];
for (const b of readBundles()) {
  if (only && b.slug !== only) continue;
  const master = join(assetsDir, `${b.slug}.png`);
  const flat = join(flatDir, `${b.platformId}.svg`);
  const have = { master: existsSync(master), flat: existsSync(flat) };
  if (!have.master || !have.flat) {
    skipped.push(`${b.slug} (no ${!have.master ? "light master" : "flat icon"})`);
    continue;
  }
  pairs.push({
    slug: b.slug, id: b.platformId, source: b.source ?? "?", master, flat,
    glass: glassLayers(b.bundlePath),
  });
}

if (!pairs.length) {
  console.error(`no pairs${only ? ` for --only ${only}` : ""}`);
  process.exit(1);
}

// Trap 2 check on icatcher's known P3 canvas, whenever it is present.
{
  const ic = readBundles().find((b) => b.slug === "icatcher");
  const master = ic && join(assetsDir, "icatcher.png");
  const flat = ic && join(flatDir, "icatcher.svg");
  if (ic && existsSync(master) && existsSync(flat)) {
    const png = flatRaster(readFileSync(flat, "utf8"), "icatcher", MASTER);
    await assertSrgbFrame(master, png);
    console.log("color frame: both facets read icatcher's P3 canvas as sRGB [21,87,173] ±4 — ok");
  } else console.log("color frame: icatcher pair absent, sRGB check skipped");
}

if (floor) {
  // Trap 3, reproduced with this script's own resizer: the same SVG
  // rendered at 1024 and resized to 256 vs rendered at 256 directly.
  const p = pairs.find((x) => x.slug === "tunestr") ?? pairs[0];
  const svg = readFileSync(p.flat, "utf8");
  const hi = await rgba256(flatRaster(svg, p.id, MASTER));
  const lo = await rgba256(flatRaster(svg, p.id, SIZE));
  const s = score(hi, lo);
  console.log(
    `resampling floor (${p.slug}, Chrome@1024->256 vs Chrome@256, same artwork): ` +
      `central ${s.central.toFixed(2)}, frame ${s.frame.toFixed(2)} — ` +
      `this is what rendering the two sides at different sizes would cost`
  );
}

const rows = [];
for (const p of pairs) {
  const svg = readFileSync(p.flat, "utf8");
  const flatPng = flatRaster(svg, p.id, MASTER);
  await assertFlatSane(flatPng, svg, p.id);
  const [f, g] = await Promise.all([rgba256(flatPng), rgba256(p.master)]);
  const s = score(f, g);
  rows.push({ slug: p.slug, source: p.source, glass: p.glass, ...s });
  if (sheets) await writeSheet(p.slug, f, g);
}

rows.sort((a, b) => b.central - a.central);

const f2 = (v) => v.toFixed(2).padStart(6);
const pct = (v) => (v * 100).toFixed(0).padStart(3) + "%";
const sgn = (v) => (v >= 0 ? "+" : "") + v.toFixed(1);
console.log(
  "\n" +
    "#".padStart(3) + " " +
    "slug".padEnd(18) +
    "central".padStart(8) +
    "frame".padStart(8) +
    "  maskΔ" +
    "  cropα f/g" +
    "   meanΔ R/G/B (glass-flat)" +
    "  luma%" +
    "  >40" +
    "  glass" +
    "  source"
);
rows.forEach((r, i) =>
  console.log(
    String(i + 1).padStart(3) + " " +
      r.slug.padEnd(18) +
      f2(r.central).padStart(8) +
      f2(r.frame).padStart(8) +
      "  " + (r.maskDiff * 100).toFixed(1).padStart(4) + "%" +
      "  " + r.cropOpaqueFlat.toFixed(2) + "/" + r.cropOpaqueGlass.toFixed(2) +
      "   " + r.signed.map(sgn).map((s) => s.padStart(6)).join(" ") +
      "   " + pct(r.lumaShare) +
      "  " + pct(r.struct) +
      "  " + r.glass.padEnd(5) +
      "  " + r.source
  )
);

// Distribution: quartiles and the largest gap between consecutive
// central scores (the natural break, read from the data itself).
const c = rows.map((r) => r.central).sort((a, b) => a - b);
const q = (p) => c[Math.min(c.length - 1, Math.floor(p * (c.length - 1)))];
let gap = { size: 0, below: null, above: null, nAbove: 0 };
for (let i = 1; i < c.length; i++) {
  const g = c[i] - c[i - 1];
  // ignore gaps in the top three — a single outlier is not a break
  if (i <= c.length - 3 && g > gap.size)
    gap = { size: g, below: c[i - 1], above: c[i], nAbove: c.length - i };
}
console.log(
  `\n${rows.length} pairs scored` +
    (skipped.length ? `; skipped ${skipped.length}: ${skipped.join(", ")}` : "") +
    `\ncentral RMSE: min ${c[0].toFixed(2)}  q1 ${q(0.25).toFixed(2)}  ` +
    `median ${q(0.5).toFixed(2)}  q3 ${q(0.75).toFixed(2)}  max ${c[c.length - 1].toFixed(2)}` +
    (gap.below != null
      ? `\nlargest gap: ${gap.below.toFixed(2)} -> ${gap.above.toFixed(2)} ` +
        `(+${gap.size.toFixed(2)}); ${gap.nAbove} pair(s) above the break`
      : "")
);
if (sheets) console.log(`sheets: ${join(work, "sheets")}/<slug>.png (flat | glass | 4x|diff|)`);
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify({ rows, skipped, quartiles: [c[0], q(0.25), q(0.5), q(0.75), c[c.length - 1]], gap }, null, 2) + "\n");
  console.log(`json: ${jsonOut}`);
}
