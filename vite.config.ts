import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // Runtime assets live in public/assets/, so they resolve identically in dev,
  // build and preview. Art sources, references and previews stay in art-source/.
  publicDir: 'public',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  server: {
    // Private-by-default bind: dev server is reachable only from this machine.
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
});
