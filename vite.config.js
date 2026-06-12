import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import 'dotenv/config'
import process from 'process';

const PORT = process.env.PORT || 3001;

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${PORT}`,
        changeOrigin: true
      },
      '/uploads': {
        target: `http://localhost:${PORT}`,
        changeOrigin: true
      }
    }
  }
})
