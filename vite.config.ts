import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: 'assets',
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
