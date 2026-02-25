/**
 * @file fixtures.ts
 * @description Playwright fixtures for Chrome extension testing.
 *
 * Key design decision: The content script only matches https://x.com/*.
 * To test it without real credentials, we use page.route() to intercept
 * https://x.com/mock-feed and serve our local mock HTML.
 * This means the content script runs normally against our controlled DOM.
 */

import { test as base, chromium } from '@playwright/test';
import { readFileSync }            from 'node:fs';
import { resolve }                 from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';

const DIST        = resolve(__dirname, '../../dist');
const MOCK_HTML   = readFileSync(resolve(__dirname, 'mock-feed.html'), 'utf-8');
export const MOCK_URL = 'https://x.com/mock-feed';

export interface ExtensionFixtures {
  context:        BrowserContext;
  extensionId:    string;
  popupPage:      Page;
  mockFeedPage:   Page;
}

export const test = base.extend<ExtensionFixtures>({
  // ── Persistent browser context with the extension loaded ─────────────────
  context: async ({}, use) => {
    const userDataDir = resolve(__dirname, '../../.pw-user-data');
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      args: [
        `--disable-extensions-except=${DIST}`,
        `--load-extension=${DIST}`,
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        // Allow the mock URL to be treated as a normal page (not needing real certs)
        '--ignore-certificate-errors',
      ],
    });
    await use(context);
    await context.close();
  },

  // ── Extension ID discovery ────────────────────────────────────────────────
  extensionId: async ({ context }, use) => {
    let id: string | null = null;

    // Give the service worker time to start
    for (let i = 0; i < 30; i++) {
      const workers = context.serviceWorkers();
      const sw = workers.find(w => w.url().includes('background.js'));
      if (sw) {
        id = sw.url().split('//')[1]?.split('/')[0] ?? null;
        if (id) break;
      }
      await new Promise(r => setTimeout(r, 300));
    }

    if (!id) {
      // Fallback via extensions management page
      const page = await context.newPage();
      await page.goto('chrome://extensions/');
      await page.waitForTimeout(1000);
      // Try to get ID from background service worker URL in a different way
      const swUrls = context.serviceWorkers().map(w => w.url());
      for (const url of swUrls) {
        const match = url.match(/chrome-extension:\/\/([a-z]{32})\//);
        if (match?.[1]) { id = match[1]; break; }
      }
      await page.close();
    }

    if (!id) throw new Error('Could not determine extension ID — is the dist/ built?');
    await use(id);
  },

  // ── Popup page ────────────────────────────────────────────────────────────
  popupPage: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForSelector('.nav-btn', { timeout: 8000 });
    await use(page);
    await page.close();
  },

  // ── Mock feed page (routed via x.com so content script runs) ─────────────
  mockFeedPage: async ({ context }, use) => {
    const page = await context.newPage();

    // Route our mock URL to serve the local HTML — content script runs because
    // the URL matches x.com/* in the manifest's content_scripts.matches
    await page.route(MOCK_URL, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: MOCK_HTML,
      });
    });

    await page.goto(MOCK_URL);

    // Wait for content script to boot (it sets this attribute on success)
    await page.waitForFunction(
      () => document.documentElement.hasAttribute('data-xtagger-active'),
      { timeout: 10_000 },
    );

    await use(page);
    await page.close();
  },
});

export { expect } from '@playwright/test';
