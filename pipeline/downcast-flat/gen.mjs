// Downcast flat glyph: measured geometry of the App Store artwork (1024
// canvas, packages/refraction/assets/downcast.png) -> SVG paths in 32 units.
// Every constant below was measured from 0.5-coverage crossings of the
// master (pixel centres on BOTH axes) and least-squares circle fits per
// edge; fillets are computed from offset-edge intersections. Ledger:
// pipeline/README.md, "downcast plate ramp, then a drawn glyph".
//
// Usage:
//   node pipeline/downcast-flat/gen.mjs --svg            print icon.svg (plate + glyph)
//   node pipeline/downcast-flat/gen.mjs --score <dir> [json grid]   Chrome-render candidates and score
//                                                      coverage against the master per corner window
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const G = {
  D: { left: 199.8, top: 367.0, bottom: 659.8, bowl: { cx: 305.8, cy: 513.4, r: 146.4 }, rc: 9,
       counter: { left: 263.0, top: 429.2, bottom: 595.5, circle: { cx: 295.66, cy: 512.4, r: 84.28 }, rc: 9 } },
  arcs: [
    { inner: { cx: 339.86, r: 203.4 }, outer: { cx: 338.31, r: 309.74 }, ct: 863.6, cb: -160.4 },
    { inner: { cx: 328.01, r: 411.82 }, outer: { cx: 326.06, r: 518.44 }, ct: 851.4, cb: -172.6 },
  ],
  cy: 512.0,
};
const f = (v) => (Math.round((v / 32) * 1000) / 1000).toString().replace(/^(-?)0\./, "$1.");
const P = (p) => `${f(p[0])} ${f(p[1])}`;
const sweep = (c, s, e) => ((s[0]-c[0])*(e[1]-c[1]) - (s[1]-c[1])*(e[0]-c[0]) > 0 ? 1 : 0);
const arcTo = (c, r, s, e) => `A${f(r)} ${f(r)} 0 0 ${sweep(c,s,e)} ${P(e)}`;
// fillet between two edges; each edge: {type:"line", a,b,c, side:+1|-1} meaning shape side a*x+b*y >= c (side +1) or <= c (-1) (a,b unit)
// or {type:"circle", cx,cy,r, inside:true|false} shape inside/outside circle.
function offset(e, r) {
  if (e.type === "line") return { ...e, c: e.c + e.side * r };
  return { ...e, r: e.inside ? e.r - r : e.r + r };
}
function intersect(e1, e2, near) {
  const cands = [];
  if (e1.type === "line" && e2.type === "circle") return intersect(e2, e1, near);
  if (e1.type === "circle" && e2.type === "line") {
    // line a x + b y = c ; circle
    const { a, b, c } = e2; const d = a*e1.cx + b*e1.cy - c; // signed distance from center to line (a,b unit)
    const h2 = e1.r*e1.r - d*d; if (h2 < 0) throw new Error("no intersection");
    const h = Math.sqrt(h2); const px = e1.cx - a*d, py = e1.cy - b*d;
    cands.push([px + (-b)*h, py + a*h], [px - (-b)*h, py - a*h]);
  } else if (e1.type === "circle" && e2.type === "circle") {
    const dx = e2.cx-e1.cx, dy = e2.cy-e1.cy, d = Math.hypot(dx,dy);
    const a = (e1.r*e1.r - e2.r*e2.r + d*d) / (2*d); const h = Math.sqrt(e1.r*e1.r - a*a);
    const px = e1.cx + a*dx/d, py = e1.cy + a*dy/d;
    cands.push([px + h*(-dy)/d, py + h*dx/d], [px - h*(-dy)/d, py - h*dx/d]);
  } else { // line-line
    const det = e1.a*e2.b - e1.b*e2.a; cands.push([(e1.c*e2.b - e1.b*e2.c)/det, (e1.a*e2.c - e1.c*e2.a)/det]);
  }
  cands.sort((p, q) => Math.hypot(p[0]-near[0], p[1]-near[1]) - Math.hypot(q[0]-near[0], q[1]-near[1]));
  return cands[0];
}
const foot = (e, p) => e.type === "line" ? (() => { const d = e.a*p[0] + e.b*p[1] - e.c; return [p[0]-e.a*d, p[1]-e.b*d]; })()
  : (() => { const dx = p[0]-e.cx, dy = p[1]-e.cy, l = Math.hypot(dx,dy); return [e.cx + dx/l*e.r, e.cy + dy/l*e.r]; })();
// fillet at corner between e1 (incoming) and e2 (outgoing): returns {t1 (tangent on e1), t2 (on e2), c (fillet center)}
function fillet(e1, e2, r) {
  const v = intersect(e1, e2, [0,0]); // rough vertex (nearest to origin — refine below)
  const vertex = intersect(e1, e2, v);
  if (r <= 0) return { t1: vertex, t2: vertex, c: null, r: 0 };
  const c = intersect(offset(e1, r), offset(e2, r), vertex);
  return { t1: foot(e1, c), t2: foot(e2, c), c, r };
}
const line45t = (ct) => ({ type: "line", a: Math.SQRT1_2, b: Math.SQRT1_2, c: ct/Math.SQRT2, side: +1 });   // x+y >= ct
const line45b = (cb) => ({ type: "line", a: Math.SQRT1_2, b: -Math.SQRT1_2, c: cb/Math.SQRT2, side: +1 }); // x-y >= cb
// walk a closed outline of edges (in order) with per-corner fillet radii; edges alternate; each edge drawn from previous fillet's t2 to next fillet's t1
function outline(edges, radii, vertexHints) {
  const n = edges.length; const fs = [];
  for (let i = 0; i < n; i++) {
    const e1 = edges[i], e2 = edges[(i+1)%n];
    const vertex = intersect(e1, e2, vertexHints[i]);
    const r = radii[i];
    if (r <= 0) { fs.push({ t1: vertex, t2: vertex, c: null, r: 0 }); continue; }
    const c = intersect(offset(e1, r), offset(e2, r), vertex);
    fs.push({ t1: foot(e1, c), t2: foot(e2, c), c, r });
  }
  let d = `M${P(fs[n-1].t2)}`;
  for (let i = 0; i < n; i++) {
    const e = edges[i], from = fs[(i+n-1)%n].t2, to = fs[i].t1;
    if (e.type === "line") d += `L${P(to)}`; else d += arcTo([e.cx, e.cy], e.r, from, to);
    const fl = fs[i]; if (fl.r > 0) d += arcTo(fl.c, fl.r, fl.t1, fl.t2);
  }
  return d + "Z";
}
export function build({ ra = 10.5, rk = 8, rj = 60 } = {}) {
  const { D, arcs, cy } = G;
  // D outer: edges clockwise: top line (y=top, shape below), bowl circle (inside), bottom line (shape above), left line (shape right)
  const top = { type: "line", a: 0, b: 1, c: D.top, side: +1 };
  const bot = { type: "line", a: 0, b: 1, c: D.bottom, side: -1 };
  const left = { type: "line", a: 1, b: 0, c: D.left, side: +1 };
  const bowl = { type: "circle", cx: D.bowl.cx, cy: D.bowl.cy, r: D.bowl.r, inside: true };
  // bowl is tangent to top/bottom: split into explicit path
  const b = D.bowl;
  let dD = `M${P([D.left + D.rc, D.top])}L${P([b.cx, D.top])}` +
    arcTo([b.cx,b.cy], b.r, [b.cx, b.cy-b.r], [b.cx+b.r, b.cy]) + arcTo([b.cx,b.cy], b.r, [b.cx+b.r, b.cy], [b.cx, b.cy+b.r]) +
    `L${P([D.left + D.rc, D.bottom])}` + arcTo([D.left+D.rc, D.bottom-D.rc], D.rc, [D.left+D.rc, D.bottom], [D.left, D.bottom-D.rc]) +
    `L${P([D.left, D.top + D.rc])}` + arcTo([D.left+D.rc, D.top+D.rc], D.rc, [D.left, D.top+D.rc], [D.left+D.rc, D.top]) + "Z";
  // counter (hole): edges clockwise: top line (hole below), circle (hole inside), bottom line (hole above), left line (hole right)
  const C = D.counter;
  const cEdges = [
    { type: "line", a: 0, b: 1, c: C.top, side: +1 },
    { type: "circle", cx: C.circle.cx, cy: C.circle.cy, r: C.circle.r, inside: true },
    { type: "line", a: 0, b: 1, c: C.bottom, side: -1 },
    { type: "line", a: 1, b: 0, c: C.left, side: +1 },
  ];
  const dC = outline(cEdges, [rj, rj, C.rc, C.rc], [[330, C.top], [330, C.bottom], [C.left, C.bottom], [C.left, C.top]]);
  // arcs: edges clockwise: top line, outer circle, bottom line, inner circle
  const dArcs = arcs.map((A) => {
    const edges = [
      line45t(A.ct),
      { type: "circle", cx: A.outer.cx, cy, r: A.outer.r, inside: true },
      line45b(A.cb),
      { type: "circle", cx: A.inner.cx, cy, r: A.inner.r, inside: false },
    ];
    const hints = [[A.outer.cx + A.outer.r*0.7, cy - A.outer.r*0.7], [A.outer.cx + A.outer.r*0.7, cy + A.outer.r*0.7], [A.inner.cx + A.inner.r*0.7, cy + A.inner.r*0.7], [A.inner.cx + A.inner.r*0.7, cy - A.inner.r*0.7]];
    return outline(edges, [ra, ra, rk, rk], hints);
  });
  return { dD: dD + dC, dArcs };
}
export function svg(params, { plate = false } = {}) {
  const { dD, dArcs } = build(params);
  const grad = `<defs><linearGradient id="a" x1="0" x2="0" y1="0" y2="32" gradientUnits="userSpaceOnUse"><stop stop-color="#E60000"/><stop offset=".233" stop-color="#E50000"/><stop offset=".48" stop-color="#DE0000"/><stop offset=".719" stop-color="#D00000"/><stop offset=".935" stop-color="#BC0000"/><stop offset="1" stop-color="#B40000"/></linearGradient></defs><path fill="url(#a)" d="M0 0h32v32H0z"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n  ${plate ? grad : ""}<path fill="#fff" fill-rule="evenodd" d="${dD}"/><path fill="#fff" d="${dArcs[0]}${dArcs[1]}"/>\n</svg>\n`;
}
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export async function score(params, dir, tag) {
  const s = svg(params).replace('viewBox="0 0 32 32"', 'width="1024" height="1024" viewBox="0 0 32 32"');
  const svgPath = `${dir}/${tag}.svg`, png = `${dir}/${tag}.png`;
  writeFileSync(svgPath, s);
  execFileSync(CHROME, ["--headless=new", `--screenshot=${png}`, "--window-size=1024,1024", "--default-background-color=00000000", "--hide-scrollbars", `file://${svgPath}`], { stdio: "ignore" });
  const r = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const m = await sharp(join(root, "packages/refraction/assets/downcast.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = 1024; let se = 0, n = 0, inter = 0, uni = 0; const win = {};
  const wins = { D: [190, 460, 360, 670], arc1: [485, 655, 295, 730], arc2: [620, 855, 150, 875], apex1: [530, 600, 290, 350], apex2: [670, 730, 140, 200], junc1: [485, 520, 340, 400], junc2: [615, 650, 190, 260], cjunc: [295, 335, 420, 445] };
  for (const k in wins) win[k] = { se: 0, n: 0 };
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = (y*W + x)*4; const a = r.data[i+3]/255, g = m.data[i+1]/255; const d = a - g;
    se += d*d; n++; inter += Math.min(a,g); uni += Math.max(a,g);
    for (const k in wins) { const [x0,x1,y0,y1] = wins[k]; if (x>=x0&&x<=x1&&y>=y0&&y<=y1) { win[k].se += d*d; win[k].n++; } }
  }
  const out = { rmse255: +(Math.sqrt(se/n)*255).toFixed(3), iou: +(inter/uni).toFixed(5) };
  for (const k in win) out[k] = +(Math.sqrt(win[k].se/win[k].n)*255).toFixed(2);
  return out;
}
if (process.argv[1].endsWith("gen.mjs")) {
  const args = process.argv.slice(2);
  if (args[0] === "--svg") process.stdout.write(svg({}, { plate: true }));
  else if (args[0] === "--score") {
    const dir = args[1];
    const grid = JSON.parse(args[2] || "[{}]");
    for (const p of grid) console.log(JSON.stringify(p), JSON.stringify(await score(p, dir, "t" + Object.values(p).join("_"))));
  } else console.error("usage: gen.mjs --svg | --score <dir> [json grid]");
}
