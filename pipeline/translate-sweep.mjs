// Validate the zero-measurement icon.json -> recipe translator
// (packages/engine/tools/translate_icon.py) against ictool ground truth
// over every FLAT bundle (no glass:true layers, all-SVG art).
//
// Sources: the catalog (platforms/*) and optionally a local corpus of
// first-party bundles (--corpus <dir>). Reports visible-RGB RMSE per
// bundle; this script REPORTS only, nothing is adopted.
//
//   node pipeline/translate-sweep.mjs [--corpus <dir>] [--only <slug>]
//
// macOS + Icon Composer; PYTHON env for a venv with numpy.

import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readBundles, root } from "./lib.mjs";

const GL = resolve(root, "packages/engine");
const ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool";
const PY = process.env.PYTHON ?? "python3";
const WORK = "/tmp/translate-sweep";
const REPORT = join(WORK, "report.json");

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const corpus = args.includes("--corpus")
  ? args[args.indexOf("--corpus") + 1]
  : null;

mkdirSync(join(WORK, "out"), { recursive: true });
execSync(`cd "${GL}" && "${PY}" tools/build_engine.py --outdir "${WORK}/out"`, {
  stdio: "ignore",
});

const targets = readBundles().map((b) => ({
  slug: b.slug,
  bundle: b.bundlePath,
  bucket: "catalog",
}));
if (corpus && existsSync(corpus)) {
  for (const d of readdirSync(corpus)) {
    if (!d.endsWith(".icon")) continue;
    targets.push({
      slug: "fp-" + d.replace(/\.icon$/, "").toLowerCase().replace(/[^a-z0-9]+/g, ""),
      bundle: join(corpus, d),
      bucket: "firstParty",
    });
  }
}

const report = [];
for (const t of targets) {
  if (only && t.slug !== only) continue;
  let translated;
  try {
    translated = execSync(
      `cd "${GL}" && "${PY}" tools/translate_icon.py --bundle "${t.bundle}" --id "${t.slug}" --outdir "${WORK}/out" 2>&1`
    ).toString();
  } catch (e) {
    const msg = String(e.stdout || e.message);
    const skip = msg.match(/NOT FLAT[^\n]*|NOT SVG[^\n]*/)?.[0] ?? msg.slice(0, 80);
    report.push({ slug: t.slug, bucket: t.bucket, skip });
    continue;
  }
  const warns = (translated.match(/^ {2}! .*$/gm) ?? []).map((w) => w.slice(4));
  try {
    const gt = join(WORK, `${t.slug}-gt.png`);
    execFileSync(ICTOOL, [
      t.bundle, "--export-image", "--output-file", gt, "--platform", "macOS",
      "--rendition", "Default", "--width", "1024", "--height", "1024", "--scale", "1",
    ]);
    execSync(
      `cd "${GL}" && node tools/render.mjs "${WORK}/out" "${WORK}/out/recipes/${t.slug}.mjs" "${WORK}/${t.slug}.png" --p3`,
      { stdio: "pipe" }
    );
    const out = execSync(
      `cd "${GL}" && "${PY}" tools/score.py "${WORK}/${t.slug}.png" "${gt}"`,
      { stdio: "pipe" }
    ).toString();
    const rmse = Number(out.match(/RMSE:\s*([\d.]+)/)?.[1]);
    report.push({ slug: t.slug, bucket: t.bucket, rmse, warns });
    console.log(`ok   ${t.slug}: RMSE ${rmse}${warns.length ? ` (${warns.length} warn)` : ""}`);
  } catch (e) {
    report.push({ slug: t.slug, bucket: t.bucket, error: String(e.message).slice(0, 120), warns });
    console.error(`FAIL ${t.slug}: ${String(e.message).slice(0, 120)}`);
  }
  writeFileSync(REPORT, JSON.stringify(report, null, 2));
}

writeFileSync(REPORT, JSON.stringify(report, null, 2));
const scored = report.filter((r) => r.rmse != null).sort((a, b) => a.rmse - b.rmse);
const skipped = report.filter((r) => r.skip);
console.log(`\n${scored.length} scored, ${skipped.length} skipped (not flat / not SVG), ${report.length - scored.length - skipped.length} failed`);
for (const r of scored)
  console.log(`  ${r.rmse.toFixed(2).padStart(7)}  ${r.bucket === "firstParty" ? "*" : " "} ${r.slug}`);
console.log(`\nreport: ${REPORT}  (* = first-party)`);
