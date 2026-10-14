import { expect, test } from './fixtures/test';
import { mockActivity, mockCommunity, mockDatabase, mockStatistics, mockTimeline } from './fixtures/api';

test.beforeEach(async ({ page }) => {
  // Route checks must not race unavailable backend requests during navigation.
  // Feature specs cover populated workflows and their own explicit failures.
  // These full-document navigation loops settle their finite mocked requests
  // before leaving; WebKit otherwise reports unload-aborted fetches as errors.
  await page.route(/\/(?:api|search|ingest|resources)\//, route => route.fulfill({ status: 503, json: { error: 'Unavailable route-only fixture' } }));
  await mockDatabase(page);
  await mockCommunity(page);
  await mockActivity(page, 123456789012);
  await mockStatistics(page);
  await mockTimeline(page, false);
});

const angularRoutes = [
  '/veterans',
  '/veterans/123456789012',
  '/',
  '/database',
  '/circles',
  '/circles/1',
  '/circles/1/csv',
  '/rankings',
  '/activity',
  '/activity/123456789012',
  '/timeline',
  '/tierlist',
  '/tools',
  '/tools/statistics',
  '/tools/lineage-planner',
  '/wip',
  '/privacy-policy',
  '/login',
  '/signin',
  '/profile/123456789012',
    '/profile/123456789012/cm',
  '/profile/123456789012/achievements',
  '/profile/123456789012/titles'
] as const;

test('the Svelte router retains the Angular route table', async ({ page }) => {
  test.setTimeout(90_000);
  for (const path of angularRoutes) {
    await page.goto(path, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-app-shell]'), `${path} should render inside the shared shell`).toBeVisible();
    await expect(page.locator('[data-page-body]')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}(?:\\?.*)?$`));
  }
});

test('the Angular redirects retain their exact canonical destinations', async ({ page }) => {
  for (const [source, destination] of [
    ['/inheritance', '/database'],
    ['/profile/123456789012/veterans', '/veterans/123456789012'],
    ['/support-cards', '/database'],
    ['/shame', '/activity'],
    ['/shame/123456789012', '/activity/123456789012'],
    ['/not-an-angular-route', '/']
  ] as const) {
    await page.goto(source, { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(new RegExp(`${destination.replaceAll('/', '\\/')}$`));
  }
});

test('removed experimental top-level routes are not product routes', async ({ page }) => {
  for (const path of ['/race-analysis', '/multi-race', '/cm-logs', '/research-notes', '/connect']) {
    await page.goto(path, { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/$/);
  }
});

test('representative Angular pages stay horizontally safe at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const path of ['/', '/database', '/circles', '/rankings', '/activity', '/timeline', '/tierlist', '/tools']) {
    await page.goto(path, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-page-body]')).toBeVisible();
    if (path === '/database' || path === '/rankings') await expect(page.getByText('Parity Trainer', { exact: true }).first()).toBeVisible();
    if (path === '/circles') await expect(page.getByText('Team Sirius', { exact: true })).toBeVisible();
    if (path === '/activity') await expect(page.getByText('Mejiro Analyst', { exact: true })).toBeVisible();
    if (path === '/timeline') await expect(page.getByText('Mejiro McQueen Pickup', { exact: true })).toBeVisible();
    const geometry = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth
    }));
    expect(geometry.document, `${path} overflowed the mobile viewport`).toBeLessThanOrEqual(geometry.viewport);
  }
});
