import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The app calls the Cadence service directly at http://127.0.0.1:8320
// (src/api.ts; override with VITE_API_URL). The service allows any origin.
export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1", port: 4173 },
});
