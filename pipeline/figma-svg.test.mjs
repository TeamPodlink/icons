import { test } from "node:test";
import assert from "node:assert/strict";
import { SceneGraph, FigmaAPI, exportFigFile, parseFigFile, initCanvasKit, SkiaRenderer, renderNodesToImage } from "@open-pencil/core";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { importIconSVG } from "./figma-svg.mjs";

// Parsed .fig files reuse node IDs. Use a renderer per document so cached
// paints from another fixture cannot be mistaken for this document's nodes.
async function renderFixture(graph, page, nodes, options) {
  const ck = await initCanvasKit();
  const renderer = new SkiaRenderer(ck, ck.MakeSurface(1, 1));
  renderer.viewportWidth = 1; renderer.viewportHeight = 1; renderer.dpr = 1;
  try {
    await renderer.loadFonts();
    await renderer.prepareForExport(graph, page, nodes);
    return renderNodesToImage(ck, renderer, graph, page, nodes, { format: "PNG", ...options });
  } finally { renderer.destroy(); }
}

for (const id of ["spreaker", "podcastparrot"]) test(`${id}: outlined strokes retain source appearance through .fig`, async () => {
  const source = readFileSync(new URL(`../platforms/${id}/icon.svg`, import.meta.url), "utf8");
  const graph = new SceneGraph();
  const figma = new FigmaAPI(graph);
  const report = { masks: 0, filters: 0, filterApproximations: [] };
  const component = figma.createComponent();
  component.name = "Fixture"; component.resize(32, 32); component.fills = []; component.clipsContent = true;
  component.appendChild(await importIconSVG(figma, source, report));
  const bytes = await exportFigFile(graph);
  const parsed = await parseFigFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  assert.ok(report.outlinedStrokes > 0);
  assert.ok(![...parsed.nodes.values()].some((n) => n.type === "VECTOR" && n.strokes.length));
  const node = [...parsed.nodes.values()].find((n) => n.name === "Fixture");
  const page = [...parsed.nodes.values()].find((n) => n.type === "CANVAS" && !n.internalOnly);
  const rendered = await renderFixture(parsed, page.id, [node.id], { scale: 8, trimTransparent: false });
  const actual = await sharp(rendered).flatten({ background: "white" }).raw().toBuffer();
  const expected = await sharp(Buffer.from(source), { density: 576 }).flatten({ background: "white" }).raw().toBuffer();
  assert.equal(actual.length, expected.length);
  const rmse = Math.sqrt(actual.reduce((sum, value, i) => sum + (value - expected[i]) ** 2, 0) / actual.length);
  assert.ok(rmse < 2.5, `source/export pixel RMSE ${rmse.toFixed(3)} exceeds 2.5/255`);
});

test("nested SVG masks and gradients survive .fig serialization without a white viewport", async () => {
  const graph = new SceneGraph();
  const figma = new FigmaAPI(graph);
  const report = { masks: 0, filters: 0, filterApproximations: [] };
  const artwork = await importIconSVG(figma, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <mask id="circle" maskUnits="userSpaceOnUse" style="mask-type:alpha"><circle cx="16" cy="16" r="16" fill="white"/></mask>
    <g mask="url(#circle)"><svg width="32" height="32" viewBox="0 0 32 32"><defs>
      <linearGradient id="paint"><stop stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient>
      <mask id="half" maskUnits="userSpaceOnUse"><rect width="16" height="32" fill="white"/><rect x="16" width="16" height="32" fill="black"/></mask>
    </defs><g mask="url(#half)"><rect width="32" height="32" fill="url(#paint)"/></g></svg></g>
  </svg>`, report);
  artwork.name = "Fixture";
  const bytes = await exportFigFile(graph);
  const parsed = await parseFigFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const node = [...parsed.nodes.values()].find((n) => n.name === "Fixture");
  const page = [...parsed.nodes.values()].find((n) => n.type === "CANVAS" && !n.internalOnly);
  const image = await renderFixture(parsed, page.id, [node.id], { scale: 4, trimTransparent: false });
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
  assert.equal(report.masks, 2);
  assert.equal(pixel(0, 0)[3], 0, "circle must keep corners transparent");
  assert.equal(pixel(96, 64)[3], 0, "black luminance mask must hide right half");
  const [r, g, b, a] = pixel(32, 64);
  assert.ok(r > b && b > 20 && g < 5 && a > 250, "gradient must remain colored and opaque within mask");
  assert.ok([...parsed.nodes.values()].some((n) => n.fills.some((f) => f.type === "GRADIENT_LINEAR")));
  assert.ok(![...parsed.nodes.values()].some((n) => n.fills.some((f) => f.type === "IMAGE")));
});
