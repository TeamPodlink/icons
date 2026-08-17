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
const SIZES = [64, 128, 256];

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
    await sharp(master)
      .resize(size, size)
      .webp({ quality: 92 })
      .toFile(join(OUT, `${prefix}-${size}.webp`));
  }
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
  if (hasDark) await emitSizes(dark, `${b.slug}-dark`);
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
