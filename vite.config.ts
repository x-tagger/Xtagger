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
    target: 'chrome120',
    outDir: 'dist',
    minify: true,
    rollupOptions: {
      input: {
        content:     resolve(__dirname, 'src/ui/content/index.ts'),
        background:  resolve(__dirname, 'src/background.ts'),
        popup:       resolve(__dirname, 'src/ui/popup/index.html'),
        onboarding:  resolve(__dirname, 'public/onboarding.html'),
      },
      output: {
        inlineDynamicImports: false,
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    // Copy manifest and selector configs to dist
    copyPublicDir: true,
  },
  publicDir: 'public',
  test: {
    environment: 'jsdom',
    globals: true,
    alias: {
      '@core':      resolve(__dirname, 'src/core'),
      '@adapters':  resolve(__dirname, 'src/adapters'),
      '@platforms': resolve(__dirname, 'src/platforms'),
      '@ui':        resolve(__dirname, 'src/ui'),
      '@shared':    resolve(__dirname, 'src/shared'),
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.types.ts', 'src/**/index.ts', 'src/ui/**'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
      },
    },
  },
});
