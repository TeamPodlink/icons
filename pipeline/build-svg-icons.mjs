// Build minimal .icon bundles from platforms' flat icon.svg — for
// platforms with no Liquid Glass bundle yet — then (by default) attempt
// the dark-variant SPLIT on each: decompose a detectable full-canvas
// solid background into the bundle's canvas fill so the glyph rides a
// proper dark canvas in the Dark rendition. macOS + Icon Composer +
// Chrome.
//
// Build modes (per icon, recorded as the bundle's `source`):
//   flat-svg          whole SVG as one full-bleed neutral layer
//   flat-svg-browser  1024px raster from headless Chrome — used when
//                     ictool mangles the SVG (filters, foreignObject...)
//   flat-svg-split    background lifted into the canvas fill; glyph
//                     layer alone (+ white-recolored dark glyph for
//                     monochrome-dark marks via opacity-specializations)
//
// Split rules (MEASURED by packages/engine/tools/probe-dark-tint*.py,
// Icon Composer 2.0 — see the pipeline/README.md ledger):
//   - ictool's Dark rendition always darkens the canvas (matching the
//     explicit gray:0.192->0.078 pin), but auto-tints a glyph with the
//     former background color ONLY when the layer is an SVG, has NO
//     opacity-specializations (even {value:1, dark:1} disables it),
//     every visible pixel is near-white (luminance >= ~0.85), and the
//     canvas DEFAULT fill has a channel above ~0.2. The tint samples
//     the default fill per-pixel along its gradient;
//     fill-specializations never gate it.
//   - So white glyphs must ship as a single bare SVG layer. Any twin
//     layer carrying opacity-specializations kills the tint — the old
//     "pin the glyph on dim backgrounds" twin was exactly the
//     white-on-gray dark-rendition bug.
//   - Monochrome-dark glyphs never auto-tint (they fail the near-white
//     gate); they get an explicit dark twin recolored to the background
//     color — the same convention iOS shows (dark canvas, glyph tinted
//     in the former background). Untintable backgrounds (max channel
//     <= 0.2) fall back to a white twin.
//   - Knockout designs (glyph punched out of an overlay above a white
//     base) are unsplittable: near-full glyph coverage detects them.
//
// Usage:
//   node pipeline/build-svg-icons.mjs [--all] [--only <id>]
//     [--threshold 8] [--force-raster <id,...>] [--browser <id,...>]
//     [--no-split] [--split-existing]
//   --all             include inactive platforms
//   --browser         skip the SVG layer for these ids, go straight to
//                     a Chrome raster
//   --no-split        build single-layer bundles only
//   --split-existing  also (re-)attempt the split on bundles already
//                     built as flat-svg or flat-svg-split (not just
//                     ones built this run)
//
// Review sheets for visual QA:
//   /tmp/svg-icons-review.png      light renders of built bundles
//   /tmp/dark-variants-review.png  light|dark pairs of split bundles

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
import { readPlatforms } from "./lib.mjs";

const ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CANVAS = 1024;
const DARK_GRADIENT = {
  "linear-gradient": ["gray:0.19200,1.00000", "gray:0.07800,1.00000"],
  orientation: { start: { x: 0.5, y: 0 }, stop: { x: 0.5, y: 1 } },
};

const args = process.argv.slice(2);
const flag = (name) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : null;
const includeInactive = args.includes("--all");
const only = flag("--only");
const THRESHOLD = Number(flag("--threshold") ?? 8);
const forceRaster = new Set((flag("--force-raster") ?? "").split(",").filter(Boolean));
const forceBrowser = new Set((flag("--browser") ?? "").split(",").filter(Boolean));
const doSplit = !args.includes("--no-split");
const splitExisting = args.includes("--split-existing");

const work = "/tmp/svg-icons-work";
mkdirSync(work, { recursive: true });

// ------------------------------------------------------------ helpers

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

function ictoolRender(bundle, out, size, rendition = "Default") {
  execFileSync(ICTOOL, [
    bundle, "--export-image", "--output-file", out, "--platform", "macOS",
    "--rendition", rendition, "--width", String(size), "--height",
    String(size), "--scale", "1",
  ]);
}

// Browser-grade SVG rasterization via headless Chrome. Handles what
// neither ictool nor librsvg can: foreignObject (Figma conic-gradient
// exports), color(display-p3 ...) fills, invalid-but-browser-tolerated
// markup like stop-color="none".
function chromeRasterize(svgText, outPng, size) {
  const dir = join(work, `chrome-${Math.floor(Math.random() * 1e9)}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "icon.svg"), svgText);
  writeFileSync(
    join(dir, "wrap.html"),
    `<!doctype html><html><head><style>html,body{margin:0;padding:0}img{width:${size}px;height:${size}px;display:block}</style></head><body><img src="icon.svg"></body></html>`
  );
  execFileSync(CHROME, [
    "--headless=new", "--disable-gpu", `--screenshot=${outPng}`,
    `--window-size=${size},${size}`, "--default-background-color=00000000",
    join(dir, "wrap.html"),
  ], { stdio: "ignore" });
  rmSync(dir, { recursive: true, force: true });
}

function writeSingleLayerBundle(dir, layerFile, scale) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "Assets"), { recursive: true });
  const layer = {
    "image-name": layerFile,
    name: layerFile.replace(/\.[^.]+$/, ""),
    glass: false,
  };
  if (scale && Math.abs(scale - 1) > 1e-6)
    layer.position = { scale, "translation-in-points": [0, 0] };
  writeFileSync(
    join(dir, "icon.json"),
    JSON.stringify(
      {
        groups: [
          {
            hidden: false, "blend-mode": "normal", specular: false,
            translucency: { enabled: false, value: 0 },
            layers: [layer],
          },
        ],
        "supported-platforms": { squares: "shared" },
      },
      null, 2
    ) + "\n"
  );
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

// ----------------------------------------------------- split machinery

function parseColor(s) {
  let m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const [r, g, b] = [0, 2, 4].map((i) =>
      (parseInt(m[1].slice(i, i + 2), 16) / 255).toFixed(5)
    );
    return `srgb:${r},${g},${b},1.00000`;
  }
  m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const [r, g, b] = [...m[1]].map((c) =>
      (parseInt(c + c, 16) / 255).toFixed(5)
    );
    return `srgb:${r},${g},${b},1.00000`;
  }
  m = s.match(/^color\(display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (m)
    return `display-p3:${(+m[1]).toFixed(5)},${(+m[2]).toFixed(5)},${(+m[3]).toFixed(5)},1.00000`;
  if (s === "white") return "srgb:1.00000,1.00000,1.00000,1.00000";
  if (s === "black") return "srgb:0.00000,0.00000,0.00000,1.00000";
  return null;
}

const FULL = String.raw`[Mm]0[ ,]0\s*h\s*32\s*v\s*32\s*[Hh]0\s*[zZ]`;

// Detect + strip a leading full-canvas solid background. Two patterns:
//   A: <path fill="C" d="M0 0h32v32H0z"/> (repeated paints all belong
//      to the background stack; the LAST removed is the visible color)
//   B: podcastindex-style defs path with fill, painted by a <use> at
//      the head of the clip group (never touch the clipPath's <use>)
function splitBackground(svg) {
  let color = null;
  let out = svg;
  for (let i = 0; i < 3; i++) {
    const re = new RegExp(
      `<(?:path|rect)\\s+fill="([^"]+)"(?:\\s+fill-opacity="1")?\\s+d="${FULL}"\\s*/>`
    );
    const m = out.match(re);
    if (!m) break;
    const c = parseColor(m[1]);
    if (!c) break;
    color = c;
    out = out.replace(m[0], "");
  }
  if (color) return { color, glyphSvg: out };
  const m = svg.match(
    new RegExp(
      `<path id="([^"]+)" fill="([^"]+)"[^>]*d="${FULL}"[^>]*/>[\\s\\S]*?<use href="#\\1"\\s*/>`
    )
  );
  if (m) {
    const c = parseColor(m[2]);
    if (c) {
      const painted = svg.replace(
        new RegExp(`(<g clip-path="[^"]*">)\\s*<use href="#${m[1]}"\\s*/>`),
        "$1"
      );
      if (painted !== svg) return { color: c, glyphSvg: painted };
    }
  }
  return null;
}

/** Coverage-weighted mean luminance + saturation of visible pixels. */
async function glyphStats(png) {
  const { data } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  let n = 0, luma = 0, sat = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 25) {
      n++;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      luma += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const mx = Math.max(r, g, b);
      sat += mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx;
    }
  }
  return {
    luma: n ? luma / n : 255,
    sat: n ? sat / n : 0,
    coverage: n / (data.length / 4),
  };
}

/**
 * Recolor dark fills for the dark-appearance glyph twin. `css` is the
 * former background color (Apple's dark-icon tint convention), or
 * white when the background is untintable.
 */
function retintDark(svg, css) {
  return svg
    .replace(/fill="#([0-4][0-9a-f]{2}|[0-4][0-9a-f]{5})"/gi, `fill="${css}"`)
    .replace(/fill="(black|#000|#000000)"/gi, `fill="${css}"`)
    .replace(/stroke="(black|#000|#000000)"/gi, `stroke="${css}"`);
}

/** ic color ("srgb:r,g,b,a" / "display-p3:...") -> CSS color. */
function cssColor(icColor) {
  const m = icColor.match(/^([a-z0-9-]+):([\d.]+),([\d.]+),([\d.]+)/);
  if (!m) return null;
  const [r, g, b] = [+m[2], +m[3], +m[4]];
  if (m[1] === "display-p3") return `color(display-p3 ${r} ${g} ${b})`;
  const h = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Attempt the background/glyph split on a platform's bundle.
 * Returns "split" | a skip-reason string.
 */
async function trySplit(id, dir, meta) {
  const b = meta.liquidGlass.bundles[0];
  const svg = readFileSync(join(dir, "icon.svg"), "utf8");
  const split = splitBackground(svg);
  if (!split) return "no-detectable-bg";

  const glyphPng = join(work, `${id}-glyph.png`);
  chromeRasterize(split.glyphSvg, glyphPng, 256);
  const { luma, sat, coverage } = await glyphStats(glyphPng);
  if (coverage > 0.65) return "knockout-or-leftover-bg";
  const needsWhiteGlyph = luma < 110 && sat < 0.18 && coverage > 0.01;

  const bdir = join(dir, b.file);
  rmSync(bdir, { recursive: true, force: true });
  mkdirSync(join(bdir, "Assets"), { recursive: true });
  writeFileSync(join(bdir, "Assets/icon.svg"), split.glyphSvg);
  // White glyphs MUST stay a single bare SVG layer: ictool's dark
  // derivation tints them with the canvas default fill, and any twin
  // layer / opacity-specialization disables that tint (measured law —
  // see header). Dark monochrome glyphs never auto-tint, so they get
  // an explicit dark twin recolored to the former background color
  // (white if the background is untintable: max channel <= 0.2).
  const cm = split.color.match(/^[a-z0-9-]+:([\d.]+),([\d.]+),([\d.]+)/);
  const bgMax = cm ? Math.max(+cm[1], +cm[2], +cm[3]) : 1;
  const layers = [];
  if (needsWhiteGlyph) {
    const twinColor = bgMax > 0.2 ? cssColor(split.color) : "#ffffff";
    writeFileSync(
      join(bdir, "Assets/icon-dark.svg"),
      retintDark(split.glyphSvg, twinColor)
    );
    layers.push({
      "image-name": "icon-dark.svg", name: "icon-dark", glass: false,
      position: { scale: 32, "translation-in-points": [0, 0] },
      "opacity-specializations": [
        { value: 0 }, { appearance: "dark", value: 1 },
      ],
    });
  }
  layers.push({
    "image-name": "icon.svg", name: "icon", glass: false,
    position: { scale: 32, "translation-in-points": [0, 0] },
    ...(needsWhiteGlyph
      ? {
          "opacity-specializations": [
            { value: 1 }, { appearance: "dark", value: 0 },
          ],
        }
      : {}),
  });
  const solid = {
    "linear-gradient": [split.color, split.color],
    orientation: { start: { x: 0.5, y: 0 }, stop: { x: 0.5, y: 1 } },
  };
  writeFileSync(
    join(bdir, "icon.json"),
    JSON.stringify(
      {
        fill: {
          ...solid,
          "fill-specializations": [
            { value: solid },
            { appearance: "dark", value: DARK_GRADIENT },
          ],
        },
        groups: [
          {
            hidden: false, "blend-mode": "normal", specular: false,
            translucency: { enabled: false, value: 0 },
            layers,
          },
        ],
        "supported-platforms": { squares: "shared" },
      },
      null, 2
    ) + "\n"
  );
  ictoolRender(bdir, join(work, `${id}-light.png`), 256, "Default");
  ictoolRender(bdir, join(work, `${id}-dark.png`), 256, "Dark");
  b.source = "flat-svg-split";
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  return "split";
}

// -------------------------------------------------------------- build

const buildTargets = readPlatforms().filter(({ id, dir, meta }) => {
  if (only && id !== only) return false;
  if ((meta.liquidGlass?.bundles ?? []).length > 0) return false;
  if (!includeInactive && meta.active === false) return false;
  return existsSync(join(dir, "icon.svg"));
});

console.log(`${buildTargets.length} platforms to build\n`);
const results = [];

for (const { id, dir, meta } of buildTargets) {
  const svgPath = join(dir, "icon.svg");
  const svg = readFileSync(svgPath, "utf8");
  const bname = bundleName(meta.name);
  const bdir = join(dir, bname);
  let source = "flat-svg";
  let rmse = null;

  try {
    if (!forceRaster.has(id) && !forceBrowser.has(id)) {
      const vb = viewBoxSize(svg);
      writeSingleLayerBundle(bdir, "icon.svg", CANVAS / vb);
      cpSync(svgPath, join(bdir, "Assets/icon.svg"));
      const render = join(work, `${id}-ictool.png`);
      ictoolRender(bdir, render, 256);
      const ref = join(work, `${id}-ref.png`);
      await sharp(svgPath, { density: (72 * 256) / vb })
        .resize(256, 256)
        .png()
        .toFile(ref);
      rmse = await centralRmse(render, ref);
    }
    if (forceRaster.has(id) || forceBrowser.has(id) || rmse > THRESHOLD) {
      // The browser is ground truth for these SVGs — ictool and librsvg
      // each mangle different subsets of modern SVG.
      source = "flat-svg-browser";
      const png = join(work, `${id}-1024.png`);
      chromeRasterize(svg, png, CANVAS);
      writeSingleLayerBundle(bdir, "light.png", null);
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

// -------------------------------------------------------- split pass

const splitResults = [];
if (doSplit) {
  const builtIds = new Set(
    results.filter((r) => r.source === "flat-svg").map((r) => r.id)
  );
  // --split-existing also re-runs the split on bundles already split
  // (flat-svg-split), regenerating their icon.json from icon.svg.
  const splittable = splitExisting
    ? ["flat-svg", "flat-svg-split"]
    : ["flat-svg"];
  for (const { id, dir, meta } of readPlatforms()) {
    if (only && id !== only) continue;
    const b = meta.liquidGlass?.bundles?.[0];
    if (!b || !splittable.includes(b.source) || meta.liquidGlass.bundles.length > 1)
      continue;
    if (!splitExisting && !builtIds.has(id)) continue;
    try {
      const outcome = await trySplit(id, dir, meta);
      splitResults.push({ id, outcome });
      console.log(`split ${id}: ${outcome}`);
    } catch (e) {
      splitResults.push({ id, outcome: `FAILED: ${e.message}` });
      console.error(`split FAIL ${id}: ${e.message}`);
    }
  }
}

// ------------------------------------------------------ review sheets

async function sheet(cells, out, cols) {
  const cell = 256;
  const rows = Math.ceil(cells.length / cols);
  await sharp({
    create: {
      width: cols * cell, height: rows * cell, channels: 4,
      background: { r: 128, g: 128, b: 128, alpha: 1 },
    },
  })
    .composite(
      cells.map((input, i) => ({
        input, left: (i % cols) * cell, top: Math.floor(i / cols) * cell,
      }))
    )
    .png()
    .toFile(out);
}

const okIds = results.filter((r) => r.source !== "FAILED").map((r) => r.id);
if (okIds.length) {
  const cols = Math.ceil(Math.sqrt(okIds.length));
  await sheet(
    okIds.map((id) => join(work, `${id}-ictool.png`)),
    "/tmp/svg-icons-review.png",
    cols
  );
  console.log(`\nlight review: /tmp/svg-icons-review.png (${cols} per row)`);
  console.log(okIds.join(", "));
}
const splitIds = splitResults
  .filter((r) => r.outcome === "split")
  .map((r) => r.id);
if (splitIds.length) {
  await sheet(
    splitIds.flatMap((id) => [
      join(work, `${id}-light.png`),
      join(work, `${id}-dark.png`),
    ]),
    "/tmp/dark-variants-review.png",
    6
  );
  console.log(`\ndark pairs review: /tmp/dark-variants-review.png`);
  console.log(splitIds.join(", "));
}

console.log(
  `\nbuilt: ${results.filter((r) => r.source === "flat-svg").length} svg, ` +
    `${results.filter((r) => r.source === "flat-svg-browser").length} browser, ` +
    `${results.filter((r) => r.source === "FAILED").length} failed; ` +
    `split: ${splitIds.length} of ${splitResults.length} attempted`
);
