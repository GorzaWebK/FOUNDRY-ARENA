import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths, so the build works from any sub-path (e.g. GitHub Pages)
  base: './',
  server: { port: 5173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
