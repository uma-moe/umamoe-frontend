import { expect, test } from './fixtures/test';
import { mockDatabase } from './fixtures/api';

test('landing and data pages preserve content widths, gutters and ad rails at every approved width', async ({ page }) => {
  test.setTimeout(90_000);
  await mockDatabase(page);
  for (const [path, maxContent] of [['/tools', 1080], ['/database', 1760]] as const) {
    await page.goto(path);
    // Wait for the lazy page, not the temporary frame it replaces.
    await expect(page.locator(path === '/tools' ? '.hero-content' : '.inheritance-database')).toBeVisible();
    for (const width of [320, 768, 1024, 1301, 1366, 1536, 1699, 1700, 1920, 2560]) {
      await page.setViewportSize({ width, height: 960 });
      const content = await page.locator(path === '/tools' ? '.hero-content' : '[data-page-content]').boundingBox();
      expect(content!.width, `${path} at ${width}px`).toBeLessThanOrEqual(maxContent);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      if (width < 768) {
        expect(content!.x).toBeCloseTo(path === '/tools' ? 8 : 4, 0);
        expect(width - content!.x - content!.width).toBeCloseTo(path === '/tools' ? 8 : 4, 0);
      }
      const right = page.locator('[data-ad-position="right-rail"]');
      const left = page.locator('[data-ad-position="left-rail"]');
      if (path === '/database' && width >= 1700) {
        await expect(right).toBeVisible();
        const ad = await right.boundingBox();
        expect(ad!.x).toBeGreaterThanOrEqual(content!.x + content!.width - 1);
      } else await expect(right).toBeHidden();
      if (path === '/database' && width >= 2200) {
        await expect(left).toBeVisible();
        const ad = await left.boundingBox();
        expect(ad!.x + ad!.width).toBeLessThanOrEqual(content!.x + 1);
      } else await expect(left).toBeHidden();
    }
  }
});

test('mobile shell exposes all destinations from the header', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('[data-shell-bottom]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  const navigation = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
  await expect(navigation.locator('.navigation-link')).toHaveText(['Database Updated', 'Veterans', 'Clubs', 'Rankings', 'Activity', 'Tierlist', 'ToolsUpdated', 'TimelineUpdated']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('1536px shell centers the Tools landing page beside the compact sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto('/tools');
  await expect(page.locator('main .updated-feature')).toHaveText([
    'Carat PlannerUpdatedProject income, tickets, pulls, and banner goals',
    'Lineage PlannerUpdatedPlan your full inheritance tree'
  ]);

  const rail = page.locator('[data-shell-rail]');
  const box = await rail.boundingBox();
  expect(box?.width).toBeLessThanOrEqual(66);
  expect(box?.height).toBeGreaterThanOrEqual(864);
  await expect(page.locator('[data-page-width="normal"]')).toBeVisible();
  await expect(page.locator('[data-ad-position="right-rail"]')).toHaveCount(0);
  const hero = (await page.locator('[data-page-content]').boundingBox())!;
  expect(hero.x + hero.width / 2).toBeCloseTo((1536 + box!.width) / 2, 0);
});

test('expanded shell keeps the original navbar destinations and wide layout', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/database');

  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation.getByRole('link', { name: 'Database' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Clubs' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Rankings' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Activity' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Tierlist' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Open Tools subsections' })).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Open Timeline subsections' })).toBeVisible();

  const box = await page.locator('[data-shell-rail]').boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(238);
  await expect(page.locator('[data-page-width="wide"]')).toBeVisible();
});

test('Home keeps the Angular landing background full-width inside the new shell', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto('/');
  await expect(page.locator('main .updated-feature')).toHaveText([
    'DatabaseUpdatedBrowse the Database',
    'TimelineUpdatedEstimated Release Schedule',
    'Tools & AnalyticsUpdatedAdvanced tools and statistics'
  ]);

  const geometry = await page.evaluate(() => {
    const frame = document.querySelector<HTMLElement>('[data-route-id="home"]');
    const content = document.querySelector<HTMLElement>('[data-route-id="home"] [data-page-content]');
    const home = document.querySelector<HTMLElement>('.home');
    if (!frame || !content || !home) return null;
    const frameBox = frame.getBoundingClientRect();
    const contentBox = content.getBoundingClientRect();
    const homeBox = home.getBoundingClientRect();
    return {
      frameLeft: frameBox.left,
      frameRight: frameBox.right,
      contentLeft: contentBox.left,
      contentRight: contentBox.right,
      homeLeft: homeBox.left,
      homeRight: homeBox.right
    };
  });

  expect(geometry).not.toBeNull();
  expect(geometry!.contentLeft).toBeCloseTo(geometry!.frameLeft, 0);
  expect(geometry!.contentRight).toBeCloseTo(geometry!.frameRight, 0);
  expect(geometry!.homeLeft).toBeCloseTo(geometry!.frameLeft, 0);
  expect(geometry!.homeRight).toBeCloseTo(geometry!.frameRight, 0);
});
