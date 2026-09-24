import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The extension builds to `dist/`, which is the folder Chrome loads.
 *
 * Entry filenames are fixed rather than hashed because manifest.json refers to
 * them by name. Shared chunks and assets keep their hashes.
 */
const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: 'src',
  publicDir: 'public',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // Extension pages are served from the extension origin, never inlined into
    // a page, so a source map is safe and makes a store review easier.
    sourcemap: true,
    target: 'chrome141',
    rollupOptions: {
      input: {
        sidepanel: resolve(rootDir, 'src/sidepanel.html'),
        // The same panel, framed inside the in-page overlay.
        overlay: resolve(rootDir, 'src/overlay.html'),
        // The same panel again, as the toolbar popup on Chrome's own pages.
        popup: resolve(rootDir, 'src/popup.html'),
        options: resolve(rootDir, 'src/options.html'),
        'service-worker': resolve(rootDir, 'src/background/service-worker.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
