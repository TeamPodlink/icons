// Empirical survey of the .icon format's icon.json field space.
//
// Walks every icon.json in platforms/*/<Name>.icon plus (optionally) a
// local research corpus of first-party bundles extracted from Apple's
// apps (decant). Emits aggregate facts only — key paths, types, observed
// values, ranges, usage counts — never artwork. The output is COMMITTED
// (apps/web/lib/icon-spec-survey.json) because the first-party corpus
// exists only on a maintainer Mac; regenerate with:
//
//   node pipeline/survey-icon-spec.mjs [--corpus <dir-of-.icon-bundles>]
//
// Sources are bucketed: "firstParty" (Apple's own icons) vs "catalog"
// (this repo's podcast-platform bundles, various authors + decants).

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readBundles, root } from "./lib.mjs";

const args = process.argv.slice(2);
const corpusDir = args.includes("--corpus")
  ? args[args.indexOf("--corpus") + 1]
  : null;

const MAX_DISTINCT = 48; // cap tracked distinct values per key path

const files = [];
for (const b of readBundles()) {
  const p = join(b.bundlePath, "icon.json");
  if (existsSync(p)) files.push({ path: p, bucket: "catalog", name: b.slug });
}
if (corpusDir && existsSync(corpusDir)) {
  for (const d of readdirSync(corpusDir)) {
    if (!d.endsWith(".icon")) continue;
    const p = join(corpusDir, d, "icon.json");
    if (existsSync(p))
      files.push({ path: p, bucket: "firstParty", name: d.replace(/\.icon$/, "") });
  }
}

// keyPath -> { count: {bucket: Set<fileIdx>}, types: Set, values: Map,
//              overflow: bool, num: {min,max}, arrayLen: {min,max} }
const keys = new Map();

function slot(kp) {
  let s = keys.get(kp);
  if (!s) {
    s = {
      files: { firstParty: new Set(), catalog: new Set() },
      types: new Set(),
      values: new Map(),
      overflow: false,
      num: null,
      arrayLen: null,
    };
    keys.set(kp, s);
  }
  return s;
}

function record(kp, v, fileIdx, bucket) {
  const s = slot(kp);
  s.files[bucket].add(fileIdx);
  const t = Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
  s.types.add(t);
  if (t === "string" || t === "boolean") {
    const key = String(v);
    if (s.values.size < MAX_DISTINCT || s.values.has(key))
      s.values.set(key, (s.values.get(key) ?? 0) + 1);
    else s.overflow = true;
  } else if (t === "number") {
    if (!s.num) s.num = { min: v, max: v };
    s.num.min = Math.min(s.num.min, v);
    s.num.max = Math.max(s.num.max, v);
  } else if (t === "array") {
    if (!s.arrayLen) s.arrayLen = { min: v.length, max: v.length };
    s.arrayLen.min = Math.min(s.arrayLen.min, v.length);
    s.arrayLen.max = Math.max(s.arrayLen.max, v.length);
  }
}

function walk(v, kp, fileIdx, bucket) {
  record(kp, v, fileIdx, bucket);
  if (Array.isArray(v)) {
    for (const item of v) walk(item, `${kp}[]`, fileIdx, bucket);
  } else if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v))
      walk(val, kp ? `${kp}.${k}` : k, fileIdx, bucket);
  }
}

const fileStats = [];
files.forEach((f, i) => {
  let doc;
  try {
    doc = JSON.parse(readFileSync(f.path, "utf8"));
  } catch (e) {
    console.error(`skip ${f.path}: ${e.message}`);
    return;
  }
  walk(doc, "", i, f.bucket);
  const groups = doc.groups ?? [];
  fileStats.push({
    bucket: f.bucket,
    groups: groups.length,
    layers: groups.reduce((n, g) => n + (g.layers?.length ?? 0), 0),
  });
});

const counts = { firstParty: 0, catalog: 0 };
for (const f of fileStats) counts[f.bucket]++;

const out = {
  generated: "survey of icon.json field space — facts only, no artwork",
  sources: {
    firstParty: counts.firstParty,
    catalog: counts.catalog,
  },
  keys: Object.fromEntries(
    [...keys.entries()]
      .filter(([kp]) => kp !== "")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([kp, s]) => [
        kp,
        {
          firstParty: s.files.firstParty.size,
          catalog: s.files.catalog.size,
          types: [...s.types].sort(),
          ...(s.values.size
            ? {
                values: Object.fromEntries(
                  [...s.values.entries()].sort((a, b) => b[1] - a[1])
                ),
                ...(s.overflow ? { moreValues: true } : {}),
              }
            : {}),
          ...(s.num ? { range: [s.num.min, s.num.max] } : {}),
          ...(s.arrayLen ? { arrayLen: [s.arrayLen.min, s.arrayLen.max] } : {}),
        },
      ])
  ),
  perFile: {
    groups: {
      min: Math.min(...fileStats.map((f) => f.groups)),
      max: Math.max(...fileStats.map((f) => f.groups)),
    },
    layers: {
      min: Math.min(...fileStats.map((f) => f.layers)),
      max: Math.max(...fileStats.map((f) => f.layers)),
    },
  },
};

const outPath = join(root, "apps/web/lib/icon-spec-survey.json");
writeFileSync(outPath, JSON.stringify(out, null, 1) + "\n");
console.log(
  `surveyed ${fileStats.length} icon.json files (${counts.firstParty} first-party, ${counts.catalog} catalog); ${keys.size - 1} key paths -> ${outPath}`
);
