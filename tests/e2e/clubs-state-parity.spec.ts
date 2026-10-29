import { expect, test, type Page } from './fixtures/test';
import { mockCommunity } from './fixtures/api';

const clubs = (prefix: string) =>
  [1, 2, 3].map((join_style, index) => ({
    circle_id: index + 7,
    name: `${prefix} ${['Open', 'Approval', 'Closed'][index]}`,
    join_style,
    policy: join_style,
    member_count: index === 1 ? 30 : 29,
    monthly_rank: index + 1,
    monthly_point: 1000000,
    live_points: 1100000
  }));

const response = (prefix: string, page = 0, limit = 100) => ({
  circles: clubs(prefix),
  total: 120,
  page,
  limit,
  total_pages: Math.ceil(120 / limit)
});

async function choose(page: Page, label: string) {
  await page.getByRole('combobox', { name: 'Playstyle', exact: true }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

test('Clubs use the shared card surface in both themes', async ({ page }) => {
  await mockCommunity(page);
  await page.route('**/api/v4/circles/list?*', (route) =>
    route.fulfill({ json: response('Podium') })
  );

  await page.goto('/circles');
  await expect(page.locator('.circle-card')).toHaveCount(3);
  for (const theme of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme')) !== theme)
      await page.getByRole('button', { name: 'Toggle theme' }).click();
    for (const card of await page.locator('.circle-card').all()) {
      await expect(card).toHaveCSS('background-image', 'none');
      await expect(card).toHaveCSS(
        'background-color',
        theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(22, 22, 22)'
      );
    }
  }
});

test('Clubs local filters reset both page and records, including history and every filter kind', async ({
  page
}, testInfo) => {
  await mockCommunity(page);
  await page.route('**/api/v4/circles/list?*', (route) => {
    const query = new URL(route.request().url()).searchParams;
    const index = Number(query.get('page') ?? 0);
    return route.fulfill({
      json: response(index ? 'Later' : 'First', index, Number(query.get('limit')))
    });
  });

  const names = page.locator('.circle-name');
  for (const filter of ['Open', 'Approval', 'Closed', 'Has Spots', 'Playstyle']) {
    await page.goto('/circles?page=1&pageSize=20');
    await expect(names).toHaveText(['Later Open', 'Later Approval', 'Later Closed']);
    if (filter === 'Playstyle') await choose(page, 'Going for Gold');
    else await page.getByRole('button', { name: filter, exact: true }).click();
    const expected =
      filter === 'Has Spots'
        ? ['First Open', 'First Closed']
        : [`First ${filter === 'Playstyle' ? 'Closed' : filter}`];

    await expect(names).toHaveText(expected);
    expect(new URL(page.url()).searchParams.has('page')).toBe(false);
    await expect(page.locator('.mat-paginator')).toContainText('1–20 of 120');
    if (filter !== 'Playstyle') {
      const chip = page.getByRole('button', { name: filter, exact: true });
      await expect(chip).toHaveAttribute('aria-pressed', 'true');
      await expect(chip).toHaveCSS('font-weight', '500');
      await expect(chip).toHaveCSS(
        'background-color',
        (
          {
            Open: 'rgba(76, 175, 80, 0.12)',
            Approval: 'rgba(255, 152, 0, 0.12)',
            Closed: 'rgba(244, 67, 54, 0.12)',
            'Has Spots': 'rgba(100, 181, 246, 0.12)'
          } as Record<string, string>
        )[filter]
      );
    }

    await page.goBack();
    await expect(names).toHaveText(['Later Open', 'Later Approval', 'Later Closed']);
    await page.goForward();
    await expect(names).toHaveText(expected);
  }

  if (testInfo.project.use.isMobile) {
    const spots = await page.getByRole('button', { name: 'Has Spots', exact: true }).boundingBox();
    const clear = await page.getByRole('button', { name: 'Clear', exact: true }).boundingBox();
    const open = await page.getByRole('button', { name: 'Open', exact: true }).boundingBox();
    expect(spots!.y).toBe(open!.y);
    expect(spots!.height).toBeGreaterThanOrEqual(30);
    expect(clear!.y).toBeGreaterThanOrEqual(spots!.y + spots!.height);
    expect(clear!.height).toBeGreaterThanOrEqual(28);
  }

  await expect(page.locator('.search-row .suffix-icon svg')).toBeVisible();
  if (testInfo.project.use.isMobile)
    await expect(page.locator('#club-policy .selected-copy svg')).toBeHidden();
  else await expect(page.locator('#club-policy .selected-copy svg')).toBeVisible();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(names).toHaveText(['First Open', 'First Approval', 'First Closed']);
  expect(new URL(page.url()).search).toBe('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('clubs-filters.png') });
});

test('Clubs live refresh retains rows, cache countdown and a recoverable failure state', async ({
  page
}) => {
  await page.clock.install({ time: '2026-09-06T00:00:00Z' });
  // Wall time spent navigating must not drift the exact cache-expiry assertions.
  await page.clock.pauseAt('2026-09-06T00:01:00Z');
  await mockCommunity(page);
  let requests = 0,
    fail = false,
    release!: () => void;

  let gate = Promise.resolve();
  await page.route('**/api/v4/circles/list?*', async (route) => {
    const attempt = ++requests;
    await gate;
    if (fail) return route.fulfill({ status: 503, json: { message: 'Offline' } });
    return route.fulfill({ json: response(attempt === 1 ? 'Initial' : 'Updated') });
  });

  await page.goto('/circles');
  await expect(page.locator('.circle-name').first()).toHaveText('Initial Open');
  await page.clock.fastForward(120000);
  await expect(page.locator('.live-refresh-bar')).toContainText('3:00');
  await page.locator('.circle-name').first().click();
  await expect(page.getByRole('heading', { name: 'Team Sirius' }).first()).toBeVisible();
  await page.goBack();
  await expect(page.locator('.circle-name').first()).toHaveText('Initial Open');
  await expect(page.locator('.live-refresh-bar')).toContainText('3:00');
  expect(requests).toBe(1);
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  try {
    await page.getByRole('button', { name: 'Update now', exact: true }).click();
    await expect.poll(() => requests).toBe(2);
    await expect(page.locator('.live-refresh-bar')).toContainText('Updating…');
    await expect(page.locator('.circle-name').first()).toHaveText('Initial Open');
    await expect(page.locator('.loading')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Update now', exact: true })).toBeDisabled();
    fail = true;
    release();
    const error = page.locator('.banner').filter({ hasText: 'Club data unavailable' });
    await expect(error).toBeVisible();
    await expect(error.getByRole('link', { name: 'Report on Discord' })).toBeVisible();
    await expect(page.locator('.circle-name').first()).toHaveText('Initial Open');
    expect(requests).toBe(3); // The shared HTTP pipeline retries a failed GET once.
    await page.clock.fastForward(360000);
    expect(requests).toBe(3);
    fail = false;
    await error.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.locator('.circle-name').first()).toHaveText('Updated Open');
    await expect(error).toHaveCount(0);
    await expect(page.locator('.live-refresh-bar')).toContainText('5:00');
    await page.clock.fastForward(300000);
    await expect.poll(() => requests).toBe(5);
    await expect(page.locator('.live-refresh-bar')).toContainText('5:00');
    fail = true;
    await page.goto('/circles?query=Unavailable');
    await expect(error).toBeVisible();
    await expect(page.locator('.circle-name')).toHaveCount(0);
    await expect(page.getByText('No clubs match your filters.', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('searchbox', { name: 'Search clubs', exact: true })).toHaveValue(
      'Unavailable'
    );

    fail = false;
    await error.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.locator('.circle-name').first()).toHaveText('Updated Open');
  } finally {
    release?.();
  }
});

test('Clubs keeps name links compatible and late searches cannot overwrite current results', async ({
  page
}) => {
  await mockCommunity(page);
  const requests: URLSearchParams[] = [];
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route('**/api/v4/circles/list?*', async (route) => {
    const query = new URL(route.request().url()).searchParams;
    requests.push(query);
    const search = query.get('query') ?? query.get('name') ?? 'First';
    if (search === 'Slow') await delayed;
    return route.fulfill({ json: response(search) });
  });

  try {
    await page.goto('/circles?name=Legacy&pageSize=20');
    await expect(page.locator('.circle-name').first()).toHaveText('Legacy Open');
    expect(requests.at(-1)?.get('name')).toBe('Legacy');
    expect(requests.at(-1)?.has('query')).toBe(false);
    await page.getByRole('button', { name: 'Has Spots', exact: true }).click();
    expect(new URL(page.url()).searchParams.get('name')).toBe('Legacy');
    await page.getByRole('searchbox', { name: 'Search clubs', exact: true }).fill('Slow');
    await expect.poll(() => requests.at(-1)?.get('query')).toBe('Slow');
    await page.getByRole('searchbox', { name: 'Search clubs', exact: true }).fill('Current');
    await expect(page.locator('.circle-name').first()).toHaveText('Current Open');
    expect(new URL(page.url()).searchParams.has('name')).toBe(false);
    const staleResponse = page.waitForResponse(
      (response) => new URL(response.url()).searchParams.get('query') === 'Slow'
    );

    release();
    await (await staleResponse).finished();
    await expect(page.locator('.circle-name').first()).toHaveText('Current Open');
    await page.goBack();
    await expect(page.locator('.circle-name').first()).toHaveText('Slow Open');
    await page.goForward();
    await expect(page.locator('.circle-name').first()).toHaveText('Current Open');
  } finally {
    release();
  }
});
