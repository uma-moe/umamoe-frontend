import { expect, test } from './fixtures/test';

test('support card tierlist stays hidden from links and direct visits', async ({ page }) => {
  const tierlistRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('precomputed-tierlist')) tierlistRequests.push(request.url());
  });

  await page.goto('/tierlist');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-route-id="home"]')).toBeVisible();
  await expect(page.locator('a[href="/tierlist"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Support Card Tierlist/ })).toHaveCount(0);
  expect(tierlistRequests).toEqual([]);

  await page.goto('/tools');
  await expect(page.locator('main a[href="/simulator/skills"]')).toContainText('Build Optimizer');
  await expect(page.locator('a[href="/tierlist"]')).toHaveCount(0);
});
