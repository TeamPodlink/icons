// Render a recipe to PNG:  node tools/render.mjs <engine-dir> <recipe.mjs> <out.png> [size]
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
const [engDir, recipePath, outPath, size] = process.argv.slice(2);
const { createLiquidRenderer, encodePng } = await import(resolve(engDir, "engine.mjs"));
const { recipe } = await import(resolve(recipePath));
const R = createLiquidRenderer(recipe);
const t0 = Date.now();
const r = await R.render({ size: size ? parseInt(size, 10) : 1024 });
console.log(`rendered ${r.width}px in ${Date.now() - t0} ms`);
writeFileSync(outPath, await encodePng(r));
