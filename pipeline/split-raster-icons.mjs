// Unlock Apple's automatic dark derivation for flat RASTER bundles
// (appstore/catalog artwork) whose art has a uniform background:
// border-connected flood fill separates background from glyph, the
// background color becomes the bundle's canvas fill, and the glyph
// ships as a transparent-background layer. ictool's Dark rendition
// then auto-derives exactly what iOS shows on-device for these apps.
//
// Interior regions matching the background color (YouTube's white play
// triangle) are NOT border-connected and are preserved.
//
// Safety guard: the rebuilt bundle's Default rendition must match the
// original bundle's render (central RMSE <= 3) or the change is
// reverted. Dark pairs land in /tmp/raster-split-review.png.
//
// Usage: node pipeline/split-raster-icons.mjs [--only <slug>] [--tol 12]

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
  // per-row background reference from left/right border columns
  const rowBg = new Array(h);
  for (let y = 0; y < h; y++) {
    let rs = 0, gs = 0, bs = 0, n = 0;
    for (const x of [0, 1, 2, w - 3, w - 2, w - 1]) {
      const i = px(x, y);
      rs += data[i]; gs += data[i + 1]; bs += data[i + 2]; n++;
    }
    rowBg[y] = [rs / n, gs / n, bs / n];
  }
  // left vs right must agree per row (else the bg isn't a vertical field)
  for (let y = 0; y < h; y += 7) {
    const l = px(0, y), r = px(w - 1, y);
    const d = Math.hypot(
      data[l] - data[r], data[l + 1] - data[r + 1], data[l + 2] - data[r + 2]
    );
    if (d > tol * 1.5) return null;
  }
  // smoothness: adjacent rows must vary gently (gradient, not texture)
  for (let y = 1; y < h; y++) {
    const d = Math.hypot(
      rowBg[y][0] - rowBg[y - 1][0],
      rowBg[y][1] - rowBg[y - 1][1],
      rowBg[y][2] - rowBg[y - 1][2]
    );
    if (d > 3) return null;
  }
  // top/bottom rows must be horizontally uniform against their rowBg
  for (const y of [0, h - 1])
    for (let x = 0; x < w; x += 5) {
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

import { existsSync as _exists, readdirSync as _readdir } from "node:fs";
const targets = readBundles().filter((b) => {
  if (only && b.slug !== only) return false;
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
    // Dark-glyph handling, mirroring the SVG split's learned rules:
    // ictool's derivation leaves dark glyphs near-invisible on the dark
    // canvas (Amazon's black wordmark), while iOS on-device LIGHTENS
    // monochrome dark glyphs. So: monochrome-dark glyphs get a
    // white-recolored dark twin; dark-but-colorful glyphs (Podyssey's
    // illustrated boat) are skipped entirely.
    let whitenDark = false;
    {
      // Whitening flattens EVERY glyph pixel to white, so it is only
      // safe for strictly-binary monochrome marks: require that almost
      // no visible pixel is saturated (mean saturation can hide small
      // colorful details — Podyssey's tan boat cutouts).
      let n = 0, luma = 0, satFrac = 0;
      for (let i = 0; i < keyed.glyph.length; i += 4)
        if (keyed.glyph[i + 3] > 25) {
          n++;
          const [r, g, bb] = [keyed.glyph[i], keyed.glyph[i + 1], keyed.glyph[i + 2]];
          luma += 0.2126 * r + 0.7152 * g + 0.0722 * bb;
          const mx = Math.max(r, g, bb);
          if (mx > 0 && (mx - Math.min(r, g, bb)) / mx > 0.25) satFrac++;
        }
      if (n && luma / n < 90) {
        if (satFrac / n < 0.03 || allowDarkGlyph.has(b.slug)) {
          whitenDark = true;
        } else {
          console.log(
            `skip ${b.slug}: colored dark glyph (luma ${(luma / n).toFixed(0)}, sat-frac ${(satFrac / n).toFixed(2)})`
          );
          continue;
        }
      }
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
    if (whitenDark) {
      const wg = Buffer.from(keyed.glyph);
      for (let i = 0; i < wg.length; i += 4) {
        wg[i] = 255; wg[i + 1] = 255; wg[i + 2] = 255;
      }
      await sharp(wg, {
        raw: { width: info.width, height: info.height, channels: 4 },
      })
        .png()
        .toFile(join(assets, "glyph-dark.png"));
    }
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
    // Dim backgrounds tint white glyphs into near-invisibility under
    // Apple's dark derivation (Apollo's navy). Pin the glyph with a
    // dark-only twin layer — explicit dark layers escape the tinting.
    const bgLuma =
      0.2126 * keyed.bgMid[0] + 0.7152 * keyed.bgMid[1] + 0.0722 * keyed.bgMid[2];
    const darkTwin = whitenDark
      ? { ...baseLayer, "image-name": "glyph-dark.png", name: "glyph-dark" }
      : bgLuma < 80
        ? { ...baseLayer, name: "glyph-dark" }
        : null;
    const layers = darkTwin
      ? [
          {
            ...darkTwin,
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
      `ok ${b.slug} (light rmse ${rmse.toFixed(2)}, bg rgb(${keyed.bgTop})->rgb(${keyed.bgBottom}))`
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
