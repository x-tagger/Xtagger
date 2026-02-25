#!/usr/bin/env node
/**
 * @file verify-selectors.js
 * @description Daily health check — verifies X.com selectors still work.
 *
 * Opens X.com's public explore/home page (no login required) in headless
 * Chromium and tests each selector from the config. Reports pass/fail per
 * selector, exits non-zero if any required selector fails.
 *
 * Output: selector-report/report.json + selector-report/screenshots/
 *
 * Run:  node scripts/verify-selectors.js
 * CI:   Nightly via .forgejo/workflows/selector-check.yml
 */

import { chromium }              from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname }      from 'node:path';
import { fileURLToPath }         from 'node:url';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '../selector-configs/x.com.json');
const REPORT_DIR  = resolve(__dirname, '../selector-report');
const VERBOSE     = process.env.VERBOSE === 'true';

const log   = m => console.log(`[selector-verify] ${m}`);
const debug = m => { if (VERBOSE) log(m); };

// ─── Load config ──────────────────────────────────────────────────────────────

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
log(`Loaded selector config v${config.selectorVersion} (last verified: ${config.lastVerified})`);

// ─── Prepare output dirs ──────────────────────────────────────────────────────

mkdirSync(`${REPORT_DIR}/screenshots`, { recursive: true });

// ─── Run checks ───────────────────────────────────────────────────────────────

const results = {
  checkedAt:       new Date().toISOString(),
  configVersion:   config.selectorVersion,
  url:             'https://x.com/explore',
  selectors:       {},
  summary: { total: 0, passed: 0, failed: 0 },
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport:  { width: 1280, height: 900 },
});
const page = await context.newPage();

try {
  log('Navigating to x.com/explore (public, no login required)...');
  await page.goto('https://x.com/explore', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });

  // Wait a moment for React to render
  await page.waitForTimeout(3000);

  // Screenshot for reference
  await page.screenshot({
    path: `${REPORT_DIR}/screenshots/page-snapshot.png`,
    fullPage: false,
  });
  debug('Page snapshot saved');

  // ── Test each selector ──────────────────────────────────────────────────

  for (const [selectorKey, definition] of Object.entries(config.selectors)) {
    results.summary.total++;
    const strategies = definition.strategies;
    let found = false;
    let matchedStrategy = null;
    let matchedCount = 0;

    for (const strategy of strategies) {
      try {
        let count = 0;

        if (['testid', 'aria', 'structural'].includes(strategy.type)) {
          count = await page.locator(strategy.value).count();
        } else if (strategy.type === 'text') {
          // Text strategy: find elements containing the string
          count = await page.locator(`text="${strategy.value}"`).count();
        }

        if (count > 0) {
          found = true;
          matchedStrategy = strategy;
          matchedCount = count;
          debug(`  ✅ ${selectorKey} matched via ${strategy.type}: ${strategy.value} (${count} elements)`);
          break;
        } else {
          debug(`  ⚠️  ${selectorKey} strategy ${strategy.type} found 0 elements`);
        }
      } catch (e) {
        debug(`  ⚠️  ${selectorKey} strategy threw: ${e.message}`);
      }
    }

    results.selectors[selectorKey] = {
      description:     definition.description,
      passed:          found,
      matchedStrategy: matchedStrategy,
      matchedCount:    matchedCount,
      triedStrategies: strategies.length,
    };

    if (found) {
      results.summary.passed++;
      log(`  ✅ ${selectorKey} (${matchedStrategy.type}: ${matchedCount} match${matchedCount !== 1 ? 'es' : ''})`);
    } else {
      results.summary.failed++;
      log(`  ❌ ${selectorKey} — ALL ${strategies.length} strategies failed`);
      // Screenshot when a selector fails
      await page.screenshot({
        path: `${REPORT_DIR}/screenshots/${selectorKey}-fail.png`,
      });
    }
  }

} catch (e) {
  log(`Fatal error during selector check: ${e.message}`);
  results.error = e.message;
} finally {
  await context.close();
  await browser.close();
}

// ─── Write report ─────────────────────────────────────────────────────────────

const reportPath = `${REPORT_DIR}/report.json`;
writeFileSync(reportPath, JSON.stringify(results, null, 2));

// ─── Summary ──────────────────────────────────────────────────────────────────

const { total, passed, failed } = results.summary;
log('─'.repeat(50));
log(`Results: ${passed}/${total} selectors passed`);

if (failed > 0) {
  log(`❌ ${failed} selector(s) failed:`);
  for (const [key, r] of Object.entries(results.selectors)) {
    if (!r.passed) log(`   • ${key}: ${r.description}`);
  }
  log('');
  log('Next steps:');
  log('  1. Open selector-report/report.json for details');
  log('  2. Check screenshots in selector-report/screenshots/');
  log('  3. Update selector-configs/x.com.json with working strategies');
  log('  4. Bump selectorVersion and update lastVerified date');
  process.exit(1);
} else {
  log(`✅ All ${total} selectors verified against x.com/explore`);

  // Update lastVerified in config file
  const today = new Date().toISOString().slice(0, 10);
  const updated = { ...config, lastVerified: today };
  writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2) + '\n');
  log(`Updated selector config lastVerified to ${today}`);
}
