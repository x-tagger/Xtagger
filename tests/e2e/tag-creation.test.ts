/**
 * @file tag-creation.test.ts
 * @description E2E tests for the full tag creation flow.
 *
 * Uses a mock feed page served via https://x.com/mock-feed (routed locally)
 * so the content script runs normally against a controlled DOM.
 */

import { test, expect } from './fixtures';

test.describe('Tag creation', () => {

  test('hover over username shows tag icon', async ({ mockFeedPage: page }) => {
    const nameContainer = page.locator('[data-testid="User-Name"]').first();
    await nameContainer.hover();

    const tagIcon = page.locator('[data-xtagger-add-btn]');
    await expect(tagIcon).toBeVisible({ timeout: 3000 });
    await expect(tagIcon).toContainText('🏷️');
  });

  test('clicking tag icon opens editor popover', async ({ mockFeedPage: page }) => {
    const nameContainer = page.locator('[data-testid="User-Name"]').first();
    await nameContainer.hover();
    await page.locator('[data-xtagger-add-btn]').click();

    // Popover host is in the real DOM; its content is in Shadow DOM
    const popoverHost = page.locator('[data-xtagger-popover]');
    await expect(popoverHost).toBeAttached({ timeout: 5000 });

    const hasTitle = await page.evaluate(() => {
      const host = document.querySelector('[data-xtagger-popover]') as HTMLElement;
      const title = host?.shadowRoot?.querySelector('.header-title');
      return title !== null && (title.textContent?.includes('@') ?? false);
    });
    expect(hasTitle).toBe(true);
  });

  test('popover shows username in title', async ({ mockFeedPage: page }) => {
    const nameContainer = page.locator('[data-testid="User-Name"]').first();
    await nameContainer.hover();
    await page.locator('[data-xtagger-add-btn]').click();

    const title = await page.evaluate(() => {
      const host = document.querySelector('[data-xtagger-popover]') as HTMLElement;
      return host?.shadowRoot?.querySelector('.header-title')?.textContent ?? '';
    });
    expect(title).toContain('@alice_dev');
  });

  test('pressing Escape closes the popover', async ({ mockFeedPage: page }) => {
    const nameContainer = page.locator('[data-testid="User-Name"]').first();
    await nameContainer.hover();
    await page.locator('[data-xtagger-add-btn]').click();
    await expect(page.locator('[data-xtagger-popover]')).toBeAttached({ timeout: 3000 });

    // Press Escape in the shadow DOM input
    await page.evaluate(() => {
      const host = document.querySelector('[data-xtagger-popover]') as HTMLElement;
      const input = host?.shadowRoot?.querySelector<HTMLInputElement>('#xt-name');
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    await expect(page.locator('[data-xtagger-popover]')).not.toBeAttached({ timeout: 3000 });
  });

  test('colour palette has 16 swatches', async ({ mockFeedPage: page }) => {
    const nameContainer = page.locator('[data-testid="User-Name"]').first();
    await nameContainer.hover();
    await page.locator('[data-xtagger-add-btn]').click();

    const swatchCount = await page.evaluate(() => {
      const host = document.querySelector('[data-xtagger-popover]') as HTMLElement;
      return host?.shadowRoot?.querySelectorAll('.color-swatch').length ?? 0;
    });
    expect(swatchCount).toBe(16);
  });

  test('complete tag creation flow — tag appears in feed', async ({
    mockFeedPage: page,
    extensionId,
    context,
  }) => {
    // Open editor for the first user
    const nameContainer = page.locator('[data-testid="User-Name"]').first();
    await nameContainer.hover();
    await page.locator('[data-xtagger-add-btn]').click();

    // Type tag name
    await page.evaluate(() => {
      const host = document.querySelector('[data-xtagger-popover]') as HTMLElement;
      const input = host?.shadowRoot?.querySelector<HTMLInputElement>('#xt-name');
      if (input) {
        input.value = 'e2e-journalist';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // Select colour index 2
    await page.evaluate(() => {
      const host = document.querySelector('[data-xtagger-popover]') as HTMLElement;
      const swatches = host?.shadowRoot?.querySelectorAll<HTMLElement>('.color-swatch');
      swatches?.[2]?.click();
    });

    // Save
    await page.evaluate(() => {
      const host = document.querySelector('[data-xtagger-popover]') as HTMLElement;
      host?.shadowRoot?.querySelector<HTMLButtonElement>('#xt-save')?.click();
    });

    // Popover closes
    await expect(page.locator('[data-xtagger-popover]')).not.toBeAttached({ timeout: 5000 });

    // Tag pill/dot appears in the feed
    await page.waitForFunction(
      () => document.querySelector('[data-xtagger-injected]') !== null,
      { timeout: 5000 },
    );
    const injected = await page.evaluate(
      () => document.querySelector('[data-xtagger-injected]') !== null,
    );
    expect(injected).toBe(true);

    // Verify the tag appears in the popup
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.waitForSelector('.results', { timeout: 8000 });
    await popupPage.waitForTimeout(500); // let data load
    const resultsText = await popupPage.locator('#main').textContent({ timeout: 5000 });
    expect(resultsText).toContain('e2e-journalist');
    await popupPage.close();
  });

  test('multiple users can be tagged', async ({ mockFeedPage: page }) => {
    const tagUser = async (index: number, tagName: string): Promise<void> => {
      const containers = page.locator('[data-testid="User-Name"]');
      await containers.nth(index).hover();
      await page.locator('[data-xtagger-add-btn]').click();

      await page.evaluate((name) => {
        const host = document.querySelector('[data-xtagger-popover]') as HTMLElement;
        const input = host?.shadowRoot?.querySelector<HTMLInputElement>('#xt-name');
        if (input) { input.value = name; input.dispatchEvent(new Event('input')); }
      }, tagName);

      await page.evaluate(() => {
        const host = document.querySelector('[data-xtagger-popover]') as HTMLElement;
        host?.shadowRoot?.querySelector<HTMLButtonElement>('#xt-save')?.click();
      });

      await expect(page.locator('[data-xtagger-popover]')).not.toBeAttached({ timeout: 5000 });
      // Brief pause for injection to process
      await page.waitForTimeout(300);
    };

    await tagUser(0, 'multi-test-alpha');
    await tagUser(1, 'multi-test-beta');

    const injectedCount = await page.evaluate(
      () => document.querySelectorAll('[data-xtagger-injected]').length,
    );
    expect(injectedCount).toBeGreaterThanOrEqual(2);
  });
});
