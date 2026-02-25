/**
 * @file global-setup.ts
 * @description Playwright global setup — builds the extension before tests run.
 * Also installs Playwright browsers if not already present.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export default async function globalSetup(): Promise<void> {
  const distDir = resolve(__dirname, '../../dist');

  // Build extension if dist doesn't exist or if source is newer
  if (!existsSync(distDir)) {
    console.log('[E2E setup] Building extension...');
    execSync('pnpm run build', {
      cwd: resolve(__dirname, '../..'),
      stdio: 'inherit',
    });
    console.log('[E2E setup] Build complete');
  } else {
    console.log('[E2E setup] Using existing dist build');
  }
}
