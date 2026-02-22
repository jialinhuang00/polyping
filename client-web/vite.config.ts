import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const certDir = path.resolve(__dirname, '.certs')
const hasCerts =
  fs.existsSync(path.join(certDir, 'localhost.pem')) &&
  fs.existsSync(path.join(certDir, 'localhost-key.pem'))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    https: hasCerts
      ? {
          cert: fs.readFileSync(path.join(certDir, 'localhost.pem')),
          key: fs.readFileSync(path.join(certDir, 'localhost-key.pem')),
        }
      : undefined,
    proxy: {
      '/rest': 'http://localhost:8080',
      '/sse': 'http://localhost:8080',
      '/ws': { target: 'http://localhost:8080', ws: true },
      '/poll': 'http://localhost:8080',
    },
  },
})
