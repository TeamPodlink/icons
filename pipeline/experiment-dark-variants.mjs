// PROTOTYPE: authored dark renditions for SVG-built bundles.
//
// For bundles whose icon.svg starts with a detectable full-canvas solid
// background, decompose into canvas fill + glyph layer:
//   - light: canvas fill = the original background color (exact solid),
//     so the rendition is visually unchanged;
//   - dark: fill-specialization swaps the canvas to the standard dark
//     gradient (gray 0.192 -> 0.078); mostly-dark glyphs additionally get
//     a white-recolored dark glyph layer (opacity-specializations swap),
//     otherwise the same glyph rides the dark canvas.
//
// Only bundles with source "flat-svg" and a confidently-detected solid
// background are rewritten (source becomes "flat-svg-split"). Everything
// else is left untouched. Review sheet: /tmp/dark-variants-review.png
// (light|dark pairs). macOS + Icon Composer + Chrome.
//
// Usage: node pipeline/experiment-dark-variants.mjs [--only <id>]

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { readPlatforms, root } from "./lib.mjs";

const ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DARK_GRADIENT = {
  "linear-gradient": ["gray:0.19200,1.00000", "gray:0.07800,1.00000"],
  orientation: { start: { x: 0.5, y: 0 }, stop: { x: 0.5, y: 1 } },
};
const only = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : null;

// ---- color parsing: #hex or color(display-p3 r g b) -> icon.json string
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
  if (s === "#fff" || s === "white") return "srgb:1.00000,1.00000,1.00000,1.00000";
  if (s === "#000" || s === "black") return "srgb:0.00000,0.00000,0.00000,1.00000";
  return null;
}

const FULL = String.raw`[Mm]0[ ,]0\s*h\s*32\s*v\s*32\s*[Hh]0\s*[zZ]`;

// Detect + strip a leading full-canvas solid background. Two patterns:
//   A: <path fill="C" d="M0 0h32v32H0z"/> (or <rect .../>) as first paint
//   B: podcastindex-style defs path with fill + a leading <use href>
function splitBackground(svg) {
  // Repeated full-canvas paints all belong to the background stack
  // (Figma exports often layer a white base under the brand color);
  // the LAST one removed is the visible background color.
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
  // Pattern B: fill lives on a defs path referenced by the first <use>
  const m = svg.match(
    new RegExp(
      `<path id="([^"]+)" fill="([^"]+)"[^>]*d="${FULL}"[^>]*/>[\\s\\S]*?<use href="#\\1"\\s*/>`
    )
  );
  if (m) {
    const c = parseColor(m[2]);
    if (c) {
      // Remove only the PAINTING <use> (first child of the clip group) —
      // never the <clipPath>'s own <use> reference.
      const painted = svg.replace(
        new RegExp(`(<g clip-path="[^"]*">)\\s*<use href="#${m[1]}"\\s*/>`),
        "$1"
      );
      if (painted !== svg) return { color: c, glyphSvg: painted };
    }
  }
  return null;
}

function chromeRasterize(svgText, outPng, size) {
  const dir = `/tmp/dark-work/chrome-${Math.floor(Math.random() * 1e9)}`;
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

/** Recolor dark fills to white for the dark-appearance glyph. */
function whiten(svg) {
  return svg
    .replace(/fill="#([0-4][0-9a-f]{2}|[0-4][0-9a-f]{5})"/gi, 'fill="#ffffff"')
    .replace(/fill="(black|#000|#000000)"/gi, 'fill="#ffffff"')
    .replace(/stroke="(black|#000|#000000)"/gi, 'stroke="#ffffff"');
}

function ictoolRender(bundle, out, size, rendition) {
  execFileSync(ICTOOL, [
    bundle, "--export-image", "--output-file", out, "--platform", "macOS",
    "--rendition", rendition, "--width", String(size), "--height", String(size),
    "--scale", "1",
  ]);
}

mkdirSync("/tmp/dark-work", { recursive: true });
const rows = [];
const skipped = [];

for (const { id, dir, meta } of readPlatforms()) {
  if (only && id !== only) continue;
  const b = meta.liquidGlass?.bundles?.[0];
  if (!b || b.source !== "flat-svg" || meta.liquidGlass.bundles.length > 1) continue;
  const svg = readFileSync(join(dir, "icon.svg"), "utf8");
  const split = splitBackground(svg);
  if (!split) {
    skipped.push(id);
    continue;
  }

  const glyphPng = `/tmp/dark-work/${id}-glyph.png`;
  chromeRasterize(split.glyphSvg, glyphPng, 256);
  const { luma, sat, coverage } = await glyphStats(glyphPng);
  // Whitening is only safe for effectively-monochrome dark glyphs. A
  // dark-but-colorful glyph (illustrated artwork) can't be recolored
  // mechanically — leave those bundles as plain single-layer (auto dark).
  // Whiten only effectively-monochrome dark glyphs; dark-but-colorful
  // glyphs (red antennas, illustrated art) split WITHOUT recoloring and
  // let Apple's automatic dark derivation handle the rest.
  const needsWhiteGlyph = luma < 110 && sat < 0.18 && coverage > 0.01;
  // Knockout designs (overlay with the glyph as a punched hole over a
  // white base) leave a near-full-coverage "glyph"; swapping the canvas
  // makes the hole go dark instead of the background. Unsplittable.
  if (coverage > 0.65) {
    skipped.push(`${id}(knockout-or-leftover-bg)`);
    continue;
  }

  const bdir = join(dir, b.file);
  rmSync(bdir, { recursive: true, force: true });
  mkdirSync(join(bdir, "Assets"), { recursive: true });
  writeFileSync(join(bdir, "Assets/icon.svg"), split.glyphSvg);
  const layers = [];
  if (needsWhiteGlyph) {
    writeFileSync(join(bdir, "Assets/icon-dark.svg"), whiten(split.glyphSvg));
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

  const light = `/tmp/dark-work/${id}-light.png`;
  const dark = `/tmp/dark-work/${id}-dark.png`;
  ictoolRender(bdir, light, 256, "Default");
  ictoolRender(bdir, dark, 256, "Dark");
  b.source = "flat-svg-split";
  writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  rows.push({ id, whiteGlyph: needsWhiteGlyph, luma: Math.round(luma) });
  console.log(
    `ok ${id} (bg ${split.color}${needsWhiteGlyph ? `, white dark glyph, luma ${Math.round(luma)}` : ""})`
  );
}

// paired review sheet: each row = [light, dark]
if (rows.length) {
  const cell = 256;
  const cols = 6; // 3 icons per visual row (light+dark pairs)
  const gridRows = Math.ceil((rows.length * 2) / cols);
  const composites = rows.flatMap(({ id }, i) => [
    { input: `/tmp/dark-work/${id}-light.png`, left: ((2 * i) % cols) * cell, top: Math.floor((2 * i) / cols) * cell },
    { input: `/tmp/dark-work/${id}-dark.png`, left: ((2 * i + 1) % cols) * cell, top: Math.floor((2 * i + 1) / cols) * cell },
  ]);
  await sharp({
    create: { width: cols * cell, height: gridRows * cell, channels: 4, background: { r: 128, g: 128, b: 128, alpha: 1 } },
  })
    .composite(composites)
    .png()
    .toFile("/tmp/dark-variants-review.png");
  console.log(`\nreview: /tmp/dark-variants-review.png — pairs in order:`);
  console.log(rows.map((r) => r.id).join(", "));
}
console.log(`\n${rows.length} split, ${skipped.length} no-detectable-bg: ${skipped.join(", ")}`);
