import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The service's session cookie is SameSite=Lax on 127.0.0.1, so the app must be
// served from 127.0.0.1 too (not localhost) for the cookie to travel.
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
})
