import { defineConfig } from 'vitest/config';
import { resolve }       from 'path';

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
  test: {
    globals:     true,
    environment: 'jsdom',
    include:     ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    exclude:     ['tests/e2e/**'],  // E2E runs separately via Playwright
    setupFiles:  [],
    coverage: {
      provider:  'v8',
      reporter:  ['text', 'json', 'lcov', 'html'],
      include:   ['src/core/**', 'src/platforms/**', 'src/ui/**'],
      exclude:   [
        'src/core/ports/**',      // Interfaces — no logic
        'src/**/*.d.ts',
      ],
      thresholds: {
        lines:     75,
        functions: 75,
        branches:  65,
      },
    },
  },
});
