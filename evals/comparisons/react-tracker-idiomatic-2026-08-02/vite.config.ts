import { createReadStream, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const FIXTURE = fileURLToPath(new URL("issues.json", import.meta.url));

/**
 * The benchmark ships `issues.json` at the project root. Rather than keep a
 * second copy under `public/`, serve it from there in dev and emit it into the
 * bundle at build time — one file, one source of truth.
 */
function fixture(): Plugin {
  return {
    name: "tracker-fixture",
    configureServer(server) {
      server.middlewares.use("/issues.json", (_request, response) => {
        response.setHeader("content-type", "application/json");
        createReadStream(FIXTURE).pipe(response);
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "issues.json", source: readFileSync(FIXTURE) });
    },
  };
}

export default defineConfig({
  plugins: [react(), fixture()],
  server: { port: 5174, strictPort: true },
  preview: { port: 5175, strictPort: true },
  build: { target: "es2022" },
});
