// Render every liquid glass bundle through Apple's ictool (Default + Dark)
// and emit the sized asset set into packages/refraction. macOS + Icon
// Composer only. Sets per-bundle `hasDark` back into platforms/*/meta.json.
//
// Usage: node pipeline/build-assets.mjs [--only <bundle-slug>] [--shape circle|squircle]
// Default: both shapes. Circle uses the native watchOS renderer.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import sharp from "sharp";
import { readBundles, root } from "./lib.mjs";
import { syncCircleSafeArea } from "./circle-layout.mjs";

const ICTOOL = [
  "/Applications/Icon Composer.app/Contents/Executables/ictool",
  "/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool",
].find(existsSync);
if (!ICTOOL) throw new Error("Install Icon Composer or Xcode to render icon bundles");
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

const shapeArg = process.argv.includes("--shape")
  ? process.argv[process.argv.indexOf("--shape") + 1]
  : null;
if (process.argv.includes("--shape") && !["squircle", "circle"].includes(shapeArg))
  throw new Error("--shape must be squircle or circle");
const shapes = shapeArg ? [shapeArg] : ["squircle", "circle"];
mkdirSync(OUT, { recursive: true });

// ictool silently renders a squircle for --platform watchOS unless the
// document declares circle support. Layout overrides live in the source
// bundle; safe-area policies refresh their native watchOS specialization.
async function circleBundle(bundle) {
  const fit = await syncCircleSafeArea(bundle);
  if (fit) console.log(`safe area ${basename(bundle)}: radius ${fit.radius.toFixed(2)} → ${Math.min(fit.radius, fit.safeRadius).toFixed(2)}pt, scale ${fit.scale.toFixed(6)}`);
  const temp = mkdtempSync(join(tmpdir(), "refraction-watchos-"));
  try {
    const path = join(temp, basename(bundle));
    cpSync(bundle, path, { recursive: true });
    const json = join(path, "icon.json");
    const doc = JSON.parse(readFileSync(json, "utf8"));
    doc["supported-platforms"] = {
      ...doc["supported-platforms"],
      circles: ["watchOS"],
    };
    writeFileSync(json, JSON.stringify(doc));
    return { path, cleanup: () => rmSync(temp, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}

function render(bundle, out, rendition, shape) {
  execFileSync(ICTOOL, [
    bundle,
    "--export-image",
    "--output-file", out,
    "--platform", shape === "circle" ? "watchOS" : "macOS",
    "--rendition", rendition,
    "--width", "1024",
    "--height", "1024",
    "--scale", "1",
    // Keep delivery on the generation used for the refreshed store-material review.
    "--design-generation", "27",
  ]);
}

async function assertCircle(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // (10%, 10%) is inside an iOS squircle but outside the watchOS circle.
  for (const [x, y] of [[.1,.1], [.9,.1], [.1,.9], [.9,.9]]) {
    const alpha = data[(Math.floor(y * info.height) * info.width + Math.floor(x * info.width)) * info.channels + info.channels - 1];
    if (alpha !== 0) throw new Error(`Expected native circle transparency: ${file}`);
  }
}

async function pixelsEqual(a, b) {
  const [pa, pb] = await Promise.all(
    [a, b].map((f) => sharp(f).raw().toBuffer())
  );
  return pa.equals(pb);
}

// ictool masters are Display-P3-tagged, but their content is sRGB-gamut
// color expressed in P3 coordinates (ictool composites in sRGB with
// colorimetric clipping, then encodes as P3 — measured by
// packages/engine/tools/probe-gamut.mjs). sharp neither converts nor keeps
// the profile by default, so shipped pixels were P3 numbers that browsers
// read as sRGB — desaturating every icon (up to ~110/255 per channel).
// Converting P3 -> sRGB through the embedded profile is lossless for
// in-gamut content and beats tagging every tiny file with the 536B profile.
const toSrgb = (s) => s.withIccProfile("srgb", { attach: false });

async function emitSizes(master, prefix) {
  for (const size of SIZES) {
    const base = toSrgb(sharp(master).resize(size, size));
    for (const [ext, encode] of FORMATS)
      await encode(base.clone()).toFile(join(OUT, `${prefix}-${size}.${ext}`));
  }
}

// ictool emits 16-bit/channel RGBA; 8-bit is indistinguishable for delivery
// and ~5-10x smaller (the 1024 masters were 98% of the tarball).
async function squashMaster(file) {
  const buf = await toSrgb(sharp(file))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  writeFileSync(file, buf);
}

const bundles = readBundles();
const hasDarkBySlug = new Map();
const hasCircleDarkBySlug = new Map();

for (const b of bundles) {
  if (only && b.slug !== only) continue;
  if (!existsSync(b.bundlePath)) {
    console.error(`SKIP ${b.slug}: bundle not found at ${b.bundlePath}`);
    continue;
  }
  for (const shape of shapes) {
    const prefix = `${b.slug}${shape === "circle" ? "-circle" : ""}`;
    const light = join(OUT, `${prefix}.png`);
    const dark = join(OUT, `${prefix}-dark.png`);
    const staged = shape === "circle" ? await circleBundle(b.bundlePath) : null;
    try {
      render(staged?.path ?? b.bundlePath, light, "Default", shape);
      render(staged?.path ?? b.bundlePath, dark, "Dark", shape);
      if (shape === "circle") {
        await assertCircle(light);
        await assertCircle(dark);
      }
    } finally {
      staged?.cleanup();
    }

    const hasDark = !(await pixelsEqual(light, dark));
    (shape === "circle" ? hasCircleDarkBySlug : hasDarkBySlug).set(b.slug, hasDark);
    if (!hasDark) {
      rmSync(dark);
      for (const size of SIZES)
        for (const [ext] of FORMATS)
          rmSync(join(OUT, `${prefix}-dark-${size}.${ext}`), { force: true });
    }
    await emitSizes(light, prefix);
    await squashMaster(light);
    if (hasDark) {
      await emitSizes(dark, `${prefix}-dark`);
      await squashMaster(dark);
    }
    console.log(`ok ${prefix}${hasDark ? " (+dark)" : ""}`);
  }
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
    if (b.hasDark && b.darkStatus !== undefined) {
      delete b.darkStatus;
      changed = true;
    }
    const circleDark = hasCircleDarkBySlug.get(b.slug);
    if (circleDark !== undefined) {
      // Store an override only when watchOS differs from the squircle.
      if (circleDark === b.hasDark) {
        if (b.hasCircleDark !== undefined) { delete b.hasCircleDark; changed = true; }
      } else if (b.hasCircleDark !== circleDark) {
        b.hasCircleDark = circleDark;
        changed = true;
      }
    }
  }
  if (changed)
    writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
}

// Manifest for the assets package
const manifest = {
  shapes: ["squircle", "circle"],
  sizes: SIZES,
  formats: FORMATS.map(([ext]) => ext),
  bundles: bundles.map((b) => ({
    slug: b.slug,
    title: b.title,
    platform: b.platformId,
    hasDark: hasDarkBySlug.get(b.slug) ?? b.hasDark ?? false,
    hasCircleDark: hasCircleDarkBySlug.get(b.slug) ?? b.hasCircleDark ?? b.hasDark ?? false,
  })),
};
writeFileSync(
  join(root, "packages/refraction/manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n"
);
console.log("done");
