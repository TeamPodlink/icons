// Build minimal .icon bundles from platforms' flat icon.svg — for
// platforms with no Liquid Glass bundle yet. macOS + Icon Composer only.
//
// The whole 32x32 icon.svg becomes a single full-bleed layer (neutral
// material, no glass), mirroring build_flat_icon.py but with a vector
// source. ictool's SVG renderer doesn't support everything (filters,
// blend modes, CSS color() fills), so every bundle is verified: the
// ictool render is compared against a librsvg (sharp) rasterization of
// the same SVG over the central region (inside the squircle). Bundles
// that disagree beyond --threshold automatically fall back to a 1024px
// PNG rasterization of the SVG (source: flat-svg-raster), which always
// matches by construction.
//
// Usage:
//   node pipeline/build-svg-icons.mjs [--all] [--only <id>]
//     [--threshold 8] [--force-raster <id,id,...>]
//   --all           include inactive platforms
//   --force-raster  skip the SVG layer for these ids, go straight to PNG
//
// After building, writes a contact sheet of all new renders to
// /tmp/svg-icons-review.png for visual QA. Update meta.json entries and
// re-run pipeline/build-assets.mjs afterwards (this script only creates
// bundles + registers them; it does not emit the web asset set).

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { readPlatforms, root } from "./lib.mjs";

const ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CANVAS = 1024;

// Browser-grade SVG rasterization via headless Chrome. Handles what
// neither ictool nor librsvg can: foreignObject (Figma conic-gradient
// exports), color(display-p3 ...) fills, invalid-but-browser-tolerated
// markup like stop-color="none".
function chromeRasterize(svgPath, outPng, size) {
  const dir = join("/tmp/svg-icons-work", `chrome-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  cpSync(svgPath, join(dir, "icon.svg"));
  writeFileSync(
    join(dir, "wrap.html"),
    `<!doctype html><html><head><style>html,body{margin:0;padding:0}img{width:${size}px;height:${size}px;display:block}</style></head><body><img src="icon.svg"></body></html>`
  );
  execFileSync(CHROME, [
    "--headless=new",
    "--disable-gpu",
    `--screenshot=${outPng}`,
    `--window-size=${size},${size}`,
    "--default-background-color=00000000",
    join(dir, "wrap.html"),
  ], { stdio: "ignore" });
  rmSync(dir, { recursive: true, force: true });
}

const args = process.argv.slice(2);
const flag = (name) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : null;
const includeInactive = args.includes("--all");
const only = flag("--only");
const THRESHOLD = Number(flag("--threshold") ?? 8);
const forceRaster = new Set((flag("--force-raster") ?? "").split(",").filter(Boolean));
const forceBrowser = new Set((flag("--browser") ?? "").split(",").filter(Boolean));

function bundleName(name) {
  return name.replace(/[^A-Za-z0-9]/g, "") + ".icon";
}

function viewBoxSize(svg) {
  const m = svg.match(/viewBox=["']\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
  if (!m) throw new Error("no viewBox");
  const w = Number(m[1]);
  if (Number(m[2]) !== w) throw new Error(`non-square viewBox ${m[1]}x${m[2]}`);
  return w;
}

function writeBundle(dir, layerFile, scale) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "Assets"), { recursive: true });
  const layer = {
    "image-name": layerFile,
    name: layerFile.replace(/\.[^.]+$/, ""),
    glass: false,
  };
  if (scale && Math.abs(scale - 1) > 1e-6)
    layer.position = { scale, "translation-in-points": [0, 0] };
  const doc = {
    groups: [
      {
        hidden: false,
        "blend-mode": "normal",
        specular: false,
        translucency: { enabled: false, value: 0 },
        layers: [layer],
      },
    ],
    "supported-platforms": { squares: "shared" },
  };
  writeFileSync(join(dir, "icon.json"), JSON.stringify(doc, null, 2) + "\n");
}

function ictoolRender(bundle, out, size) {
  execFileSync(ICTOOL, [
    bundle,
    "--export-image",
    "--output-file", out,
    "--platform", "macOS",
    "--rendition", "Default",
    "--width", String(size),
    "--height", String(size),
    "--scale", "1",
  ]);
}

// RMSE over the central 60% square (inside the squircle mask) at 256px.
async function centralRmse(pngA, pngB) {
  const size = 256;
  const off = Math.round(size * 0.2);
  const w = size - 2 * off;
  const region = { left: off, top: off, width: w, height: w };
  const [a, b] = await Promise.all(
    [pngA, pngB].map((p) =>
      sharp(p).resize(size, size).extract(region).removeAlpha().raw().toBuffer()
    )
  );
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum / a.length);
}

const targets = readPlatforms().filter(({ id, dir, meta }) => {
  if (only && id !== only) return false;
  if ((meta.liquidGlass?.bundles ?? []).length > 0) return false;
  if (!includeInactive && meta.active === false) return false;
  return existsSync(join(dir, "icon.svg"));
});

console.log(`${targets.length} platforms to build\n`);
const results = [];
const work = "/tmp/svg-icons-work";
mkdirSync(work, { recursive: true });

for (const { id, dir, meta } of targets) {
  const svgPath = join(dir, "icon.svg");
  const svg = readFileSync(svgPath, "utf8");
  const bname = bundleName(meta.name);
  const bdir = join(dir, bname);
  let source = "flat-svg";
  let rmse = null;

  try {
    if (!forceRaster.has(id) && !forceBrowser.has(id)) {
      const vb = viewBoxSize(svg);
      writeBundle(bdir, "icon.svg", CANVAS / vb);
      cpSync(svgPath, join(bdir, "Assets/icon.svg"));
      const render = join(work, `${id}-ictool.png`);
      ictoolRender(bdir, render, 256);
      const ref = join(work, `${id}-ref.png`);
      await sharp(svgPath, { density: (72 * 256) / viewBoxSize(svg) })
        .resize(256, 256)
        .png()
        .toFile(ref);
      rmse = await centralRmse(render, ref);
    }
    if (forceRaster.has(id) || forceBrowser.has(id) || rmse > THRESHOLD) {
      // Fallback: rasterize the SVG at 1024 in headless Chrome and ship
      // pixels. The browser is ground truth for these SVGs — ictool and
      // librsvg each mangle different subsets of modern SVG.
      source = "flat-svg-browser";
      const png = join(work, `${id}-1024.png`);
      chromeRasterize(svgPath, png, CANVAS);
      writeBundle(bdir, "light.png", null);
      cpSync(png, join(bdir, "Assets/light.png"));
      ictoolRender(bdir, join(work, `${id}-ictool.png`), 256);
    }
    meta.liquidGlass = {
      bundles: [
        { slug: id, title: meta.name, variant: null, file: bname, source },
      ],
    };
    writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
    results.push({ id, source, rmse: rmse == null ? null : +rmse.toFixed(2) });
    console.log(
      `ok ${id} (${source}${rmse != null ? `, rmse ${rmse.toFixed(2)}` : ""})`
    );
  } catch (e) {
    rmSync(bdir, { recursive: true, force: true });
    results.push({ id, source: "FAILED", error: String(e.message).slice(0, 90) });
    console.error(`FAIL ${id}: ${e.message}`);
  }
}

// Contact sheet of ictool renders for visual review (row-major, the
// printed order below maps index -> id).
const okIds = results.filter((r) => r.source !== "FAILED").map((r) => r.id);
if (okIds.length) {
  const cols = Math.ceil(Math.sqrt(okIds.length));
  const rows = Math.ceil(okIds.length / cols);
  const cell = 256;
  await sharp({
    create: {
      width: cols * cell,
      height: rows * cell,
      channels: 4,
      background: { r: 235, g: 235, b: 235, alpha: 1 },
    },
  })
    .composite(
      okIds.map((id, i) => ({
        input: join(work, `${id}-ictool.png`),
        left: (i % cols) * cell,
        top: Math.floor(i / cols) * cell,
      }))
    )
    .png()
    .toFile("/tmp/svg-icons-review.png");
  console.log(`\nreview sheet: /tmp/svg-icons-review.png (${cols} per row)`);
  console.log(okIds.join(", "));
}
console.log(
  `\n${results.filter((r) => r.source === "flat-svg").length} svg, ` +
    `${results.filter((r) => r.source === "flat-svg-raster").length} raster fallback, ` +
    `${results.filter((r) => r.source === "FAILED").length} failed`
);
