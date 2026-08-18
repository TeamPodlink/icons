// Split flat RASTER bundles (appstore/catalog artwork) whose art has a
// uniform background: border-connected flood fill separates background
// from glyph, the background color becomes the bundle's canvas fill,
// and the glyph ships as a transparent-background layer.
//
// Dark renditions are BAKED here. Measured law (packages/engine/tools/
// probe-dark-tint*.py, ledger in pipeline/README.md): ictool's Dark
// rendition darkens the canvas but auto-tints only bare all-white SVG
// layers — raster layers are NEVER tinted — so this script bakes
// Apple's dark-icon convention itself: a glyph-dark.png twin whose
// monochrome paint (white or dark) is recolored to the former
// background color, riding the dark canvas via opacity-specializations.
// Pixels matching the background become holes; colorful glyphs get no
// twin (they keep their own colors in dark, as iOS does); untintable
// backgrounds (max channel <= ~0.2, e.g. black) keep the glyph as-is.
//
// Interior regions matching the background color (YouTube's white play
// triangle) are NOT border-connected and are preserved.
//
// Safety guard: the rebuilt bundle's Default rendition must match the
// original bundle's render (central RMSE <= 3) or the change is
// reverted. Dark pairs land in /tmp/raster-split-review.png.
//
// Usage: node pipeline/split-raster-icons.mjs [--only <slug>] [--tol 12]
//   --refresh-dark    re-bake glyph-dark.png + layers for bundles that
//                     are ALREADY split (source *-artwork-split),
//                     keeping their canvas fill and glyph.png as-is

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { readBundles, root } from "./lib.mjs";

const ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool";
const DARK_GRADIENT = {
  "linear-gradient": ["gray:0.19200,1.00000", "gray:0.07800,1.00000"],
  orientation: { start: { x: 0.5, y: 0 }, stop: { x: 0.5, y: 1 } },
};
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const TOL = Number(args.includes("--tol") ? args[args.indexOf("--tol") + 1] : 12);
const refreshDark = args.includes("--refresh-dark");
const allowDarkGlyph = new Set(
  (args.includes("--allow-dark-glyph")
    ? args[args.indexOf("--allow-dark-glyph") + 1]
    : ""
  ).split(",").filter(Boolean)
);
const work = "/tmp/raster-split";
mkdirSync(work, { recursive: true });

function ictoolRender(bundle, out, size, rendition = "Default") {
  execFileSync(ICTOOL, [
    bundle, "--export-image", "--output-file", out, "--platform", "macOS",
    "--rendition", rendition, "--width", String(size), "--height",
    String(size), "--scale", "1",
  ]);
}

async function centralRmse(pngA, pngB) {
  const size = 256, off = 51, w = size - 102;
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

/**
 * Border-connected flood fill over near-background pixels. Handles both
 * uniform and VERTICAL-GRADIENT backgrounds: the reference background
 * color varies per row (mean of each row's left+right border pixels,
 * smoothed), which is exactly what the bundle's 2-stop linear-gradient
 * canvas fill can represent. The light-rendition RMSE guard downstream
 * rejects backgrounds a linear gradient can't reproduce.
 * Returns { bgTop, bgBottom, bgMid: [r,g,b], glyph: Buffer } or null.
 */
function keyBackground(data, w, h, tol) {
  const px = (x, y) => (y * w + x) * 4;
  // Sampling is inset a few pixels: some appstore artwork bakes tiny
  // rounded-corner AA (anytimeplayer) that the canvas squircle mask
  // hides anyway but that would poison border references.
  const IN = 3;
  // per-row background reference from (inset) left/right border
  // columns; the outermost IN rows reuse the nearest inset row so edge
  // artifacts can't poison the reference or the smoothness check
  const rowBg = new Array(h);
  for (let y = 0; y < h; y++) {
    const yy = Math.min(Math.max(y, IN), h - 1 - IN);
    let rs = 0, gs = 0, bs = 0, n = 0;
    for (const x of [IN, IN + 1, IN + 2, w - 3 - IN, w - 2 - IN, w - 1 - IN]) {
      const i = px(x, yy);
      rs += data[i]; gs += data[i + 1]; bs += data[i + 2]; n++;
    }
    rowBg[y] = [rs / n, gs / n, bs / n];
  }
  // left vs right must agree per row (else the bg isn't a vertical field)
  for (let y = IN; y < h - IN; y += 7) {
    const l = px(IN, y), r = px(w - 1 - IN, y);
    const d = Math.hypot(
      data[l] - data[r], data[l + 1] - data[r + 1], data[l + 2] - data[r + 2]
    );
    if (d > tol * 1.5) return null;
  }
  // smoothness: adjacent rows must vary gently (gradient, not texture)
  for (let y = IN + 1; y < h - IN; y++) {
    const d = Math.hypot(
      rowBg[y][0] - rowBg[y - 1][0],
      rowBg[y][1] - rowBg[y - 1][1],
      rowBg[y][2] - rowBg[y - 1][2]
    );
    if (d > 3) return null;
  }
  // near-border rows must be horizontally uniform against their rowBg
  for (const y of [IN, h - 1 - IN])
    for (let x = IN + 1; x < w - IN; x += 5) {
      const i = px(x, y);
      const d = Math.hypot(
        data[i] - rowBg[y][0], data[i + 1] - rowBg[y][1], data[i + 2] - rowBg[y][2]
      );
      if (d > tol * 1.5) return null;
    }

  const dist = (i) => {
    const y = Math.floor(i / 4 / w);
    const bg = rowBg[y];
    return Math.sqrt(
      (data[i] - bg[0]) ** 2 + (data[i + 1] - bg[1]) ** 2 + (data[i + 2] - bg[2]) ** 2
    );
  };
  const mask = new Uint8Array(w * h); // 1 = background
  const stack = [];
  const border = [];
  for (let x = 0; x < w; x++) border.push([x, 0], [x, h - 1]);
  for (let y = 0; y < h; y++) border.push([0, y], [w - 1, y]);
  for (const [x, y] of border)
    if (dist(px(x, y)) <= tol) {
      mask[y * w + x] = 1;
      stack.push(x, y);
    }
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (!mask[j] && dist(j * 4) <= tol) {
        mask[j] = 1;
        stack.push(nx, ny);
      }
    }
  }
  // glyph = original with background transparent; soften the boundary
  // by scaling alpha with color distance in a 1px shell around the mask
  const out = Buffer.from(data);
  for (let i = 0; i < w * h; i++) {
    if (mask[i]) out[i * 4 + 3] = 0;
  }
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (mask[i]) continue;
      const nearBg =
        mask[i - 1] || mask[i + 1] || mask[i - w] || mask[i + w];
      if (nearBg) {
        const d = dist(i * 4);
        const a = Math.max(0, Math.min(1, (d - tol * 0.5) / (tol * 1.5)));
        out[i * 4 + 3] = Math.round(out[i * 4 + 3] * a);
      }
    }
  const round3 = (c) => c.map((v) => Math.round(v));
  return {
    bgTop: round3(rowBg[0]),
    bgBottom: round3(rowBg[h - 1]),
    bgMid: round3(rowBg[Math.floor(h / 2)]),
    glyph: out,
  };
}

/**
 * Bake the dark-appearance glyph twin (raster layers never auto-tint —
 * see header). Model: the artwork is monochrome paint P (white or
 * dark) over background B; each pixel is projected onto the B->P line.
 * Paint becomes the background color (per-row along the canvas
 * gradient — matching how ictool's SVG tint samples the default fill),
 * pixels matching B become holes, blends interpolate. Returns the
 * baked RGBA buffer, or null (no twin) when:
 *   - the background is untintable (max channel <= ~0.2: ictool keeps
 *     white glyphs white on black canvases, and so do we),
 *   - paint and background are indistinguishable, or
 *   - the artwork has colors off the B->P line (colorful glyphs keep
 *     their own colors in dark, as iOS does) — unless `force`.
 */
function bakeDarkGlyph(data, w, h, bgTop, bgBottom, force = false) {
  if (Math.max(...bgTop, ...bgBottom) <= 51) return null;
  const rowBg = (y) => {
    const t = h <= 1 ? 0 : y / (h - 1);
    return [
      bgTop[0] + (bgBottom[0] - bgTop[0]) * t,
      bgTop[1] + (bgBottom[1] - bgTop[1]) * t,
      bgTop[2] + (bgBottom[2] - bgTop[2]) * t,
    ];
  };
  // Pole vote among clearly-non-background pixels: is the paint white
  // or achromatic-dark? Chromatic paint (YouTube's red button) and
  // mid-tones vote "other" — enough of those means the artwork isn't a
  // monochrome mark and gets no twin (it keeps its colors in dark).
  let nWhite = 0, nDark = 0, nOther = 0, dr = 0, dg = 0, db = 0;
  for (let y = 0; y < h; y++) {
    const B = rowBg(y);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] <= 128) continue;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (Math.hypot(r - B[0], g - B[1], b - B[2]) <= 48) continue;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const mx = Math.max(r, g, b);
      const sat = mx > 0 ? (mx - Math.min(r, g, b)) / mx : 0;
      if (luma >= 217) nWhite++;
      else if (luma < 90 && sat < 0.25) { nDark++; dr += r; dg += g; db += b; }
      else nOther++;
    }
  }
  const nVote = nWhite + nDark + nOther;
  if (!nVote) return null;
  if (!force && nOther / nVote > 0.1) return null;
  let P;
  if (nWhite > 0 && (force ? nWhite >= nDark : nWhite >= 8 * nDark))
    P = [255, 255, 255];
  else if (nDark > 0 && (force ? nDark > nWhite : nDark >= 8 * nWhite))
    P = [dr / nDark, dg / nDark, db / nDark];
  else return null;
  const out = Buffer.alloc(data.length);
  let nVis = 0, nOff = 0;
  for (let y = 0; y < h; y++) {
    const B = rowBg(y);
    const d = [P[0] - B[0], P[1] - B[1], P[2] - B[2]];
    const dd = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
    if (dd < 80 ** 2) return null; // paint ~= background: nothing to tint
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      if (a === 0) continue;
      const v = [data[i] - B[0], data[i + 1] - B[1], data[i + 2] - B[2]];
      let t = (v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) / dd;
      t = Math.max(0, Math.min(1, t));
      if (a > 128) {
        nVis++;
        if (Math.hypot(v[0] - t * d[0], v[1] - t * d[1], v[2] - t * d[2]) > 64)
          nOff++;
      }
      out[i] = Math.round(B[0]);
      out[i + 1] = Math.round(B[1]);
      out[i + 2] = Math.round(B[2]);
      out[i + 3] = Math.round(a * t);
    }
  }
  if (!nVis || (!force && nOff / nVis > 0.02)) return null;
  return out;
}

/** Coverage-weighted mean luminance of visible glyph pixels. */
function glyphLuma(data) {
  let n = 0, luma = 0;
  for (let i = 0; i < data.length; i += 4)
    if (data[i + 3] > 25) {
      n++;
      luma += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
  return n ? luma / n : 255;
}

function twinLayers(baseLayer, hasTwin) {
  return hasTwin
    ? [
        {
          ...baseLayer, "image-name": "glyph-dark.png", name: "glyph-dark",
          "opacity-specializations": [
            { value: 0 }, { appearance: "dark", value: 1 },
          ],
        },
        {
          ...baseLayer,
          "opacity-specializations": [
            { value: 1 }, { appearance: "dark", value: 0 },
          ],
        },
      ]
    : [baseLayer];
}

function parseStop(s) {
  const m = s.match(/^([a-z0-9-]+):([\d.]+)(?:,([\d.]+),([\d.]+))?/);
  if (!m) throw new Error(`unparsable fill stop ${s}`);
  if (m[1] === "gray") {
    const v = Math.round(+m[2] * 255);
    return [v, v, v];
  }
  return [+m[2], +m[3], +m[4]].map((v) => Math.round(v * 255));
}

import { existsSync as _exists, readdirSync as _readdir } from "node:fs";
const targets = readBundles().filter((b) => {
  if (only && b.slug !== only) return false;
  if (refreshDark)
    return ["appstore-artwork-split", "catalog-artwork-split"].includes(b.source);
  if (!["appstore-artwork", "catalog-artwork"].includes(b.source)) return false;
  if (b.hasDark) return false;
  // Never split a bundle that already ships explicit dark art — meta's
  // hasDark may lag behind a fresh rebuild until build-assets re-measures.
  const assets = join(b.bundlePath, "Assets");
  if (_exists(assets) && _readdir(assets).some((f) => f.startsWith("dark")))
    return false;
  return true;
});
console.log(`${targets.length} raster bundles to attempt\n`);
const pairs = [];

for (const b of targets) {
  const bdir = b.bundlePath;
  const backup = join(work, `${b.slug}-backup.icon`);
  // Clear any stale backup from a previous run so a pre-mutation failure
  // can never "restore" outdated bundle contents.
  rmSync(backup, { recursive: true, force: true });
  try {
    const assets = join(bdir, "Assets");

    if (refreshDark) {
      // Re-bake the dark twin for an already-split bundle: glyph.png
      // and the canvas fill stay exactly as they are.
      const { data, info } = await sharp(join(assets, "glyph.png"))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const icon = JSON.parse(readFileSync(join(bdir, "icon.json"), "utf8"));
      const stops = icon.fill["linear-gradient"];
      const bgTop = parseStop(stops[0]);
      const bgBottom = parseStop(stops[1]);
      const beforeR = join(work, `${b.slug}-before.png`);
      ictoolRender(bdir, beforeR, 256);
      rmSync(backup, { recursive: true, force: true });
      cpSync(bdir, backup, { recursive: true });
      const baked = bakeDarkGlyph(
        data, info.width, info.height, bgTop, bgBottom,
        allowDarkGlyph.has(b.slug)
      );
      if (baked)
        await sharp(baked, {
          raw: { width: info.width, height: info.height, channels: 4 },
        })
          .png()
          .toFile(join(assets, "glyph-dark.png"));
      else rmSync(join(assets, "glyph-dark.png"), { force: true });
      const scale = info.width === 1024 ? undefined : 1024 / info.width;
      const baseLayer = {
        "image-name": "glyph.png", name: "glyph", glass: false,
        ...(scale ? { position: { scale, "translation-in-points": [0, 0] } } : {}),
      };
      icon.groups = [
        {
          hidden: false, "blend-mode": "normal", specular: false,
          translucency: { enabled: false, value: 0 },
          layers: twinLayers(baseLayer, !!baked),
        },
      ];
      writeFileSync(
        join(bdir, "icon.json"),
        JSON.stringify(icon, null, 2) + "\n"
      );
      const afterR = join(work, `${b.slug}-after.png`);
      ictoolRender(bdir, afterR, 256);
      const rmse = await centralRmse(beforeR, afterR);
      if (rmse > 3) {
        rmSync(bdir, { recursive: true, force: true });
        cpSync(backup, bdir, { recursive: true });
        console.log(`revert ${b.slug}: light drifted (rmse ${rmse.toFixed(2)})`);
        continue;
      }
      ictoolRender(bdir, join(work, `${b.slug}-dark.png`), 256, "Dark");
      pairs.push(b.slug);
      console.log(
        `ok ${b.slug} (refresh, ${baked ? "tinted twin" : "no twin"}, light rmse ${rmse.toFixed(2)})`
      );
      continue;
    }

    const lightPng = join(assets, "light.png");
    const { data, info } = await sharp(lightPng)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const keyed = keyBackground(data, info.width, info.height, TOL);
    if (!keyed) {
      console.log(`skip ${b.slug}: non-uniform background`);
      continue;
    }
    // Bake the dark twin (raster layers never auto-tint — see header).
    // A dark glyph that gets no tintable twin would ride the dark
    // canvas near-invisibly (Podyssey's illustrated boat): skip whole.
    const baked = bakeDarkGlyph(
      keyed.glyph, info.width, info.height, keyed.bgTop, keyed.bgBottom,
      allowDarkGlyph.has(b.slug)
    );
    if (!baked && glyphLuma(keyed.glyph) < 90) {
      console.log(`skip ${b.slug}: dark glyph with no tintable twin`);
      continue;
    }
    const before = join(work, `${b.slug}-before.png`);
    ictoolRender(bdir, before, 256);

    rmSync(backup, { recursive: true, force: true });
    cpSync(bdir, backup, { recursive: true });
    await sharp(keyed.glyph, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toFile(join(assets, "glyph.png"));
    if (baked)
      await sharp(baked, {
        raw: { width: info.width, height: info.height, channels: 4 },
      })
        .png()
        .toFile(join(assets, "glyph-dark.png"));
    rmSync(lightPng);
    const col = (c) => `srgb:${c.map((v) => (v / 255).toFixed(5)).join(",")},1.00000`;
    const fillValue = {
      "linear-gradient": [col(keyed.bgTop), col(keyed.bgBottom)],
      orientation: { start: { x: 0.5, y: 0 }, stop: { x: 0.5, y: 1 } },
    };
    const scale = info.width === 1024 ? undefined : 1024 / info.width;
    const baseLayer = {
      "image-name": "glyph.png", name: "glyph", glass: false,
      ...(scale ? { position: { scale, "translation-in-points": [0, 0] } } : {}),
    };
    const layers = twinLayers(baseLayer, !!baked);
    writeFileSync(
      join(bdir, "icon.json"),
      JSON.stringify(
        {
          fill: {
            ...fillValue,
            "fill-specializations": [
              { value: fillValue },
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

    const after = join(work, `${b.slug}-after.png`);
    ictoolRender(bdir, after, 256);
    const rmse = await centralRmse(before, after);
    if (rmse > 3) {
      rmSync(bdir, { recursive: true, force: true });
      cpSync(backup, bdir, { recursive: true });
      console.log(`revert ${b.slug}: light drifted (rmse ${rmse.toFixed(2)})`);
      continue;
    }
    ictoolRender(bdir, join(work, `${b.slug}-dark.png`), 256, "Dark");
    b.platformMeta.liquidGlass.bundles.find((x) => x.slug === b.slug).source =
      b.source === "appstore-artwork" ? "appstore-artwork-split" : "catalog-artwork-split";
    writeFileSync(
      join(b.platformDir, "meta.json"),
      JSON.stringify(b.platformMeta, null, 2) + "\n"
    );
    pairs.push(b.slug);
    console.log(
      `ok ${b.slug} (light rmse ${rmse.toFixed(2)}, bg rgb(${keyed.bgTop})->rgb(${keyed.bgBottom})${baked ? ", tinted twin" : ""})`
    );
  } catch (e) {
    // Restore ONLY if we actually took a backup (i.e. we mutated the
    // bundle); otherwise the bundle was never touched — leave it alone.
    if (_exists(backup)) {
      try {
        rmSync(bdir, { recursive: true, force: true });
        cpSync(backup, bdir, { recursive: true });
      } catch {}
    }
    console.error(`FAIL ${b.slug}: ${String(e.message).slice(0, 100)}`);
  }
}

if (pairs.length) {
  const cell = 256, cols = 6;
  const cells = pairs.flatMap((id) => [
    join(work, `${id}-after.png`),
    join(work, `${id}-dark.png`),
  ]);
  await sharp({
    create: {
      width: cols * cell,
      height: Math.ceil(cells.length / cols) * cell,
      channels: 4,
      background: { r: 128, g: 128, b: 128, alpha: 1 },
    },
  })
    .composite(
      cells.map((input, i) => ({
        input, left: (i % cols) * cell, top: Math.floor(i / cols) * cell,
      }))
    )
    .png()
    .toFile("/tmp/raster-split-review.png");
  console.log(`\nreview pairs: /tmp/raster-split-review.png`);
  console.log(pairs.join(", "));
}
console.log(`\n${pairs.length} split`);
