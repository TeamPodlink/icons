// refraction-engine — procedural Liquid Glass rendering (research layer).
// Recipes are keyed by bundle slug (see platforms/*/meta.json).

export { createLiquidRenderer, encodePng } from "./engine.mjs";

export const recipeSlugs = [
  "apple",
  "overcast",
  "podcastrepublic",
  "spotify",
];

export async function loadRecipe(slug) {
  if (!recipeSlugs.includes(slug))
    throw new Error(`No procedural recipe for bundle "${slug}"`);
  const mod = await import(`./recipes/${slug}.mjs`);
  return mod.recipe;
}

/** Render a recipe-backed bundle to a PNG data URI (memoized per slug). */
const rendererCache = new Map();
export async function renderBundleDataUri(slug, { size = 256 } = {}) {
  let renderer = rendererCache.get(slug);
  if (!renderer) {
    const { createLiquidRenderer } = await import("./engine.mjs");
    renderer = createLiquidRenderer(await loadRecipe(slug));
    rendererCache.set(slug, renderer);
  }
  return renderer.dataUri({ size });
}
