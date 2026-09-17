// Derive platforms/podcastrepublic/icon.svg from PodcastRepublic.icon.
//
// The Liquid Glass bundle's one layer, Assets/app_icon_512.svg, is two
// white paths drawn with cubic-ish Q approximations of circles. Both are
// exact constructions underneath, so the flat is REBUILT from those
// constructions (not traced), carried through the bundle's own transforms
// to the 1024 pt canvas, then scaled into the 32×32 viewBox:
//
//   ring      an annulus (outer 10, inner 8, in the asset's 24-unit space)
//             minus two width-2 slots whose inner edge lies on the two
//             diagonals through the centre — so the piece between the
//             slots is an exact 90° annular sector and the other piece a
//             270° sector shortened by one slot width at each end. The
//             asset places it with matrix(-0.110203 19.0817 -19.0817
//             -0.110203 486.1 28.4): scale 19.082, rotation 90.331°
//             (not 90 — the 0.33° is the shipped artwork; --square
//             snaps it to 90).
//   triangle  an equilateral triangle, corner radius 10, rounded height
//             89.1 (its bounding box is centred on the layer origin), via
//             matrix(0 1.54739 -1.54739 0 276.85 255.5): scale 1.547,
//             rotation exactly 90°, apex to the right.
//   layer     icon.json: scale 2.15039, translation-in-points (-0.5,-0.5);
//             canvas = 512 + (p - 256)·2.15039 - 0.5 (verified against the
//             rendered master to ≤ 0.5 px on every edge).
//   canvas    icon.json's automatic-gradient on display-p3 0.322 0.522
//             0.878; the flat carries the RAMP ICTOOL ACTUALLY PAINTS,
//             least-squares fitted on the sRGB master's background pixels
//             (rows 160–870, rms 1.4/255) and extrapolated to rows 0 and
//             1023.
//
// Writes icon.svg and badge.svg (the same art on a circular plate — the
// app is an Android app and its Play Store icon is a circle; badge files
// carry their own clip, see packages/icons/scripts/build-static.ts).
//
// Usage: node pipeline/podcastrepublic-flat/generate.mjs [--square]
//          [--glyph white|ramp] [--out <icon file>] [--badge-out <badge file>]
//   --glyph ramp paints the glass material's measured vertical ramp on
//   the glyph instead of the brand's flat white (scored, not shipped —
//   see the README). --out alone writes only the icon.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const square = args.includes("--square");
const glyph = flag("--glyph") ?? "white";
const platformDir = join(dirname(fileURLToPath(import.meta.url)), "../../platforms/podcastrepublic");
const out = flag("--out") ?? join(platformDir, "icon.svg");
const badgeOut = flag("--badge-out") ?? (flag("--out") ? null : join(platformDir, "badge.svg"));

// ---------------------------------------------------------------- transforms
// SVG matrix(a b c d e f): (x, y) -> (a x + c y + e, b x + d y + f).
const RING_M = [-0.110203, 19.0817, -19.0817, -0.110203, 486.1, 28.4];
const TRI_M = [-6.76385e-8, 1.54739, -1.54739, -6.76385e-8, 276.85, 255.5];
const LAYER_SCALE = 2.15039;
const LAYER_TX = -0.5; // translation-in-points, both axes
const VIEW = 32;

const ringM = square
  ? (() => {
      // Same scale, rotation snapped to 90° about the ring centre (12,12).
      const s = Math.hypot(RING_M[0], RING_M[1]);
      const [cx, cy] = apply(RING_M, [12, 12]);
      return [0, s, -s, 0, cx + 12 * s, cy - 12 * s];
    })()
  : RING_M;

function apply(m, [x, y]) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
const scaleOf = (m) => Math.hypot(m[0], m[1]);
const toCanvas = ([x, y]) => [512 + (x - 256) * LAYER_SCALE + LAYER_TX, 512 + (y - 256) * LAYER_SCALE + LAYER_TX];
const toView = ([x, y]) => [x / (1024 / VIEW), y / (1024 / VIEW)];
const place = (m, p) => toView(toCanvas(apply(m, p)));
const placeLen = (m, len) => (len * scaleOf(m) * LAYER_SCALE) / (1024 / VIEW);

const f = (n) => {
  const s = n.toFixed(3).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
};
const P = (p) => `${f(p[0])} ${f(p[1])}`;
const A = (r, large, sweep, p) => `A${f(r)} ${f(r)} 0 ${large} ${sweep} ${P(p)}`;

// --------------------------------------------------------------------- ring
// Asset space: centre (12,12), outer R=10, inner r=8, slot width w=2.
// Screen angles (y down): the small sector spans -135°..-45° (the top of
// the asset; the right of the icon after the 90° rotation). Slot k lies
// on the far side of diagonal k from the sector; its far edge is the
// diagonal offset by w along n_k.
const C = [12, 12], R = 10, r = 8, w = 2;
const u = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
const at = (c, dir, t, n = [0, 0], off = 0) => [c[0] + dir[0] * t + n[0] * off, c[1] + dir[1] * t + n[1] * off];
const u1 = u(-135), n1 = u(135); // diagonal toward the asset's top-left; slot extends toward the left
const u2 = u(-45), n2 = u(45); //  diagonal toward the asset's top-right; slot extends toward the right

const RR = placeLen(ringM, R), rr = placeLen(ringM, r);
const sector = [
  `M${P(place(ringM, at(C, u1, R)))}`,
  A(RR, 0, 1, place(ringM, at(C, u2, R))),
  `L${P(place(ringM, at(C, u2, r)))}`,
  A(rr, 0, 0, place(ringM, at(C, u1, r))),
  "Z",
].join("");
const tR = Math.sqrt(R * R - w * w), tr = Math.sqrt(r * r - w * w);
const arc = [
  `M${P(place(ringM, at(C, u2, tR, n2, w)))}`,
  A(RR, 1, 1, place(ringM, at(C, u1, tR, n1, w))),
  `L${P(place(ringM, at(C, u1, tr, n1, w)))}`,
  A(rr, 1, 0, place(ringM, at(C, u2, tr, n2, w))),
  "Z",
].join("");

// ----------------------------------------------------------------- triangle
// Asset space (y down): apex at -y, base at +y; rounded height Hr = 89.1,
// corner radius rc = 10, equilateral; bounding box centred on the origin.
const Hr = 89.1, rc = 10;
const H = Hr + rc; // sharp height
const hw = H / Math.sqrt(3); // sharp half-width
const B = (H - rc) / 2; // base y (bbox centred)
const apex = [0, B - H], V1 = [-hw, B], V2 = [hw, B];
const t = rc * Math.sqrt(3); // tangent length from each sharp vertex
const unit = (a, b) => {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
};
const along = (v, dir, k) => [v[0] + dir[0] * k, v[1] + dir[1] * k];
const RC = placeLen(TRI_M, rc);
const tri = [
  `M${P(place(TRI_M, along(V1, unit(V1, V2), t)))}`,
  `L${P(place(TRI_M, along(V2, unit(V2, V1), t)))}`,
  A(RC, 0, 0, place(TRI_M, along(V2, unit(V2, apex), t))),
  `L${P(place(TRI_M, along(apex, unit(apex, V2), t)))}`,
  A(RC, 0, 0, place(TRI_M, along(apex, unit(apex, V1), t))),
  `L${P(place(TRI_M, along(V1, unit(V1, apex), t)))}`,
  A(RC, 0, 0, place(TRI_M, along(V1, unit(V1, V2), t))),
  "Z",
].join("");

// ------------------------------------------------------------------ colours
// Background: the master's vertical ramp, sRGB, rows 0 and 1023.
const BG_TOP = "#569dff", BG_BOTTOM = "#3d85e4";
// Glass glyph ramp (measured on the master's glyph interior; R and G
// clip at 255 above row ~213).
const GLYPH_FILL =
  glyph === "ramp"
    ? `url(#g)`
    : "#fff";
const glyphGrad =
  glyph === "ramp"
    ? `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".21" stop-color="#fff"/><stop offset="1" stop-color="#9dc1f3"/></linearGradient>`
    : "";

const provenance =
  `the Liquid Glass icon's constructions rebuilt, not traced. Ring = annulus (outer 10, inner 8) minus two width-2 slots on the diagonals; play = equilateral triangle, corner radius 10, rounded height 89.1; both carried through the bundle's own layer transforms (ring rotation 90.331°, layer scale 2.15039). Background = the vertical ramp ictool paints for the canvas's automatic-gradient, fitted on the sRGB master. Generator: pipeline/podcastrepublic-flat/generate.mjs.`;
const gradDefs = `<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BG_TOP}"/><stop offset="1" stop-color="${BG_BOTTOM}"/></linearGradient>${glyphGrad}`;
const art = `<rect width="${VIEW}" height="${VIEW}" fill="url(#b)"/><path fill="${GLYPH_FILL}" d="${sector}${arc}${tri}"/>`;

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}">\n` +
  `  <!-- Podcast Republic, drawn: ${provenance} -->\n` +
  `  <defs>${gradDefs}</defs>\n` +
  `  ${art}\n` +
  `</svg>\n`;
writeFileSync(out, svg);
console.log(`wrote ${out} (${svg.length} bytes, ring ${square ? "90°" : "90.331°"}, glyph ${glyph})`);

if (badgeOut) {
  const badge =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}">\n` +
    `  <!-- Podcast Republic badge: the flat (${provenance.replace(/\. Generator.*$/, "")}) on a circular plate. Generator: pipeline/podcastrepublic-flat/generate.mjs. -->\n` +
    `  <defs>${gradDefs}<clipPath id="s"><circle cx="${VIEW / 2}" cy="${VIEW / 2}" r="${VIEW / 2}"/></clipPath></defs>\n` +
    `  <g clip-path="url(#s)">${art}</g>\n` +
    `</svg>\n`;
  writeFileSync(badgeOut, badge);
  console.log(`wrote ${badgeOut} (${badge.length} bytes)`);
}
