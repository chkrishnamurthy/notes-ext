import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

/**
 * A separate build for the content script.
 *
 * It cannot share the main build: a script injected with
 * `scripting.executeScript` is not a module, so it must be a single IIFE with
 * no imports and no code splitting. Its stylesheet is inlined into the bundle
 * by the `?inline` imports, because a content script cannot fetch its own CSS
 * under `connect-src 'none'`.
 */
export default defineConfig({
  root: 'src',
  publicDir: false,
  plugins: [react(), tailwindcss()],
  define: {
    // React reads this; without it the injected bundle runs in dev mode.
    'process.env.NODE_ENV': '"production"',
  },
  build: {
    outDir: '../dist',
    // The main build runs first and owns the directory.
    emptyOutDir: false,
    sourcemap: true,
    target: 'chrome141',
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(rootDir, 'src/content/overlay.tsx'),
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'content.js',
        // Nothing should be emitted beside it; the CSS is inlined.
        assetFileNames: 'assets/content-[hash][extname]',
      },
    },
  },
});
