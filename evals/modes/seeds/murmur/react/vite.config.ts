import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app fetches its history, media and live feed from its own origin
// (src/service/api.ts), so the dev server proxies them to the Murmur service.
const service = 'http://127.0.0.1:8330'
const proxy = {
  '/threads.json': service,
  '/schedule.json': service,
  '/photos': service,
  '/voice': service,
  '/avatars': service,
  '/live': { target: 'ws://127.0.0.1:8330', ws: true },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, proxy },
  preview: { host: '127.0.0.1', port: 4173, proxy },
})
