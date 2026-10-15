import { expect, test } from './fixtures/test';
import { accountId, profile, mockOwnerProfile } from './fixtures/api';

test('Fan activity loads each year at daily resolution with its selector in the header and working zoom', async ({
  page,
  isMobile
}) => {
  await mockOwnerProfile(page, []);
  const monthly = [2026, 2025].flatMap((year) =>
    Array.from({ length: 12 }, (_, index) => ({
      ...profile.fan_history.monthly[0],
      year,
      month: index + 1
    }))
  );

  await page.route(`**/api/v4/user/profile/${accountId}`, (route) =>
    route.fulfill({
      json: { ...profile, circle: null, fan_history: { ...profile.fan_history, monthly } }
    })
  );

  const requests: string[] = [];
  await page.route('**/api/v4/circles?*', (route) => {
    const query = new URL(route.request().url()).searchParams,
      year = Number(query.get('year')),
      month = Number(query.get('month'));

    requests.push(`${year}-${month}`);
    return route.fulfill({
      json: {
        circle: { circle_id: 7 },
        members: [
          { viewer_id: 123, year, month, daily_fans: [900_000_000] },
          {
            viewer_id: Number(accountId),
            year,
            month,
            daily_fans: Array.from(
              { length: new Date(year, month, 0).getDate() },
              (_, day) => (year - 2020) * 10_000_000 + month * 2_000_000 + day * 50_000
            )
          }
        ]
      }
    });
  });

  await page.goto(`/profile/${accountId}`);
  const activity = page.getByRole('figure', { name: 'Fan activity', exact: true });
  const chart = activity.locator('.chart-host'),
    labels = chart.locator('svg');

  await expect(labels).toContainText('Jan 01');
  await expect(labels).toContainText('Dec 31');
  const selector = activity.getByRole('combobox', { name: 'Fan activity year' });
  await expect(selector).toContainText('2026');
  await expect(activity.getByRole('combobox', { name: 'Daily history month' })).toHaveCount(0);
  await expect(activity.locator('.fan-controls')).toHaveCount(0);
  expect(await selector.evaluate((el) => Boolean(el.closest('figcaption')))).toBe(true);
  const tabs = page.getByRole('navigation', { name: 'Trainer profile sections' });
  const originalViewport = page.viewportSize()!;
  for (const width of [320, 390, 535, 700, originalViewport.width]) {
    await page.setViewportSize({ width, height: originalViewport.height });
    const bounds = await tabs.boundingBox();
    for (const tab of await tabs.getByRole('link').all()) {
      const link = (await tab.boundingBox())!;
      expect(link.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(link.x + link.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    }

    const title = (await activity
      .getByRole('heading', { name: 'Fan activity', exact: true })
      .boundingBox())!;

    const year = (await selector.boundingBox())!;
    expect(year.x).toBeGreaterThan(title.x + title.width);
    expect(Math.abs(year.y + year.height / 2 - title.y - title.height / 2)).toBeLessThanOrEqual(1);
  }

  expect(requests.sort()).toEqual(Array.from({ length: 12 }, (_, i) => `2026-${i + 1}`).sort());
  await chart.scrollIntoViewIfNeeded();
  const plot = await chart.boundingBox(),
    panel = await activity.boundingBox();

  const header = await activity.locator(':scope > figcaption').boundingBox();
  expect(plot!.y - header!.y - header!.height).toBeLessThanOrEqual(10);
  expect(panel!.y + panel!.height - plot!.y - plot!.height).toBeLessThanOrEqual(12);
  const axis = await chart.locator('text').filter({ hasText: /^Day$/ }).boundingBox();
  expect(plot!.y + plot!.height - axis!.y - axis!.height).toBeLessThanOrEqual(34);
  const lastDate = (await chart
    .locator('text')
    .filter({ hasText: /^Dec 31$/ })
    .boundingBox())!;

  expect(plot!.x + plot!.width - lastDate.x - lastDate.width).toBeLessThanOrEqual(12);
  await page.mouse.move(plot!.x + 8, plot!.y + plot!.height - 14);
  await page.mouse.down();
  await page.mouse.move(plot!.x + plot!.width * 0.55, plot!.y + plot!.height - 14, { steps: 12 });
  await page.mouse.up();
  await expect(labels).not.toContainText('Jan 01');
  await activity.getByRole('button', { name: 'Reset zoom', exact: true }).click();
  await expect(labels).toContainText('Jan 01');
  await chart.focus();
  await chart.press('+');
  await chart.press('+');
  await expect(labels).not.toContainText('Jan 01');
  await chart.press('Home');
  await expect(labels).toContainText('Jan 01');
  await selector.click();
  await activity.getByRole('option', { name: '2025', exact: true }).click();
  await expect(selector).toContainText('2025');
  await expect(
    activity.getByRole('figure', { name: 'Daily total fan progression', exact: true })
  ).toBeVisible();

  expect(requests.filter((key) => key.startsWith('2025-')).sort()).toEqual(
    Array.from({ length: 12 }, (_, i) => `2025-${i + 1}`).sort()
  );

  await chart.scrollIntoViewIfNeeded();
  const dailyBounds = await chart.boundingBox();
  const dayLabel = await chart
    .locator('text')
    .filter({ hasText: /^[A-Z][a-z]{2} (?:0[2-9]|[12]\d|3[01])$/ })
    .first()
    .boundingBox();

  const dayX = dayLabel!.x + dayLabel!.width / 2;
  if (isMobile) await page.touchscreen.tap(dayX, dailyBounds!.y + 70);
  else await page.mouse.move(dayX, dailyBounds!.y + 70);
  await expect(page.getByText(/Change since prior snapshot: \+50,000/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width
  );
});

test('Yearly daily history can retry failures and never substitutes another trainer or year', async ({
  page
}) => {
  await mockOwnerProfile(page, []);
  await page.route(`**/api/v4/user/profile/${accountId}`, (route) =>
    route.fulfill({ json: { ...profile, circle: null } })
  );

  let calls = 0,
    fail = true;

  await page.route('**/api/v4/circles?*', (route) => {
    calls++;
    if (fail) return route.fulfill({ status: 503, json: { message: 'Temporarily unavailable' } });
    return route.fulfill({
      json: {
        circle: { circle_id: 7 },
        members: [
          { viewer_id: 999, year: 2026, month: 8, daily_fans: [5000, 6000] },
          { viewer_id: Number(accountId), year: 2025, month: 8, daily_fans: [5000, 6000] }
        ]
      }
    });
  });

  await page.goto(`/profile/${accountId}`);
  const activity = page.getByRole('figure', { name: 'Fan activity', exact: true });
  await expect(activity.getByRole('alert')).toContainText(
    'Some daily history could not be loaded.'
  );
  fail = false;
  await activity.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(activity.getByText(/No daily snapshots for this year/)).toBeVisible();
  await expect(
    activity.getByRole('figure', { name: 'Daily total fan progression', exact: true })
  ).toHaveCount(0);

  expect(calls).toBe(3);
});

test('Changing years ignores late responses and keeps successful months visible after a partial failure', async ({
  page
}) => {
  await mockOwnerProfile(page, []);
  const monthly = [2026, 2025].flatMap((year) =>
    [1, 2].map((month) => ({ ...profile.fan_history.monthly[0], year, month }))
  );

  await page.route(`**/api/v4/user/profile/${accountId}`, (route) =>
    route.fulfill({
      json: { ...profile, circle: null, fan_history: { ...profile.fan_history, monthly } }
    })
  );

  let release!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/v4/circles?*', async (route) => {
    const query = new URL(route.request().url()).searchParams,
      year = Number(query.get('year')),
      month = Number(query.get('month'));

    if (year === 2026) await pending;
    if (year === 2025 && month === 2)
      return route.fulfill({ status: 500, json: { message: 'Missing month' } });
    return route.fulfill({
      json: {
        circle: { circle_id: 7 },
        members: [
          {
            viewer_id: Number(accountId),
            year,
            month,
            daily_fans: year === 2026 ? [900_000_000] : [500_000, 600_000]
          }
        ]
      }
    });
  });

  await page.goto(`/profile/${accountId}`);
  const activity = page.getByRole('figure', { name: 'Fan activity', exact: true });
  await expect(activity.getByRole('status')).toContainText('Loading');
  await activity.getByRole('combobox', { name: 'Fan activity year' }).click();
  await activity.getByRole('option', { name: '2025', exact: true }).click();
  await expect(
    activity.getByRole('figure', { name: 'Daily total fan progression', exact: true })
  ).toBeVisible();

  await expect(activity.getByRole('alert')).toContainText(
    'Some daily history could not be loaded.'
  );
  const stale = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v4/circles?') &&
      new URL(response.url()).searchParams.get('year') === '2026'
  );

  release();
  await stale;
  await expect(activity.getByRole('combobox', { name: 'Fan activity year' })).toContainText('2025');
  await expect(activity.locator('.chart-host svg')).not.toContainText('900M');
  await expect(activity.locator('.chart-host svg')).toContainText('600K');
  await expect(activity.locator('.chart-host svg')).toContainText('Jan 02');
  await expect(activity.locator('.chart-host svg')).not.toContainText('Dec 31');
});
