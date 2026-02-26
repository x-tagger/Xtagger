import { defineConfig } from 'vite';
import { resolve } from 'path';

const aliases = {
  '@core':      resolve(__dirname, 'src/core'),
  '@adapters':  resolve(__dirname, 'src/adapters'),
  '@platforms': resolve(__dirname, 'src/platforms'),
  '@ui':        resolve(__dirname, 'src/ui'),
  '@shared':    resolve(__dirname, 'src/shared'),
};

export default defineConfig({
  resolve: { alias: aliases },

  build: {
    target:       'chrome120',
    outDir:       'dist',
    minify:       true,
    copyPublicDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        popup:      resolve(__dirname, 'src/ui/popup/index.html'),
        onboarding: resolve(__dirname, 'src/ui/onboarding/index.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },

  publicDir: 'public',

  test: {
    environment: 'jsdom',
    globals: true,
    alias: aliases,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.types.ts', 'src/**/index.ts', 'src/ui/**'],
      thresholds: { lines: 70, functions: 70, branches: 65 },
    },
  },
});
