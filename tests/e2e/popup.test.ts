/**
 * @file popup.test.ts
 * @description E2E tests for the extension popup dashboard.
 */

import { test, expect } from './fixtures';

test.describe('Popup', () => {

  test('loads and shows the home view', async ({ popupPage }) => {
    await expect(popupPage.locator('.app-name')).toBeVisible();
    await expect(popupPage.locator('.app-name')).toHaveText('XTagger');
    await expect(popupPage.locator('#nav-home')).toHaveClass(/active/);
    // All nav buttons present
    for (const id of ['nav-home', 'nav-import', 'nav-export', 'nav-settings']) {
      await expect(popupPage.locator(`#${id}`)).toBeVisible();
    }
  });

  test('shows empty state or results on home view', async ({ popupPage }) => {
    // Either empty state or user list — both are valid depending on test order
    const content = popupPage.locator('.empty, .user-list, .count-label');
    await expect(content.first()).toBeVisible({ timeout: 8000 });
  });

  test('search bar filters results', async ({ popupPage }) => {
    await expect(popupPage.locator('#search')).toBeVisible();
    await popupPage.fill('#search', 'zzz-no-match-ever');
    await popupPage.waitForTimeout(400);
    await expect(popupPage.locator('.empty')).toBeVisible({ timeout: 3000 });
  });

  test('navigates to import view', async ({ popupPage }) => {
    await popupPage.click('#nav-import');
    await expect(popupPage.locator('#nav-import')).toHaveClass(/active/);
    await expect(popupPage.locator('.drop-zone')).toBeVisible();
    await expect(popupPage.locator('#paste-input')).toBeVisible();
    await expect(popupPage.locator('#btn-preview')).toBeVisible();
    await expect(popupPage.locator('#btn-import')).toBeDisabled();
  });

  test('navigates to export view', async ({ popupPage }) => {
    await popupPage.click('#nav-export');\
    await expect(popupPage.locator('#nav-export')).toHaveClass(/active/);
    await expect(popupPage.locator('#btn-export')).toBeVisible();
    await expect(popupPage.locator('#btn-export')).toHaveText('Export all');
  });

  test('navigates to settings view', async ({ popupPage }) => {
    await popupPage.click('#nav-settings');
    await expect(popupPage.locator('#nav-settings')).toHaveClass(/active/);
    await expect(popupPage.locator('.setting-group')).toHaveCount(4);
  });

  test('settings: display mode change saves', async ({ popupPage }) => {
    await popupPage.click('#nav-settings');
    await popupPage.check('input[name="display"][value="pills"]');
    await expect(popupPage.locator('.settings-status')).toHaveText('✓ Saved', { timeout: 4000 });
  });

  test('settings persist after popup is reopened', async ({ context, extensionId }) => {
    const page1 = await context.newPage();
    await page1.goto(`chrome-extension://${extensionId}/popup.html`);
    await page1.waitForSelector('.nav-btn');
    await page1.click('#nav-settings');
    await page1.check('input[name="theme"][value="dark"]');
    await expect(page1.locator('.settings-status')).toHaveText('✓ Saved', { timeout: 4000 });
    await page1.close();

    const page2 = await context.newPage();
    await page2.goto(`chrome-extension://${extensionId}/popup.html`);
    await page2.waitForSelector('.nav-btn');
    await page2.click('#nav-settings');
    await expect(page2.locator('input[name="theme"][value="dark"]')).toBeChecked();
    await page2.close();
  });

  test('export generates output', async ({ popupPage }) => {
    await popupPage.click('#nav-export');
    await popupPage.click('#btn-export');
    await expect(popupPage.locator('.preview-box')).toBeVisible({ timeout: 8000 });
    await expect(popupPage.locator('#btn-dl-json')).toBeVisible();
    await expect(popupPage.locator('#btn-copy-compact')).toBeVisible();
    await expect(popupPage.locator('.compact-output')).toBeVisible();
  });

  test('import shows validation error for invalid input', async ({ popupPage }) => {
    await popupPage.click('#nav-import');
    await popupPage.fill('#paste-input', 'totally not valid JSON or xtag format');
    await popupPage.click('#btn-preview');
    await expect(popupPage.locator('.error-box')).toBeVisible({ timeout: 5000 });
    await expect(popupPage.locator('#btn-import')).toBeDisabled();
  });

  test('version is shown in settings', async ({ popupPage }) => {
    await popupPage.click('#nav-settings');
    await expect(popupPage.locator('.version-info')).toBeVisible();
    const text = await popupPage.locator('.version-info').textContent();
    expect(text).toMatch(/v\d+\.\d+\.\d+/);
  });

  test('theme toggle applies dark class to html element', async ({ popupPage }) => {
    await popupPage.click('#nav-settings');
    await popupPage.check('input[name="theme"][value="dark"]');
    await expect(popupPage.locator('.settings-status')).toHaveText('✓ Saved', { timeout: 3000 });
    const theme = await popupPage.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );
    expect(theme).toBe('dark');
  });
});
