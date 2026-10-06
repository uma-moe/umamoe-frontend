import { expect, test } from './fixtures/test';
import { mockDatabase } from './fixtures/api';

test('rate limits reach the shared UI and can be dismissed before retrying', async ({ page }) => {
  await mockDatabase(page);
  await page.route('**/search/query*', route => route.fulfill({ status: 429, headers: { 'retry-after': '3' }, json: { error: 'rate_limited' } }));
  await page.goto('/database');
  const dialog = page.getByRole('dialog', { name: 'Too many requests' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('before trying again');
  await dialog.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
});

test('status details, build notification, and changelog work on desktop and mobile', async ({ page }) => {
  await page.route('**/tools', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace('name="app-build-version" content="local"', 'name="app-build-version" content="2.0.371"') });
  });
  await page.route('**/version.json*', route => route.fulfill({ json: { version: '2.0.372' } }));
  await page.goto('/tools');
  await expect(page.getByRole('button', { name: '2.0.371', exact: true })).toBeAttached();
  await expect(page.getByText('Update available', { exact: true })).toBeVisible();
  const notice = page.getByRole('region', { name: 'Update available', exact: true });
  const originalViewport = page.viewportSize()!;
  for (const width of [originalViewport.width, 320]) {
    await page.setViewportSize({ width, height: originalViewport.height });
    await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await expect(notice.getByRole('button', { name: 'Reload', exact: true })).toBeVisible();
      expect(await notice.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      const bounds = await notice.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await notice.screenshot({ path: test.info().outputPath(`update-notice-${theme}-${width}.png`) });
    }
  }
  await page.setViewportSize(originalViewport);
  await page.getByRole('button', { name: 'Later', exact: true }).click();
  await expect(notice).toBeHidden();
  const status = page.getByRole('button', { name: 'Service status', exact: true });
  await status.scrollIntoViewIfNeeded(); await status.click();
  const details = page.getByRole('dialog', { name: 'Service status', exact: true });
  await expect(details).toContainText('All systems operational');
  await expect(details).toContainText('API');
  await details.getByRole('button', { name: 'Close Service status' }).click();
  await page.getByRole('button', { name: 'What’s new', exact: true }).click();
  const updates = page.getByRole('dialog', { name: 'What’s new', exact: true });
  await expect(updates.getByRole('heading', { name: 'Usability update', exact: true })).toBeVisible();
  await expect(updates).toContainText('Add banner notes and record actual pulls and copies. Both save and sync with your plan.');
  await expect(updates.locator('.release-summary')).toHaveCount(0);
  await expect(updates.locator('.latest-release .highlight h3')).toHaveText(['Pull plans & actual results', 'Income & ticket planning', 'Spark filters', 'Parent picker', 'Timeline', 'Layout improvements']);
  await expect(updates.locator('img')).toHaveCount(0);
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await updates.screenshot({ path: test.info().outputPath(`whats-new-${theme}.png`) });
  }
  await updates.getByRole('button', { name: 'Previous updates', exact: true }).click();
  await expect(updates.getByRole('heading', { name: 'Previous updates', exact: true })).toBeVisible();
  await updates.getByText('Carat Planner Accuracy and Sync', { exact: true }).click();
  await expect(updates.getByRole('heading', { name: 'More Accurate Planning', exact: true })).toBeVisible();
  const olderRelease = updates.locator('summary').filter({ hasText: 'August Update - Inheritance, Races & Planning' });
  await olderRelease.focus();
  await olderRelease.press('Enter');
  await expect(updates.getByRole('heading', { name: 'Inheritance Results', exact: true })).toBeVisible();
  await expect(updates.getByRole('heading', { name: 'More Accurate Planning', exact: true })).not.toBeVisible();
  await expect(updates.locator('details[open]')).toHaveCount(1);
  await updates.getByRole('button', { name: 'Latest release', exact: true }).click();
  await expect(updates.getByRole('heading', { name: 'Usability update', exact: true })).toBeVisible();
  await updates.getByRole('button', { name: 'Got it', exact: true }).click();
  await expect(page.getByText('Carat Planner Accuracy and Sync', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'What’s new', exact: true }).click();
  await expect(updates).toBeVisible();
  const currentUrl = page.url();
  await updates.getByRole('button', { name: 'Got it', exact: true }).click();
  await expect(updates).toBeHidden();
  await expect(page).toHaveURL(currentUrl);
  expect(await page.evaluate(() => localStorage.getItem('lastSeenUpdateVersion'))).toBe('18');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
});

test('route changes refresh canonical, social, and structured metadata without private query values', async ({ page }) => {
  await page.goto('/tools?tokenless=private');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://uma.moe/tools');
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://uma.moe/tools');
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://uma.moe/privacy-policy');
  await page.goto('/settings');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('#page-structured-data')).toHaveCount(0);
});

test('Usability update is announced once to returning visitors and stays available from the footer', async ({ page }) => {
  await page.goto('/tools');
  await page.evaluate(() => localStorage.setItem('lastSeenUpdateVersion', '17'));
  await page.reload();
  const updates = page.getByRole('dialog', { name: 'What’s new', exact: true });
  await expect(updates.getByRole('heading', { name: 'Usability update', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => localStorage.getItem('lastSeenUpdateVersion'))).toBe('18');
  await page.reload();
  await page.waitForTimeout(1800); // The automatic announcement checks after 1.5 seconds.
  await expect(updates).not.toBeVisible();
  await page.getByRole('button', { name: 'What’s new', exact: true }).click();
  await expect(updates).toBeVisible();
});
