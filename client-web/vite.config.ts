import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/rest': 'http://localhost:8080',
      '/sse': 'http://localhost:8080',
      '/ws': { target: 'http://localhost:8080', ws: true },
      '/poll': 'http://localhost:8080',
    },
  },
})
