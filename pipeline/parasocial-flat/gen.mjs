// Parasocial flat facet: the in-car 1024 icon (Assets.car `AppIcon`, identical
// to the App Store artwork, RMSE 0) measured into SVG primitives in 32 units.
// Every constant below is a measurement, not a drawing: shape extents are
// half-coverage crossings of the master's luminance (pixel centres on both
// axes), dot centres are connected-component centroids (+0.5 px), the glyph
// ramp is the per-shape linear colour profile along x extrapolated to each
// shape's true edge, and the plate is a least-squares radial fit over 1614
// background samples (centre (512,432), R 750, rms 0.30/255). Ledger:
// pipeline/README.md, "parasocial: the in-car flat measured into vectors".
//
// Usage: node pipeline/parasocial-flat/gen.mjs   rewrites platforms/parasocial/{icon,badge}.svg
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "platforms", "parasocial");
const U = 1024 / 32;
const f = (v, n = 3) => { const s = Number(v.toFixed(n)).toString(); return s.replace(/^(-?)0\./, "$1."); };
const hex = (rgb) => "#" + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("").toUpperCase();
// --- glyph geometry (pixel-centre convention: centroid index + 0.5) ---
const R_DOT = 41.2 / U;             // half-coverage crossings: dot diameters 82.2–82.6 px (edges.mjs)
const BAR_HW = 82.59 / 2 / U;       // half-coverage crossings at row 512: 220.36 → 302.95
const barX = 261.66 / U;            // midpoint of the bar crossings
const barY0 = 192 / U, barY1 = 832 / U; // coverage-exact 640 px tall
const cols = [
  { x: (443.17 + 0.5) / U, ys: [13.153, 18.847] },
  { x: (602.55 + 0.5) / U, ys: [10.308, 16, 21.692] },
  { x: (761.82 + 0.5) / U, ys: [7.822, 13.153, 18.847, 24.178] },
];
// --- horizontal colour ramp: per-shape linear profiles, extrapolated to each shape's true edge ---
const prof = [ // [xA, cA, xB, cB, edgeL, edgeR]
  [226, [9,112,254], 297, [28,98,249], barX*U - BAR_HW*U, barX*U + BAR_HW*U],
  [408, [57,75,240], 479, [80,64,235], cols[0].x*U - R_DOT*U, cols[0].x*U + R_DOT*U],
  [567, [122,63,229], 638, [155,62,223], cols[1].x*U - R_DOT*U, cols[1].x*U + R_DOT*U],
  [726, [206,74,159], 798, [249,84,106], cols[2].x*U - R_DOT*U, cols[2].x*U + R_DOT*U],
];
const stops = [];
for (const [xa, ca, xb, cb, eL, eR] of prof) {
  const at = (x) => ca.map((c, i) => c + (cb[i] - c) * (x - xa) / (xb - xa));
  stops.push([eL, at(eL)], [eR, at(eR)]);
}
const gx1 = stops[0][0], gx2 = stops[stops.length - 1][0];
const stopSvg = stops.map(([x, c], i) => `<stop${i ? ` offset="${f((x - gx1) / (gx2 - gx1), 4)}"` : ""} stop-color="${hex(c)}"/>`).join("");
// --- background: radial fit centre (512,432) R 750, rms 0.30 ---
const bg = `<radialGradient id="parasocial-unmasked__a" cx="16" cy="13.5" r="23.4375" gradientUnits="userSpaceOnUse"><stop stop-color="${hex([19.6,26.6,60.7])}"/><stop offset="1" stop-color="${hex([5.0,8.1,23.5])}"/></radialGradient>`;
const ramp = `<linearGradient id="parasocial-unmasked__b" x1="${f(gx1/U)}" x2="${f(gx2/U)}" y1="0" y2="0" gradientUnits="userSpaceOnUse">${stopSvg}</linearGradient>`;
const r = f(BAR_HW), bx = f(barX);
const bar = `M${f(barX - BAR_HW)} ${f(barY0 + BAR_HW)}a${r} ${r} 0 0 1 ${f(2*BAR_HW)} 0V${f(barY1 - BAR_HW)}a${r} ${r} 0 0 1 ${f(-2*BAR_HW)} 0Z`;
const dots = cols.flatMap((c) => c.ys.map((y) => `<circle cx="${f(c.x)}" cy="${f(y)}" r="${f(R_DOT)}"/>`)).join("");
const art = `<path fill="url(#parasocial-unmasked__a)" d="M0 0h32v32H0z"/><g fill="url(#parasocial-unmasked__b)"><path d="${bar}"/>${dots}</g>`;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 32 32"><defs>${bg}${ramp}</defs>${art}</svg>`;
const badge = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 32 32">\n  <defs>${bg}${ramp}<clipPath id="shape"><path d="M16 0C30.545 0 32 1.455 32 16S30.545 32 16 32S0 30.545 0 16S1.455 0 16 0Z"/></clipPath></defs>\n  <g clip-path="url(#shape)">${art}</g>\n</svg>`;
writeFileSync(join(out, "icon.svg"), icon + "\n");
writeFileSync(join(out, "badge.svg"), badge + "\n");
console.log("stops:", stops.map(([x,c])=>`${x.toFixed(1)}:${hex(c)}`).join(" "));
