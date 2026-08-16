import { defineConfig } from 'vite';

/**
 * Declared locally rather than by adding @types/node. The tsconfig covers this
 * file and `src` together, and game code has no business seeing Node globals.
 */
declare const process: { env: Record<string, string | undefined> };

/**
 * Set by `npm run build:single`, which produces one self-contained HTML file
 * that runs by double-clicking it. That needs a classic script rather than an
 * ES module, because browsers refuse to load modules over `file://`.
 */
const singleFile = process.env.SINGLE_FILE === '1';

export default defineConfig({
  // Relative base so the built game works from a subfolder (e.g. GitHub Pages).
  base: './',
  server: { open: true },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0, // keep sprite PNGs as real files, never inlined
    rollupOptions: singleFile
      ? { output: { format: 'iife', inlineDynamicImports: true, entryFileNames: 'game.js' } }
      : {},
  },
});
