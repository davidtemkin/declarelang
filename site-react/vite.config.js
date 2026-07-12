import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served by the Declare dev server under /site-react/ (see server/index.mjs),
// so every asset URL is prefixed to load correctly on that subpath. The compile
// endpoint (POST /compile) and the runtime (/runtime/dist/index.js) live on the
// SAME origin, so the live previews reach them with root-absolute URLs.
export default defineConfig({
  base: "/site-react/",
  plugins: [react()],
  server: {
    port: 5232,
    // Dev convenience: forward the two same-origin dependencies to the Declare
    // dev server so `vite dev` can compile + render previews too. In production
    // they are already same-origin (served by that server under /site-react/).
    proxy: {
      "/compile": "http://127.0.0.1:8210",
      "/runtime": "http://127.0.0.1:8210",
    },
  },
});
