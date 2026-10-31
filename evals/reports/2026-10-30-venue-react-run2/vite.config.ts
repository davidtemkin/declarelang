import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The service's session cookie is SameSite=Lax, so the app must be served from
// 127.0.0.1 (the same site as the service), not localhost.
export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5178 },
  preview: { host: "127.0.0.1", port: 4173 },
});
