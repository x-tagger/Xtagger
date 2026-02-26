/**
 * @file playwright.config.ts
 * @description Playwright configuration for Chrome extension E2E testing.
 *
 * Extension testing requires:
 *   1. Building the extension first (dist/ directory must exist)
 *   2. Using launchPersistentContext with --load-extension flags
 *   3. A user data dir (Playwright creates a temp one automatically)
 *
 * We test against a local mock page for feed injection tests (no real X.com
 * credentials required). Import/export and popup tests use the extension popup
 * directly via chrome-extension:// URLs.
 */

import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';

const DIST_DIR = resolve(__dirname, 'dist');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env['CI'] ? 2 : 0,
  workers: 1, // Extensions must run single-threaded (persistent context limitation)
  reporter: process.env['CI']
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'playwright-report', open: 'on-failure' }]],

  use: {
    // All E2E tests use the chromium project below
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium-extension',
      use: {
        ...devices['Desktop Chrome'],
        // Extension loading happens in the fixture — see tests/e2e/fixtures.ts
        // We use launchPersistentContext rather than the default browser launch
      },
    },
  ],

  // Build extension before running tests
  globalSetup: './tests/e2e/global-setup.ts',

  // Where to find the built extension
  metadata: {
    distDir: DIST_DIR,
  },
});
