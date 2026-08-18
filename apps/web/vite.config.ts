import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Matches tsconfig "@/*": ["./*"] — components/ and lib/ live at the
    // package root (ported verbatim from the Next app).
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)).slice(0, -1) },
  },
  server: { port: 4173, strictPort: true },
});
