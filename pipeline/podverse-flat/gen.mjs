// Podverse flat glyph: measured geometry of the Liquid Glass master
// (packages/refraction/assets/podverse.png — ictool's render of the App Store
// artwork the bundle carries, 1024) -> SVG paths in 32 units. Every constant
// in M was measured on that raster at the 0.5-coverage level of its blue
// channel (plate 0, mark 179): least-squares circles, a general conic for the
// cup housing, total-least-squares lines, all with pixel i covering [i, i+1).
// The right cup mirrors the left within a pixel (its lines within 0.15°), so
// the mark is built once and mirrored about x = 512 (+ the measured shift). Ledger: pipeline/README.md,
// "podverse: the headphones measured as primitives (2026-09-22)".
//
// Construction (painter's order): plate; the headband as an annulus sector
// cut just below each housing's kink (the cuts hide inside the housings);
// each housing as its ellipse clipped by the slit line (the chord is the
// housing's straight slit edge); each pad as one outline of two side lines,
// a bottom end line and three corner arcs (the two top arcs meet each other;
// the bottom slit-side corner is sharp).
//
// Usage:
//   node pipeline/podverse-flat/gen.mjs --svg | --badge | --write
//   node pipeline/podverse-flat/gen.mjs --score [chrome|librsvg] [refinements.json]
import { writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const MARK = "#0D7AB3"; // interior mean over the band (13.0, 122.5, 179.1); the two modes are 14,122,179 and 12,123,179
export const M = {
  rightShift: -0.9, // the right cup sits 0.9 px closer to the centre than the left's exact mirror: pad centroids 402.27 (left) vs 620.84 (right, mirror 403.16); the lobe centroids agree (383.45 vs 384.12 mirrored)
  band: { cx: 512, cy: 510.4, rIn: 248.55, rOut: 305.15, cut: 137 }, // rays every 1°, 195–345°: rms 0.08 / 0.08; cut = the sector's end angle on the left (mirrored on the right), 2° below the housing kink at 139.3°
  lobe: { cx: 383.45, cy: 692.19, ra: 105.29, rb: 124.18, rot: -16.65 }, // conic on 284 boundary points (shoulder, bulge, bottom): rms 0.14; the long axis lies along the pad
  slit: { a: -0.962373, b: 0.271731, c: -154.426 },                      // the housing's slit edge: TLS on 119 row crossings, rms 0.07, dir 74.23°; 18.99 px from the pad's edge
  pad: {                                                                 // lines as a·x + b·y = c (a, b unit)
    slitSide: { a: -0.96238, b: 0.271706, c: -173.419 },                 // rms 0.06, dir 74.23°
    outerSide: { a: -0.962933, b: 0.269741, c: -231.519 },               // rms 0.06, dir 74.35°
    botEnd: { a: 0.191673, b: 0.981459, c: 881.374 },                    // rms 0.18 on 24 points
    topOuter: { cx: 363.79, cy: 598.97, r: 42.4 },                       // rms 0.04
    topSlit: { cx: 370.51, cy: 588.89, r: 33.99 },                       // rms 0.04; meets topOuter at their intersection — the top end has no flat
    botOuter: { cx: 429.06, cy: 784.15, r: 29.06 },                      // rms 0.11
  },
};
// Scored refinements (px), applied additively to M: a bounded coordinate descent (±1 px per constant, steps
// 0.5 → 0.05; angles and line directions held; librsvg scoring, within 0.02 of Chrome here). 1.82 → 1.42 central.
// The one constant at its bound is the pad's top-outer arc centre (pad.topOuter.cx, +1, with its radius −0.45):
// that arc's fit window is the shortest of the corner fits. Nothing else moved more than 0.7 px.
export const R = {
  "rightShift": 0.25,
  "band.rIn": 0.05,
  "band.rOut": -0.05,
  "lobe.cx": -0.35,
  "slit.c": 0.05,
  "pad.outerSide.c": -0.2,
  "pad.botEnd.c": -0.4,
  "pad.topOuter.cx": 1,
  "pad.topOuter.r": -0.45,
  "pad.topSlit.cx": -0.35,
  "pad.topSlit.cy": 0.2,
  "pad.topSlit.r": -0.05,
  "pad.botOuter.cy": -0.5,
  "pad.botOuter.r": 0.7,
};

const f = (v) => { const s = (Math.round((v / 32) * 10000) / 10000).toString(); return s.replace(/^(-?)0\./, "$1."); };
const P = (p) => `${f(p[0])} ${f(p[1])}`;
export function apply(M, R = {}) { const out = JSON.parse(JSON.stringify(M)); for (const k in R) { const path = k.split("."); let o = out; for (let i = 0; i < path.length - 1; i++) o = o[path[i]]; o[path.at(-1)] += R[k]; } return out; }

// ---- geometry helpers
const lineLine = (l1, l2) => { const det = l1.a * l2.b - l1.b * l2.a; return [(l1.c * l2.b - l1.b * l2.c) / det, (l1.a * l2.c - l1.c * l2.a) / det]; };
function lineCircle(l, C, hint) { // the line–circle junction: the tangent foot when the circle grazes the line, else the intersection nearest `hint`
  const d = l.a * C.cx + l.b * C.cy - l.c; const foot = [C.cx - l.a * d, C.cy - l.b * d]; const h2 = C.r * C.r - d * d;
  if (h2 < 9) return foot;
  const h = Math.sqrt(h2); const c1 = [foot[0] - l.b * h, foot[1] + l.a * h], c2 = [foot[0] + l.b * h, foot[1] - l.a * h];
  return Math.hypot(c1[0] - hint[0], c1[1] - hint[1]) < Math.hypot(c2[0] - hint[0], c2[1] - hint[1]) ? c1 : c2;
}
// path commands: [{ op: "M"|"L", p }, { op: "A", r, large, sweep, p }, { op: "E", ra, rb, rot, large, sweep, p }]
function serialize(cmds) {
  return cmds.map((c) => c.op === "A" ? `A${f(c.r)} ${f(c.r)} 0 ${c.large ?? 0} ${c.sweep} ${P(c.p)}` : c.op === "E" ? `A${f(c.ra)} ${f(c.rb)} ${c.rot} ${c.large} ${c.sweep} ${P(c.p)}` : `${c.op}${P(c.p)}`).join("") + "Z";
}
const onC = (C, deg) => [C.cx + C.r * Math.cos(deg * Math.PI / 180), C.cy + C.r * Math.sin(deg * Math.PI / 180)];

const circleCircle = (A, B, hint) => { const dx = B.cx - A.cx, dy = B.cy - A.cy, d = Math.hypot(dx, dy); const a = (A.r * A.r - B.r * B.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, A.r * A.r - a * a)); const px = A.cx + a * dx / d, py = A.cy + a * dy / d; const c1 = [px - h * dy / d, py + h * dx / d], c2 = [px + h * dy / d, py - h * dx / d]; return Math.hypot(c1[0] - hint[0], c1[1] - hint[1]) < Math.hypot(c2[0] - hint[0], c2[1] - hint[1]) ? c1 : c2; };
export function pieces(G) {
  const B = G.band, rad = (d) => d * Math.PI / 180;
  const pt = (r, deg) => [B.cx + r * Math.cos(rad(deg)), B.cy + r * Math.sin(rad(deg))];
  const a0 = B.cut, a1 = 180 - B.cut; // left end, right end (clockwise on screen from a0 through the top to a1)
  const band = [{ op: "M", p: pt(B.rOut, a0) }, { op: "A", r: B.rOut, large: 1, sweep: 1, p: pt(B.rOut, a1) }, { op: "L", p: pt(B.rIn, a1) }, { op: "A", r: B.rIn, large: 1, sweep: 0, p: pt(B.rIn, a0) }];
  // housing: the ellipse cut by the slit line, keeping the side the band is on
  const L = G.lobe, t = rad(L.rot), e1 = [Math.cos(t), Math.sin(t)], e2 = [-Math.sin(t), Math.cos(t)];
  const ep = (u) => [L.cx + L.ra * Math.cos(u) * e1[0] + L.rb * Math.sin(u) * e2[0], L.cy + L.ra * Math.cos(u) * e1[1] + L.rb * Math.sin(u) * e2[1]];
  const S = G.slit, side = (p) => S.a * p[0] + S.b * p[1] - S.c; // > 0 on the housing side (the band is at +55 there)
  const Ka = L.ra * (S.a * e1[0] + S.b * e1[1]), Kb = L.rb * (S.a * e2[0] + S.b * e2[1]), Kc = S.c - S.a * L.cx - S.b * L.cy;
  const base = Math.atan2(Kb, Ka), off = Math.acos(Math.max(-1, Math.min(1, Kc / Math.hypot(Ka, Kb))));
  let u1 = base - off, u2 = base + off; // increasing u is clockwise on screen (e2 = e1 turned 90° clockwise in y-down)
  const span = ((u2 - u1) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const midUp = ep(u1 + span / 2), keepUp = side(midUp) > 0; // the increasing-u arc from u1 to u2, or the other way round
  const lobe = keepUp
    ? [{ op: "M", p: ep(u1) }, { op: "E", ra: L.ra, rb: L.rb, rot: L.rot, large: span > Math.PI ? 1 : 0, sweep: 1, p: ep(u2) }]
    : [{ op: "M", p: ep(u2) }, { op: "E", ra: L.ra, rb: L.rb, rot: L.rot, large: 2 * Math.PI - span > Math.PI ? 1 : 0, sweep: 1, p: ep(u1) }];
  const D = G.pad;
  const p1 = lineCircle(D.slitSide, D.topSlit, [342, 572]), p2 = circleCircle(D.topSlit, D.topOuter, [340, 565]), p4 = lineCircle(D.outerSide, D.topOuter, [405, 600]);
  const p5 = lineCircle(D.outerSide, D.botOuter, [455, 790]), p6 = lineCircle(D.botEnd, D.botOuter, [430, 815]), p7 = lineLine(D.botEnd, D.slitSide);
  const pad = [{ op: "M", p: p1 }, { op: "A", r: D.topSlit.r, sweep: 1, p: p2 }, { op: "A", r: D.topOuter.r, sweep: 1, p: p4 }, { op: "L", p: p5 }, { op: "A", r: D.botOuter.r, sweep: 1, p: p6 }, { op: "L", p: p7 }];
  return { band, lobe, pad };
}
export function svg(G = apply(M, R), { badge = false } = {}) {
  const { band, lobe, pad } = pieces(G);
  const cup = serialize(lobe) + serialize(pad); // the left cup; the right one is its mirror about x = 16 (a transform, so no arc flag is re-derived)
  const body = `<path fill="#000" d="M0 0h32v32H0z"/><path fill="${MARK}" d="${serialize(band)}${cup}"/><path fill="${MARK}" d="${cup}" transform="matrix(-1 0 0 1 ${f(1024 + G.rightShift)} 0)"/>`;
  if (badge) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n  <defs><clipPath id="shape"><path d="M16 0C30.545 0 32 1.455 32 16S30.545 32 16 32S0 30.545 0 16S1.455 0 16 0Z"/></clipPath></defs>\n  <g clip-path="url(#shape)">${body}</g>\n</svg>\n`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n  ${body}\n</svg>\n`;
}

// ---- scoring: the facet-drift audit's central RMSE at 256 against the master
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MASTER = join(root, "packages/refraction/assets/podverse.png");
const to256 = async (input) => sharp(input, Buffer.isBuffer(input) && input.length === 1024 * 1024 * 4 ? { raw: { width: 1024, height: 1024, channels: 4 } } : {}).ensureAlpha().resize(256, 256, { kernel: "lanczos3" }).raw().toBuffer();
const overGray = (rgba) => { const out = new Float64Array(256 * 256 * 3); for (let p = 0; p < 256 * 256; p++) { const a = rgba[p * 4 + 3] / 255; for (let c = 0; c < 3; c++) out[p * 3 + c] = rgba[p * 4 + c] * a + 128 * (1 - a); } return out; };
let master256;
export async function score(svgText, engine = "librsvg", work = "/tmp/podverse-flat-work") {
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
  else if (cmd === "--write") { writeFileSync(join(root, "platforms/podverse/icon.svg"), svg()); writeFileSync(join(root, "platforms/podverse/badge.svg"), svg(undefined, { badge: true })); console.log("wrote icon.svg + badge.svg"); }
  else if (cmd === "--score") { const engine = rest[0] ?? "librsvg"; const G = rest[1] ? apply(M, JSON.parse(readFileSync(rest[1], "utf8"))) : apply(M, R); console.log(`central ${engine}: ${(await score(svg(G), engine)).toFixed(3)}`); }
  else console.error("usage: gen.mjs --svg | --badge | --write | --score [chrome|librsvg] [refinements.json]");
}
