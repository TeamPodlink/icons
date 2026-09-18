import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const webRoot = fileURLToPath(new URL(".", import.meta.url)).slice(0, -1);
const platformsDir = resolve(webRoot, "../../platforms");

/**
 * Dev-server-only maintainer convenience: the card context menu's "Open
 * in Finder" (icon-card.tsx, gated on import.meta.env.DEV) hits
 * GET /__reveal?platform=<id>&facet=glass|flat|badge[&slug=<bundle>] and
 * the source file for that facet is revealed in Finder (`open -R`).
 * `apply: "serve"` keeps it out of the production build entirely; the
 * platform id is validated against the id grammar so the path can only
 * land inside platforms/. macOS only — elsewhere the endpoint says so.
 */
function revealInFinder(): Plugin {
  return {
    name: "refraction-reveal-in-finder",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__reveal", (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const id = url.searchParams.get("platform") ?? "";
        const facet = url.searchParams.get("facet") ?? "glass";
        const slug = url.searchParams.get("slug");
        const fail = (code: number, msg: string) => {
          res.statusCode = code;
          res.end(msg);
        };
        if (process.platform !== "darwin") return fail(501, "Finder is macOS only");
        if (!/^[a-z0-9]+$/.test(id)) return fail(400, "bad platform id");
        const dir = join(platformsDir, id);
        if (!existsSync(join(dir, "meta.json"))) return fail(404, "unknown platform");
        let target = dir;
        if (facet === "glass") {
          const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
          const bundles: { slug: string; file: string }[] = meta.liquidGlass?.bundles ?? [];
          const b = bundles.find((x) => x.slug === slug) ?? bundles[0];
          if (b) target = join(dir, b.file);
        } else if (facet === "flat") target = join(dir, "icon.svg");
        else if (facet === "badge") target = join(dir, "badge.svg");
        if (!existsSync(target)) target = dir;
        execFile("open", ["-R", target], (err) => {
          if (err) return fail(500, String(err));
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), revealInFinder()],
  resolve: {
    // Matches tsconfig "@/*": ["./*"] — components/ and lib/ live at the
    // package root (ported verbatim from the Next app).
    alias: { "@": webRoot },
  },
  server: { port: 4173, strictPort: true },
});
