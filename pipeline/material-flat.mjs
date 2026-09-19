// Carry the Liquid Glass material's two vector-expressible parts into a
// flat icon: TRANSLUCENCY and SHADOW. Measured 2026-09-19 (ledger
// "Translucency and shadow in the flats"): ablating the material through
// ictool shows translucency is nearly the whole of a material pair's
// drift (icatcher 26.8 → 3.5, moonfm 44.3 → 5.8 with it off), shadow ~4,
// specular 0–5, refraction ~0. What translucency does is a per-layer
// blend toward the layer's BACKDROP with a weight that rises from 0 at
// the top of the layer's bounding box to ~translucency-value at the
// bottom — so a vertical opacity mask over the layer reproduces it
// without a filter. The shadow is a soft dark drop, expressible as a
// blurred, offset copy of the layer's alpha (SVG filter primitives).
//
//   node pipeline/material-flat.mjs measure --only <slug> [--json <out>]
//     Renders the bundle through ictool as full / no-translucency /
//     no-shadow / each glass layer hidden (cached under --work), and for
//     every glass layer reads: its row extent, the translucency weight
//     per row-decile against the EXACT backdrop (the render with the
//     layer hidden), and a shadow fit (offset dy, blur σ, opacity a) of
//     luma(noShadow − full) to the layer's blurred silhouette.
//   node pipeline/material-flat.mjs apply --only <slug> --measure <json>
//        --map "<layer-file>=<css selector>" [--map ...]
//     Rewrites platforms/<id>/icon.svg: the elements each selector
//     matches become one group per layer, drawn as a shadow-only <use>
//     of the group beneath the group itself under a luminance mask whose
//     vertical gradient carries 1 − weight(decile). Ids are prefixed
//     `<id>-material-`. The plate and every non-glass element are left
//     alone. Re-running apply on an already-materialised flat is refused.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { readPlatforms, root } from "./lib.mjs";

const ICTOOL = "/Applications/Icon Composer.app/Contents/Executables/ictool";
const N = 1024;
const args = process.argv.slice(2);
const cmd = args[0];
const flag = (n) => { const i = args.indexOf(n); return i < 0 ? null : args[i + 1]; };
const flags = (n) => args.map((a, i) => (a === n ? args[i + 1] : null)).filter(Boolean);
const only = flag("--only");
const work = flag("--work") ?? "/tmp/material-flat-work";
if (!only) { console.error("need --only <slug>"); process.exit(2); }

const platform = readPlatforms().find((p) => (p.meta.liquidGlass?.bundles ?? []).some((b) => b.slug === only));
if (!platform) { console.error(`no bundle ${only}`); process.exit(2); }
const bundleMeta = platform.meta.liquidGlass.bundles.find((b) => b.slug === only);
const bundlePath = join(platform.dir, bundleMeta.file);

const toS = (s) => s.withIccProfile("srgb", { attach: false });
const load = async (f) => toS(sharp(f)).ensureAlpha().raw().toBuffer();
const isGlass = (l) => l.glass === true || (l.glass == null && (l["glass-specializations"] ?? []).find((s) => !s.appearance)?.value === true);

/** Gaussian-blurred 0/255 silhouette as ONE channel. sharp hands a raw
 *  1-channel input back with 3 channels after blur unless coerced; read
 *  by the reported stride so a change in that behaviour cannot misindex. */
async function blurred(sil, sigma) {
  const { data, info } = await sharp(sil, { raw: { width: N, height: N, channels: 1 } }).blur(sigma).toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
  if (info.channels === 1) return data;
  const out = Buffer.alloc(N * N); for (let i = 0; i < N * N; i++) out[i] = data[i * info.channels]; return out;
}

function renderVariant(name, mutate) {
  mkdirSync(work, { recursive: true });
  const out = join(work, `${only}-${name}.png`);
  if (existsSync(out)) return out;
  const dir = join(work, `${only}-${name}.icon`);
  rmSync(dir, { recursive: true, force: true });
  cpSync(bundlePath, dir, { recursive: true });
  const j = JSON.parse(readFileSync(join(dir, "icon.json"), "utf8"));
  mutate(j);
  writeFileSync(join(dir, "icon.json"), JSON.stringify(j, null, 2));
  execFileSync(ICTOOL, [dir, "--export-image", "--output-file", out, "--platform", "macOS", "--rendition", "Default", "--width", String(N), "--height", String(N), "--scale", "1"], { stdio: "pipe" });
  rmSync(dir, { recursive: true, force: true });
  return out;
}

async function measure() {
  const doc = JSON.parse(readFileSync(join(bundlePath, "icon.json"), "utf8"));
  const full = await load(renderVariant("full", () => {}));
  const noT = await load(renderVariant("noTransl", (j) => { for (const g of j.groups) { g.translucency = { enabled: false, value: 0 }; delete g["translucency-specializations"]; } }));
  const noS = await load(renderVariant("noShadow", (j) => { for (const g of j.groups) g.shadow = { kind: "none", opacity: 0 }; }));
  const layers = [];
  doc.groups.forEach((g, gi) => g.layers.forEach((l, li) => {
    if (!isGlass(l) || l.hidden) return;
    layers.push({ gi, li, file: l["image-name"] ?? l["image-name-specializations"]?.[0]?.value, translucency: (g["translucency-specializations"]?.find((s) => !s.appearance)?.value ?? g.translucency)?.value ?? 0, shadowOpacity: g.shadow?.kind === "none" ? 0 : (g.shadow?.opacity ?? 0) });
  }));
  const out = []; const collected = [];
  // Each layer's VISIBLE footprint: where hiding it (translucency off, so
  // nothing shows through anything) changes the render, minus the
  // footprints of the layers above it (groups and layers are listed
  // top-to-bottom). Without the subtraction a lower layer reads the
  // upper layer's pixels, where it is only the backdrop (moonfm's pink
  // under the blue chevron measured 0.75–1.0 that way).
  const covered = new Uint8Array(N * N);
  for (const L of layers) {
    const hid = await load(renderVariant(`hide-${L.gi}-${L.li}`, (j) => { j.groups[L.gi].layers[L.li].hidden = true; }));
    const hidNoT = await load(renderVariant(`hideNoT-${L.gi}-${L.li}`, (j) => { for (const g of j.groups) { g.translucency = { enabled: false, value: 0 }; delete g["translucency-specializations"]; } j.groups[L.gi].layers[L.li].hidden = true; }));
    const mask = new Uint8Array(N * N); let y0 = N, y1 = 0, area = 0;
    for (let i = 0; i < N * N; i++) { if (covered[i]) continue; const q = i * 4; if (Math.max(Math.abs(noT[q] - hidNoT[q]), Math.abs(noT[q + 1] - hidNoT[q + 1]), Math.abs(noT[q + 2] - hidNoT[q + 2])) > 24) { mask[i] = 1; area++; const y = (i / N) | 0; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    for (let i = 0; i < N * N; i++) if (mask[i]) covered[i] = 1;
    if (area < N * N * 0.005) { console.log(`${L.file.padEnd(20)} visible footprint ${area} px — below 0.5% of the canvas, no material applied`); continue; }
    // translucency weight per row-decile of the footprint, interior pixels (eroded 3), channel with the largest backdrop contrast
    const B = 10; const acc = Array.from({ length: B }, () => ({ s: 0, n: 0 }));
    for (let y = y0 + 3; y <= y1 - 3; y++) for (let x = 3; x < N - 3; x++) {
      const i = y * N + x; if (!mask[i]) continue; let ok = true;
      for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3; dx++) if (!mask[(y + dy) * N + x + dx]) { ok = false; break; }
      if (!ok) continue; const q = i * 4; let best = 0, bk = 0;
      for (let k = 0; k < 3; k++) { const den = Math.abs(hid[q + k] - noT[q + k]); if (den > best) { best = den; bk = k; } }
      if (best < 40) continue;
      const a = (full[q + bk] - noT[q + bk]) / (hid[q + bk] - noT[q + bk]);
      const bi = Math.min(B - 1, Math.floor(((y - y0) / (y1 - y0)) * B)); acc[bi].s += a; acc[bi].n++;
    }
    let alpha = acc.map((a) => (a.n > 50 ? Math.max(0, Math.min(1, a.s / a.n)) : null));
    // fill gaps (a decile covered by another layer) by interpolation, then enforce monotone non-decreasing
    for (let i = 0; i < B; i++) if (alpha[i] === null) { let lo = i - 1, hi = i + 1; while (lo >= 0 && alpha[lo] === null) lo--; while (hi < B && alpha[hi] === null) hi++; const a = lo >= 0 ? alpha[lo] : 0, b = hi < B ? alpha[hi] : (lo >= 0 ? alpha[lo] : 0); alpha[i] = lo >= 0 && hi < B ? a + (b - a) * ((i - lo) / (hi - lo)) : (lo >= 0 ? a : b); }
    for (let i = 1; i < B; i++) if (alpha[i] < alpha[i - 1]) alpha[i] = alpha[i - 1];
    collected.push({ L, mask, y0, y1, area, alpha });
    continue;
  }
  // Translucency acts per GROUP: a layer fades toward what lies beneath its
  // group, not toward sibling layers of the same group (moonfm's blue chevron
  // fades to the white M beneath the group, not to the pink chevron under it
  // inside the group — measured 2026-09-19). So the weight curve is read over
  // the union footprint of a group's glass layers and applied to the group.
  const byGroup = new Map();
  for (const c of collected) { const g = byGroup.get(c.L.gi); if (!g) byGroup.set(c.L.gi, { gi: c.L.gi, files: [c.L.file], mask: c.mask, y0: c.y0, y1: c.y1, area: c.area, L: c.L }); else { g.files.push(c.L.file); for (let i = 0; i < N * N; i++) if (c.mask[i]) g.mask[i] = 1; g.y0 = Math.min(g.y0, c.y0); g.y1 = Math.max(g.y1, c.y1); g.area += c.area; } }
  const groups = [...byGroup.values()];
  for (const g of groups) {
    const B = 10; const acc = Array.from({ length: B }, () => ({ s: 0, n: 0 }));
    const hid = await load(renderVariant(`hideGroup-${g.gi}`, (j) => { j.groups[g.gi].hidden = true; }));
    for (let y = g.y0 + 3; y <= g.y1 - 3; y++) for (let x = 3; x < N - 3; x++) {
      const i = y * N + x; if (!g.mask[i]) continue; let ok = true;
      for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3; dx++) if (!g.mask[(y + dy) * N + x + dx]) { ok = false; break; }
      if (!ok) continue; const q = i * 4; let best = 0, bk = 0;
      for (let k = 0; k < 3; k++) { const den = Math.abs(hid[q + k] - noT[q + k]); if (den > best) { best = den; bk = k; } }
      if (best < 40) continue;
      const a = (full[q + bk] - noT[q + bk]) / (hid[q + bk] - noT[q + bk]);
      const bi = Math.min(B - 1, Math.floor(((y - g.y0) / (g.y1 - g.y0)) * B)); acc[bi].s += a; acc[bi].n++;
    }
    let alpha = acc.map((a) => (a.n > 50 ? Math.max(0, Math.min(1, a.s / a.n)) : null));
    for (let i = 0; i < B; i++) if (alpha[i] === null) { let lo = i - 1, hi = i + 1; while (lo >= 0 && alpha[lo] === null) lo--; while (hi < B && alpha[hi] === null) hi++; const a = lo >= 0 ? alpha[lo] : 0, b = hi < B ? alpha[hi] : (lo >= 0 ? alpha[lo] : 0); alpha[i] = lo >= 0 && hi < B ? a + (b - a) * ((i - lo) / (hi - lo)) : (lo >= 0 ? a : b); }
    for (let i = 1; i < B; i++) if (alpha[i] < alpha[i - 1]) alpha[i] = alpha[i - 1];
    g.alpha = alpha;
  }
  collected.length = 0; collected.push(...groups);
  // Shadow, fitted JOINTLY: luma(noShadow − full) outside every footprint ≈
  // Σ_k a_k · blur_σ(silhouette_k shifted down by dy), one (dy, σ) for the
  // bundle (ictool's shadow is one light) and an opacity per layer. Fitting
  // each layer alone against the summed field overstates every a_k.
  const D = new Float32Array(N * N); const anyMask = new Uint8Array(N * N);
  for (const c of collected) for (let i = 0; i < N * N; i++) if (c.mask[i]) anyMask[i] = 1;
  let anyShadow = false;
  for (let i = 0; i < N * N; i++) { if (anyMask[i]) continue; const q = i * 4; const v = ((noS[q] + noS[q + 1] + noS[q + 2]) - (full[q] + full[q + 1] + full[q + 2])) / 3; D[i] = v; if (v > 2) anyShadow = true; }
  let fit = null;
  if (anyShadow && collected.length) {
    const sils = collected.map((c) => Buffer.from(c.mask.map((v) => (v ? 255 : 0))));
    const yA = Math.max(0, Math.min(...collected.map((c) => c.y0)) - 100), yB = Math.min(N, Math.max(...collected.map((c) => c.y1)) + 160);
    for (const sigma of [8, 12, 16, 20, 26, 32, 40, 48, 56]) {
      const bls = []; for (const sil of sils) bls.push(await blurred(sil, sigma));
      for (const dy of [0, 6, 12, 18, 24, 32, 40, 48, 56, 64, 72]) {
        const K = bls.length; const M = Array.from({ length: K }, () => new Float64Array(K)); const v = new Float64Array(K);
        for (let y = yA; y < yB; y += 2) for (let x = 0; x < N; x += 2) { const i = y * N + x; if (anyMask[i]) continue; const ys = y - dy; if (ys < 0) continue; const m = bls.map((b) => b[ys * N + x] / 255); for (let a = 0; a < K; a++) { v[a] += m[a] * D[i]; for (let b = 0; b < K; b++) M[a][b] += m[a] * m[b]; } }
        // solve M a = v (Gaussian elimination, K ≤ 4)
        const A = M.map((r, i) => [...r, v[i]]); for (let c = 0; c < K; c++) { let p = c; for (let r = c + 1; r < K; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; if (Math.abs(A[c][c]) < 1e-9) continue; for (let r = 0; r < K; r++) { if (r === c) continue; const fct = A[r][c] / A[c][c]; for (let k = c; k <= K; k++) A[r][k] -= fct * A[c][k]; } }
        const coef = A.map((r, i) => (Math.abs(r[i]) < 1e-9 ? 0 : Math.max(0, r[K] / r[i])));
        let e = 0; for (let y = yA; y < yB; y += 2) for (let x = 0; x < N; x += 2) { const i = y * N + x; if (anyMask[i]) continue; const ys = y - dy; let m = 0; if (ys >= 0) for (let k = 0; k < K; k++) m += coef[k] * bls[k][ys * N + x] / 255; const d = D[i] - m; e += d * d; }
        if (!fit || e < fit.e) fit = { sigma, dy, coef, e };
      }
    }
    // diagnostic at the lowest footprint's bottom edge
    const low = collected.reduce((p, c) => (c.y1 > p.y1 ? c : p)); let cx = 0, cn = 0; for (let x = 0; x < N; x++) if (low.mask[low.y1 * N + x]) { cx += x; cn++; } cx = cn ? Math.round(cx / cn) : 512;
    let peakD = 0; for (let d = 1; d < 90 && low.y1 + d < N; d++) peakD = Math.max(peakD, D[(low.y1 + d) * N + cx]);
    const bls = []; for (const sil of sils) bls.push(await blurred(sil, fit.sigma));
    let peakM = 0; for (let d = 1; d < 90 && low.y1 + d < N; d++) { const ys = low.y1 + d - fit.dy; if (ys < 0) continue; let m = 0; for (let k = 0; k < bls.length; k++) m += fit.coef[k] * bls[k][ys * N + cx] / 255; peakM = Math.max(peakM, m); }
    console.log(`shadow: dy ${fit.dy} σ ${fit.sigma} opacities ${fit.coef.map((c) => (c / 255).toFixed(3)).join(" ")} (peak below the lowest layer: measured ${peakD.toFixed(1)}, model ${peakM.toFixed(1)})`);
  }
  collected.forEach((c, k) => {
    const shadow = fit && fit.coef[k] > 0.002 * 255 ? { dy: fit.dy, sigma: fit.sigma, opacity: +(fit.coef[k] / 255).toFixed(3) } : null;
    out.push({ group: c.gi, files: c.files, rows: [c.y0, c.y1], translucency: c.L.translucency, shadowOpacity: c.L.shadowOpacity, alpha: c.alpha.map((v) => +v.toFixed(3)), shadow });
    console.log(`${c.files.join("+").padEnd(20)} rows ${c.y0}-${c.y1} area ${(c.area / (N * N) * 100).toFixed(1)}%  T ${c.L.translucency}  α ${c.alpha.map((v) => v.toFixed(2)).join(" ")}  shadow ${shadow ? `dy ${shadow.dy} σ ${shadow.sigma} a ${shadow.opacity}` : "none"}`);
  });
  const jsonOut = flag("--json"); if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ slug: only, groups: out }, null, 2) + "\n");
}

async function apply() {
  // jsdom is @podlink/icons' dev dependency; resolve it from there when the
  // workspace root does not hoist it.
  const { JSDOM } = await import("jsdom").catch(() => import(join(root, "packages/icons/node_modules/jsdom/lib/api.js")));
  const m = JSON.parse(readFileSync(flag("--measure"), "utf8"));
  const maps = Object.fromEntries(flags("--map").map((s) => { const i = s.indexOf("="); return [s.slice(0, i), s.slice(i + 1)]; }));
  const file = join(platform.dir, "icon.svg");
  const src = readFileSync(file, "utf8");
  if (src.includes("-material-")) { console.error(`${file} already carries the material`); process.exit(1); }
  const dom = new JSDOM(src, { contentType: "image/svg+xml" });
  const d = dom.window.document; const svg = d.documentElement; const NS = "http://www.w3.org/2000/svg";
  // Select every layer's elements BEFORE touching the tree: an inserted
  // <defs> would shift :first-child and the like.
  const selected = m.groups.map((G) => G.files.flatMap((file) => { const sel = maps[file]; if (!sel) { console.error(`no --map for ${file}`); process.exit(2); } const els = [...svg.querySelectorAll(sel)]; if (!els.length) { console.error(`selector matched nothing: ${sel}`); process.exit(2); } return els; }));
  let defs = svg.querySelector("defs"); if (!defs) { defs = d.createElementNS(NS, "defs"); svg.insertBefore(defs, svg.firstChild); }
  const pid = platform.id; let n = 0; const lastLifted = new Map();
  // Wrap in the FLAT's paint order (document order of each group's first
  // element), not the bundle's group order — the lifted groups are inserted
  // one after another and must keep what the flat painted on top on top.
  const order = m.groups.map((L, k) => k).sort((a, b) => { const p = selected[a][0], q = selected[b][0]; return p === q ? 0 : (p.compareDocumentPosition(q) & 4 ? -1 : 1); });
  for (const k of order) { const L = m.groups[k];
    // keep the elements' own document order inside the wrapped group (paint order)
    const els = [...selected[k]].sort((p, q) => (p.compareDocumentPosition(q) & 4 ? -1 : 1));
    n++; const id = `${pid}-material-${n}`;
    const y0 = L.rows[0] / 32, y1 = L.rows[1] / 32;
    // mask: white rect under a vertical gradient of 1 − α(decile)
    const grad = d.createElementNS(NS, "linearGradient"); grad.setAttribute("id", `${id}-fade`); grad.setAttribute("gradientUnits", "userSpaceOnUse");
    grad.setAttribute("x1", "0"); grad.setAttribute("x2", "0"); grad.setAttribute("y1", y0.toFixed(4)); grad.setAttribute("y2", y1.toFixed(4));
    L.alpha.forEach((a, i) => { const st = d.createElementNS(NS, "stop"); st.setAttribute("offset", ((i + 0.5) / L.alpha.length).toFixed(3)); st.setAttribute("stop-color", "#fff"); st.setAttribute("stop-opacity", (1 - a).toFixed(3)); grad.appendChild(st); });
    const mask = d.createElementNS(NS, "mask"); mask.setAttribute("id", `${id}-mask`); mask.setAttribute("maskUnits", "userSpaceOnUse"); mask.setAttribute("x", "0"); mask.setAttribute("y", "0"); mask.setAttribute("width", "32"); mask.setAttribute("height", "32");
    const rect = d.createElementNS(NS, "rect"); rect.setAttribute("width", "32"); rect.setAttribute("height", "32"); rect.setAttribute("fill", `url(#${id}-fade)`); mask.appendChild(rect);
    defs.appendChild(grad); defs.appendChild(mask);
    // shadow-only filter: blurred, offset alpha of the source, flooded black at the fitted opacity — the source itself is NOT merged back
    let shadowUse = null;
    if (L.shadow) {
      const f = d.createElementNS(NS, "filter"); f.setAttribute("id", `${id}-shadow`); f.setAttribute("filterUnits", "userSpaceOnUse"); f.setAttribute("x", "-8"); f.setAttribute("y", "-8"); f.setAttribute("width", "48"); f.setAttribute("height", "48");
      const blur = d.createElementNS(NS, "feGaussianBlur"); blur.setAttribute("in", "SourceAlpha"); blur.setAttribute("stdDeviation", (L.shadow.sigma / 32).toFixed(4)); blur.setAttribute("result", "b");
      const off = d.createElementNS(NS, "feOffset"); off.setAttribute("in", "b"); off.setAttribute("dy", (L.shadow.dy / 32).toFixed(4)); off.setAttribute("result", "o");
      const flood = d.createElementNS(NS, "feFlood"); flood.setAttribute("flood-color", "#000"); flood.setAttribute("flood-opacity", String(L.shadow.opacity)); flood.setAttribute("result", "c");
      const comp = d.createElementNS(NS, "feComposite"); comp.setAttribute("in", "c"); comp.setAttribute("in2", "o"); comp.setAttribute("operator", "in");
      f.append(blur, off, flood, comp); defs.appendChild(f);
      shadowUse = d.createElementNS(NS, "use"); shadowUse.setAttribute("href", `#${id}-layer`); shadowUse.setAttribute("filter", `url(#${id}-shadow)`);
    }
    const layer = d.createElementNS(NS, "g"); layer.setAttribute("id", `${id}-layer`);
    const masked = d.createElementNS(NS, "g"); masked.setAttribute("mask", `url(#${id}-mask)`); masked.appendChild(layer);
    // The mask and the shadow filter are authored in ROOT units. An element
    // nested under transformed groups would read them in its own user
    // space (the userSpaceOnUse trap), so nested elements are LIFTED: the
    // masked group is placed at the top level, right after the element's
    // top-level ancestor, and the elements sit under a replica of their
    // ancestor transforms. Paint order is kept: each lifted group goes
    // after the previous one, so the original group's remaining content
    // paints first and the lifted layers follow in document order.
    const anchor = els[0];
    // ancestors from the top-level element down to the parent, each once
    const chain = []; let top = anchor;
    while (top.parentNode && top.parentNode !== svg) { top = top.parentNode; chain.unshift(top); }
    let container = layer;
    if (top !== anchor) {
      for (const anc of chain) { const rep = d.createElementNS(NS, "g"); for (const at of ["transform", "fill", "fill-rule", "clip-rule", "opacity"]) if (anc.hasAttribute(at)) rep.setAttribute(at, anc.getAttribute(at)); container.appendChild(rep); container = rep; }
    }
    const after = top !== anchor ? (lastLifted.get(top) ?? top) : null;
    if (after) { if (shadowUse) after.parentNode.insertBefore(shadowUse, after.nextSibling); after.parentNode.insertBefore(masked, shadowUse ? shadowUse.nextSibling : after.nextSibling); lastLifted.set(top, masked); }
    else { const parent = anchor.parentNode; if (shadowUse) parent.insertBefore(shadowUse, anchor); parent.insertBefore(masked, anchor); }
    for (const el of els) container.appendChild(el);
    console.log(`${L.files.join("+")}: ${els.length} element(s) → ${id} (mask${L.shadow ? " + shadow" : ""})`);
  }
  for (const g of [...svg.childNodes]) if (g.nodeName === "g" && !g.hasAttribute("id") && ![...g.childNodes].some((c) => c.nodeType === 1)) g.remove();
  const out = new dom.window.XMLSerializer().serializeToString(d);
  writeFileSync(file, out.endsWith("\n") ? out : out + "\n");
  console.log(`wrote ${file}`);
}

if (cmd === "measure") await measure();
else if (cmd === "apply") await apply();
else { console.error("usage: measure|apply --only <slug> …"); process.exit(2); }
