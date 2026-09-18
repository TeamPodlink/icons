// Generate platforms/listennotes/{icon,badge,badge-dark}.svg from the Listen
// Notes mark MEASURED on the brand's own PNG (brand-assets.listennotes.com
// publishes no vector). Every number below is a least-squares fit on the
// 610×610 "Logo only with Transparent Background" PNG — which is byte-for-
// byte the bundle's Assets/glyph.png — cross-checked on the 2520 "Logo with
// Circle" export (the same vector at 2.5664×, every fit within 0.1 px).
// Method: 0.5-coverage crossings of bilinear-sampled ink fields along rays,
// Kasa + Gauss–Newton circles, 5-parameter Gauss–Newton ellipses; ledger
// entry "listennotes: the maintainer's vector scored against the brand mark
// (2026-09-18)" and its follow-up. Fit residuals are ≤ 0.08 px at 610.
//
// Coordinates: the brand PNG's 610-px frame. The flat places that frame the
// way the bundle did (icon.json: layer scale 1.22667 on a 610 natural size,
// 748.27 pt centred on 1024): q32 = p610 · 0.0383334 + 4.30830, then a
// measured registration against the ictool master folded in (REG).
//
// Usage: node pipeline/listennotes-flat/gen.mjs [--out-dir <dir>] [--twin <file>]
//   --twin writes the bundle's dark twin: the mark alone (no plate), every
//   paint white, in the flat's own 32-unit frame — the brand's "White Logo"
//   treatment, as Assets/icon-dark.svg of the flat-svg-split bundle (the
//   builder's own mixed-tone form: image-name-specializations + the
//   {1, dark 1} guard; its saturation gate skips this black+red mark).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const outDir =
  args.includes("--out-dir")
    ? args[args.indexOf("--out-dir") + 1]
    : join(dirname(fileURLToPath(import.meta.url)), "../../platforms/listennotes");

// ----------------------------------------------------------- measured mark
// Colours: every opaque pixel of the brand PNGs is one of these two.
const BLACK = "#000";
const RED = "#B82F00";

// Magnifier ring: two concentric circles (centres agree to 0.001 px;
// edge rmse 0.054 / 0.057 px over 687 rays each). Thickness 51.843.
const RING = { cx: 254.002, cy: 252.002, ri: 196.072, ro: 247.915 };

// Handle: a rotated ELLIPSE (not a capsule — its width runs 191 → 245 → 0
// px along the axis), inner end hidden under the ring band, tip at
// r 479.35 from the ring centre; rmse 0.045 px, max 0.17 (451 edge pts).
const HANDLE = { cx: 495.969, cy: 489.97, a: 139.972, b: 47.519, phiDeg: 43.999 };

// Shadow: axis-aligned ellipse (rotation fitted to 1e-8°); rmse 0.037 px.
const SHADOW = { cx: 239, cy: 591.001, a: 122.713, b: 13.016 };

// RSS dot: circle, rmse 0.070 px.
const DOT = { cx: 171, cy: 337, r: 31.733 };

// RSS arcs: three quarter-annuli, ends cut flat on each arc's own axes
// (measured end angles within 0.8 px of on-axis). They do NOT share a
// centre and are not centred on the dot — the artwork places each one
// separately; centres are the mean of the inner/outer edge fits (edge rmse
// 0.054–0.080 px). Strokes 34.09 / 36.33 / 36.54.
const ARCS = [
  { cx: 152.45, cy: 351.83, ri: 74.66, ro: 108.75 },
  { cx: 153.09, cy: 355.41, ri: 135.04, ro: 171.38 },
  { cx: 156.68, cy: 346.89, ri: 194.86, ro: 231.4 },
];

// ------------------------------------------------------------- placement
// Bundle framing (see header) …
const FRAME = { k: 1.22667 * 32 / 1024, o: (1024 - 610 * 1.22667) / 2 / 32 };
// … and the registration measured against the ictool master with the
// transform-wrapper grid search (Chrome @1024 → 256, central-crop RMSE;
// coarse 0.1 unit / 1% → fine 0.008 / 0.1%): translate(tx ty) scale(s) on
// the whole mark, folded in here so the emitted file carries no transform.
// Measured 2026-09-18: identity is the optimum at every grid level (central
// 3.32; the nearest 0.008-unit / 0.1% neighbours score ≥ 3.83) — the bundle
// framing IS the registered placement, so nothing is folded.
const REG = { tx: 0, ty: 0, s: 1 };

const K = FRAME.k * REG.s;
const O = FRAME.o * REG.s;
const map = (p) => ({ x: p.cx * K + O + REG.tx, y: p.cy * K + O + REG.ty });
const scale = (r) => r * K;

// Badge: the house bare-mark form ("8 8 24 24", no plate, no clip — the
// form this platform's badge already used): the mark's analytic ink bbox
// fitted to the 24-unit box, taller side exactly 24, centred.
function badgeMap() {
  const ph = (HANDLE.phiDeg * Math.PI) / 180;
  const hx = Math.sqrt((HANDLE.a * Math.cos(ph)) ** 2 + (HANDLE.b * Math.sin(ph)) ** 2);
  const x0 = RING.cx - RING.ro, x1 = HANDLE.cx + hx;
  const y0 = RING.cy - RING.ro, y1 = SHADOW.cy + SHADOW.b;
  const k = 24 / Math.max(x1 - x0, y1 - y0);
  const ox = 8 + (24 - (x1 - x0) * k) / 2 - x0 * k;
  const oy = 8 + (24 - (y1 - y0) * k) / 2 - y0 * k;
  return { map: (p) => ({ x: p.cx * k + ox, y: p.cy * k + oy }), scale: (r) => r * k };
}

// ---------------------------------------------------------------- paths
const f = (v) => {
  const s = Number(v.toFixed(3)).toString();
  return s.replace(/^(-?)0\./, "$1.");
};
const P = (p) => `${f(p.x)} ${f(p.y)}`;

// Every closed ellipse/circle is four QUARTER arcs between its axis ends.
// A 180° arc between the major-axis ends is ill-conditioned in SVG's
// centre solve (a square root of a near-zero radicand amplifies the
// 3-decimal rounding of the endpoints): emitted that way, Chrome drew the
// handle 0.5 px smaller on both semi-axes at 610 — measured, 2026-09-18.
function ellipsePath(C, A, B, phiDeg, sweep) {
  const ph = (phiDeg * Math.PI) / 180;
  const ax = { x: A * Math.cos(ph), y: A * Math.sin(ph) };
  const bx = { x: -B * Math.sin(ph), y: B * Math.cos(ph) };
  const pts = [
    { x: C.x + ax.x, y: C.y + ax.y },
    { x: C.x + bx.x, y: C.y + bx.y },
    { x: C.x - ax.x, y: C.y - ax.y },
    { x: C.x - bx.x, y: C.y - bx.y },
  ];
  const order = sweep ? [0, 1, 2, 3, 0] : [0, 3, 2, 1, 0];
  let d = `M${P(pts[order[0]])}`;
  for (let i = 1; i < 5; i++) d += `A${f(A)} ${f(B)} ${f(phiDeg)} 0 ${sweep} ${P(pts[order[i]])}`;
  return d + "Z";
}
// Annulus: outer and inner circles wound opposite ways (nonzero fill leaves the hole).
function annulus(c, ri, ro, m, sc) {
  const C = m(c);
  return ellipsePath(C, sc(ro), sc(ro), 0, 1) + ellipsePath(C, sc(ri), sc(ri), 0, 0);
}
function ellipse(e, phiDeg, m, sc) {
  return ellipsePath(m(e), sc(e.a), sc(e.b), phiDeg, 1);
}
function circle(c, r, m, sc) {
  return ellipsePath(m(c), sc(r), sc(r), 0, 1);
}
// Quarter annulus from the top (−90°) clockwise to the right (0°), flat ends on the axes.
function quarter(a, m, sc) {
  const C = m(a);
  const RO = sc(a.ro), RI = sc(a.ri);
  return `M${f(C.x)} ${f(C.y - RO)}A${f(RO)} ${f(RO)} 0 0 1 ${f(C.x + RO)} ${f(C.y)}H${f(C.x + RI)}A${f(RI)} ${f(RI)} 0 0 0 ${f(C.x)} ${f(C.y - RI)}Z`;
}

function mark(m, sc, black = BLACK, red = RED) {
  // Handle first so the ring's band covers its inner end (both black).
  const blackD =
    ellipse(HANDLE, HANDLE.phiDeg, m, sc) +
    annulus(RING, RING.ri, RING.ro, m, sc) +
    ellipse(SHADOW, 0, m, sc);
  const redD = circle(DOT, DOT.r, m, sc) + ARCS.map((a) => quarter(a, m, sc)).join("");
  return `<path fill="${black}" d="${blackD}"/><path fill="${red}" d="${redD}"/>`;
}

const icon =
  `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 32 32">` +
  `<path fill="#fff" d="M0 0h32v32H0z"/>` +
  mark(map, scale) +
  `</svg>`;
const bm = badgeMap();
const badge =
  `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="8 8 24 24">` +
  mark(bm.map, bm.scale) +
  `</svg>`;
// Dark pill: the black ring cannot read on a dark frame; the brand's own
// dark treatment is the white logo, so the dark badge is the mark in white.
const badgeDark =
  `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="8 8 24 24">` +
  mark(bm.map, bm.scale, "#fff", "#fff") +
  `</svg>`;

const twinPath = args.includes("--twin") ? args[args.indexOf("--twin") + 1] : null;
if (twinPath) {
  const twin =
    `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 32 32">` +
    mark(map, scale, "#fff", "#fff") +
    `</svg>`;
  writeFileSync(twinPath, twin + "\n");
  console.log(`wrote dark twin → ${twinPath}`);
}
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "icon.svg"), icon + "\n");
writeFileSync(join(outDir, "badge.svg"), badge + "\n");
writeFileSync(join(outDir, "badge-dark.svg"), badgeDark + "\n");
console.log(`wrote icon.svg (${icon.length} B), badge.svg, badge-dark.svg → ${outDir}`);
console.log(`framing k ${K.toFixed(7)} o ${(O + REG.tx).toFixed(5)}/${(O + REG.ty).toFixed(5)}`);
