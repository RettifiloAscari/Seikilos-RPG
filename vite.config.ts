import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built game works from a subfolder (e.g. GitHub Pages).
  base: './',
  server: { open: true },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0, // keep sprite PNGs as real files, never inlined
  },
});
