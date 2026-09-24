// Vectorize a platform's raster artwork through QuiverAI's Image-to-SVG
// endpoint (POST https://api.quiver.ai/v1/svgs/vectorizations — docs:
// docs.quiver.ai/api-reference/vectorize-svg/vectorizesvg) and save what
// comes back next to a Chrome render and, when a master exists, the
// facet-drift audit's central RMSE against it. An exploration tool: what
// it saves is a candidate, not a facet — nothing in platforms/ is touched.
//
// The key is QUIVERAI_API_KEY from the repo's .env (gitignored; loaded with
// process.loadEnvFile, Node ≥ 21.7). It is sent as a Bearer header and never
// printed; error output shows the API's status, code, message and request_id
// only. Requests go through node:https with a 30-minute timeout: fetch's
// undici dispatcher gives up on headers after 300 s, and an xhigh-effort
// vectorization ran past that on 2026-09-23.
//
// Usage:
//   node pipeline/vectorize-quiver.mjs --only <slug> [--source glyph|master|store]
//   node pipeline/vectorize-quiver.mjs --image <png|jpg|webp|svg>
//     [--model arrow-2|arrow-2-telos|arrow-1.1]   default arrow-2
//     [--effort low|medium|high|xhigh]            reasoning_effort (omit for the API default)
//     [--auto-crop] [--target-size N]             the endpoint's own options
//     [--viewbox "minX minY w h"]                 requested SVG viewBox (default: the image's pixel size)
//     [--max-tokens N] [--temperature T]
//     [--n K]                                     repeat the call K times (each is billed)
//     [--out <dir>]                               default /tmp/quiver-vectorize-work/<name>
//     [--stream] [--verbose]                      SSE mode (keeps long xhigh runs alive; events logged to <out>/*.events)
//     [--dry-run]                                 print the request (image elided) and exit
//     [--models]                                  list the account's models and exit
//   node pipeline/vectorize-quiver.mjs --adopt <returned.svg> --only <slug> [--bbox "x0 y0 x1 y1"]
//     [--plate "#top,#bottom"] [--provenance "…"] [--input <file>] [--drop <id,id>]
//     [--transform "tx ty s"] [--fit-bbox "x0 y0 x1 y1"]   placement override / registration onto the master's box (px)
//     [--grade]                                             grade every colour to the master by a fitted affine RGB map
//     writes platforms/<id>/icon.svg + badge.svg: the document plated on the declared canvas in the 32-unit frame,
//     ids prefixed <slug>-q-, a provenance header; badge bare when --bbox (px, the mark's box) is given, plated otherwise
//
// Sources for --only: glyph = the bundle's split artwork (Assets/glyph.png
// or the first raster layer), master = packages/refraction/assets/<slug>.png
// (ictool's light render), store = apps/web/public/raster/<slug>.png.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import https from "node:https";
import { basename, extname, join } from "node:path";
import sharp from "sharp";
import { readBundles, root } from "./lib.mjs";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
const has = (n) => args.includes(n);

try { process.loadEnvFile(join(root, ".env")); } catch (e) { if (e.code !== "ENOENT") throw e; }
const KEY = process.env.QUIVERAI_API_KEY;
if (!KEY && !has("--dry-run")) { console.error("QUIVERAI_API_KEY is not set — add it to the repo's .env (docs.quiver.ai/developers/quickstart)"); process.exit(2); }
const API = "https://api.quiver.ai/v1";
const headers = () => ({ Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });

// node:https rather than fetch: undici's default headers timeout is 300 s and an xhigh-effort vectorization can run longer
function httpRequest(path, { method = "GET", body = null, onEvent = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(`${API}${path}`, { method, headers: { ...headers(), ...(onEvent ? { Accept: "text/event-stream" } : {}), ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}) }, timeout: 30 * 60 * 1000 }, (res) => {
      const chunks = []; let buf = "";
      res.on("data", (c) => { chunks.push(c); if (onEvent) { buf += c.toString("utf8"); let i; while ((i = buf.indexOf("\n\n")) >= 0) { const frame = buf.slice(0, i); buf = buf.slice(i + 2); const ev = {}; for (const line of frame.split("\n")) { const m = line.match(/^(\w+):\s?(.*)$/); if (m) ev[m[1]] = (ev[m[1]] ? ev[m[1]] + "\n" : "") + m[2]; } if (ev.data !== undefined || ev.event) onEvent(ev); } } });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("timeout", () => req.destroy(new Error("request timed out after 30 min")));
    req.on("error", reject);
    if (body) req.write(body); req.end();
  });
}
async function api(path, init = {}, attempt = 0) {
  const events = []; const t0 = Date.now();
  const res = await httpRequest(path, { ...init, onEvent: init.stream ? (ev) => { events.push(ev); if (has("--verbose")) console.error(`  [${((Date.now() - t0) / 1000).toFixed(0)} s] ${ev.event ?? "message"} ${(ev.data ?? "").slice(0, 120)}`); } : null });
  const requestId = res.headers["x-request-id"];
  let body;
  if (init.stream && events.length) {
    if (init.log) writeFileSync(init.log, events.map((e) => `event: ${e.event ?? ""}\ndata: ${e.data ?? ""}\n`).join("\n"));
    const parsed = events.map((e) => { try { return { ...e, json: JSON.parse(e.data) }; } catch { return e; } });
    const errEv = parsed.find((e) => e.event === "error" || e.json?.error); if (errEv) { const j = errEv.json?.error ?? errEv.json ?? {}; const err = new Error(`stream error ${j.status ?? ""} ${j.code ?? ""}: ${j.message ?? errEv.data} — request ${requestId ?? j.request_id ?? "?"}`); err.status = j.status; throw err; }
    const final = [...parsed].reverse().find((e) => e.json && (e.json.data?.[0]?.svg || e.json.response?.data?.[0]?.svg || e.json.svg));
    body = final ? (final.json.response ?? (final.json.svg ? { data: [{ svg: final.json.svg, mime_type: "image/svg+xml" }] } : final.json)) : null;
    if (!body) { const kinds = [...new Set(parsed.map((e) => e.event ?? "message"))]; const err = new Error(`stream ended with no SVG (${events.length} events: ${kinds.join(", ")}) — see ${init.log ?? "--verbose"}; request ${requestId ?? "?"}`); err.status = res.status; if (res.status >= 400) { try { const j = JSON.parse(res.text); err.message = `${res.status} ${j.code ?? ""}: ${j.message ?? "?"} — request ${requestId ?? j.request_id ?? "?"}`; } catch {} } throw err; }
    body.streamSeconds = (Date.now() - t0) / 1000;
    return { body, requestId };
  }
  try { body = JSON.parse(res.text); } catch { body = { message: res.text.slice(0, 400) }; }
  if (res.status >= 200 && res.status < 300) return { body, requestId };
  const retryAfter = Number(res.headers["retry-after"] ?? body.retry_after ?? 0);
  if ((res.status === 429 || res.status === 503) && attempt < 3 && retryAfter <= 120) {
    const wait = Math.max(1, retryAfter || 2 ** attempt) * 1000 + Math.random() * 500;
    console.error(`  ${res.status} ${body.code ?? ""} — retrying in ${(wait / 1000).toFixed(1)} s (request ${requestId ?? body.request_id ?? "?"})`);
    await new Promise((r) => setTimeout(r, wait));
    return api(path, init, attempt + 1);
  }
  const err = new Error(`${res.status} ${body.code ?? ""}: ${body.message ?? "?"}${body.param ? ` (param ${body.param})` : ""} — request ${requestId ?? body.request_id ?? "?"}`);
  err.status = res.status; throw err;
}

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// ---- adoption: plate a returned document in the house frame and write the platform's facets with provenance
if (flag("--adopt")) {
  const slug = flag("--only"); const b = readBundles().find((x) => x.slug === slug); if (!b) { console.error("--adopt needs --only <slug>"); process.exit(2); }
  const src = flag("--adopt"); const q = readFileSync(src, "utf8");
  if (/<script|<image|<foreignObject|href="https?:|url\(https?:/.test(q)) { console.error(`${src}: carries a script, image, foreignObject or external reference — not shipped`); process.exit(2); }
  const vb = (q.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 1024 1024").split(/\s+/).map(Number); const scale = 32 / vb[2];
  let inner = q.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<!--[\s\S]*?-->/g, "").trim();
  // a nested <svg> wrapper (arrow-2-telos emits one) is unwrapped; --drop removes elements by id (a background the model added, say) and reports each
  inner = inner.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").trim().replaceAll("xlink:href=", "href="); // SVG 2 href: the plated root declares no xlink namespace, and Chrome renders nothing when it meets an undeclared prefix
  for (const id of (flag("--drop") ?? "").split(",").filter(Boolean)) { const re = new RegExp(`\\s*<(\\w+)[^>]*\\bid="${id}"[^>]*?(?:/>|>[\\s\\S]*?</\\1>)`); const m = inner.match(re); if (!m) { console.error(`--drop ${id}: no element with that id`); process.exit(2); } inner = inner.replace(re, ""); console.log(`dropped <${m[1]} id="${id}"> (${m[0].length} chars)`); }
  const ids = [...new Set([...inner.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))];
  let art = inner; for (const id of ids) art = art.replaceAll(`id="${id}"`, `id="${slug}-q-${id}"`).replaceAll(`url(#${id})`, `url(#${slug}-q-${id})`).replaceAll(`href="#${id}"`, `href="#${slug}-q-${id}"`);
  art = art.replace(/\n\s*/g, "");
  const doc = JSON.parse(readFileSync(join(b.bundlePath, "icon.json"), "utf8"));
  const canvas = doc.fill?.["linear-gradient"] ?? (doc.fill?.solid ? [doc.fill.solid, doc.fill.solid] : null);
  const toHex = (v) => { const m = v.match(/^(srgb|gray|display-p3):([\d.,]+)/); if (!m) return null; const n = m[2].split(",").map(Number); if (m[1] === "gray") return `color(display-p3 ${n[0]} ${n[0]} ${n[0]})`.replace("display-p3", "srgb"); if (m[1] === "display-p3") return `color(display-p3 ${n[0]} ${n[1]} ${n[2]})`; return "#" + n.slice(0, 3).map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join(""); };
  const plateStops = canvas ? canvas.map(toHex) : null;
  const plateOverride = flag("--plate"); // "top,bottom" hex pair, when the declared canvas is not what ictool paints (P3 declared → measured)
  const stops = plateOverride ? plateOverride.split(",") : plateStops;
  if (!stops || stops.some((v) => !v)) { console.error("cannot resolve the plate from icon.json — pass --plate '#top,#bottom'"); process.exit(2); }
  const orient = doc.fill?.orientation ?? { start: { x: 0.5, y: 0 }, stop: { x: 0.5, y: 1 } };
  const plate = `<linearGradient id="${slug}-plate" gradientUnits="userSpaceOnUse" x1="${orient.start.x * 32}" y1="${orient.start.y * 32}" x2="${orient.stop.x * 32}" y2="${orient.stop.y * 32}"><stop stop-color="${stops[0]}"/><stop offset="1" stop-color="${stops[1]}"/></linearGradient>`;
  const prov = flag("--provenance") ?? ""; // free text: model, effort, response id, request id, score
  // placement: the document's pixel box onto the 32-unit canvas (scale 32 / viewBox width); --transform "tx ty s" overrides it; --fit-bbox
  // "x0 y0 x1 y1" (px, the artwork's box on the master) registers the document's rendered content onto that box by a similarity — for
  // layers whose document was drawn at another size than the placement law predicts (arrow drew the 1024 × 1379 balloon layer at 0.74)
  let tx = -vb[0] * scale, ty = -vb[1] * scale, sc = scale;
  if (flag("--transform")) [tx, ty, sc] = flag("--transform").split(/\s+/).map(Number);
  if (flag("--fit-bbox")) {
    const [X0, Y0, X1, Y1] = flag("--fit-bbox").split(/\s+/).map(Number);
    const probe = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g transform="translate(${tx.toFixed(4)} ${ty.toFixed(4)}) scale(${sc.toFixed(6)})">${art}</g></svg>`;
    const dir = join("/tmp/quiver-vectorize-work", `fit-${Math.floor(Math.random() * 1e9)}`); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "icon.svg"), probe); writeFileSync(join(dir, "wrap.html"), `<!doctype html><html><head><style>html,body{margin:0;padding:0}img{width:1024px;height:1024px;display:block}</style></head><body><img src="icon.svg"></body></html>`);
    execFileSync(CHROME, ["--headless=new", "--disable-gpu", `--screenshot=${join(dir, "out.png")}`, "--window-size=1024,1024", "--default-background-color=00000000", join(dir, "wrap.html")], { stdio: "ignore" });
    const { data } = await sharp(join(dir, "out.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); rmSync(dir, { recursive: true, force: true });
    let x0 = 1e9, x1 = 0, y0 = 1e9, y1 = 0; for (let i = 0; i < 1024 * 1024; i++) if (data[i * 4 + 3] > 64) { const x = i % 1024, y = (i / 1024) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const kx = (X1 - X0) / (x1 - x0), ky = (Y1 - Y0) / (y1 - y0), k = (kx + ky) / 2; const s2 = sc * k;
    const docX0 = (x0 / 32 - tx) / sc, docY0 = (y0 / 32 - ty) / sc; tx = X0 / 32 - docX0 * s2; ty = Y0 / 32 - docY0 * s2; sc = s2;
    console.log(`fit-bbox: rendered ${x0}–${x1} × ${y0}–${y1} → ${X0}–${X1} × ${Y0}–${Y1}: scale ×${k.toFixed(4)} (x ${kx.toFixed(4)}, y ${ky.toFixed(4)}; aspect off by ${(100 * Math.abs(kx - ky) / k).toFixed(2)}%) → translate(${tx.toFixed(4)} ${ty.toFixed(4)}) scale(${sc.toFixed(6)})`);
  }
  // --grade: the model's colours are its own reading of the raster (arrow-2-telos drew airshow's balloon 4/11/6 brighter than the layer
  // it was given, with the layer itself rendering to the master within 1). Fit an affine RGB map, master ≈ T·[r g b 1], by least
  // squares over the artwork's interior (its own alpha, 3 px in from every edge) and apply it to every colour in the document — the
  // pandora precedent (ledger 2026-09-14). The map goes into the header.
  let gradeNote = "";
  if (has("--grade")) {
    const masterPng = join(root, "packages/refraction/assets", `${slug}.png`);
    const probe = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g transform="translate(${tx.toFixed(4)} ${ty.toFixed(4)}) scale(${sc.toFixed(6)})">${art}</g></svg>`;
    const dir = join("/tmp/quiver-vectorize-work", `grade-${Math.floor(Math.random() * 1e9)}`); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "icon.svg"), probe); writeFileSync(join(dir, "wrap.html"), `<!doctype html><html><head><style>html,body{margin:0;padding:0}img{width:1024px;height:1024px;display:block}</style></head><body><img src="icon.svg"></body></html>`);
    execFileSync(CHROME, ["--headless=new", "--disable-gpu", `--screenshot=${join(dir, "out.png")}`, "--window-size=1024,1024", "--default-background-color=00000000", join(dir, "wrap.html")], { stdio: "ignore" });
    const A = await sharp(join(dir, "out.png")).ensureAlpha().raw().toBuffer(), Mi = await sharp(masterPng).ensureAlpha().raw().toBuffer(); rmSync(dir, { recursive: true, force: true });
    const N = 1024, pts = []; for (let y = 3; y < N - 3; y++) for (let x = 3; x < N - 3; x++) { const i = (y * N + x) * 4; if (A[i + 3] < 255) continue; let ok = true; for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3; dx++) if (A[((y + dy) * N + x + dx) * 4 + 3] < 255) { ok = false; break; } if (ok) pts.push(i); }
    const T = []; for (let c = 0; c < 3; c++) { const AtA = Array.from({ length: 4 }, () => new Float64Array(4)), AtY = new Float64Array(4); for (const i of pts) { const v = [A[i], A[i + 1], A[i + 2], 1]; for (let a = 0; a < 4; a++) { AtY[a] += v[a] * Mi[i + c]; for (let b = 0; b < 4; b++) AtA[a][b] += v[a] * v[b]; } } const Ab = AtA.map((r, i) => [...r, AtY[i]]); for (let i = 0; i < 4; i++) { let p = i; for (let r = i + 1; r < 4; r++) if (Math.abs(Ab[r][i]) > Math.abs(Ab[p][i])) p = r; [Ab[i], Ab[p]] = [Ab[p], Ab[i]]; for (let r = 0; r < 4; r++) { if (r === i) continue; const f = Ab[r][i] / Ab[i][i]; for (let k = i; k <= 4; k++) Ab[r][k] -= f * Ab[i][k]; } } T.push(Ab.map((r, i) => r[4] / r[i])); }
    const mapRGB = (r, g, b) => T.map((t) => Math.round(Math.max(0, Math.min(255, t[0] * r + t[1] * g + t[2] * b + t[3]))));
    let e0 = 0, e1 = 0, sg = [0, 0, 0]; for (const i of pts) { const q = mapRGB(A[i], A[i + 1], A[i + 2]); for (let c = 0; c < 3; c++) { e0 += (Mi[i + c] - A[i + c]) ** 2; e1 += (Mi[i + c] - q[c]) ** 2; sg[c] += Mi[i + c] - A[i + c]; } }
    const hex = (n) => n.toString(16).padStart(2, "0");
    let count = 0; const gradeColour = (str) => { let m; if ((m = str.match(/^#([0-9a-f]{6})$/i))) { const [r, g, b] = [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16)); count++; return "#" + mapRGB(r, g, b).map(hex).join("").toUpperCase(); } if ((m = str.match(/^#([0-9a-f]{3})$/i))) { const [r, g, b] = m[1].split("").map((ch) => parseInt(ch + ch, 16)); count++; return "#" + mapRGB(r, g, b).map(hex).join("").toUpperCase(); } if ((m = str.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i))) { count++; const q = mapRGB(+m[1], +m[2], +m[3]); return str.replace(/\(\s*\d+\s*,\s*\d+\s*,\s*\d+/, `(${q[0]},${q[1]},${q[2]}`); } return str; };
    art = art.replace(/\b(fill|stroke|stop-color|flood-color|lighting-color)="([^"]+)"/g, (m0, k, v) => `${k}="${gradeColour(v)}"`).replace(/\b(fill|stroke|stop-color|flood-color)\s*:\s*([^;"]+)/g, (m0, k, v) => `${k}:${gradeColour(v.trim())}`);
    gradeNote = ` Graded to the master by the affine map R'=${T[0].map((v) => v.toFixed(4)).join(",")}; G'=${T[1].map((v) => v.toFixed(4)).join(",")}; B'=${T[2].map((v) => v.toFixed(4)).join(",")} (each a·R+b·G+c·B+d), fitted over ${pts.length} interior pixels: rms ${Math.sqrt(e0 / pts.length / 3).toFixed(2)} → ${Math.sqrt(e1 / pts.length / 3).toFixed(2)}, ${count} colours rewritten.`;
    console.log(`grade: ${pts.length} interior px, master − document ${sg.map((v) => (v / pts.length).toFixed(1)).join("/")}, rms ${Math.sqrt(e0 / pts.length / 3).toFixed(2)} → ${Math.sqrt(e1 / pts.length / 3).toFixed(2)}; ${count} colours rewritten`);
  }
  const group = `<g transform="translate(${tx.toFixed(4)} ${ty.toFixed(4)}) scale(${sc.toFixed(6)})">${art}</g>`;
  const head = `<!-- ${slug}: QuiverAI Image-to-SVG vectorization of ${basename(flag("--input") ?? src)} (${prov || "see pipeline/README.md"}), ${new Date().toLocaleDateString("sv-SE")}; plated on the declared canvas at scale ${scale.toFixed(6)}, ids prefixed ${slug}-q-. ${gradeNote} A derived drawing: flatSource drawn. Method: .claude/skills/icon-to-flat-svg, "Vectorizing through QuiverAI". -->`;
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n  ${head}\n  <defs>${plate}</defs><path fill="url(#${slug}-plate)" d="M0 0h32v32H0z"/>${group}\n</svg>\n`;
  // badge: bare (viewBox = the artwork's bbox in 32 units + 2%, from --bbox "x0 y0 x1 y1" px) or plated under the house squircle
  let badge;
  if (flag("--bbox")) { const [x0, y0, x1, y1] = flag("--bbox").split(/\s+/).map(Number); const px = 0.02 * (x1 - x0), py = 0.02 * (y1 - y0); const v = [(x0 - px) * scale, (y0 - py) * scale, (x1 - x0 + 2 * px) * scale, (y1 - y0 + 2 * py) * scale].map((n) => n.toFixed(2)); badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${v.join(" ")}">\n  ${head}\n  ${group}\n</svg>\n`; }
  else badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">\n  ${head}\n  <defs>${plate}<clipPath id="shape"><path d="M16 0C30.545 0 32 1.455 32 16S30.545 32 16 32S0 30.545 0 16S1.455 0 16 0Z"/></clipPath></defs>\n  <g clip-path="url(#shape)"><path fill="url(#${slug}-plate)" d="M0 0h32v32H0z"/>${group}</g>\n</svg>\n`;
  writeFileSync(join(b.platformDir ?? join(root, "platforms", b.platformId), "icon.svg"), icon); writeFileSync(join(b.platformDir ?? join(root, "platforms", b.platformId), "badge.svg"), badge);
  console.log(`wrote platforms/${b.platformId}/icon.svg (${(icon.length / 1024).toFixed(1)} KB) and badge.svg (${flag("--bbox") ? "bare" : "plated"}); ${ids.length} ids prefixed; plate ${stops.join(" → ")}`);
  process.exit(0);
}

if (has("--models")) {
  const { body } = await api("/models");
  for (const m of body.data ?? []) console.log(`${m.id.padEnd(16)} ${(m.supported_operations ?? []).join(", ")}`);
  process.exit(0);
}

// ---- pick the input image
let image = flag("--image"), name;
const only = flag("--only");
if (only) {
  const b = readBundles().find((x) => x.slug === only);
  if (!b) { console.error(`no bundle ${only}`); process.exit(2); }
  const source = flag("--source") ?? "glyph";
  if (source === "master") image = join(root, "packages/refraction/assets", `${b.slug}.png`);
  else if (source === "store") image = join(root, "apps/web/public/raster", `${b.slug}.png`);
  else {
    const assets = join(b.bundlePath, "Assets");
    const files = existsSync(assets) ? readdirSync(assets).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)) : [];
    image = files.includes("glyph.png") ? join(assets, "glyph.png") : files.length ? join(assets, files[0]) : null;
    if (!image) { console.error(`${only}: no raster layer in ${assets} — use --source master|store`); process.exit(2); }
  }
  name = `${b.slug}-${source}`;
} else if (image) name = basename(image, extname(image));
else { console.error("need --only <slug> or --image <file> (or --models)"); process.exit(2); }
if (!existsSync(image)) { console.error(`missing ${image}`); process.exit(2); }

const meta = await sharp(image).metadata();
const bytes = readFileSync(image);
const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" }[extname(image).toLowerCase()];
if (!mime) { console.error(`unsupported image type ${extname(image)}`); process.exit(2); }
if (bytes.length > 12582912 || meta.width > 4096 || meta.height > 4096) { console.error(`${image}: ${bytes.length} bytes, ${meta.width}×${meta.height} — over the endpoint's limits (12 MB, 4096²)`); process.exit(2); }

const model = flag("--model") ?? "arrow-2";
const vb = (flag("--viewbox") ?? `0 0 ${meta.width} ${meta.height}`).split(/\s+/).map(Number);
const request = {
  model,
  image: { base64: bytes.toString("base64") },
  attributes: { viewBox: { minX: vb[0], minY: vb[1], width: vb[2], height: vb[3] } },
  stream: has("--stream"),
  ...(flag("--effort") ? { reasoning_effort: flag("--effort") } : {}),
  ...(has("--auto-crop") ? { auto_crop: true } : {}),
  ...(flag("--target-size") ? { target_size: Number(flag("--target-size")) } : {}),
  ...(flag("--max-tokens") ? { max_output_tokens: Number(flag("--max-tokens")) } : {}),
  ...(flag("--temperature") ? { temperature: Number(flag("--temperature")) } : {}),
};
const out = flag("--out") ?? join("/tmp/quiver-vectorize-work", name);
mkdirSync(out, { recursive: true });
console.log(`${name}: ${basename(image)} ${meta.width}×${meta.height} ${mime} ${(bytes.length / 1024).toFixed(0)} KB → ${model}${request.reasoning_effort ? ` (${request.reasoning_effort})` : ""}, viewBox ${vb.join(" ")}`);
if (has("--dry-run")) { console.log(JSON.stringify({ ...request, image: { base64: `<${request.image.base64.length} chars>` } }, null, 2)); process.exit(0); }

// ---- scoring against the master, the facet-drift audit's way (Chrome at 1024, lanczos to 256, over gray, central 60%)
function chrome(svgText, png, size = 1024) {
  const dir = join(out, `chrome-${Math.floor(Math.random() * 1e9)}`); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "icon.svg"), svgText);
  writeFileSync(join(dir, "wrap.html"), `<!doctype html><html><head><style>html,body{margin:0;padding:0}img{width:${size}px;height:${size}px;display:block}</style></head><body><img src="icon.svg"></body></html>`);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", `--screenshot=${png}`, `--window-size=${size},${size}`, "--default-background-color=00000000", join(dir, "wrap.html")], { stdio: "ignore" });
  rmSync(dir, { recursive: true, force: true });
}
const to256 = async (p) => sharp(p).ensureAlpha().resize(256, 256, { kernel: "lanczos3" }).raw().toBuffer();
const overGray = (rgba) => { const o = new Float64Array(256 * 256 * 3); for (let p = 0; p < 256 * 256; p++) { const a = rgba[p * 4 + 3] / 255; for (let c = 0; c < 3; c++) o[p * 3 + c] = rgba[p * 4 + c] * a + 128 * (1 - a); } return o; };
async function central(pngA, pngB) { const a = overGray(await to256(pngA)), b = overGray(await to256(pngB)); let s = 0, n = 0; for (let y = 51; y <= 204; y++) for (let x = 51; x <= 204; x++) { const i = (y * 256 + x) * 3; for (let c = 0; c < 3; c++) { const d = a[i + c] - b[i + c]; s += d * d; n++; } } return Math.sqrt(s / n); }
const master = only ? join(root, "packages/refraction/assets", `${only}.png`) : null;

const runs = Number(flag("--n") ?? 1);
for (let k = 1; k <= runs; k++) {
  const t0 = Date.now();
  process.on("exit", () => { if (!process.exitCode && !globalThis.__done) return; });
  const onFail = (e) => { console.error(`  failed after ${((Date.now() - t0) / 1000).toFixed(0)} s: ${e.message}${e.cause ? ` (${e.cause.code ?? e.cause.message})` : ""}`); process.exit(1); };
  const { body, requestId } = await api("/svgs/vectorizations", { method: "POST", body: JSON.stringify(request), stream: request.stream, log: join(out, `${name}-${model}-${k}.events`) }).catch(onFail);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const docs = body.data ?? [];
  const u = body.usage ?? {};
  console.log(`  ${body.id ?? "?"} in ${secs} s — ${docs.length} svg, credits ${body.credits ?? "–"}, tokens in ${u.input_tokens ?? "–"} / out ${u.output_tokens ?? "–"} (request ${requestId ?? "?"})`);
  for (let i = 0; i < docs.length; i++) {
    const svg = docs[i].svg; const tag = `${name}-${model}${request.reasoning_effort ? "-" + request.reasoning_effort : ""}-${k}${docs.length > 1 ? `-${i + 1}` : ""}`;
    const svgPath = join(out, `${tag}.svg`); writeFileSync(svgPath, svg);
    const counts = {}; for (const m of svg.matchAll(/<([a-zA-Z]+)[\s>]/g)) counts[m[1]] = (counts[m[1]] || 0) + 1;
    const els = Object.entries(counts).filter(([k]) => !["svg", "defs", "g"].includes(k)).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k}`).join(", ");
    let line = `  ${tag}.svg — ${(svg.length / 1024).toFixed(1)} KB: ${els}`;
    if (existsSync(CHROME)) {
      const png = join(out, `${tag}.png`); chrome(svg, png);
      // score against the SOURCE (both transparent where the artwork is not) — a split glyph scored against the plated
      // master reads the plate, not the vector; the master figure is added only when the source is the master itself
      const cs = await central(image, png); line += ` — central ${cs.toFixed(2)} vs the source`;
      if (master && existsSync(master) && image === master) line += ` (the glass master)`;
      const ref = image;
      const A = await sharp(png).ensureAlpha().resize(1024, 1024).raw().toBuffer(), B = await sharp(ref).ensureAlpha().resize(1024, 1024).raw().toBuffer();
      const D = Buffer.alloc(1024 * 1024 * 4); for (let j = 0; j < 1024 * 1024; j++) { for (let c = 0; c < 3; c++) D[j * 4 + c] = Math.min(255, 4 * Math.abs(A[j * 4 + c] - B[j * 4 + c])); D[j * 4 + 3] = 255; }
      const t = async (p) => sharp(p).resize(384, 384, { fit: "contain", background: "#808080" }).png().toBuffer();
      const tiles = [await t(image), await t(png), await sharp(D, { raw: { width: 1024, height: 1024, channels: 4 } }).resize(384).png().toBuffer()];
      await sharp({ create: { width: 384 * 3 + 16, height: 384, channels: 4, background: "#808080" } }).composite(tiles.map((b, j) => ({ input: b, left: j * 392, top: 0 }))).png().toFile(join(out, `${tag}-sheet.png`));
    }
    console.log(line);
  }
}
console.log(`saved under ${out}`);
