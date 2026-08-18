// Upload the rendered Liquid Glass rasters to Cloudflare R2 under an
// immutable release prefix, and/or produce the GitHub-Release zip for
// self-hosters.
//
//   node pipeline/upload-assets.mjs [--dry-run] [--force-verify] [--zip <out.zip>]
//
// Source: packages/refraction/assets/* + packages/refraction/manifest.json
// (render first with `node pipeline/build-assets.mjs` — macOS only).
// Target: s3://$R2_BUCKET/<version>/<file> where <version> is the version
// in packages/refraction/package.json. Served publicly at
// https://assets.icons.podlink.com/<version>/<file>.
//
// Release prefixes are IMMUTABLE: a prefix that already contains objects
// refuses to upload. Bump the version in packages/refraction/package.json
// for new renders. `--force-verify` re-lists an existing prefix and
// checksum-compares it against the local files (report only, no writes).
//
// Env (S3-compatible R2 credentials — create an R2 API token in the
// Cloudflare dashboard):
//   R2_ACCOUNT_ID          Cloudflare account id
//   R2_ACCESS_KEY_ID       R2 API token access key
//   R2_SECRET_ACCESS_KEY   R2 API token secret
//   R2_BUCKET              bucket name (default "refraction-assets")
//
// `--dry-run` needs no credentials: it enumerates what would upload.
// `--zip <out.zip>` additionally writes assets-<version>.zip content
// (flat: <slug>*.png/avif/webp + manifest.json) for attaching to the
// GitHub Release, so self-hosters never need R2 or npm.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { root } from "./lib.mjs";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const FORCE_VERIFY = args.includes("--force-verify");
const zipIdx = args.indexOf("--zip");
const ZIP_OUT = zipIdx !== -1 ? args[zipIdx + 1] : null;
if (zipIdx !== -1 && !ZIP_OUT) {
  console.error("--zip requires an output path");
  process.exit(1);
}

const pkgDir = join(root, "packages/refraction");
const assetsDir = join(pkgDir, "assets");
const manifestPath = join(pkgDir, "manifest.json");
const { version } = JSON.parse(
  readFileSync(join(pkgDir, "package.json"), "utf8")
);
const PREFIX = `${version}/`;
const PUBLIC_BASE = `https://assets.icons.podlink.com/${version}`;
const BUCKET = process.env.R2_BUCKET ?? "refraction-assets";

const CONTENT_TYPES = {
  ".png": "image/png",
  ".avif": "image/avif",
  ".webp": "image/webp",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};
const contentType = (name) => {
  const ext = name.slice(name.lastIndexOf("."));
  const ct = CONTENT_TYPES[ext];
  if (!ct) throw new Error(`no content-type mapping for ${name}`);
  return ct;
};

// ---------------------------------------------------------------- files
if (!existsSync(assetsDir) || !existsSync(manifestPath)) {
  console.error(
    "packages/refraction/assets + manifest.json missing — render first:\n" +
      "  node pipeline/build-assets.mjs   (macOS + Icon Composer)"
  );
  process.exit(1);
}

const files = [
  ...readdirSync(assetsDir)
    .filter((f) => !f.startsWith("."))
    .sort()
    .map((f) => ({ path: join(assetsDir, f), key: PREFIX + f })),
  { path: manifestPath, key: `${PREFIX}manifest.json` },
].map((f) => ({ ...f, size: statSync(f.path).size, type: contentType(f.key) }));

const totalBytes = files.reduce((n, f) => n + f.size, 0);
const mb = (n) => (n / 1024 / 1024).toFixed(1) + " MB";

// ---------------------------------------------------------------- zip
if (ZIP_OUT) {
  const out = resolve(ZIP_OUT);
  // Flat archive: extract straight into e.g. public/refraction.
  execFileSync("zip", ["-X", "-q", "-j", out, manifestPath]);
  execFileSync("zip", ["-X", "-q", "-r", out, "."], { cwd: assetsDir });
  console.log(`zip: ${out} (${mb(statSync(out).size)}) — attach to the ` +
    `v${version} GitHub Release as assets-${version}.zip`);
}

// ---------------------------------------------------------------- dry run
if (DRY) {
  for (const f of files.slice(0, 8))
    console.log(`  ${f.key}  ${f.type}  ${f.size} B`);
  if (files.length > 8) console.log(`  … ${files.length - 8} more`);
  console.log(
    `dry-run: would upload ${files.length} files (${mb(totalBytes)}) to ` +
      `s3://${BUCKET}/${PREFIX} with Cache-Control: public, max-age=31536000, immutable`
  );
  console.log(`release base URL: ${PUBLIC_BASE}/`);
  process.exit(0);
}

// ---------------------------------------------------------------- client
for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"])
  if (!process.env[k]) {
    console.error(`missing env ${k} (see header comment); use --dry-run to preview`);
    process.exit(1);
  }

const { S3Client, ListObjectsV2Command, PutObjectCommand } = await import(
  "@aws-sdk/client-s3"
);
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function listPrefix() {
  const keys = new Map(); // key -> ETag
  let token;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: PREFIX,
        ContinuationToken: token,
      })
    );
    for (const o of res.Contents ?? []) keys.set(o.Key, o.ETag?.replaceAll('"', ""));
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

const existing = await listPrefix();

// ------------------------------------------------------- immutability guard
if (existing.size > 0 && !FORCE_VERIFY) {
  console.error(
    `refusing to upload: s3://${BUCKET}/${PREFIX} already has ${existing.size} objects.\n` +
      `Release prefixes are immutable — bump the version in ` +
      `packages/refraction/package.json, or run with --force-verify to ` +
      `checksum-compare the existing release (report only).`
  );
  process.exit(1);
}

if (FORCE_VERIFY) {
  // Report-only: compare remote ETags (MD5 for single-part uploads, which
  // is all this script ever does) against local checksums.
  let ok = 0,
    mismatched = [],
    missing = [];
  for (const f of files) {
    const remote = existing.get(f.key);
    if (!remote) {
      missing.push(f.key);
      continue;
    }
    const local = createHash("md5").update(readFileSync(f.path)).digest("hex");
    if (remote === local) ok++;
    else mismatched.push(f.key);
  }
  const extra = [...existing.keys()].filter(
    (k) => !files.some((f) => f.key === k)
  );
  console.log(
    `verify s3://${BUCKET}/${PREFIX}: ${ok}/${files.length} match, ` +
      `${mismatched.length} mismatched, ${missing.length} missing remotely, ` +
      `${extra.length} extra remote objects`
  );
  for (const k of mismatched) console.log(`  MISMATCH ${k}`);
  for (const k of missing) console.log(`  MISSING  ${k}`);
  for (const k of extra) console.log(`  EXTRA    ${k}`);
  console.log(`release base URL: ${PUBLIC_BASE}/`);
  process.exit(mismatched.length || missing.length ? 1 : 0);
}

// ---------------------------------------------------------------- upload
const CONCURRENCY = 16;
let done = 0;
const queue = [...files];
async function worker() {
  for (;;) {
    const f = queue.shift();
    if (!f) return;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: f.key,
        Body: readFileSync(f.path),
        ContentType: f.type,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
    done++;
    if (done % 100 === 0) console.log(`  ${done}/${files.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(
  `uploaded ${done} files (${mb(totalBytes)}) to s3://${BUCKET}/${PREFIX}`
);
console.log(`release base URL: ${PUBLIC_BASE}/`);
