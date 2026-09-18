// Classify every scored facet-drift pair by WHAT the residual is, so the
// site's dev-only "drift: …" lenses can group the worklist by method:
//
//   material      the bundle has glass layers/specular — the material's
//                 measured cost (25–55 central, ledger "The material's
//                 cost"); the flat is not wrong, the metric includes the
//                 sheen. Method: score with material off, or accept.
//   artwork       ≥ 15% of crop pixels differ by > 40 — a moved, missing
//                 or different element. Method: re-source / redraw the
//                 flat from the bundle's artwork (icon-to-flat-svg, or a
//                 measured drawing).
//   plate         mean signed glass−flat ≥ 3/255 in some channel — a
//                 plate colour or gradient mismatch. Method: refit the
//                 plate from the shipped raster (per-row medians) or
//                 fix a wrong-space colour declaration.
//   registration  fit-flat-glyph's similarity transform is ≥ 0.08 units
//                 of offset or ≥ 0.8% of scale — the same mark at the
//                 wrong place/size. Method: apply the measured transform
//                 (refine.mjs grid search).
//   geometry      ≥ 50% of the residual energy sits within 2 px of the
//                 flat's own edges, with none of the above — a different
//                 cut of the mark (stroke weight, arc radii). Method:
//                 measure the primitives (downcast/youtubemusic style).
//   shading       none of the above — diffuse interior residual: gloss,
//                 vignette, texture the flat does not carry. Method:
//                 usually accept; sometimes a gradient refit.
//   floor         central ≤ 5, nothing to do.
//
// Inputs (run these first, in this order):
//   node pipeline/audit-facet-drift.mjs --sheets --json <audit.json>
//   node pipeline/fit-flat-glyph.mjs > <fit.txt>
// Usage:
//   node pipeline/audit-drift-diagnosis.mjs --audit <audit.json> --fit <fit.txt>
//       [--sheets /tmp/facet-drift-work/sheets] [--write]
// --write refreshes apps/web/lib/drift-diagnosis.json (a committed snapshot,
// like facet-drift.json; build-data.mjs merges it into platforms.gen.json).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { root } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
const auditPath = flag("--audit"), fitPath = flag("--fit");
const sheets = flag("--sheets") ?? "/tmp/facet-drift-work/sheets";
const write = args.includes("--write");
if (!auditPath || !existsSync(auditPath)) { console.error("need --audit <audit.json> (from audit-facet-drift.mjs --json)"); process.exit(2); }

const FLOOR = 5, ARTWORK = 0.15, PLATE = 3, REG_T = 0.08, REG_S = 0.008, EDGE = 0.5;
const SIZE = 256, OFF = 51, W = SIZE - 2 * OFF;

const audit = JSON.parse(readFileSync(auditPath, "utf8"));
const fits = {};
if (fitPath && existsSync(fitPath))
  for (const m of readFileSync(fitPath, "utf8").matchAll(/^\s+(\S+)\s+translate\(([-\d.]+) ([-\d.]+)\) scale\(([\d.]+)\)/gm))
    fits[m[1]] = { tx: +m[2], ty: +m[3], s: +m[4] };

/** Share of the crop's residual energy within 2 px of the flat's own colour edges, from the audit sheet (flat | glass | 4x|diff|). */
async function edgeShare(slug) {
  const p = join(sheets, `${slug}.png`);
  if (!existsSync(p)) return null;
  const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true });
  const C = info.channels, RW = info.width;
  const px = (panel, x, y, c) => data[(y * RW + panel * SIZE + x) * C + c];
  const edge = new Uint8Array(SIZE * SIZE);
  for (let y = 1; y < SIZE - 1; y++)
    for (let x = 1; x < SIZE - 1; x++) {
      let g = 0;
      for (let c = 0; c < 3; c++)
        g = Math.max(g, Math.abs(px(0, x + 1, y, c) - px(0, x - 1, y, c)) + Math.abs(px(0, x, y + 1, c) - px(0, x, y - 1, c)));
      if (g > 48) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) edge[(y + dy) * SIZE + x + dx] = 1;
    }
  let onEdge = 0, total = 0;
  for (let y = OFF; y < OFF + W; y++)
    for (let x = OFF; x < OFF + W; x++) {
      let e = 0;
      for (let c = 0; c < 3; c++) { const d = px(2, x, y, c) / 4; e += d * d; }
      total += e;
      if (edge[y * SIZE + x]) onEdge += e;
    }
  return total ? onEdge / total : 0;
}

const out = {};
for (const r of audit.rows) {
  const glassLayers = +(String(r.glass).split("/")[0]) || 0;
  const fit = fits[r.slug] ?? null;
  const es = await edgeShare(r.slug);
  const signals = {
    central: +r.central.toFixed(2),
    glassLayers,
    specular: /\+s/.test(String(r.glass)),
    struct: +r.struct.toFixed(3),
    signed: r.signed.map((v) => +v.toFixed(1)),
    lumaShare: +r.lumaShare.toFixed(2),
    edgeShare: es === null ? null : +es.toFixed(2),
    fit,
  };
  const causes = [];
  if (r.central > FLOOR) {
    // Material confounds every other signal (the sheen shifts the means and
    // scatters > 40 pixels), so a glass pair is filed under material alone.
    if (glassLayers > 0) causes.push("material");
    else if (r.struct >= ARTWORK) causes.push("artwork");
    if (glassLayers === 0 && Math.max(...r.signed.map(Math.abs)) >= PLATE) causes.push("plate");
    if (glassLayers === 0 && fit && (Math.abs(fit.tx) >= REG_T || Math.abs(fit.ty) >= REG_T || Math.abs(fit.s - 1) >= REG_S)) causes.push("registration");
    if (!causes.length && es !== null && es >= EDGE) causes.push("geometry");
    if (!causes.length) causes.push("shading");
  }
  out[r.slug] = { primary: causes[0] ?? "floor", causes, ...signals };
}
const order = ["material", "artwork", "plate", "registration", "geometry", "shading", "floor"];
for (const k of order) {
  const list = Object.entries(out).filter(([, v]) => v.primary === k).sort((a, b) => b[1].central - a[1].central);
  if (list.length) console.log(`${k.padEnd(13)} ${String(list.length).padStart(2)}  ${list.map(([s, v]) => `${s} ${v.central}${v.causes.length > 1 ? " (+" + v.causes.slice(1).join(",") + ")" : ""}`).join(", ")}`);
}
if (write) {
  const snap = { generated: new Date().toISOString().slice(0, 10), thresholds: { FLOOR, ARTWORK, PLATE, REG_T, REG_S, EDGE }, bundles: out };
  writeFileSync(join(root, "apps/web/lib/drift-diagnosis.json"), JSON.stringify(snap, null, 2) + "\n");
  console.log("wrote apps/web/lib/drift-diagnosis.json");
}
