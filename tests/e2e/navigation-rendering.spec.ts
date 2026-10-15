import { expect, test } from './fixtures/test';
import { mockAffinity, mockCommunity, mockActivity } from './fixtures/api';
import { completion } from '../performance/completion';

test('every page frame navigates without waiting for its content module', async ({
  page
}, info) => {
  const destinations = [
    ['/database', 'DatabasePage', 'database'],
    ['/circles', 'ClubsPage', 'clubs'],
    ['/rankings', 'RankingsPage', 'rankings'],
    ['/activity', 'ActivityPage', 'activity'],
    ['/tierlist', 'TierlistPage', 'tierlist'],
    ['/tools/statistics', 'StatisticsPage', 'statistics'],
    ['/tools/lineage-planner', 'LineagePlannerPage', 'lineage-planner'],
    ['/veterans', 'VeteransBrowserPage', 'veterans'],
    ['/veterans/123', 'ProfileVeteransPage', 'veterans'],
    ['/profile/123', 'ProfilePage', 'profile'],
    ['/profile/123/cm', 'CmLogsPage', 'profile'],
    ['/profile/123/achievements', 'ProfilePlaceholderPage', 'profile'],
    ['/settings', 'SettingsPage', 'settings'],
    ['/login', 'LoginPage', 'login'],
    ['/privacy-policy', 'PrivacyPage', 'privacy'],
    ['/circles/123', 'ClubDetailsPage', 'clubs']
  ];

  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    new RegExp(
      '/(' +
        destinations.map(([, module]) => module).join('|') +
        ')(?:-[\\w-]+\\.js|\\.svelte)(?:\\?.*)?$'
    ),
    async (route) => {
      await held;
      await route.abort();
    }
  );

  await page.goto('/tools');
  await expect(page.locator('main a[href="/tools/lineage-planner"]')).toBeVisible();
  const timings = [];
  try {
    for (const [path, , id] of destinations) {
      // Exercise the same native anchor handler as every navigation link.
      timings.push({
        path,
        ...(await completion(
          page,
          `Uncached ${path}: destination frame painted`,
          () =>
            page.evaluate((path) => {
              const link = document.createElement('a');
              link.href = path!;
              document.body.append(link);
              link.click();
              link.remove();
            }, path),
          { selector: `[data-route-id="${id}"] .pending-content`, pathname: path }
        ))
      });

      await expect(page.locator(`[data-route-id="${id}"] h1`)).toBeVisible();
      await expect(page.locator('.route-loading')).toHaveCount(0);
    }

    await info.attach('uncached-frame-timings', {
      body: JSON.stringify(timings),
      contentType: 'application/json'
    });

    console.info(
      `Uncached page frames (${process.env.PERF_CPU ?? '1'}x CPU), ms:`,
      timings.map(({ path, ms }) => `${path}: ${ms}`).join(', ')
    );
  } finally {
    release();
  }
});

test('background-cached planner paints its tree without waiting for catalogs', async ({
  page
}, info) => {
  await mockAffinity(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/resources\/test\/character(?:_names)?\.json/, async (route) => {
    await held;
    await route.fallback();
  });

  await page.route(/\/app\/.*\.(js|css)$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.continue();
  });

  const plannerCode = page.waitForResponse(/\/LineagePlannerPage-[\w-]+\.js/);
  await page.goto('/tools');
  await plannerCode; // No pointer hover or route click has occurred.
  // Let the module's transitive dependencies finish warming.
  await page.waitForTimeout(2000);
  const routeRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/app\/.*\.(js|css)$/.test(request.url())) routeRequests.push(request.url());
  });

  try {
    const timing = await completion(
      page,
      'Cached planner: tree painted with catalogs held',
      () =>
        page
          .locator('main a[href="/tools/lineage-planner"]')
          .evaluate((link: HTMLAnchorElement) => link.click()),
      { selector: '.planner-shell', pathname: '/tools/lineage-planner' }
    );

    await expect(page.getByRole('button', { name: 'Choose Target', exact: true })).toBeVisible();
    await expect(page.locator('.route-loading')).toHaveCount(0);
    // Controls remain usable while catalogs are still unavailable.
    await page.getByRole('button', { name: 'Save / Load', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(routeRequests.filter((url) => url.includes('/LineagePlannerPage-'))).toEqual([]);
    await info.attach('navigation-timing', {
      body: JSON.stringify({ ...timing, routeRequests }),
      contentType: 'application/json'
    });

    console.info(
      `Planner click to painted tree (${process.env.PERF_CPU ?? '1'}x CPU): ${timing.ms} ms`
    );
  } finally {
    release();
  }
});

for (const kind of ['clubs', 'rankings', 'activity'] as const)
  test(`${kind} bounds its mounted results when scrolling to the end`, async ({ page }) => {
    await mockCommunity(page);
    await mockActivity(page);
    const pattern =
      kind === 'clubs'
        ? '**/api/v4/circles/list?*'
        : kind === 'rankings'
          ? '**/api/v4/rankings/*?*'
          : '**/api/v4/shame/hall*';

    const rows = Array.from({ length: 100 }, (_, i) => ({
      circle_id: i + 1,
      name: `Club ${i + 1}`,
      rank: i + 1,
      member_count: 30,
      monthly_point: 1000000,
      viewer_id: i + 1,
      trainer_name: `Trainer ${i + 1}`,
      total_fans: 1000000,
      monthly_gain: 10000,
      suspicion_score: 50,
      days_observed: 30,
      total_careers: 500,
      total_fan_gain: 1000000,
      total_active_seconds: 3600,
      careers_per_active_hour: 5
    }));

    await page.route(pattern, (route) =>
      route.fulfill({
        json: {
          circles: rows,
          rankings: rows,
          entries: rows,
          total: 100,
          total_pages: 1,
          page: 0,
          limit: 100
        }
      })
    );

    const path = kind === 'clubs' ? '/circles' : `/${kind}`;
    const selector =
      kind === 'clubs'
        ? '.club-list .circle-card'
        : kind === 'rankings'
          ? '.leaderboard .leader-row'
          : '.activity-list .activity-row';

    await page.goto(path);
    await expect(page.locator(selector).first()).toBeVisible();
    expect(await page.locator(selector).count()).toBeLessThan(100);
    const host = page.locator(
      kind === 'clubs' ? '.club-list' : kind === 'rankings' ? '.leaderboard' : '.activity-list'
    );

    await host.evaluate((node) =>
      window.scrollTo({
        top: node.getBoundingClientRect().top + scrollY + node.scrollHeight,
        behavior: 'instant'
      })
    );

    await expect
      .poll(async () =>
        Number(
          await host.locator('[data-virtual-index]').first().getAttribute('data-virtual-index')
        )
      )
      .toBeGreaterThan(60);
    expect(await page.locator(selector).count()).toBeLessThan(60);
    await expect(page.getByRole('button', { name: /show more/i })).toHaveCount(0);
  });
