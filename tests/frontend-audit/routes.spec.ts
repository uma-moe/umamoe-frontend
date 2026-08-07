import { expect, test, type Page } from '@playwright/test';
import { installDeterministicNetwork } from './network-fixtures';
import { auditedRoutes } from './routes';

async function assertStableShell(page: Page, expectedPath?: RegExp): Promise<void> {
  await expect(page.locator('app-root')).toBeAttached();
  await expect(page.locator('.app-shell-main')).toBeVisible();
  if (expectedPath) {
    await expect(page).toHaveURL(expectedPath);
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page should not create horizontal viewport overflow').toBeLessThanOrEqual(2);
}

for (const route of auditedRoutes) {
  test.describe(route.path, () => {
    test.beforeEach(async ({ page }) => installDeterministicNetwork(page));

    test('direct load has a stable responsive shell', async ({ page }) => {
      const pageErrors: Error[] = [];
      page.on('pageerror', error => pageErrors.push(error));
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      await assertStableShell(page, route.expectedPath);
      expect(pageErrors, pageErrors.map(error => error.stack ?? error.message).join('\n')).toEqual([]);
    });

    test('warm client navigation has a stable responsive shell', async ({ page }) => {
      const pageErrors: Error[] = [];
      page.on('pageerror', error => pageErrors.push(error));
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.evaluate(path => {
        history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, route.path);
      await assertStableShell(page, route.expectedPath);
      expect(pageErrors, pageErrors.map(error => error.stack ?? error.message).join('\n')).toEqual([]);
    });
  });
}
