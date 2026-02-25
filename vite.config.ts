import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@adapters': resolve(__dirname, 'src/adapters'),
      '@platforms': resolve(__dirname, 'src/platforms'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    target: 'chrome120',
    outDir: 'dist',
    rollupOptions: {
      input: {
        // Content script — must stay tiny (<50KB)
        content: resolve(__dirname, 'src/ui/content/index.ts'),
        // Service worker background script
        background: resolve(__dirname, 'src/adapters/chrome/background.ts'),
        // Extension popup
        popup: resolve(__dirname, 'src/ui/popup/index.html'),
      },
      output: {
        // No code splitting for extension scripts
        inlineDynamicImports: false,
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.types.ts', 'src/**/index.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});
