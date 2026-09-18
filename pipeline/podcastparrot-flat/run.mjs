// Rebuild platforms/podcastparrot/{icon,badge}.svg from supplied.svg + the bundle raster. Byte-stable (Chrome renders are deterministic).
//   node pipeline/podcastparrot-flat/run.mjs            (work dir: $WORK or /tmp/podcastparrot-flat-work)
import { execFileSync } from "node:child_process"; import { rmSync, copyFileSync } from "node:fs"; import { fileURLToPath } from "node:url"; import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url)); const WORK = process.env.WORK ?? "/tmp/podcastparrot-flat-work";
rmSync(WORK, { recursive: true, force: true });
const run = (script, ...args) => execFileSync(process.execPath, [join(here, script), ...args], { stdio: "inherit", env: { ...process.env, WORK } });
run("masks.mjs");            // identity masks of every supplied element
run("segment.mjs");          // colour classes of the raster
run("register.mjs");         // per-feature translate+scale, eye circles -> elements.json
run("masks.mjs");            // masks again, now registered
run("fit.mjs", "stage2b");   // base fills refit
run("overlays.mjs", "stage2b"); // translucent overlays refit -> stage3 (chest accents 18/19 excluded: too prominent on the flat)
run("compose.mjs", "stage3"); // 32-unit icon.svg + badge.svg
const out = join(here, "..", "..", "platforms", "podcastparrot");
copyFileSync(join(WORK, "icon.svg"), join(out, "icon.svg")); copyFileSync(join(WORK, "badge.svg"), join(out, "badge.svg"));
console.log("wrote", out);
