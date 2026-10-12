import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, the API and Socket.io are proxied so the browser only talks to :5173.
// In production, serve the built app and the API from the same origin (or set VITE_API_URL / VITE_SOCKET_URL).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false
      },
      '/socket.io': {
        target: 'http://127.0.0.1:5000',
        ws: true,
        changeOrigin: true
      }
    }
  }
})
