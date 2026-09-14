// Does each `color(display-p3 ...)` a flat icon declares actually match the
// colour its bundle ships — or is it an sRGB value written in the wrong
// function?
//
// THE BUG. `display-p3 .6353 .2196 1` looks like a wide-gamut purple. Read
// its triple as sRGB it is (162,56,255) — Deezer's exact brand purple,
// transcribed into the wrong colour function. Chrome dutifully converts P3
// -> sRGB and paints (176,45,255). The icon looks approximately right, so
// nothing catches it. Found ten times by hand before this existed, and
// 164 of our 168 display-p3 declarations carry the signature: every
// component an exact n/255, which a real wide-gamut colour would not do.
//
// WHY THE FIRST DETECTOR MISSED FOUR. It compared icon.svg against the
// bundle's declared `"srgb:"` fills, so any bundle whose plate is a RASTER
// had nothing to compare against — siriusxm, hark, deezer and metacast all
// slipped through and were caught one at a time by eye. This one asks the
// rendered master instead, so how the bundle is built does not matter.
//
// METHOD, per declaration:
//   A = what Chrome actually paints for it (measured from a rendered
//       swatch, not a colour-space matrix reimplemented here)
//   B = its triple read as sRGB
// then count master pixels near each. B present and A absent is the bug,
// and B is printed as the hex to declare. A present means the declaration
// is consistent with what ships, wide-gamut or not. Neither present means
// the two facets draw different artwork — that is audit-facet-drift's
// business, not this instrument's, and it says so rather than guessing.
//
// Only DECLARED colours are examined. An earlier draft compared whole
// rendered palettes and drowned in gradient bands: a 40-stop gradient
// yields 40 "significant" colours, none of them declared, and nearest-
// colour pairing then matched unrelated regions across the two facets.
//
// CIRCULARITY. A `flat-svg*` bundle is BUILT from icon.svg, so its master
// cannot arbitrate its own source; those are skipped by name.
//
// --write rewrites each confirmed bug in place as the hex it should have
// been. It touches ONLY declarations the master positively contradicts;
// "indeterminate" and "consistent" ones are never rewritten.
//
//   node pipeline/audit-declared-colors.mjs [--only <slug>] [--tol 4] [--write]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { readPlatforms, root } from "./lib.mjs";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
const only = flag("--only");
const write = args.includes("--write");
const TOL = Number(flag("--tol") ?? 4);
const MIN_SHARE = 0.003;
const P3 = /color\(display-p3\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g;
const work = mkdtempSync(join(tmpdir(), "declcol-"));
const hex = (v) => "#" + v.map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();

// --- collect every distinct declaration in the catalogue -------------------
const decls = new Map();                       // "r g b" -> {v, users:Set}
const targets = [];
for (const { id, dir, meta } of readPlatforms()) {
  if (only && id !== only) continue;
  const p = join(dir, "icon.svg");
  const b = meta.liquidGlass?.bundles?.[0];
  if (!existsSync(p) || !b) continue;
  const svg = readFileSync(p, "utf8");
  const hits = [...svg.matchAll(P3)];
  if (!hits.length) continue;
  const master = join(root, "packages/refraction/assets", `${b.slug}.png`);
  const circular = /^flat-svg/.test(b.source ?? "");
  const mine = hits.map((h) => h.slice(1, 4).map(Number));
  for (const v of mine) {
    const k = v.join(" ");
    if (!decls.has(k)) decls.set(k, { v, users: new Set() });
    decls.get(k).users.add(id);
  }
  targets.push({ id, master, circular, source: b.source, decls: mine });
}

// --- ask Chrome what each declaration actually paints ----------------------
const list = [...decls.values()];
const swatch = join(work, "sw.png");
{
  const d = join(work, "s"); mkdirSync(d, { recursive: true });
  const W = list.length * 10;
  const rects = list.map((e, i) =>
    `<rect x="${i * 10}" y="0" width="10" height="10" fill="color(display-p3 ${e.v.join(" ")})"/>`).join("");
  writeFileSync(join(d, "icon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="10" viewBox="0 0 ${W} 10">${rects}</svg>`);
  writeFileSync(join(d, "w.html"),
    `<!doctype html><style>html,body{margin:0;padding:0}img{display:block}</style><img src="icon.svg" width="${W}" height="10">`);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", `--screenshot=${swatch}`,
    `--window-size=${W},10`, "--default-background-color=00000000", join(d, "w.html")], { stdio: "ignore" });
  const { data, info } = await sharp(swatch).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  list.forEach((e, i) => {
    const x = i * 10 + 5, y = 5, o = (y * info.width + x) * 4;
    e.rendered = [data[o], data[o + 1], data[o + 2]];
    e.asSrgb = e.v.map((x) => Math.round(x * 255));
  });
}

// --- count master pixels near a colour -------------------------------------
const masterCache = new Map();
async function near(masterPath, rgb) {
  if (!masterCache.has(masterPath)) {
    const { data } = await sharp(masterPath).resize(512, 512).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true });
    masterCache.set(masterPath, data);
  }
  const data = masterCache.get(masterPath);
  let hit = 0, opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 250) continue;
    opaque++;
    if (Math.hypot(data[i] - rgb[0], data[i + 1] - rgb[1], data[i + 2] - rgb[2]) <= TOL) hit++;
  }
  return hit / Math.max(opaque, 1);
}

const bugs = [], ok = [], unknown = [], skipped = [];
for (const t of targets) {
  if (!existsSync(t.master)) { skipped.push(`${t.id} (no master)`); continue; }
  if (t.circular) { skipped.push(`${t.id} (source "${t.source}" is built FROM icon.svg)`); continue; }
  for (const v of t.decls) {
    const e = decls.get(v.join(" "));
    const [sa, sb] = [await near(t.master, e.rendered), await near(t.master, e.asSrgb)];
    const row = { id: t.id, v, rendered: e.rendered, asSrgb: e.asSrgb, sa, sb };
    if (sb >= MIN_SHARE && sa < MIN_SHARE) bugs.push(row);
    else if (sa >= MIN_SHARE) ok.push(row);
    else unknown.push(row);
  }
}
rmSync(work, { recursive: true, force: true });

const pct = (x) => (x * 100).toFixed(1).padStart(5) + "%";
console.log(`SAME-TRIPLE BUGS — the master shows the sRGB reading, not what Chrome paints:\n`);
console.log(`  slug            declared                        paints   in master   should be   in master`);
for (const r of bugs.sort((a, b) => b.sb - a.sb))
  console.log(`  ${r.id.padEnd(15)} p3(${r.v.join(" ")})`.padEnd(50) +
    ` ${hex(r.rendered)} ${pct(r.sa)}   ${hex(r.asSrgb)} ${pct(r.sb)}`);
console.log(`\n${bugs.length} bug(s) across ${new Set(bugs.map(b=>b.id)).size} platform(s); ` +
  `${ok.length} declaration(s) consistent with the master; ${unknown.length} indeterminate ` +
  `(neither colour present — different artwork, see audit-facet-drift).`);
if (skipped.length) console.log(`\nskipped ${skipped.length} (cannot self-arbitrate):\n  ${skipped.join("\n  ")}`);

if (write && bugs.length) {
  const byPlatform = new Map();
  for (const r of bugs) (byPlatform.get(r.id) ?? byPlatform.set(r.id, []).get(r.id)).push(r);
  let files = 0, edits = 0;
  for (const { id, dir } of readPlatforms()) {
    const rows = byPlatform.get(id);
    if (!rows) continue;
    const p = join(dir, "icon.svg");
    const before = readFileSync(p, "utf8");
    // Rewrite by RE-SCANNING and comparing parsed numbers. Matching the
    // literal text fails: the files write `.8039` where the parsed value
    // prints as `0.8039`.
    let n = 0;
    const after = before.replace(new RegExp(P3.source, "g"), (m, a, b, c) => {
      const v = [a, b, c].map(Number);
      const hit = rows.find((r) => r.v.every((x, i) => x === v[i]));
      if (!hit) return m;
      n++;
      return hex(hit.asSrgb);
    });
    if (!n) { console.log(`  !! ${id}: no declaration rewritten`); continue; }
    writeFileSync(p, after);
    files++; edits += n;
  }
  console.log(`\nwrote ${edits} declaration(s) across ${files} file(s)`);
}
