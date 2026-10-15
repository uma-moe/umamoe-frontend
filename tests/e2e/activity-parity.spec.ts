import { expect, test } from './fixtures/test';
import { mockActivity } from './fixtures/api';

test('Activity list retains Angular filters, facts, metrics, and query compatibility', async ({
  page
}) => {
  await mockActivity(page);
  await page.goto('/activity?sortBy=active_time&minScore=40&minDays=7');
  await expect(page.getByRole('heading', { name: 'Top 100 Club Activity Reports' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Sort by' })).toContainText('Active time');
  await expect(page.getByText('Mejiro Analyst')).toBeVisible();
  await expect(page.getByText('Fan gain').first()).toBeVisible();
  await expect(page.getByText('84')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    await page.evaluate(() => innerWidth)
  );
  await expect(page.locator('.pager nav button')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  const selects = page.locator('.filters [role="combobox"]');
  const widths = await selects.evaluateAll((elements) =>
    elements.map((el) => el.getBoundingClientRect().width)
  );

  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
  for (const select of await selects.all())
    await expect(select.locator('.selected-copy svg')).toBeVisible();
});

test('Activity detail exposes every Angular report family and remains contained on mobile', async ({
  page
}) => {
  await mockActivity(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/activity/42');
  for (const heading of [
    'Score inputs',
    'Why this account received this score',
    'Weekly activity heatmap',
    'Career length buckets',
    'Daily fan gain',
    'Top sessions',
    'Short careers',
    'Probe metrics'
  ])
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  await expect(page.getByText('Highlighted short career')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('Activity rows retain neutral metrics and the dense mobile evidence layout', async ({
  page
}) => {
  await mockActivity(page);
  await page.goto('/activity');
  const row = page.locator('.activity-row').first();
  await expect(row).toBeVisible();
  await expect(row.locator('.identity small')).toContainText('Rate anomaly');
  for (const width of [1536, 390]) {
    await page.setViewportSize({ width, height: 960 });
    const value = row.locator('dd').first(),
      label = row.locator('dt').first();

    expect((await value.boundingBox())!.y).toBeLessThan((await label.boundingBox())!.y);
    if (width === 390) {
      await expect(row.locator('.rank')).toBeHidden();
      expect((await row.locator('.open').boundingBox())!.width).toBeGreaterThanOrEqual(44);
      expect((await row.boundingBox())!.height).toBeLessThan(210);
      await expect(row.locator('.identity small')).toContainText('Short high-fan careers');
    }

    for (const theme of ['light', 'dark']) {
      if ((await page.locator('html').getAttribute('data-theme')) !== theme)
        await page.getByRole('button', { name: 'Toggle theme' }).click();
      for (const [index, token] of ['--accent-warning', '--accent-green-strong'].entries()) {
        const color = await page.evaluate((token) => {
          const probe = document.createElement('span');
          probe.style.color = `var(${token})`;
          document.body.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        }, token);

        await expect(
          page.locator('.activity-row').nth(index).locator('.row-score strong')
        ).toHaveCSS('color', color);
      }

      expect(await row.locator('dl').evaluate((el) => getComputedStyle(el).color)).toBe(
        await page.locator('html').evaluate((el) => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--text-primary)';
          el.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        })
      );
    }
  }
});

test('Activity navigation reloads list and report state without a full browser reload', async ({
  page
}) => {
  await mockActivity(page);
  await page.goto('/activity?sortBy=active_time&minDays=7');
  await page.getByRole('link', { name: 'Mejiro Analyst', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Score inputs', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.locator('.activity-list')).toContainText('Mejiro Analyst');
  await expect(page.getByRole('combobox', { name: 'Sort by', exact: true })).toContainText(
    'Active time'
  );

  await expect(page.getByRole('combobox', { name: 'Minimum observed', exact: true })).toContainText(
    '7+ observed days'
  );
});
