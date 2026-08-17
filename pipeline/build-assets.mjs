// Render every liquid glass bundle through Apple's ictool (Default + Dark)
// and emit the sized asset set into packages/refraction. macOS + Icon
// Composer only. Sets per-bundle `hasDark` back into platforms/*/meta.json.
//
// Usage: node pipeline/build-assets.mjs [--only <bundle-slug>]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { readBundles, root } from "./lib.mjs";

const ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool";
const OUT = join(root, "packages/refraction/assets");
const SIZES = [32, 64, 128, 256, 512];
// AVIF q60 measures both smaller AND lower-error than WebP q92 at icon sizes
// (64px, 9-master sample: RMSE 2.7 @ 1533B vs 5.7 @ 1784B — WebP's chroma
// subsampling visibly hurts the gradient squircles). WebP stays as the
// no-AVIF fallback at unchanged quality.
const FORMATS = [
  ["avif", (s) => s.avif({ quality: 60 })],
  ["webp", (s) => s.webp({ quality: 92 })],
];

const only = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : null;

mkdirSync(OUT, { recursive: true });

function render(bundle, out, rendition) {
  execFileSync(ICTOOL, [
    bundle,
    "--export-image",
    "--output-file", out,
    "--platform", "macOS",
    "--rendition", rendition,
    "--width", "1024",
    "--height", "1024",
    "--scale", "1",
  ]);
}

async function pixelsEqual(a, b) {
  const [pa, pb] = await Promise.all(
    [a, b].map((f) => sharp(f).raw().toBuffer())
  );
  return pa.equals(pb);
}

async function emitSizes(master, prefix) {
  for (const size of SIZES) {
    const base = sharp(master).resize(size, size);
    for (const [ext, encode] of FORMATS)
      await encode(base.clone()).toFile(join(OUT, `${prefix}-${size}.${ext}`));
  }
}

// ictool emits 16-bit/channel RGBA; 8-bit is indistinguishable for delivery
// and ~5-10x smaller (the 1024 masters were 98% of the tarball).
async function squashMaster(file) {
  const buf = await sharp(file)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  writeFileSync(file, buf);
}

const bundles = readBundles();
const hasDarkBySlug = new Map();

for (const b of bundles) {
  if (only && b.slug !== only) continue;
  if (!existsSync(b.bundlePath)) {
    console.error(`SKIP ${b.slug}: bundle not found at ${b.bundlePath}`);
    continue;
  }
  const light = join(OUT, `${b.slug}.png`);
  const dark = join(OUT, `${b.slug}-dark.png`);
  render(b.bundlePath, light, "Default");
  render(b.bundlePath, dark, "Dark");

  const hasDark = !(await pixelsEqual(light, dark));
  if (!hasDark) rmSync(dark);
  hasDarkBySlug.set(b.slug, hasDark);

  await emitSizes(light, b.slug);
  await squashMaster(light);
  if (hasDark) {
    await emitSizes(dark, `${b.slug}-dark`);
    await squashMaster(dark);
  }
  console.log(`ok ${b.slug}${hasDark ? " (+dark)" : ""}`);
}

// Write hasDark back into each platform's meta.json
const byPlatform = new Map();
for (const b of bundles) byPlatform.set(b.platformDir, b.platformMeta);
for (const [dir, meta] of byPlatform) {
  let changed = false;
  for (const b of meta.liquidGlass?.bundles ?? []) {
    const measured = hasDarkBySlug.get(b.slug);
    if (measured !== undefined && b.hasDark !== measured) {
      b.hasDark = measured;
      changed = true;
    }
  }
  if (changed)
    writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
}

// Manifest for the assets package
const manifest = {
  sizes: SIZES,
  formats: FORMATS.map(([ext]) => ext),
  bundles: bundles.map((b) => ({
    slug: b.slug,
    title: b.title,
    platform: b.platformId,
    hasDark: hasDarkBySlug.get(b.slug) ?? b.hasDark ?? false,
  })),
};
writeFileSync(
  join(root, "packages/refraction/manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n"
);
console.log("done");
