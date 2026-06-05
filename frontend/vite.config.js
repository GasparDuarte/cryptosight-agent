import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The frontend runs on :5173 and proxies /api -> backend FastAPI on :8000,
// so there are no CORS issues in development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  build: {
    // recharts is ~550kB raw, but it lives in its own cached chunk (≈155kB gzipped)
    // and only the chart needs it — raise the warning ceiling so the build stays clean.
    chunkSizeWarningLimit: 700,
    // Split heavy vendors into their own cacheable chunks (faster repeat loads,
    // smaller main bundle, parallel download).
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          charts: ['recharts'],
          markdown: ['react-markdown'],
        },
      },
    },
  },
})
