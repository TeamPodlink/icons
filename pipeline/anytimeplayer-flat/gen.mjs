// Anytime Podcast Player flat glyph: measured geometry of the Liquid Glass
// master (packages/refraction/assets/anytimeplayer.png — ictool's render of
// the App Store artwork the bundle carries, 1024) -> SVG paths in 32 units.
// Every constant in M was measured on that raster at the 0.5-coverage level
// of its green channel (plate #F90 G=153, mark G=255): least-squares circles
// and axis-aligned/rotated ellipses on boundary points sampled along rays,
// total-least-squares lines on edge crossings, all with pixel i covering
// [i, i+1). Ledger: pipeline/README.md, "anytimeplayer: the mark measured
// as primitives (2026-09-21)". R holds the scored refinements (each within
// measurement noise; see the ledger table) applied on top of M.
//
// Construction (painter's order, no evenodd): plate; the ring as an
// evenodd annulus; the white play triangle as the hull of three equal
// corner circles; each letter as an ORANGE bowl ellipse plus stem painted
// over the triangle; each counter as a WHITE ellipse painted last (the
// counters overhang the stems by ~3 px on the master, so they are not
// holes cut by the stem). Letters outside the triangle vanish into the
// plate, which is what the master shows (the a's bowl is flush with the
// left edge; the p's descender is invisible below the lower edge).
//
// Usage:
//   node pipeline/anytimeplayer-flat/gen.mjs --svg     print icon.svg
//   node pipeline/anytimeplayer-flat/gen.mjs --badge   print badge.svg
//   node pipeline/anytimeplayer-flat/gen.mjs --write   write both into platforms/anytimeplayer/
//   node pipeline/anytimeplayer-flat/gen.mjs --score [chrome|librsvg] [params.json]
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Measured (1024 px space).
export const M = {
  ring: { cx: 511.18, cy: 511.35, rIn: 385.55, rOut: 440.14 },          // rays every 1.5°, last two crossings; rms 1.16 (the raster's ~3 px edge ramp)
  tri: { c0: [344.19, 212.51], c1: [851.35, 514.78], c2: [343.79, 817.49], r: 27.25 }, // corner circles (rms 0.14 / 0.09 / 0.11), r = their mean
  // Letters. Angles are about the counter centre, 0° = +x, 90° = +y (down). Each bowl is a chain of
  // measured arcs (window -> least-squares circle, rms in px); the outer side of the a (150–210°) is
  // hidden behind the triangle's left edge, so it borrows the p's measured outer side, mirrored.
  a: {
    counter: { cx: 415.5, cy: 510.09, ra: 77.82, rb: 81.65, rot: 0 },     // rms 0.27
    arcs: [ // clockwise from the stem notch
      { c: [406.55, 520.48], r: 110.05, to: 110 },   // bottom     (60–120°, rms 0.18)
      { c: [410.18, 518.5], r: 113.47, to: 150 },    // lower-left (120–150°, rms 0.15)
      { c: [428.69, 508.99], r: 133.12, to: 210 },   // outer side: the p's (−30..30°) mirrored about the counter centres
      { c: [417.18, 511.74], r: 123.42, to: 250 },   // upper-left (210–240°, rms 0.12)
      { c: [415.25, 515.66], r: 126.01, to: 300 },   // top        (240–300°, rms 0.17)
      { c: [417.41, 506.35], r: 116.6, to: 360 },    // upper-right (300–330°, rms 0.08); ends at its rightmost point
    ],
    stem: { x1: 490.56, x2: 534.47, bottom: 629.31 },                      // edges from rows 594–640; cap = semicircle of the half-width, lowest point 629.31
  },
  p: {
    counter: { cx: 676.37, cy: 514.98, ra: 77.73, rb: 81.68, rot: 0 },     // rms 0.28
    arcs: [ // counter-clockwise from the stem notch
      { c: [684.79, 528.19], r: 107.22, to: 45 },    // bottom      (45–135°, rms 0.16)
      { c: [663.18, 516.08], r: 133.12, to: -30 },   // outer side  (−30..30°, rms 0.17); the 30–60° window is the notch (10 points) and is folded in
      { c: [677.52, 512.37], r: 118.42, to: -60 },   // upper-right (300–330°, rms 0.06)
      { c: [676.75, 521.69], r: 127.14, to: -120 },  // top         (240–300°, rms 0.23)
      { c: [674.53, 510.89], r: 116.37, to: -180 },  // upper-left  (210–240°, rms 0.09); ends at its leftmost point
    ],
    stem: { x1: 557.02, x2: 601.58, bottom: 760 },                         // edges from rows 620–700; the descender is invisible below the triangle, 760 keeps it inside the ring
  },
};
// Scored refinements (px), applied additively to M: a bounded coordinate descent (±1 px per constant, steps
// 0.5 → 0.05, junction angles and the p's stem bottom held; scored with librsvg, which sits within 0.03 of Chrome
// on this artwork). 5.38 → 4.00 central. The two constants at the ±1 bound are the a's borrowed outer side
// (a.arcs.2.r, a mirror of the p's, not a measurement) and the p's bottom arc radius (p.arcs.0.r, whose fit
// window ends at the notch). Nothing else moved more than 0.5 px.
export const R = {
  "ring.cx": 0.15,
  "ring.cy": 0.05,
  "ring.rIn": 0.05,
  "ring.rOut": -0.05,
  "tri.c0.1": -0.4,
  "tri.c1.0": 0.25,
  "tri.c2.0": 0.45,
  "tri.c2.1": -0.1,
  "a.counter.cx": -0.3,
  "a.counter.ra": -0.35,
  "a.counter.rb": 0.1,
  "a.arcs.0.c.0": -0.2,
  "a.arcs.1.c.0": 0.5,
  "a.arcs.1.c.1": 0.5,
  "a.arcs.2.c.0": 0.15,
  "a.arcs.2.c.1": -0.5,
  "a.arcs.2.r": 1,
  "a.arcs.4.c.0": 0.1,
  "a.arcs.4.c.1": -0.05,
  "a.arcs.5.c.0": 0.15,
  "a.arcs.5.c.1": 0.2,
  "a.arcs.5.r": 0.1,
  "a.stem.x1": -0.15,
  "a.stem.x2": 0.1,
  "a.stem.bottom": 0.1,
  "p.counter.cx": 0.25,
  "p.counter.ra": -0.25,
  "p.counter.rb": 0.15,
  "p.arcs.0.c.0": 0.5,
  "p.arcs.0.c.1": -0.9,
  "p.arcs.0.r": 1,
  "p.arcs.1.c.1": -0.25,
  "p.arcs.2.c.0": -0.05,
  "p.arcs.2.c.1": -0.1,
  "p.arcs.3.c.0": -0.15,
  "p.arcs.4.c.0": -0.25,
  "p.arcs.4.c.1": 0.35,
  "p.arcs.4.r": 0.1,
  "p.stem.x1": 0.15,
  "p.stem.x2": -0.15,
};

const f = (v) => { const s = (Math.round((v / 32) * 10000) / 10000).toString(); return s.replace(/^(-?)0\./, "$1."); };
const P = (p) => `${f(p[0])} ${f(p[1])}`;
export function apply(M, R = {}) { const out = JSON.parse(JSON.stringify(M)); for (const k in R) { const path = k.split("."); let o = out; for (let i = 0; i < path.length - 1; i++) o = o[path[i]]; o[path.at(-1)] += R[k]; } return out; }

function ellipsePath({ cx, cy, ra, rb, rot }) {
  // four quarter arcs (no 180° ambiguity): parametric points at 0°, 90°, 180°, 270° on the rotated ellipse
  const t = rot * Math.PI / 180, ct = Math.cos(t), st = Math.sin(t);
  const pt = (u) => [cx + ra * Math.cos(u) * ct - rb * Math.sin(u) * st, cy + ra * Math.cos(u) * st + rb * Math.sin(u) * ct];
  const q = [0, Math.PI / 2, Math.PI, 1.5 * Math.PI].map(pt);
  return `M${P(q[0])}` + [1, 2, 3, 0].map((i) => `A${f(ra)} ${f(rb)} ${rot} 0 1 ${P(q[i])}`).join("") + "Z";
}
const circlePath = (cx, cy, r) => `M${P([cx + r, cy])}A${f(r)} ${f(r)} 0 0 1 ${P([cx, cy + r])}A${f(r)} ${f(r)} 0 0 1 ${P([cx - r, cy])}A${f(r)} ${f(r)} 0 0 1 ${P([cx, cy - r])}A${f(r)} ${f(r)} 0 0 1 ${P([cx + r, cy])}Z`;
function triPath({ c0, c1, c2, r }) {
  const C = [c0, c1, c2]; const cen = [(c0[0] + c1[0] + c2[0]) / 3, (c0[1] + c1[1] + c2[1]) / 3];
  const N = C.map((a, i) => { const b = C[(i + 1) % 3]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); let n = [dy / l, -dx / l]; if ((a[0] - cen[0]) * n[0] + (a[1] - cen[1]) * n[1] < 0) n = [-n[0], -n[1]]; return n; });
  const T = (i, n) => [C[i][0] + r * n[0], C[i][1] + r * n[1]];
  // orientation: c0 -> c1 -> c2 is clockwise on screen (top-left, apex, bottom-left)? cross of (c1-c0, c2-c0) > 0 => clockwise in y-down
  const cw = (c1[0] - c0[0]) * (c2[1] - c0[1]) - (c1[1] - c0[1]) * (c2[0] - c0[0]) > 0; const sw = cw ? 1 : 0;
  let d = `M${P(T(0, N[0]))}`;
  for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; d += `L${P(T(j, N[i]))}A${f(r)} ${f(r)} 0 0 ${sw} ${P(T(j, N[j]))}`; }
  return d + "Z";
}
// Intersection of two circles nearest a direction from a centre point.
function meet(A, B, C, angDeg) {
  const t = angDeg * Math.PI / 180; const want = [C[0] + 120 * Math.cos(t), C[1] + 120 * Math.sin(t)];
  const dx = B.c[0] - A.c[0], dy = B.c[1] - A.c[1], d = Math.hypot(dx, dy);
  const a = (A.r * A.r - B.r * B.r + d * d) / (2 * d), h2 = A.r * A.r - a * a;
  if (h2 < 0) return want.map((v, i) => C[i] + (v - C[i]) * ((A.r + B.r) / 2) / 120); // no intersection: the mean radius on the ray
  const h = Math.sqrt(h2), px = A.c[0] + a * dx / d, py = A.c[1] + a * dy / d;
  const cands = [[px - h * dy / d, py + h * dx / d], [px + h * dy / d, py - h * dx / d]];
  cands.sort((p, q) => Math.hypot(p[0] - want[0], p[1] - want[1]) - Math.hypot(q[0] - want[0], q[1] - want[1]));
  return cands[0];
}
const onCircle = (A, angDeg) => { const t = angDeg * Math.PI / 180; return [A.c[0] + A.r * Math.cos(t), A.c[1] + A.r * Math.sin(t)]; };
// The a: one outline, clockwise: stem notch J -> bowl arcs -> rightmost point -> down the stem -> cap -> up to J.
function letterA({ counter, arcs, stem }) {
  const C = [counter.cx, counter.cy]; const B = arcs[0];
  const J = [stem.x1, B.c[1] + Math.sqrt(B.r * B.r - (stem.x1 - B.c[0]) ** 2)];       // bottom arc meets the stem's left edge
  const E = [arcs.at(-1).c[0] + arcs.at(-1).r, arcs.at(-1).c[1]];                       // upper-right arc's rightmost point
  let d = `M${P(J)}`; let from = J;
  for (let i = 0; i < arcs.length; i++) { const to = i < arcs.length - 1 ? meet(arcs[i], arcs[i + 1], C, arcs[i].to) : E; d += `A${f(arcs[i].r)} ${f(arcs[i].r)} 0 0 1 ${P(to)}`; from = to; }
  const r = (stem.x2 - stem.x1) / 2, yc = stem.bottom - r;
  d += `L${P([stem.x2, E[1]])}V${f(yc)}A${f(r)} ${f(r)} 0 0 1 ${P([stem.x1, yc])}Z`;
  return d;
}
// The p: one outline, counter-clockwise: stem notch J -> bowl arcs -> leftmost point -> down the stem -> across -> up to J.
function letterP({ counter, arcs, stem }) {
  const C = [counter.cx, counter.cy]; const B = arcs[0];
  const J = [stem.x2, B.c[1] + Math.sqrt(B.r * B.r - (stem.x2 - B.c[0]) ** 2)];
  const E = [arcs.at(-1).c[0] - arcs.at(-1).r, arcs.at(-1).c[1]];
  let d = `M${P(J)}`;
  for (let i = 0; i < arcs.length; i++) { const to = i < arcs.length - 1 ? meet(arcs[i], arcs[i + 1], C, arcs[i].to) : E; d += `A${f(arcs[i].r)} ${f(arcs[i].r)} 0 0 0 ${P(to)}`; }
  d += `L${P([stem.x1, E[1]])}V${f(stem.bottom)}H${f(stem.x2)}Z`;
  return d;
}
export function paths(G) {
  const ring = circlePath(G.ring.cx, G.ring.cy, G.ring.rOut) + circlePath(G.ring.cx, G.ring.cy, G.ring.rIn);
  const tri = triPath(G.tri);
  const letters = letterA(G.a) + letterP(G.p);
  const counters = ellipsePath(G.a.counter) + ellipsePath(G.p.counter);
  return { ring, tri, letters, counters };
}
export function svg(G = apply(M, R), { badge = false } = {}) {
  const { ring, tri, letters, counters } = paths(G);
  const body = `<path fill="#F90" d="M0 0h32v32H0z"/><path fill="#fff" fill-rule="evenodd" d="${ring}"/><path fill="#fff" d="${tri}"/><path fill="#F90" d="${letters}"/><path fill="#fff" d="${counters}"/>`;
  if (badge) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n  <defs><clipPath id="shape"><path d="M16 0C30.545 0 32 1.455 32 16S30.545 32 16 32S0 30.545 0 16S1.455 0 16 0Z"/></clipPath></defs>\n  <g clip-path="url(#shape)">${body}</g>\n</svg>\n`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n  ${body}\n</svg>\n`;
}

// ---- scoring: the facet-drift audit's central RMSE at 256 against the master
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MASTER = join(root, "packages/refraction/assets/anytimeplayer.png");
const to256 = async (input) => sharp(input, Buffer.isBuffer(input) && input.length === 1024 * 1024 * 4 ? { raw: { width: 1024, height: 1024, channels: 4 } } : {}).ensureAlpha().resize(256, 256, { kernel: "lanczos3" }).raw().toBuffer();
const overGray = (rgba) => { const out = new Float64Array(256 * 256 * 3); for (let p = 0; p < 256 * 256; p++) { const a = rgba[p * 4 + 3] / 255; for (let c = 0; c < 3; c++) out[p * 3 + c] = rgba[p * 4 + c] * a + 128 * (1 - a); } return out; };
let master256;
export async function score(svgText, engine = "librsvg", work = "/tmp/anytimeplayer-flat-work") {
  if (!master256) master256 = overGray(await to256(MASTER));
  let rgba;
  if (engine === "chrome") {
    mkdirSync(work, { recursive: true }); const dir = join(work, `chrome-${Math.floor(Math.random() * 1e9)}`); mkdirSync(dir);
    writeFileSync(join(dir, "icon.svg"), svgText);
    writeFileSync(join(dir, "wrap.html"), `<!doctype html><html><head><style>html,body{margin:0;padding:0}img{width:1024px;height:1024px;display:block}</style></head><body><img src="icon.svg"></body></html>`);
    const png = join(dir, "out.png");
    execFileSync(CHROME, ["--headless=new", "--disable-gpu", `--screenshot=${png}`, "--window-size=1024,1024", "--default-background-color=00000000", join(dir, "wrap.html")], { stdio: "ignore" });
    rgba = await to256(readFileSync(png)); rmSync(dir, { recursive: true, force: true });
  } else rgba = await to256(await sharp(Buffer.from(svgText), { density: 72 * 32 }).ensureAlpha().resize(1024, 1024).raw().toBuffer());
  const fl = overGray(rgba); let s = 0, n = 0;
  for (let y = 51; y <= 204; y++) for (let x = 51; x <= 204; x++) { const i = (y * 256 + x) * 3; for (let c = 0; c < 3; c++) { const d = master256[i + c] - fl[i + c]; s += d * d; n++; } }
  return Math.sqrt(s / n);
}

if (process.argv[1]?.endsWith("gen.mjs")) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--svg") process.stdout.write(svg());
  else if (cmd === "--badge") process.stdout.write(svg(undefined, { badge: true }));
  else if (cmd === "--write") { writeFileSync(join(root, "platforms/anytimeplayer/icon.svg"), svg()); writeFileSync(join(root, "platforms/anytimeplayer/badge.svg"), svg(undefined, { badge: true })); console.log("wrote icon.svg + badge.svg"); }
  else if (cmd === "--score") { const engine = rest[0] ?? "librsvg"; const G = rest[1] ? apply(M, JSON.parse(readFileSync(rest[1], "utf8"))) : apply(M, R); console.log(`central ${engine}: ${(await score(svg(G), engine)).toFixed(3)}`); }
  else console.error("usage: gen.mjs --svg | --badge | --write | --score [chrome|librsvg] [refinements.json]");
}
