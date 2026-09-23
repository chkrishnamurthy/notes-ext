import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

/**
 * A third build, for the quick-open button alone.
 *
 * It is separate from the overlay build on purpose. This script is registered
 * against every site the user has allowed, so it runs on every page load —
 * which makes its size the one number that matters. Bundling it with the panel
 * would put React, TipTap and the whole stylesheet on every page for the sake
 * of a 34-pixel button. Kept apart, it is a couple of kilobytes.
 *
 * No React or Tailwind plugin here, because it deliberately uses neither.
 */
export default defineConfig({
  root: 'src',
  publicDir: false,
  build: {
    outDir: '../dist',
    // The main build runs first and owns the directory.
    emptyOutDir: false,
    sourcemap: true,
    target: 'chrome141',
    rollupOptions: {
      input: resolve(rootDir, 'src/content/launcher.ts'),
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'launcher.js',
        assetFileNames: 'assets/launcher-[hash][extname]',
      },
    },
  },
});
