// Airshow flat glyph: a TRACE of the shaded balloon illustration the bundle
// carries as a raster — measured primitives, flat fills, no painterly shading
// (icon-to-flat-svg, "Falling back to a trace"). No official vector exists:
// the IPA's catalogue holds the icon as an IconImageStack whose balloon layer
// is a 1024 × 1379 PNG and whose only vectors are the Feedbin logo and two UI
// glyphs; airshow.fm serves the wordmark as SVG and the balloon as a 314-px
// PNG; the app has no Android build; no press kit. Ledger: pipeline/README.md,
// "airshow: the balloon traced from primitives (2026-09-22)". Every constant
// in M was measured on the master (packages/refraction/assets/airshow.png,
// ictool's render of the store artwork, 1024): the envelope by rays from
// (511.5, 400) on a warm-colour test (R − B > 40, which the glass rim light
// fails) in 30° circle windows; the gore boundaries tracked row by row on the
// G/R ratio (yellow gores > 0.55) and fitted as circles or an ellipse; the
// lower assembly from hue classes; every colour a region mean.
//
// Construction (painter's order): plate; the envelope filled with gore 0's
// gradient; gores 1–4 as "everything right of boundary k" clipped to the
// envelope, each under its own vertical gradient; the load ring; the hub
// post; the two visible ropes; the basket bowl; the rim; the opening.
//
// Usage:
//   node pipeline/airshow-flat/gen.mjs --svg | --badge | --write
//   node pipeline/airshow-flat/gen.mjs --score [chrome|librsvg] [refinements.json]
import { writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const M = {
  envelope: { // arcs clockwise on screen from 120° (lower-left, above the neck) over the top to 60° (lower-right), about (511.5, 400); each a least-squares circle on its 30° window
    arcs: [
      { c: [570.11, 357.79], r: 359.67, to: 150 }, // 120–150°, rms 0.147,
      { c: [511.25, 374.27], r: 301.06, to: 180 }, // 150–180°, rms 0.145,
      { c: [448.32, 376.52], r: 237.61, to: 210 }, // 180–210°, rms 0.121,
      { c: [497.77, 421.84], r: 304.17, to: 240 }, // 210–240°, rms 0.512,
      { c: [492.57, 366.68], r: 255.49, to: 270 }, // 240–270°, rms 1.065,
      { c: [527.3, 380.95], r: 270.28, to: 300 }, // 270–300°, rms 1.122,
      { c: [510.33, 439.69], r: 327.92, to: 330 }, // 300–330°, rms 0.601,
      { c: [577.73, 375.97], r: 235.62, to: 0 }, // 330–0°, rms 0.135,
      { c: [517.49, 375.95], r: 296.19, to: 30 }, // 0–30°, rms 0.148,
      { c: [456.04, 359.66], r: 356.98, to: 60 }, // 30–60°, rms 0.122
    ],
  },
  gores: [ // 5 gores, left to right: `stops` [y, colour] are 20-row-band means of the master inside the gore (5 px in from its edges, every other band)
    { stops: [ [130, "#FFCD73"], [170, "#FF4D56"], [210, "#F92842"], [250, "#E20B39"], [290, "#C50C33"], [330, "#CA242F"], [370, "#D5332D"], [410, "#DE392B"], [450, "#E33D28"], [490, "#E74326"], [530, "#E73D25"], [570, "#E73C26"], [610, "#E73C26"], [650, "#E63320"] ] },
    { stops: [ [110, "#EBA86C"], [150, "#FFA861"], [190, "#FFD46B"], [230, "#FDE864"], [270, "#FFE45A"], [310, "#FFD853"], [350, "#FFCC4D"], [390, "#FFBD46"], [430, "#FFAC3E"], [470, "#FF9733"], [650, "#AE0925"] ] },
    { stops: [ [130, "#F43847"], [170, "#FF665A"], [210, "#FF5C56"], [250, "#FF484D"], [290, "#FE3645"], [330, "#FA243D"], [370, "#F51437"], [410, "#EA0832"], [450, "#E00131"], [490, "#D3012E"], [530, "#C5012B"], [570, "#BD022B"], [610, "#B7042A"], [650, "#AF0925"] ] },
    { stops: [ [130, "#FCBB58"], [170, "#FFFE7A"], [210, "#FFFE78"], [250, "#FFFE70"], [290, "#FFFF6E"], [330, "#FFFF6D"], [370, "#FFFF6C"], [410, "#FFFE69"], [450, "#FFF761"], [490, "#FFDB54"], [530, "#FFBB41"], [570, "#FE9B32"], [610, "#F77F2A"], [650, "#F26F27"] ] },
    { stops: [ [110, "#EF9563"], [150, "#FF414A"], [190, "#FF3747"], [230, "#FF2D41"], [270, "#FC253E"], [310, "#F81F3C"], [350, "#F51C3B"], [390, "#F41C3C"], [430, "#F21C3B"], [470, "#F1203E"], [510, "#F22741"], [550, "#F22C44"], [590, "#EA2640"], [630, "#EE5435"], [650, "#F6752D"] ] }
  ],
  // gore boundaries, left to right, each a curve from above the crown to below the neck (clipped to the envelope):
  b0: { upper: { c: [539.02, 397.46], r: 271.12 }, lower: { c: [549.3, 292.76], r: 253.68 }, join: 300 }, // two circle arcs (rms 1.9 / 0.7), joined at y 300; the boundary bows out to x 293 at y 290
  b1: { c: [988.6, 463.21], r: 589.01 },   // rms 1.1 over rows 130–560, the circle's left side
  b2: { c: [19.46, 466.09], r: 603.88 },   // rms 0.9, the circle's right side
  b3: { cx: 350.46, cy: 424.62, ra: 326.65, rb: 424.27, rot: 85.57 }, // ellipse, rms 0.8 (its right side)
  ring: { cx: 511.5, cy: 694, rx: 141.5, ry: 24, stops: [[370, "#762426"], [512, "#AC5457"], [653, "#F17C81"]], hole: { rx: 122, ry: 12, fill: "#420310" } }, // the load ring: pink rows 670–718, x 370–653, lit from the right (118,36,38 at x 400 → 241,124,129 at 620); its hole shows the skirt's underside (66,3,13)
  hub: { x1: 505, x2: 518, y1: 720, y2: 742, fill: "#84371E" },        // the post under the ring: 132,55,30
  ropes: { xs: [413, 611], w: 10, y1: 700, y2: 770, fills: ["#9E4721", "#E1965E"] }, // warm columns 408–418 and 605–617 over rows 728–758; the left rope in shadow (158,71,33), the right lit (225,150,94)
  bowl: { cx: 512, cy: 821.4, rx: 113.8, ry: 95, top: 780, stops: [[800, "#FFC48F"], [830, "#FFCC99"], [870, "#FED1A6"], [905, "#EC8560"], [916, "#E07850"]], shadeL: { x1: 398, x2: 512, a: 0.45 } }, // ellipse on the outer extents of rows 800–916 (rms 1.4), drawn below y 780 (the rim covers its top); centre-column colours; the left side in shadow (228,109,58 at x 430 against 254,209,166 at the centre)
  rim: { cx: 511.5, cy: 785, rx: 119.5, ry: 35, stops: [[392, "#A34D50"], [512, "#CE696F"], [632, "#F3828A"]] }, // pink rows 750–820, x 392–631, lit from the right (163,77,80 → 206,105,111 → 243,130,138)
  opening: { cx: 511.5, cy: 776, rx: 86, ry: 20, fill: "#451E12" },   // the dark interior: 69,30,18
  plate: ["#0C0715", "#261444"], // the declared canvas gradient as ictool paints it (12,7,21 → 38,20,68; ledger 2026-09-14 plate table)
};
// Scored refinements (px), applied additively to M: a bounded coordinate descent, ±0.75 px per geometric constant
// (colours, gradient stops, window angles and the join held), steps 0.5 → 0.05, librsvg scoring. 19.82 → 18.84. Most
// constants sit at the bound: the shading the flat cannot carry pulls on the geometry, so the bound is what keeps the
// drawing honest to its measurements — a ±1.5 run reached 23.95 → and moved everything to its limit.
export const R = {
  "envelope.arcs.0.c.0": 0.5,
  "envelope.arcs.0.c.1": -0.75,
  "envelope.arcs.1.c.0": 0.4,
  "envelope.arcs.1.c.1": 0.75,
  "envelope.arcs.2.c.0": -0.05,
  "envelope.arcs.2.c.1": -0.5,
  "envelope.arcs.3.c.0": 0.25,
  "envelope.arcs.3.c.1": -0.5,
  "envelope.arcs.5.c.0": 0.5,
  "envelope.arcs.5.c.1": -0.25,
  "envelope.arcs.5.r": 0.1,
  "envelope.arcs.6.c.0": -0.2,
  "envelope.arcs.6.r": -0.05,
  "envelope.arcs.7.c.0": -0.15,
  "envelope.arcs.7.c.1": 0.75,
  "envelope.arcs.8.c.0": -0.5,
  "envelope.arcs.8.c.1": 0.35,
  "envelope.arcs.9.c.0": -0.25,
  "envelope.arcs.9.c.1": -0.75,
  "envelope.arcs.9.r": 0.1,
  "b0.upper.c.0": 0.75,
  "b0.upper.c.1": 0.75,
  "b0.upper.r": -0.75,
  "b0.lower.c.1": 0.75,
  "b0.lower.r": 0.75,
  "b1.c.0": 0.75,
  "b1.c.1": -0.75,
  "b1.r": -0.75,
  "b2.c.0": -0.6,
  "b2.c.1": -0.75,
  "b2.r": -0.5,
  "b3.cx": 0.6,
  "b3.cy": 0.75,
  "b3.ra": -0.6,
  "ring.cx": -0.75,
  "ring.cy": -0.75,
  "ring.rx": -0.75,
  "ring.ry": -0.75,
  "hub.x1": 0.75,
  "hub.x2": 0.75,
  "hub.y1": -0.75,
  "hub.y2": 0.65,
  "ropes.xs.0": 0.45,
  "ropes.xs.1": 0.75,
  "ropes.y1": -0.75,
  "bowl.cx": -0.5,
  "bowl.cy": -0.75,
  "bowl.rx": 0.75,
  "bowl.ry": 0.5,
  "rim.cx": 0.75,
  "rim.cy": 0.75,
  "rim.rx": 0.75,
  "rim.ry": 0.75,
  "opening.cx": 0.7,
  "opening.cy": -0.75,
  "opening.rx": 0.75,
  "opening.ry": 0.75,
};

const f = (v) => { const s = (Math.round((v / 32) * 10000) / 10000).toString(); return s.replace(/^(-?)0\./, "$1."); };
const P = (p) => `${f(p[0])} ${f(p[1])}`;
export function apply(M, R = {}) { const out = JSON.parse(JSON.stringify(M)); for (const k in R) { const path = k.split("."); let o = out; for (let i = 0; i < path.length - 1; i++) o = o[path[i]]; o[path.at(-1)] += R[k]; } return out; }
const CEN = [511.5, 400];
function circleCircle(A, B, hint) { const dx = B.c[0] - A.c[0], dy = B.c[1] - A.c[1], d = Math.hypot(dx, dy); const a = (A.r * A.r - B.r * B.r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, A.r * A.r - a * a)); const px = A.c[0] + a * dx / d, py = A.c[1] + a * dy / d; const c1 = [px - h * dy / d, py + h * dx / d], c2 = [px + h * dy / d, py - h * dx / d]; return Math.hypot(c1[0] - hint[0], c1[1] - hint[1]) < Math.hypot(c2[0] - hint[0], c2[1] - hint[1]) ? c1 : c2; }
const onC = (A, deg) => { const t = deg * Math.PI / 180; return [A.c[0] + A.r * Math.cos(t), A.c[1] + A.r * Math.sin(t)]; };
// x on a circle at height y, the side chosen by `side` (-1 left of the centre, +1 right)
const xOn = (A, y, side) => A.c[0] + side * Math.sqrt(Math.max(0, A.r * A.r - (y - A.c[1]) ** 2));
const arc = (r, p, sweep, large = 0) => `A${f(r)} ${f(r)} 0 ${large} ${sweep} ${P(p)}`;
const ellipsePath = ({ cx, cy, rx, ry }) => `M${P([cx + rx, cy])}A${f(rx)} ${f(ry)} 0 0 1 ${P([cx, cy + ry])}A${f(rx)} ${f(ry)} 0 0 1 ${P([cx - rx, cy])}A${f(rx)} ${f(ry)} 0 0 1 ${P([cx, cy - ry])}A${f(rx)} ${f(ry)} 0 0 1 ${P([cx + rx, cy])}Z`;
export function paths(G) {
  // envelope: from the first window's start on the ray at 120°, clockwise through the top to the last window's end at 60°, closed by the chord across the neck
  const E = G.envelope.arcs; const rayPt = (deg, r) => [CEN[0] + r * Math.cos(deg * Math.PI / 180), CEN[1] + r * Math.sin(deg * Math.PI / 180)];
  const start = (() => { const A = E[0]; const t = 120 * Math.PI / 180; const d = [Math.cos(t), Math.sin(t)]; const fx = CEN[0] - A.c[0], fy = CEN[1] - A.c[1]; const b = 2 * (fx * d[0] + fy * d[1]), c = fx * fx + fy * fy - A.r * A.r; const s = (-b + Math.sqrt(b * b - 4 * c)) / 2; return [CEN[0] + s * d[0], CEN[1] + s * d[1]]; })();
  let env = `M${P(start)}`;
  let endPt = null;
  for (let i = 0; i < E.length; i++) { const to = i < E.length - 1 ? circleCircle(E[i], E[i + 1], rayPt(E[i].to, 300)) : (() => { const A = E[i]; const t = 60 * Math.PI / 180; const d = [Math.cos(t), Math.sin(t)]; const fx = CEN[0] - A.c[0], fy = CEN[1] - A.c[1]; const b = 2 * (fx * d[0] + fy * d[1]), c = fx * fx + fy * fy - A.r * A.r; const s = (-b + Math.sqrt(b * b - 4 * c)) / 2; return [CEN[0] + s * d[0], CEN[1] + s * d[1]]; })(); env += arc(E[i].r, to, 1); endPt = to; }
  env += `L${P([endPt[0], G.ring.cy])}L${P([start[0], G.ring.cy])}Z`; // down to the ring's centre line on both sides: the skirt between the chain's ends and the ring is envelope
  // gore regions: right of each boundary, as a closed polygon out to x = 1100 (clipped by the envelope)
  const yTop = 90, yBot = 720;
  const b0 = G.b0; const b0path = `M${P([xOn(b0.upper, yTop, -1), yTop])}${arc(b0.upper.r, [xOn(b0.upper, b0.join, -1), b0.join], 0)}${arc(b0.lower.r, [xOn(b0.lower, Math.min(yBot, b0.lower.c[1] + b0.lower.r - 0.5), -1), Math.min(yBot, b0.lower.c[1] + b0.lower.r - 0.5)], 0)}L${P([xOn(b0.lower, Math.min(yBot, b0.lower.c[1] + b0.lower.r - 0.5), -1), yBot])}L${P([1100, yBot])}L${P([1100, yTop])}Z`;
  const b1 = G.b1; const b1path = `M${P([xOn(b1, yTop, -1), yTop])}${arc(b1.r, [xOn(b1, yBot, -1), yBot], 0)}L${P([1100, yBot])}L${P([1100, yTop])}Z`;
  const b2 = G.b2; const b2path = `M${P([xOn(b2, yTop, 1), yTop])}${arc(b2.r, [xOn(b2, yBot, 1), yBot], 1)}L${P([1100, yBot])}L${P([1100, yTop])}Z`;
  const b3 = G.b3; const t = b3.rot * Math.PI / 180, e1 = [Math.cos(t), Math.sin(t)], e2 = [-Math.sin(t), Math.cos(t)]; const ep = (u) => [b3.cx + b3.ra * Math.cos(u) * e1[0] + b3.rb * Math.sin(u) * e2[0], b3.cy + b3.ra * Math.cos(u) * e1[1] + b3.rb * Math.sin(u) * e2[1]];
  // the ellipse's right side between yTop and yBot: sample parametric angles and pick the two with y ≈ yTop / yBot on the right (x > cx)
  const pick = (yy) => { let best = null; for (let u = 0; u < 2 * Math.PI; u += 0.002) { const p = ep(u); if (p[0] > b3.cx && (!best || Math.abs(p[1] - yy) < Math.abs(best[1] - yy))) best = p; } return best; };
  const pTop = pick(yTop), pBot = pick(yBot);
  const b3path = `M${P(pTop)}A${f(b3.ra)} ${f(b3.rb)} ${b3.rot} 0 1 ${P(pBot)}L${P([1100, yBot])}L${P([1100, yTop])}Z`;
  const ring = ellipsePath(G.ring), hole = ellipsePath({ cx: G.ring.cx, cy: G.ring.cy, rx: G.ring.hole.rx, ry: G.ring.hole.ry }), bowl = ellipsePath(G.bowl), rim = ellipsePath(G.rim), opening = ellipsePath(G.opening);
  const hub = `M${P([G.hub.x1, G.hub.y1])}H${f(G.hub.x2)}V${f(G.hub.y2)}H${f(G.hub.x1)}Z`;
  const ropes = G.ropes.xs.map((x) => `M${P([x - G.ropes.w / 2, G.ropes.y1])}H${f(x + G.ropes.w / 2)}V${f(G.ropes.y2)}H${f(x - G.ropes.w / 2)}Z`);
  return { env, gores: [b0path, b1path, b2path, b3path], ring, hole, hub, ropes, bowl, rim, opening };
}
export function svg(G = apply(M, R), { badge = false } = {}) {
  const p = paths(G);
  const gradH = (id, stops) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" y1="0" y2="0" x1="${f(stops[0][0])}" x2="${f(stops.at(-1)[0])}">${stops.map(([x, c]) => `<stop offset="${((x - stops[0][0]) / (stops.at(-1)[0] - stops[0][0])).toFixed(3)}" stop-color="${c}"/>`).join("")}</linearGradient>`;
  const gradV = (id, stops) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${f(stops[0][0])}" y2="${f(stops.at(-1)[0])}">${stops.map(([y, c]) => `<stop offset="${((y - stops[0][0]) / (stops.at(-1)[0] - stops[0][0])).toFixed(3)}" stop-color="${c}"/>`).join("")}</linearGradient>`;
  const defs = `<linearGradient id="airshow-plate" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="0" y2="32"><stop stop-color="${G.plate[0]}"/><stop offset="1" stop-color="${G.plate[1]}"/></linearGradient>${G.gores.map((g, i) => gradV(`airshow-g${i}`, g.stops)).join("")}${gradV("airshow-bowl", G.bowl.stops)}<linearGradient id="airshow-bowl-l" gradientUnits="userSpaceOnUse" x1="${f(G.bowl.shadeL.x1)}" x2="${f(G.bowl.shadeL.x2)}" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity="${G.bowl.shadeL.a}"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>${gradH("airshow-ring", G.ring.stops)}${gradH("airshow-rim", G.rim.stops)}<clipPath id="airshow-env"><path d="${p.env}"/></clipPath><clipPath id="airshow-bowlclip"><rect x="0" y="${f(G.bowl.top)}" width="32" height="32"/></clipPath>`;
  const body = `<defs>${defs}</defs><path fill="url(#airshow-plate)" d="M0 0h32v32H0z"/><path fill="url(#airshow-g0)" d="${p.env}"/><g clip-path="url(#airshow-env)">${p.gores.map((d, i) => `<path fill="url(#airshow-g${i + 1})" d="${d}"/>`).join("")}</g><path fill="url(#airshow-ring)" d="${p.ring}"/><path fill="${G.ring.hole.fill}" d="${p.hole}"/><path fill="${G.hub.fill}" d="${p.hub}"/>${p.ropes.map((d, i) => `<path fill="${G.ropes.fills[i]}" d="${d}"/>`).join("")}<g clip-path="url(#airshow-bowlclip)"><path fill="url(#airshow-bowl)" d="${p.bowl}"/><path fill="url(#airshow-bowl-l)" d="${p.bowl}"/></g><path fill="url(#airshow-rim)" d="${p.rim}"/><path fill="${G.opening.fill}" d="${p.opening}"/>`;
  // badge: the mark bare (it reads on both pills, as the 2026-09-14 raster crop did), viewBox the mark's bbox (211–812 × 109–916 px) padded 2%
  if (badge) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="6.22 2.9 19.53 26.22">\n  ${body.replace(/<path fill="url\(#airshow-plate\)" d="M0 0h32v32H0z"\/>/, "")}\n</svg>\n`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n  ${body}\n</svg>\n`;
}
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MASTER = join(root, "packages/refraction/assets/airshow.png");
const to256 = async (input) => sharp(input, Buffer.isBuffer(input) && input.length === 1024 * 1024 * 4 ? { raw: { width: 1024, height: 1024, channels: 4 } } : {}).ensureAlpha().resize(256, 256, { kernel: "lanczos3" }).raw().toBuffer();
const overGray = (rgba) => { const out = new Float64Array(256 * 256 * 3); for (let p = 0; p < 256 * 256; p++) { const a = rgba[p * 4 + 3] / 255; for (let c = 0; c < 3; c++) out[p * 3 + c] = rgba[p * 4 + c] * a + 128 * (1 - a); } return out; };
let master256;
export async function score(svgText, engine = "librsvg", work = "/tmp/airshow-flat-work") {
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
  else if (cmd === "--write") { writeFileSync(join(root, "platforms/airshow/icon.svg"), svg()); writeFileSync(join(root, "platforms/airshow/badge.svg"), svg(undefined, { badge: true })); console.log("wrote icon.svg + badge.svg"); }
  else if (cmd === "--score") { const engine = rest[0] ?? "librsvg"; const G = rest[1] ? apply(M, JSON.parse(readFileSync(rest[1], "utf8"))) : apply(M, R); console.log(`central ${engine}: ${(await score(svg(G), engine)).toFixed(3)}`); }
  else console.error("usage: gen.mjs --svg | --badge | --write | --score [chrome|librsvg] [refinements.json]");
}
