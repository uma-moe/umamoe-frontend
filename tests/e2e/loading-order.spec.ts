import { expect, test } from './fixtures/test';
import { mockDatabase, mockStatistics } from './fixtures/api';

test('database search starts before display catalogs finish', async ({ page }) => {
  await mockDatabase(page);
  let release!: () => void;
  const catalogs = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/resources/test/character.json*', async (route) => {
    await catalogs;
    await route.fallback();
  });

  const search = page.waitForRequest((request) => request.url().includes('/search/query?'));
  try {
    await page.goto('/database');
    await search;
    await expect(page.locator('.inheritance-card').first()).toBeVisible();
  } finally {
    release();
  }
});

test('statistics download while label catalogs are still loading', async ({ page }) => {
  await mockStatistics(page);
  let release!: () => void;
  const catalogs = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/resources/test/skills.json*', async (route) => {
    await catalogs;
    await route.fallback();
  });

  const statistics = page.waitForRequest((request) =>
    request.url().includes('/global/global.json')
  );

  try {
    await page.goto('/tools/statistics');
    await statistics;
  } finally {
    release();
  }

  await expect(page.getByTestId('selected-samples')).toHaveText('10');
});
