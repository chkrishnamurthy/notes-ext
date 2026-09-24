import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

/**
 * A fourth build, for reading a selection as rich text when it is saved.
 *
 * Injected only on a "Save selection" click, and only into that page. Like the
 * launcher, it is kept apart from the panel so that a capture puts a few
 * kilobytes on the page rather than React and the editor.
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
      input: resolve(rootDir, 'src/content/capture.ts'),
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'capture.js',
        assetFileNames: 'assets/capture-[hash][extname]',
      },
    },
  },
});
