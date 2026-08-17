// Render a recipe to PNG:  node tools/render.mjs <engine-dir> <recipe.mjs> <out.png> [size] [--p3]
// --p3 keeps the raw Display-P3-coded recipe space (what ictool ground
// truth decodes to) — required by the calibration/scoring loop. Default
// output is sRGB-converted, matching what browsers should display.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
const args = process.argv.slice(2);
const p3 = args.includes("--p3");
const [engDir, recipePath, outPath, size] = args.filter((a) => a !== "--p3");
const { createLiquidRenderer, encodePng } = await import(resolve(engDir, "engine.mjs"));
const { recipe } = await import(resolve(recipePath));
const R = createLiquidRenderer(recipe);
const t0 = Date.now();
const r = await R.render({
  size: size ? parseInt(size, 10) : 1024,
  colorSpace: p3 ? "display-p3" : "srgb",
});
console.log(`rendered ${r.width}px in ${Date.now() - t0} ms`);
writeFileSync(outPath, await encodePng(r));
