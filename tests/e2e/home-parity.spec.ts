import { expect, test } from './fixtures/test';
import { homeStats, mockTimeline } from './fixtures/api';

test('Home and Tools fill all four Angular counters through the shared statistics component', async ({
  page
}) => {
  await page.route('**/api/stats?days=30', (route) => route.fulfill({ json: homeStats }));
  for (const path of ['/', '/tools']) {
    await page.goto(path);
    const stats = page.locator('.stat-card strong');
    await expect(stats).toHaveText(['4,521', '8,123', '34,567', '2,456,789']);
    for (const badge of await page.locator('.quick-link small').all()) {
      await expect(badge).toHaveCSS('letter-spacing', '0.5px');
      await expect(badge).toHaveCSS('white-space', 'nowrap');
      expect(
        await badge.evaluate((element) => {
          const style = getComputedStyle(element);
          return parseFloat(style.lineHeight) / parseFloat(style.fontSize);
        })
      ).toBeCloseTo(1.5);
    }

    for (const width of [320, 390, 768, 1024, 1536, 1920, 2560]) {
      await page.setViewportSize({ width, height: 844 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width);
      const background = await page.locator('.hero').evaluate((element) => {
        const body = document.querySelector('[data-page-frame]')!.getBoundingClientRect(),
          hero = element.getBoundingClientRect();

        return { left: hero.left - body.left, right: body.right - hero.right };
      });

      expect(background).toEqual({ left: 0, right: 0 });
    }
  }
});

test('Home and Tools keep source link order, disabled tools and the Angular theme preference', async ({
  page
}) => {
  await page.route('**/api/stats?days=30', (route) => route.fulfill({ json: homeStats }));
  await mockTimeline(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    if (!localStorage.getItem('uma-color-mode')) localStorage.setItem('uma-color-mode', 'light');
    localStorage.setItem('uma:theme', 'dark');
  });

  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const cards = page.locator('.quick-links');
  await expect(cards).toBeVisible();
  expect(
    await cards
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
  ).toEqual(['/database', '/circles', '/rankings', '/tierlist', '/timeline', '/tools']);
  await expect(cards.locator('strong')).toHaveText([
    'Database',
    'Clubs',
    'Rankings',
    'Tierlists',
    'TimelineUpdated',
    'Tools & AnalyticsUpdated'
  ]);
  expect(
    await cards
      .getByRole('link')
      .first()
      .evaluate((node) => getComputedStyle(node).backgroundColor)
  ).toBe('rgb(255, 255, 255)');
  await expect(cards.getByRole('link', { name: /Timeline/ }).locator('svg')).toHaveCSS(
    'color',
    'rgb(190, 24, 93)'
  );

  await expect(cards.getByRole('link', { name: /Tools & Analytics/ }).locator('svg')).toHaveCSS(
    'color',
    'rgb(124, 58, 237)'
  );

  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(cards.getByRole('link', { name: /Timeline/ }).locator('svg')).toHaveCSS(
    'color',
    'rgb(233, 30, 99)'
  );

  await expect(cards.getByRole('link', { name: /Tools & Analytics/ }).locator('svg')).toHaveCSS(
    'color',
    'rgb(156, 39, 176)'
  );

  expect(await page.evaluate(() => localStorage.getItem('uma-color-mode'))).toBe('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const toolsLink = cards.getByRole('link', { name: /Tools & Analytics/ });
  await toolsLink.focus();
  await toolsLink.press('Enter');
  await expect(page).toHaveURL(/\/tools$/);
  await expect(cards.locator('strong')).toHaveText([
    'Team Stadium Statistics',
    'Carat PlannerUpdated',
    'Lineage Planner',
    'HP Calculator',
    'Race Simulator'
  ]);
  expect(
    await cards
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
  ).toEqual(['/tools/statistics', '/timeline?tab=carat-planner', '/tools/lineage-planner']);
  await expect(cards.locator('[aria-disabled="true"]')).toHaveCount(2);
  await expect(cards.locator('.updated-feature')).toContainText('Carat Planner');
  for (const width of [1536, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    expect(
      await cards
        .getByRole('link')
        .evaluateAll((links) => links.every((link) => link.getBoundingClientRect().height >= 44))
    ).toBe(true);
  }

  await cards.getByRole('link', { name: /Carat Planner/ }).focus();
  await cards.getByRole('link', { name: /Carat Planner/ }).press('Enter');
  await expect(page).toHaveURL(/\/timeline\?tab=carat-planner$/);
  await expect(
    page
      .getByRole('navigation', { name: 'Timeline tools' })
      .getByRole('link', { name: /^Carat Planner/ })
  ).toHaveAttribute('aria-current', 'page');
});

test('Home and Tools retain their zero counters and working links if statistics fail', async ({
  page
}) => {
  await page.route('**/api/stats?days=30', (route) =>
    route.fulfill({ status: 503, json: { message: 'Unavailable' } })
  );

  for (const route of ['/', '/tools']) {
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes('/api/stats?days=30') && response.status() === 503
      ),
      page.goto(route)
    ]);
    await expect(page.locator('.stat-card strong')).toHaveText(['0', '0', '0', '0']);
    await expect(page.locator('.stat-card span')).toHaveText([
      'Tasks Today',
      'Updated Today',
      'Trainers',
      'Total Umas Tracked'
    ]);
    await expect(page.locator('.quick-links a').first()).toBeVisible();
  }
});
