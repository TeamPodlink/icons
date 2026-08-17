// Probe: what gradient does the canvas "automatic-gradient" fill derive
// from its single input color? Feasibility gate for a universal .icon
// player. Renders instrument bundles through ictool, samples a center
// column, converts P3-coordinate pixels to sRGB (probe-gamut.mjs showed
// compositing happens in sRGB), and reports the derived top/bottom
// colors and the profile shape. macOS + Icon Composer only.
//
//   node packages/engine/tools/probe-autogradient.mjs

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../pipeline/x.mjs", import.meta.url));
const sharp = require("sharp");

const ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool";
const WORK = "/tmp/probe-autogradient";
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const BLANK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#000" fill-opacity="0"/></svg>`;

function bundle(color, space = "display-p3") {
  const dir = join(WORK, `probe.icon`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "Assets"), { recursive: true });
  writeFileSync(join(dir, "Assets", "blank.svg"), BLANK_SVG);
  const comp = color.map((v) => v.toFixed(5)).join(",");
  writeFileSync(
    join(dir, "icon.json"),
    JSON.stringify({
      fill: { "automatic-gradient": `${space}:${comp},1.00000` },
      groups: [
        { layers: [{ name: "blank", "image-name": "blank.svg", glass: false }] },
      ],
      "supported-platforms": { squares: "shared" },
    })
  );
  return dir;
}

const lin = (u) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
const enc = (u) => (u <= 0.0031308 ? 12.92 * u : 1.055 * u ** (1 / 2.4) - 0.055);
const M_P3_SRGB = [
  [1.2249401, -0.2249404, 0.0000001],
  [-0.0420569, 1.0420571, 0.0000000],
  [-0.0196376, -0.0786361, 1.0982735],
];
function p3ToSrgb(px) {
  const l = px.map((v) => lin(v / 255));
  return M_P3_SRGB.map((r) =>
    255 * enc(Math.min(Math.max(r[0] * l[0] + r[1] * l[1] + r[2] * l[2], 0), 1))
  );
}

async function renderColumn(dir) {
  const png = join(WORK, "render.png");
  execFileSync(ICTOOL, [
    dir, "--export-image", "--output-file", png, "--platform", "macOS",
    "--rendition", "Default", "--width", "256", "--height", "256", "--scale", "1",
  ]);
  // center column band, away from the body edge (rim light lives < ~12px)
  const { data, info } = await sharp(png)
    .extract({ left: 96, top: 16, width: 64, height: 224 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rows = [];
  for (let y = 0; y < info.height; y++) {
    const acc = [0, 0, 0];
    for (let x = 0; x < info.width; x++)
      for (let k = 0; k < 3; k++) acc[k] += data[(y * info.width + x) * info.channels + k];
    rows.push(p3ToSrgb(acc.map((v) => v / info.width)));
  }
  return rows; // sRGB rows, y = 16..239 of 256
}

const FIT = process.argv.includes("--fit");
const COLORS = [];
if (FIT) {
  // gray ladder resolves the lightening law + near-white anchoring;
  // hue ladders check hue independence of the same offsets.
  for (let v = 0; v <= 20; v++) COLORS.push([`gray-${v * 5}`, [v / 20, v / 20, v / 20]]);
  for (const l of [0.2, 0.4, 0.6, 0.8])
    for (const [h, base] of [["red", [1, 0.15, 0.15]], ["blue", [0.1, 0.45, 1]], ["green", [0.2, 0.8, 0.3]]])
      COLORS.push([`${h}-${l}`, base.map((c) => c * l + (l > 0.6 ? (l - 0.6) : 0))]);
} else {
  COLORS.push(
    ["gray", [0.5, 0.5, 0.5]],
    ["black", [0, 0, 0]],
    ["white", [1, 1, 1]],
    ["red", [1, 0.2, 0.2]],
    ["orange", [0.744, 0.297, 0.0]],
    ["green", [0.235, 0.85, 0.32]],
    ["blue", [0.0, 0.533, 1.0]],
    ["purple", [0.35, 0.1, 0.85]],
    ["dark-blue", [0.05, 0.1, 0.3]],
    ["pastel", [0.85, 0.9, 0.95]]
  );
}

const report = [];
for (const [name, c] of COLORS) {
  const rows = await renderColumn(bundle(c));
  const top = rows[8], mid = rows[Math.floor(rows.length / 2)], bot = rows[rows.length - 9];
  // linearity check: mid vs average of top/bottom
  const linDev = Math.max(...mid.map((v, k) => Math.abs(v - (top[k] + bot[k]) / 2)));
  report.push({ name, input: c, top, mid, bot, linDev });
  const f = (a) => a.map((v) => v.toFixed(1)).join(",");
  console.log(
    name.padEnd(10), "in", c.join(","),
    "| top", f(top), "| bottom", f(bot),
    "| span", f(top.map((v, k) => v - bot[k])), "| linDev", linDev.toFixed(2)
  );
}
writeFileSync(join(WORK, "report.json"), JSON.stringify(report, null, 2));
console.log("\nreport:", join(WORK, "report.json"));
