#!/usr/bin/env tsx
/**
 * @file package-extension.ts
 * @description Build and package XTagger for distribution.
 *
 * Steps:
 *   1. Clean dist/
 *   2. Run vite build (production)
 *   3. Validate required files are present
 *   4. Check bundle size budgets
 *   5. Create xtagger-v<version>.zip from dist/
 *   6. Write SHA-256 checksum file
 *
 * Usage:
 *   pnpm run package
 */

import { execSync }             from 'node:child_process';
import { existsSync, statSync, writeFileSync, rmSync, mkdirSync, readFileSync, createReadStream } from 'node:fs';
import { resolve, join }        from 'node:path';
import { createHash }           from 'node:crypto';

const ROOT    = resolve(import.meta.dirname, '..');
const DIST    = join(ROOT, 'dist');
const PKG     = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as { version: string };
const VERSION = PKG.version;
const ZIP     = join(ROOT, `xtagger-v${VERSION}.zip`);

const log   = (m: string): void => console.log(`[package] ${m}`);
const fail  = (m: string): never => { console.error(`[package] ❌ ${m}`); process.exit(1); };

// ─── Required files ───────────────────────────────────────────────────────────

const REQUIRED = [
  'manifest.json',
  'background.js',
  'content.js',
  'popup.html',
  'onboarding.html',
  'icons/icon-16.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
  'selector-configs/x.com.json',
];

// ─── Bundle size budgets (bytes) ──────────────────────────────────────────────

const BUDGETS: Record<string, number> = {
  'content.js':     51_200,   // 50 KB — strict (injected into every page load)
  'background.js': 204_800,   // 200 KB
};

// ─── 1. Clean ─────────────────────────────────────────────────────────────────

log(`Packaging XTagger v${VERSION}...`);
log('Cleaning dist/...');
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// ─── 2. Build ─────────────────────────────────────────────────────────────────

log('Building (production mode)...');
execSync('pnpm run build', { cwd: ROOT, stdio: 'inherit' });
log('Build complete.');

// ─── 3. Validate required files ───────────────────────────────────────────────

log('Validating build output...');
const missing = REQUIRED.filter(f => !existsSync(join(DIST, f)));
if (missing.length > 0) fail(`Missing required files:\n  ${missing.join('\n  ')}`);
log(`✅ All ${REQUIRED.length} required files present`);

// ─── 4. Bundle size check ─────────────────────────────────────────────────────

log('Checking bundle sizes...');
let anyOver = false;
for (const [file, budget] of Object.entries(BUDGETS)) {
  const path = join(DIST, file);
  if (!existsSync(path)) { log(`  ⚠️  ${file}: not found`); continue; }
  const size = statSync(path).size;
  const kb   = (size / 1024).toFixed(1);
  const budgetKb = (budget / 1024).toFixed(0);
  const ok   = size <= budget;
  log(`  ${ok ? '✅' : '❌'} ${file}: ${kb} KB / ${budgetKb} KB budget`);
  if (!ok) anyOver = true;
}
if (anyOver) fail('Bundle size budget exceeded. Optimise and retry.');

// ─── 5. Create zip ────────────────────────────────────────────────────────────

rmSync(ZIP, { force: true });
log(`Creating ${`xtagger-v${VERSION}.zip`}...`);
execSync(`cd "${DIST}" && zip -r "${ZIP}" .`, { stdio: 'inherit' });

// ─── 6. Checksum ──────────────────────────────────────────────────────────────

const checksum = await new Promise<string>((res, rej) => {
  const h = createHash('sha256');
  const s = createReadStream(ZIP);
  s.on('data', d => h.update(d as Buffer));
  s.on('end',  () => res(h.digest('hex')));
  s.on('error', rej);
});
const name = `xtagger-v${VERSION}.zip`;
writeFileSync(`${ZIP}.sha256`, `${checksum}  ${name}\n`);

const zipKb = (statSync(ZIP).size / 1024).toFixed(1);
log('─'.repeat(50));
log(`✅ ${name}  (${zipKb} KB)`);
log(`   SHA-256: ${checksum.slice(0, 32)}...`);
log(`   Checksum: ${name}.sha256`);
log('');
log('Next steps:');
log('  Load unpacked: chrome://extensions → Developer mode → Load unpacked → dist/');
log('  Submit to CWS: https://chrome.google.com/webstore/devconsole');
