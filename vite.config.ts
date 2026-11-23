import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'CLOSESIGNAL_')
  const target = env.CLOSESIGNAL_BACKEND_URL || 'http://127.0.0.1:4173'
  // Express checks the browser origin against the forwarded Host on write requests.
  const proxy = { target, changeOrigin: false }

  return {
    plugins: [react(), tailwind()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      fs: {
        allow: [
          fileURLToPath(new URL('.', import.meta.url)),
          fileURLToPath(new URL('../backend/shared', import.meta.url)),
        ],
      },
      proxy: {
        '/api': proxy,
      },
    },
  }
})
