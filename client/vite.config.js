import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies API calls and the websocket to the backend, so the
// frontend is always same-origin and the YouTube key stays server-side.
//
//   • npm run dev            → proxies to the Express server on :3001
//   • npm run dev:worker     → proxies to the Cloudflare Worker on :8787
//                               (set VITE_PROXY_TARGET=http://127.0.0.1:8787)
const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // reachable from phones on the same Wi-Fi
    proxy: {
      '/api': { target: proxyTarget, changeOrigin: true },
      '/socket.io': { target: proxyTarget, ws: true },
      // Cloudflare Workers realtime transport
      '/ws': { target: proxyTarget, ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
