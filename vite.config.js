import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  plugins: [react()],
  // CARTO_API_KEY is a public client tile token; NIKE_* stays server-only.
  envPrefix: ['VITE_', 'CARTO_'],
})
