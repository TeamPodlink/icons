// Measure the similarity transform that aligns a flat icon.svg's glyph to
// the glyph its Liquid Glass bundle actually ships.
//
// WHY THIS EXISTS: the facet-drift audit (audit-facet-drift.mjs) separates
// pairs whose artwork genuinely differs from pairs that draw the SAME mark
// at the wrong size or offset. The second kind is fixable without
// re-sourcing anything — soundcloud went 25.02 -> 7.44 on a transform
// alone, no path data touched — but only if the offset is MEASURED.
// Eyeballing a scale is how you turn a 2% error into a 5% one.
//
// METHOD. Both sides are measured from RENDERED 1024 pixels, the same way:
// the flat from a Chrome rasterization of icon.svg, the glass from the
// bundle's committed master (packages/refraction/assets/<slug>.png).
//
// MEASURED THE WRONG WAY FIRST (2026-09-13), recorded so it is not redone:
// the obvious glass-side shortcut is a `-split` bundle's `glyph.png`, which
// looks like the mark alone on transparency. It is NOT a safe reference.
// `icon.json` may place that layer with its own `position.scale`, so the
// asset's natural bbox is not the bbox ictool draws — and some glyph.png
// files are not bare marks at all (podurama's is 100% opaque, the whole
// artwork; anytimeplayer's bleeds off the canvas with 1026 of 2048 border
// pixels opaque, so its bbox is the crop, not the mark). Scoring against
// the raw asset claimed listennotes was 37% out while its facet drift sits
// in the 14-28 band, which is self-contradictory. The master is what
// actually ships; measure that.
//
// Both sides therefore have the mark burned onto a plate, and the plate has
// to be subtracted. Sampling one corner is not enough — several plates are
// gradients (podurama, siriusxm), and a single reference colour would read
// the far end of the gradient as "glyph". Instead an INSET RING (6-10% in,
// opaque pixels only, so it sits inside the master's squircle as well as on
// the flat's full-bleed square) is collected as a PALETTE of plate colours,
// and a pixel counts as glyph only when its distance to the NEAREST ring
// colour exceeds THRESHOLD.
//
// Rendering is headless Chrome, never librsvg — see the P3 trap in
// build-svg-icons.mjs's header.
//
// REPORT ONLY: prints the transform, writes nothing. Apply it by hand as
// `<g transform="translate(tx ty) scale(s)">` around the glyph, then
// re-score with audit-facet-drift.mjs. Uniform scale only, from the WIDTH
// ratio: thin strokes bias the height measurement (thresholding an
// antialiased 2px bar loses a half-pixel at each cap), so width is the
// more trustworthy axis and a non-uniform fit would distort the mark.
//
//   node pipeline/fit-flat-glyph.mjs [--only <slug>] [--threshold 60]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { readPlatforms, root } from "./lib.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CANVAS = 1024;
const RING_IN = 0.06, RING_OUT = 0.10;  // inset band, inside the squircle
const EDGE_MARGIN = 0.045;              // drop the glass canvas's specular rim
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
const only = flag("--only");
const THRESHOLD = Number(flag("--threshold") ?? 60);
const work = mkdtempSync(join(tmpdir(), "fit-glyph-"));

function chromeRasterize(svgText, outPng, size) {
  const d = join(work, `c${Math.random().toString(36).slice(2)}`);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "icon.svg"), svgText);
  writeFileSync(join(d, "w.html"),
    `<!doctype html><style>html,body{margin:0;padding:0}img{width:${size}px;height:${size}px;display:block}</style><img src="icon.svg">`);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", `--screenshot=${outPng}`,
    `--window-size=${size},${size}`, "--default-background-color=00000000", join(d, "w.html")],
    { stdio: "ignore" });
  if (!existsSync(outPng)) throw new Error("headless Chrome wrote no screenshot");
}

const box = (px) => {
  if (!px.length) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const [x, y] of px) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
};

/** Glyph = pixels far from every colour the plate shows in its border ring. */
async function glyphBox(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const i0 = Math.round(W * RING_IN), i1 = Math.round(W * RING_OUT);
  const inBand = (x, y) => {
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    return d >= i0 && d < i1;
  };
  const at = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
  const palette = new Map();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inBand(x, y)) continue;
      const [r, g, b, a] = at(x, y);
      if (a < 250) continue;
      palette.set(`${r >> 3},${g >> 3},${b >> 3}`, [r, g, b]);
    }
  const plate = [...palette.values()];
  if (!plate.length) return null;
  // Precompute "is this 5-bit colour bucket within THRESHOLD of any plate
  // colour" once (32^3 buckets), instead of rescanning the palette for every
  // one of a million pixels — the naive form is minutes per platform.
  const B = 32, near = new Uint8Array(B * B * B);
  const t2 = THRESHOLD * THRESHOLD;
  for (let rb = 0; rb < B; rb++)
    for (let gb = 0; gb < B; gb++)
      for (let bb = 0; bb < B; bb++) {
        const r = rb * 8 + 4, g = gb * 8 + 4, b = bb * 8 + 4;
        for (const [pr, pg, pb] of plate) {
          const dr = r - pr, dg = g - pg, db = b - pb;
          if (dr * dr + dg * dg + db * db <= t2) { near[(rb * B + gb) * B + bb] = 1; break; }
        }
      }
  // Exclude a margin inside the opaque shape. On the glass master the
  // canvas carries SPECULAR EDGE LIGHTING: a bright rim that is nowhere
  // near the plate palette, so without this it reads as glyph and the bbox
  // becomes the whole squircle (measured: soundcloud and ivoox both
  // reported a 1024-tall "glyph" — each is 0.56/7.44 on facet drift, i.e.
  // already aligned, so a full-height mark was impossible). Per-row and
  // per-column opaque extents approximate an erosion cheaply, which is
  // exact enough for a convex squircle, and the same margin is applied to
  // the flat's square so both sides are cropped identically.
  const margin = Math.round(W * EDGE_MARGIN);
  const rowMin = new Int32Array(H).fill(W), rowMax = new Int32Array(H).fill(-1);
  const colMin = new Int32Array(W).fill(H), colMax = new Int32Array(W).fill(-1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] < 250) continue;
      if (x < rowMin[y]) rowMin[y] = x;
      if (x > rowMax[y]) rowMax[y] = x;
      if (y < colMin[x]) colMin[x] = y;
      if (y > colMax[x]) colMax[x] = y;
    }
  const px = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (data[i + 3] < 250) continue;
      if (x - rowMin[y] < margin || rowMax[y] - x < margin) continue;
      if (y - colMin[x] < margin || colMax[x] - y < margin) continue;
      if (near[((data[i] >> 3) * B + (data[i + 1] >> 3)) * B + (data[i + 2] >> 3)]) continue;
      px.push([x, y]);
    }
  return box(px);
}

const rows = [];
for (const { id, dir, meta } of readPlatforms()) {
  if (only && id !== only) continue;
  const svgPath = join(dir, "icon.svg");
  const bundle = meta.liquidGlass?.bundles?.[0]?.file;
  if (!existsSync(svgPath) || !bundle) continue;
  const slug = meta.liquidGlass.bundles[0].slug;
  const master = join(root, "packages/refraction/assets", `${slug}.png`);
  if (!existsSync(master)) { if (only) console.log(`${id}: no rendered master — run build-assets.mjs first`); continue; }

  const png = join(work, `${id}.png`);
  chromeRasterize(readFileSync(svgPath, "utf8"), png, CANVAS);
  const f = await glyphBox(png);
  const g = await glyphBox(master);
  if (!f || !g) { console.log(`${id}: could not isolate a glyph`); continue; }

  const s = g.w / f.w;                    // uniform, from width (see header)
  const tx = g.cx - s * f.cx, ty = g.cy - s * f.cy;
  const u = CANVAS / 32;                  // report in the 32-unit icon space
  rows.push({
    id,
    flat: `${f.w}x${f.h} @(${f.cx.toFixed(1)},${f.cy.toFixed(1)})`,
    glass: `${g.w}x${g.h} @(${g.cx.toFixed(1)},${g.cy.toFixed(1)})`,
    dScale: `${((s - 1) * 100).toFixed(2)}%`,
    aspect: `${(((g.w / f.w) / (g.h / f.h) - 1) * 100).toFixed(2)}%`,
    dx: (g.cx - f.cx).toFixed(1),
    dy: (g.cy - f.cy).toFixed(1),
    transform: `translate(${(tx / u).toFixed(4)} ${(ty / u).toFixed(4)}) scale(${s.toFixed(5)})`,
  });
}

rmSync(work, { recursive: true, force: true });
if (!rows.length) { console.log("nothing to fit"); process.exit(0); }
console.log("  slug            flat glyph bbox          glass glyph bbox         scaleD   aspectD    dx     dy");
for (const r of rows)
  console.log(`  ${r.id.padEnd(15)} ${r.flat.padEnd(24)} ${r.glass.padEnd(24)} ${r.dScale.padStart(7)} ${r.aspect.padStart(8)} ${r.dx.padStart(6)} ${r.dy.padStart(6)}`);
console.log("\ntransforms (wrap the glyph, then re-score with audit-facet-drift.mjs):");
for (const r of rows) console.log(`  ${r.id.padEnd(15)} ${r.transform}`);
console.log("\naspectD is how much the width and height ratios disagree: near 0 means a");
console.log("similarity transform is the whole story; large means the marks differ in");
console.log("proportion and a scale fit would be papering over different artwork.");
