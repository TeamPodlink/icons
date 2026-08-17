// Probe: is ictool's Display-P3 -> rendered-sRGB mapping a fixed,
// measurable function — and how far is it from naive colorimetric
// conversion? Feasibility gate for a universal .icon player (declared
// fills instead of per-icon measurement).
//
// Builds flat-fill instrument bundles (transparent 1-layer artwork over a
// solid display-p3 canvas), renders each through ictool at 256, samples
// the center region, and compares against linear-light matrix conversion
// with channel clipping. macOS + Icon Composer only.
//
//   node packages/engine/tools/probe-gamut.mjs [--out <report.json>]

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../pipeline/x.mjs", import.meta.url));
const sharp = require("sharp");

const ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool";
const WORK = "/tmp/probe-gamut";
const out = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : join(WORK, "report.json");

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

// Transparent 8x8 artwork: the canvas fill is the whole instrument.
const BLANK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#000" fill-opacity="0"/></svg>`;

function bundle(color) {
  const dir = join(WORK, `probe.icon`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "Assets"), { recursive: true });
  writeFileSync(join(dir, "Assets", "blank.svg"), BLANK_SVG);
  const c = color.map((v) => v.toFixed(5)).join(",");
  writeFileSync(
    join(dir, "icon.json"),
    JSON.stringify({
      fill: {
        "linear-gradient": [`display-p3:${c},1.00000`, `display-p3:${c},1.00000`],
        orientation: { start: { x: 0.5, y: 0 }, stop: { x: 0.5, y: 1 } },
      },
      groups: [
        {
          layers: [{ name: "blank", "image-name": "blank.svg", glass: false }],
        },
      ],
      "supported-platforms": { squares: "shared" },
    })
  );
  return dir;
}

async function renderCenter(dir) {
  const png = join(WORK, "render.png");
  execFileSync(ICTOOL, [
    dir, "--export-image", "--output-file", png, "--platform", "macOS",
    "--rendition", "Default", "--width", "256", "--height", "256", "--scale", "1",
  ]);
  const { data, info } = await sharp(png)
    .extract({ left: 96, top: 96, width: 64, height: 64 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = info.width * info.height, ch = info.channels;
  const acc = [0, 0, 0];
  for (let i = 0; i < n; i++)
    for (let k = 0; k < 3; k++) acc[k] += data[i * ch + k];
  return acc.map((v) => v / n);
}

// naive: P3 -> linear -> XYZ(D65) -> linear sRGB -> clip -> encode
const lin = (u) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
const enc = (u) => (u <= 0.0031308 ? 12.92 * u : 1.055 * u ** (1 / 2.4) - 0.055);
// display-p3 -> sRGB linear matrix (D65)
const M = [
  [1.2249401, -0.2249404, 0.0000001],
  [-0.0420569, 1.0420571, 0.0000000],
  [-0.0196376, -0.0786361, 1.0982735],
];
function naive(p3) {
  const l = p3.map(lin);
  const s = M.map((r) => r[0] * l[0] + r[1] * l[1] + r[2] * l[2]);
  return s.map((v) => 255 * enc(Math.min(Math.max(v, 0), 1)));
}

// Color set: sRGB-representable interior colors (naive should be exact if
// the mapping is colorimetric there) + P3 boundary colors outside sRGB
// (where any gamut mapping must act) + grays.
const COLORS = [];
for (const v of [0, 0.25, 0.5, 0.75, 1]) COLORS.push([v, v, v]);
for (const [r, g, b] of [
  [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [0, 1, 1], [1, 0, 1],
]) {
  COLORS.push([r, g, b]);                    // P3 primary/secondary (out of sRGB)
  COLORS.push([r * 0.7 + 0.15, g * 0.7 + 0.15, b * 0.7 + 0.15]); // interior
}
for (const c of [
  [0.744, 0.297, 0.0], [0.0, 0.533, 1.0], [0.235, 0.85, 0.32],
  [0.9, 0.2, 0.5], [0.35, 0.1, 0.85], [0.98, 0.75, 0.1],
]) COLORS.push(c);

const rows = [];
for (const c of COLORS) {
  const measured = await renderCenter(bundle(c));
  const predicted = naive(c);
  const dmax = Math.max(...measured.map((m, i) => Math.abs(m - predicted[i])));
  rows.push({ p3: c, measured: measured.map((v) => +v.toFixed(2)), naive: predicted.map((v) => +v.toFixed(2)), dmax: +dmax.toFixed(2) });
  console.log(
    `p3(${c.map((v) => v.toFixed(2)).join(",")})`,
    "->", measured.map((v) => v.toFixed(1)).join(","),
    "naive", predicted.map((v) => v.toFixed(1)).join(","),
    "dmax", dmax.toFixed(1)
  );
}

const interior = rows.filter((r) => r.naive.every((v) => v > 1 && v < 254));
const boundary = rows.filter((r) => !r.naive.every((v) => v > 1 && v < 254));
const stat = (rs) => ({
  n: rs.length,
  meanDmax: +(rs.reduce((s, r) => s + r.dmax, 0) / Math.max(rs.length, 1)).toFixed(2),
  worstDmax: +Math.max(...rs.map((r) => r.dmax), 0).toFixed(2),
});
const report = { interior: stat(interior), boundary: stat(boundary), rows };
writeFileSync(out, JSON.stringify(report, null, 2));
console.log("\ninterior (in-sRGB-gamut):", JSON.stringify(report.interior));
console.log("boundary (out-of-gamut): ", JSON.stringify(report.boundary));
console.log("report:", out);
