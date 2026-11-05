import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  // A desktop app served locally: the shared vendor chunk (React, Radix, Motion) is larger than the web default allows.
  build: { chunkSizeWarningLimit: 700 },
})
