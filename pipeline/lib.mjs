import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const PLATFORMS_DIR = join(root, "platforms");

/** Read every platform folder: { id, dir, meta }. */
export function readPlatforms() {
  return readdirSync(PLATFORMS_DIR)
    .filter((name) => {
      if (name.startsWith(".") || name.startsWith("_")) return false;
      return existsSync(join(PLATFORMS_DIR, name, "meta.json"));
    })
    .sort()
    .map((id) => {
      const dir = join(PLATFORMS_DIR, id);
      return { id, dir, meta: JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) };
    });
}

/** Every liquid glass bundle across all platforms, flattened. */
export function readBundles() {
  return readPlatforms().flatMap(({ id, dir, meta }) =>
    (meta.liquidGlass?.bundles ?? []).map((b) => ({
      platformId: id,
      platformDir: dir,
      platformMeta: meta,
      ...b,
      bundlePath: join(dir, b.file),
    }))
  );
}
