/**
 * Builds content.js as a self-contained IIFE.
 * No runtime imports — everything is inlined into one file.
 * This is required because Chrome content scripts cannot reliably
 * load extension chunks via ES module import.
 */
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@core':      resolve(__dirname, 'src/core'),
      '@adapters':  resolve(__dirname, 'src/adapters'),
      '@platforms': resolve(__dirname, 'src/platforms'),
      '@ui':        resolve(__dirname, 'src/ui'),
      '@shared':    resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    target:        'chrome120',
    outDir:        'dist',
    emptyOutDir:   false,
    minify:        true,
    copyPublicDir: false,
    rollupOptions: {
      input: resolve(__dirname, 'src/ui/content/index.ts'),
      output: {
        format:               'iife',
        inlineDynamicImports: true,
        entryFileNames:       'content.js',
      },
    },
  },
});
