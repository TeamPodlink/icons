// Run the glass-to-LUT two-phase pipeline (measure -> render -> bake
// lightmap -> score) over Liquid Glass bundles whose layer art is
// entirely SVG — the only kind the procedural engine supports — and
// report visible-RGB RMSE vs Apple's ictool for each.
//
// This script REPORTS; it does not adopt. Adoption (copying recipes
// into packages/engine, setting recipe/rmse in meta.json, updating
// recipeSlugs) is done by --adopt with an explicit threshold, after
// reviewing the report.
//
// Requirements: macOS + Icon Composer; python3 with numpy+Pillow
// (set PYTHON env to a venv). Tools live in packages/engine/tools.
//
// Usage:
//   node pipeline/build-recipes.mjs [--only <slug>]        # measure + report
//   node pipeline/build-recipes.mjs --adopt <maxRmse>      # adopt from last run

import { execFileSync, execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { readBundles, root } from "./lib.mjs";

const GL = resolve(root, "packages/engine");
const ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool";
const PY = process.env.PYTHON ?? "python3";
const WORK = "/tmp/recipe-sweep";
const REPORT = join(WORK, "report.json");

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const adopt = args.includes("--adopt")
  ? Number(args[args.indexOf("--adopt") + 1])
  : null;

function svgOnly(bundlePath) {
  const assets = join(bundlePath, "Assets");
  if (!existsSync(assets)) return false;
  const files = readdirSync(assets).filter((f) => !f.startsWith("."));
  return files.length > 0 && files.every((f) => f.toLowerCase().endsWith(".svg"));
}

const candidates = readBundles().filter(
  (b) => (!only || b.slug === only) && !b.recipe && svgOnly(b.bundlePath)
);

// ------------------------------------------------------------- adopt
if (adopt != null) {
  const report = JSON.parse(readFileSync(REPORT, "utf8"));
  const winners = report.filter((r) => r.rmse != null && r.rmse <= adopt);
  const engineRecipes = join(root, "packages/engine/recipes");
  for (const w of winners) {
    cpSync(join(WORK, `out/recipes/${w.slug}.mjs`), join(engineRecipes, `${w.slug}.mjs`));
  }
  // meta.json: recipe + rmse
  const bySlug = new Map(readBundles().map((b) => [b.slug, b]));
  const touched = new Map();
  for (const w of winners) {
    const b = bySlug.get(w.slug);
    const meta = touched.get(b.platformDir) ?? b.platformMeta;
    for (const bb of meta.liquidGlass.bundles)
      if (bb.slug === w.slug) {
        bb.recipe = true;
        bb.rmse = w.rmse;
      }
    touched.set(b.platformDir, meta);
  }
  for (const [dir, meta] of touched)
    writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  // engine index: regenerate recipeSlugs from the recipes directory
  const slugs = readdirSync(engineRecipes)
    .filter((f) => f.endsWith(".mjs"))
    .map((f) => f.replace(/\.mjs$/, ""))
    .sort();
  const indexPath = join(root, "packages/engine/index.mjs");
  const index = readFileSync(indexPath, "utf8").replace(
    /export const recipeSlugs = \[[^\]]*\];/s,
    `export const recipeSlugs = [\n${slugs.map((s) => `  "${s}",`).join("\n")}\n];`
  );
  writeFileSync(indexPath, index);
  console.log(
    `adopted ${winners.length} recipes (<= ${adopt} RMSE): ${winners
      .map((w) => `${w.slug}(${w.rmse})`)
      .join(", ")}`
  );
  console.log(`recipeSlugs now has ${slugs.length} entries`);
  process.exit(0);
}

// ------------------------------------------------------------ measure
mkdirSync(join(WORK, "out"), { recursive: true });
console.log(`${candidates.length} all-SVG bundles to measure\n`);

// engine build once (into WORK/out; the shipped patched engine in
// packages/engine is untouched — recipes are pure data)
execSync(`cd "${GL}" && "${PY}" tools/build_engine.py --outdir "${WORK}/out"`, {
  stdio: "ignore",
});

const report = [];
for (const b of candidates) {
  const gt = join(WORK, `${b.slug}-gt.png`);
  try {
    execFileSync(ICTOOL, [
      b.bundlePath, "--export-image", "--output-file", gt, "--platform",
      "macOS", "--rendition", "Default", "--width", "1024", "--height",
      "1024", "--scale", "1",
    ]);
    const run = (extra) =>
      execSync(
        `cd "${GL}" && "${PY}" tools/build_recipe.py --bundle "${b.bundlePath}" --gt "${gt}" --id "${b.slug}" --outdir "${WORK}/out" ${extra}`,
        { stdio: "pipe" }
      );
    run("");
    execSync(
      `cd "${GL}" && node tools/render.mjs "${WORK}/out" "${WORK}/out/recipes/${b.slug}.mjs" "${WORK}/${b.slug}-pass1.png"`,
      { stdio: "pipe" }
    );
    run(`--lightmap "${WORK}/${b.slug}-pass1.png"`);
    execSync(
      `cd "${GL}" && node tools/render.mjs "${WORK}/out" "${WORK}/out/recipes/${b.slug}.mjs" "${WORK}/${b.slug}-final.png"`,
      { stdio: "pipe" }
    );
    const out = execSync(
      `cd "${GL}" && "${PY}" tools/score.py "${WORK}/${b.slug}-final.png" "${gt}"`,
      { stdio: "pipe" }
    ).toString();
    const rmse = Number(out.match(/RMSE:\s*([\d.]+)/)?.[1]);
    report.push({ slug: b.slug, rmse });
    console.log(`ok ${b.slug}: RMSE ${rmse}`);
  } catch (e) {
    report.push({ slug: b.slug, rmse: null, error: String(e.message).slice(0, 120) });
    console.error(`FAIL ${b.slug}: ${String(e.message).slice(0, 120)}`);
  }
  writeFileSync(REPORT, JSON.stringify(report, null, 2));
}

console.log(`\nreport: ${REPORT}`);
const scored = report.filter((r) => r.rmse != null).sort((a, b) => a.rmse - b.rmse);
for (const r of scored) console.log(`  ${r.rmse.toFixed(2).padStart(7)}  ${r.slug}`);
console.log(`${scored.length} scored, ${report.length - scored.length} failed`);
