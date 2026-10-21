// Opt-in geometric fit for native watchOS foreground layers. Coordinates in
// Icon Composer's position model are points on a 1024-point canvas.
import { join } from "node:path";
import sharp from "sharp";

export function validateSafeArea(config) {
  if (!config || !Number.isFinite(config.inset) || config.inset <= 0 || config.inset >= 0.5 ||
      !Array.isArray(config.layers) || !config.layers.length ||
      config.layers.some((name) => typeof name !== "string" || !name) ||
      new Set(config.layers).size !== config.layers.length)
    throw new Error("circleSafeArea requires inset between 0 and 0.5 and unique foreground layer names");
}

// Measure ink, not its rectangular bounds. Include the full area of every
// nontransparent pixel so antialiasing never underestimates the radius.
export function inkRadius(data, width, height, sourceWidth, sourceHeight, scale, translation) {
  const dx = sourceWidth * scale / width;
  const dy = sourceHeight * scale / height;
  let radius = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!data[y * width + x]) continue;
    const px = (x + 0.5 - width / 2) * dx + translation[0];
    const py = (y + 0.5 - height / 2) * dy + translation[1];
    radius = Math.max(radius, Math.hypot(Math.abs(px) + dx / 2, Math.abs(py) + dy / 2));
  }
  return radius;
}

export async function fitCircleSafeArea(doc, bundlePath, config) {
  validateSafeArea(config);
  const layers = config.layers.map((name) => {
    const matches = doc.groups.flatMap((g) => g.layers ?? []).filter((l) => l.name === name);
    if (matches.length !== 1) throw new Error(`Expected one safe-area foreground layer named ${name}`);
    const layer = matches[0];
    // These need their own platform/appearance-aware measurement, not a guess.
    if (!layer["image-name"]?.endsWith(".svg") || layer["image-name-specializations"] ||
        layer["position-specializations"] || !Number.isFinite(layer.position?.scale) || layer.position.scale <= 0 ||
        Object.keys(layer.position).some((key) => !["scale", "translation-in-points"].includes(key)))
      throw new Error(`Safe-area layer ${name} needs a single SVG with uniform scale and translation`);
    const offset = layer.position["translation-in-points"] ?? [0, 0];
    if (offset.length !== 2 || !offset.every(Number.isFinite)) throw new Error(`Invalid position for ${name}`);
    return layer;
  });
  let radius = 0;
  for (const layer of layers) {
    const file = join(bundlePath, "Assets", layer["image-name"]);
    const metadata = await sharp(file).metadata();
    // Render vectors at high resolution before measuring, independent of their
    // original 32- or 256-unit SVG coordinate system.
    const density = 72 * 2048 / Math.max(metadata.width, metadata.height);
    const { data, info } = await sharp(file, { density }).resize(2048, 2048, { fit: "inside" })
      .ensureAlpha().extractChannel("alpha").raw().toBuffer({ resolveWithObject: true });
    radius = Math.max(radius, inkRadius(data, info.width, info.height, metadata.width, metadata.height,
      layer.position.scale, layer.position["translation-in-points"] ?? [0, 0]));
  }
  if (!radius) throw new Error("Safe-area foreground is empty");
  const safeRadius = 1024 * (0.5 - config.inset);
  const scale = Math.min(1, safeRadius / radius);
  for (const layer of layers) {
    layer.position.scale *= scale;
    layer.position["translation-in-points"] = (layer.position["translation-in-points"] ?? [0, 0]).map((v) => v * scale);
  }
  return { radius, safeRadius, scale };
}
