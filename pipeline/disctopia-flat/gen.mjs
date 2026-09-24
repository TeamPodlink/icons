// Disctopia flat glyph: measured geometry of the Liquid Glass master
// (packages/refraction/assets/disctopia.png — ictool's render of the App
// Store artwork the bundle carries, 1024) -> SVG paths in 32 units. A TRACE,
// fit parametrically (icon-to-flat-svg, "Falling back to a trace"): no
// official vector exists — the bundle ships glyph.png only, disctopia.com
// serves a PNG logo with no inline SVG and no press kit, and the search
// found nothing (2026-09-22; the IPA catalogue and Android APK are recorded
// in the ledger entry). Every constant in M was measured on the master at
// the 0.5-coverage level of its brightest channel (plate black, mark ≥ 150),
// pixel i covering [i, i+1): total-least-squares lines, least-squares
// circles in 30° windows about (470, 515) for the D's two outlines (neither
// a circle, an ellipse nor a superellipse — rms 2.3–5 — but each window
// ≤ 0.25), the gradient as per-column means of the mark's interior.
// Ledger: pipeline/README.md, "disctopia: the D and the chevron, traced
// from primitives (2026-09-22)".
//
// Construction: the D as one evenodd path — the outer outline (stem edge
// x 281.11 from where the top arc meets it to where the bottom arc does,
// then eight arcs clockwise) minus the counter (stem inner edge x 351.67
// and its eight arcs); the chevron as one outline of four measured lines,
// its two apex fillets, its arms ending inside the stem. One horizontal
// gradient fills both.
//
// Usage:
//   node pipeline/disctopia-flat/gen.mjs --svg | --badge | --write
//   node pipeline/disctopia-flat/gen.mjs --score [chrome|librsvg] [refinements.json]
import { writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const M = {
  stemOuter: 281.11, // TLS on 540 row crossings, rms 0.002
  stemInner: 351.67, // rms 0.62 (the chevron's arms meet it)
  outer: { // arcs clockwise on screen from the top (240° is up-left of the window centre), each a least-squares circle on its 30° window
    arcs: [
      { c: [496.97, 3634.44], r: 3434.22, to: 270 }, // 240–270°, rms 0.165, n 178,
      { c: [472.73, 545], r: 344.07, to: 300 }, // 270–300°, rms 0.124, n 193,
      { c: [487.52, 512.21], r: 307.91, to: 330 }, // 300–330°, rms 0.095, n 230,
      { c: [457.91, 514.62], r: 334.79, to: 0 }, // 330–0°, rms 0.148, n 199,
      { c: [453.67, 532.48], r: 339.33, to: 30 }, // 0–30°, rms 0.163, n 197,
      { c: [543.15, 568.51], r: 243.2, to: 60 }, // 30–60°, rms 0.244, n 233,
      { c: [489.02, 454.29], r: 370.21, to: 90 }, // 60–90°, rms 0.128, n 187,
      { c: [491.19, -1335.83], r: 2160.19, to: 120 }, // 90–120°, rms 0.106, n 174
    ],
  },
  inner: {
    arcs: [
      { c: [458.49, 2208.04], r: 1938.79, to: 270 }, // 240–270°, rms 0.13, n 117,
      { c: [469.35, 531.24], r: 261.75, to: 300 }, // 270–300°, rms 0.1, n 154,
      { c: [478.49, 512.28], r: 240.42, to: 330 }, // 300–330°, rms 0.094, n 177,
      { c: [455.26, 514.55], r: 261.85, to: 0 }, // 330–0°, rms 0.128, n 152,
      { c: [433.39, 532.76], r: 284.1, to: 30 }, // 0–30°, rms 0.194, n 151,
      { c: [527.98, 562.17], r: 185.71, to: 60 }, // 30–60°, rms 0.149, n 180,
      { c: [487.07, 461.04], r: 295.43, to: 90 }, // 60–90°, rms 0.136, n 146,
      { c: [466.05, -579.06], r: 1335.5, to: 120 }, // 90–120°, rms 0.113, n 117
    ],
  },
  chevron: { // lines a·x + b·y = c (a, b unit); the arms' left edges bound the notch, the right edges the arrow
    upperLeft: { a: -0.432706, b: 0.901535, c: 233.03 },   // rms 0.08, 25.64°
    lowerLeft: { a: 0.434285, b: 0.900776, c: 701.231 },   // rms 0.17, −25.74°
    upperRight: { a: -0.43283, b: 0.901476, c: 165.85 },   // rms 0.08, 25.65°
    lowerRight: { a: 0.432499, b: 0.901634, c: 768.006 },  // rms 0.08, −25.63°
    apexR: 0,      // the outer apex is sharp on the master (zoom at 3×; a 20-point circle fit read r 8.6 at rms 2.1 — antialiasing, not a fillet)
    notchR: 11.58, // notch apex fillet, circle on 26 boundary points, rms 0.46
    stemR: 13.9,   // the notch's corners against the stem: the sharp vertices sit at y 427.2 / 609.0 (line ∩ stem edge) and the notch opens at 437.5 / 598.5; for the 64.4° corner a fillet's nearest point is 0.742·r below the vertex → r 13.9
  },
  gradient: [ // x (px) -> colour, per-column mean of the mark's interior (3 px inside every edge); linear blue→green to 546, flat to 612, then the eased ramp to the bowl's edge
    [288, "#A2C1E5"],
    [546, "#A2CF64"],
    [612, "#A2CF64"],
    [624, "#A1CE64"],
    [636, "#A1CD65"],
    [648, "#9FCC65"],
    [660, "#9DCC66"],
    [672, "#9BCA67"],
    [684, "#98C869"],
    [696, "#93C66C"],
    [708, "#8DC16F"],
    [720, "#86BE72"],
    [732, "#7BB878"],
    [744, "#6FB07E"],
    [756, "#5FA686"],
    [768, "#4B9B90"],
    [780, "#348C9C"],
    [786, "#2684A3"],
    [793, "#1E7FA7"]
  ],
};
// Scored refinements (px), applied additively to M: a bounded coordinate descent (±1 px per constant, ±3 on the
// two fillet radii, the outer apex held sharp, window angles, line directions and the gradient held; steps 0.5 →
// 0.05; librsvg scoring, within 0.15 of Chrome here). 5.54 → 1.78 central. No arc centre moved more than 0.85 px;
// the stem-corner fillet grew 1.8 (13.9 → 15.7) and the notch apex shrank 0.8.
export const R = {
  "stemOuter": 0.2,
  "stemInner": -0.3,
  "outer.arcs.0.c.0": 0.7,
  "outer.arcs.0.c.1": 0.1,
  "outer.arcs.1.c.0": -0.85,
  "outer.arcs.1.r": 0.15,
  "outer.arcs.2.c.0": 0.2,
  "outer.arcs.2.c.1": 0.1,
  "outer.arcs.3.c.0": 0.35,
  "outer.arcs.3.c.1": 0.2,
  "outer.arcs.4.c.0": 0.25,
  "outer.arcs.4.c.1": 0.1,
  "outer.arcs.5.c.0": -0.25,
  "outer.arcs.5.c.1": 0.4,
  "outer.arcs.6.c.0": -0.85,
  "outer.arcs.7.c.0": 0.75,
  "inner.arcs.0.c.0": -0.1,
  "inner.arcs.0.c.1": 0.1,
  "inner.arcs.1.c.0": -0.5,
  "inner.arcs.1.c.1": 0.5,
  "inner.arcs.2.c.1": 0.5,
  "inner.arcs.3.c.1": -0.2,
  "inner.arcs.4.c.0": -0.05,
  "inner.arcs.4.c.1": 0.25,
  "inner.arcs.5.c.0": -0.45,
  "inner.arcs.5.c.1": 0.5,
  "inner.arcs.6.c.0": -0.8,
  "inner.arcs.7.c.1": 0.05,
  "chevron.lowerLeft.c": -0.05,
  "chevron.upperRight.c": 0.05,
  "chevron.lowerRight.c": -0.05,
  "chevron.notchR": -0.8,
  "chevron.stemR": 1.8,
};

const f = (v) => { const s = (Math.round((v / 32) * 10000) / 10000).toString(); return s.replace(/^(-?)0\./, "$1."); };
const P = (p) => `${f(p[0])} ${f(p[1])}`;
export function apply(M, R = {}) { const out = JSON.parse(JSON.stringify(M)); for (const k in R) { const path = k.split("."); let o = out; for (let i = 0; i < path.length - 1; i++) o = o[path[i]]; o[path.at(-1)] += R[k]; } return out; }
const CEN = [470, 515];
const lineLine = (l1, l2) => { const det = l1.a * l2.b - l1.b * l2.a; return [(l1.c * l2.b - l1.b * l2.c) / det, (l1.a * l2.c - l1.c * l2.a) / det]; };
function circleCircle(A, B, hint) { const dx = B.c[0] - A.c[0], dy = B.c[1] - A.c[1], d = Math.hypot(dx, dy); const a = (A.r * A.r - B.r * B.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, A.r * A.r - a * a)); const px = A.c[0] + a * dx / d, py = A.c[1] + a * dy / d; const c1 = [px - h * dy / d, py + h * dx / d], c2 = [px + h * dy / d, py - h * dx / d]; return Math.hypot(c1[0] - hint[0], c1[1] - hint[1]) < Math.hypot(c2[0] - hint[0], c2[1] - hint[1]) ? c1 : c2; }
// a vertical line x = X meets circle A: the point nearest `hint`
function lineXCircle(X, A, hint) { const dx = X - A.c[0]; const h = Math.sqrt(Math.max(0, A.r * A.r - dx * dx)); const c1 = [X, A.c[1] - h], c2 = [X, A.c[1] + h]; return Math.hypot(c1[1] - hint[1]) < Math.hypot(c2[1] - hint[1]) ? c1 : c2; }
// fillet between two lines meeting at V, radius r: tangent points and the arc's centre side chosen toward `inside`
function fillet(l1, l2, r, inside) { const V = lineLine(l1, l2); const cands = []; for (const s1 of [1, -1]) for (const s2 of [1, -1]) { const o1 = { ...l1, c: l1.c + s1 * r }, o2 = { ...l2, c: l2.c + s2 * r }; const C = lineLine(o1, o2); cands.push(C); } cands.sort((p, q) => Math.hypot(p[0] - inside[0], p[1] - inside[1]) - Math.hypot(q[0] - inside[0], q[1] - inside[1])); const C = cands[0]; const foot = (l) => { const d = l.a * C[0] + l.b * C[1] - l.c; return [C[0] - l.a * d, C[1] - l.b * d]; }; return { t1: foot(l1), t2: foot(l2), C, V }; }
const arcCmd = (r, p, sweep = 1) => `A${f(r)} ${f(r)} 0 0 ${sweep} ${P(p)}`;
export function paths(G) {
  // the D's outlines: from the stem edge at the top, clockwise round the arcs, back to the stem edge at the bottom, then up the stem
  const chain = (arcs, X, hintTop, hintBot) => {
    const pts = []; const start = lineXCircle(X, arcs[0], hintTop); let d = `M${P(start)}`;
    for (let i = 0; i < arcs.length; i++) { const to = i < arcs.length - 1 ? circleCircle(arcs[i], arcs[i + 1], (() => { const t = ((arcs[i].to) * Math.PI) / 180; return [CEN[0] + 300 * Math.cos(t), CEN[1] + 300 * Math.sin(t)]; })()) : lineXCircle(X, arcs[i], hintBot); d += arcCmd(arcs[i].r, to, 1); }
    return d + "Z"; // the closing line runs up the stem edge
  };
  const D = chain(G.outer.arcs, G.stemOuter, [G.stemOuter, 210], [G.stemOuter, 812]) + chain(G.inner.arcs, G.stemInner, [G.stemInner, 272], [G.stemInner, 752]);
  // the chevron: start on the stem (inside it) at the upper-right edge, out to the apex fillet, back along the lower-right edge into the stem,
  // then up the stem's inner side? No — the arms end INSIDE the stem, hidden: run the outline through x = 300.
  const C = G.chevron; const X0 = 300;
  const yOn = (l, x) => (l.c - l.a * x) / l.b;
  const apex = fillet(C.upperRight, C.lowerRight, C.apexR, [600, 518]);
  const notch = fillet(C.upperLeft, C.lowerLeft, C.notchR, [500, 518]); // the fillet centre lies inside the notch, left of its apex
  // the notch's corners against the stem's inner edge (vertical line x = stemInner)
  const stemL = { a: 1, b: 0, c: G.stemInner };
  const nTop = fillet(C.upperLeft, stemL, C.stemR, [380, 470]), nBot = fillet(C.lowerLeft, stemL, C.stemR, [380, 566]);
  let d = `M${P([X0, yOn(C.upperRight, X0)])}L${P(apex.t1)}${arcCmd(C.apexR, apex.t2, 1)}L${P([X0, yOn(C.lowerRight, X0)])}Z`;
  // the notch as a separate hole (evenodd): stem edge from nTop.t2 down to nBot.t2, fillet, lower-left edge to the notch apex, fillet, upper-left edge back, fillet
  d += `M${P(nTop.t2)}L${P(nBot.t2)}${arcCmd(C.stemR, nBot.t1, 0)}L${P(notch.t2)}${arcCmd(C.notchR, notch.t1, 0)}L${P(nTop.t1)}${arcCmd(C.stemR, nTop.t2, 0)}Z`;
  return { D, chevron: d };
}
export function svg(G = apply(M, R), { badge = false } = {}) {
  const { D, chevron } = paths(G);
  const x0 = G.gradient[0][0], x1 = G.gradient.at(-1)[0];
  const grad = `<linearGradient id="disctopia-g" gradientUnits="userSpaceOnUse" x1="${f(x0)}" y1="0" x2="${f(x1)}" y2="0">${G.gradient.map(([x, c]) => `<stop offset="${((x - x0) / (x1 - x0)).toFixed(3)}" stop-color="${c}"/>`).join("")}</linearGradient>`;
  const body = `<defs>${grad}</defs><path fill="#000" d="M0 0h32v32H0z"/><path fill="url(#disctopia-g)" fill-rule="evenodd" d="${D}"/><path fill="url(#disctopia-g)" fill-rule="evenodd" d="${chevron}"/>`;
  // badge: the mark bare (it reads on both pills, as the raster badge it replaces did), viewBox the mark's bbox padded 2% in the icon's 32-unit space
  if (badge) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="8.46 5.86 16.64 20.28">\n  <defs>${grad}</defs><path fill="url(#disctopia-g)" fill-rule="evenodd" d="${D}"/><path fill="url(#disctopia-g)" fill-rule="evenodd" d="${chevron}"/>\n</svg>\n`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n  ${body}\n</svg>\n`;
}
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MASTER = join(root, "packages/refraction/assets/disctopia.png");
const to256 = async (input) => sharp(input, Buffer.isBuffer(input) && input.length === 1024 * 1024 * 4 ? { raw: { width: 1024, height: 1024, channels: 4 } } : {}).ensureAlpha().resize(256, 256, { kernel: "lanczos3" }).raw().toBuffer();
const overGray = (rgba) => { const out = new Float64Array(256 * 256 * 3); for (let p = 0; p < 256 * 256; p++) { const a = rgba[p * 4 + 3] / 255; for (let c = 0; c < 3; c++) out[p * 3 + c] = rgba[p * 4 + c] * a + 128 * (1 - a); } return out; };
let master256;
export async function score(svgText, engine = "librsvg", work = "/tmp/disctopia-flat-work") {
  if (!master256) master256 = overGray(await to256(MASTER));
  let rgba;
  if (engine === "chrome") { mkdirSync(work, { recursive: true }); const dir = join(work, `chrome-${Math.floor(Math.random() * 1e9)}`); mkdirSync(dir); writeFileSync(join(dir, "icon.svg"), svgText); writeFileSync(join(dir, "wrap.html"), `<!doctype html><html><head><style>html,body{margin:0;padding:0}img{width:1024px;height:1024px;display:block}</style></head><body><img src="icon.svg"></body></html>`); const png = join(dir, "out.png"); execFileSync(CHROME, ["--headless=new", "--disable-gpu", `--screenshot=${png}`, "--window-size=1024,1024", "--default-background-color=00000000", join(dir, "wrap.html")], { stdio: "ignore" }); rgba = await to256(readFileSync(png)); rmSync(dir, { recursive: true, force: true }); }
  else rgba = await to256(await sharp(Buffer.from(svgText), { density: 72 * 32 }).ensureAlpha().resize(1024, 1024).raw().toBuffer());
  const fl = overGray(rgba); let s = 0, n = 0; for (let y = 51; y <= 204; y++) for (let x = 51; x <= 204; x++) { const i = (y * 256 + x) * 3; for (let c = 0; c < 3; c++) { const d = master256[i + c] - fl[i + c]; s += d * d; n++; } } return Math.sqrt(s / n);
}
if (process.argv[1]?.endsWith("gen.mjs")) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--svg") process.stdout.write(svg());
  else if (cmd === "--badge") process.stdout.write(svg(undefined, { badge: true }));
  else if (cmd === "--write") { writeFileSync(join(root, "platforms/disctopia/icon.svg"), svg()); writeFileSync(join(root, "platforms/disctopia/badge.svg"), svg(undefined, { badge: true })); console.log("wrote icon.svg + badge.svg"); }
  else if (cmd === "--score") { const engine = rest[0] ?? "librsvg"; const G = rest[1] ? apply(M, JSON.parse(readFileSync(rest[1], "utf8"))) : apply(M, R); console.log(`central ${engine}: ${(await score(svg(G), engine)).toFixed(3)}`); }
  else console.error("usage: gen.mjs --svg | --badge | --write | --score [chrome|librsvg] [refinements.json]");
}
