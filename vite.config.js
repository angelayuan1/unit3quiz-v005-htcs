import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Use relative asset paths so the built site works when served from `dist/`
  // (e.g. VSCode Live Server opening `dist/index.html`) and on Firebase Hosting.
  base: './',
  plugins: [react()],
})
