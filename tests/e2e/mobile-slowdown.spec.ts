import { expect, test, replaceQuery } from './fixtures/test';
import { mockDatabase, mockAffinity, record } from './fixtures/api';

test('mobile filters and UQL remain usable with 12 records at 8x CPU slowdown', async ({
  page,
  browserName,
  isMobile
}, testInfo) => {
  test.skip(browserName !== 'chromium' || !isMobile, 'Chrome CPU throttling with touch input');
  test.setTimeout(90_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 });
  await mockDatabase(page);
  await mockAffinity(page);
  const items = Array.from({ length: 12 }, (_, index) => {
    const item = record(String(123456789012 + index));
    item.inheritance.inheritance_id = index + 1;
    return item;
  });

  const queries: string[] = [];
  await page.route('**/search/query?*', (route) => {
    queries.push(new URL(route.request().url()).searchParams.get('uql') ?? '');
    return route.fulfill({ json: { items, total: 12, page: 0, limit: 12, total_pages: 1 } });
  });

  await page.goto('/database');
  await expect(page.locator('.inheritance-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Filters', exact: true }).tap();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).tap();
  await expect(page.locator('[data-filter-group="races"] .collapsible-body')).toBeEmpty();
  const start = Date.now();
  await page.getByRole('radio', { name: 'UQL', exact: true }).tap();
  const editor = page.getByRole('textbox', { name: 'UQL query', exact: true });
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.uql-status')).not.toHaveText('Loading');
  const readyMs = Date.now() - start;
  await replaceQuery(editor, 'Main Spe');
  await editor.press('Control+Space');
  await expect(page.locator('.cm-tooltip-autocomplete')).toBeVisible();
  await editor.press('Escape');
  await replaceQuery(editor, 'Main Speed >= 3 and Followers < 1000');
  await expect(page.locator('.uql-status')).toHaveText('Valid');
  await expect.poll(() => queries.at(-1)).toBe('main_blue_factors = 103 and follower_num < 1000');
  await page.getByRole('button', { name: 'Clear UQL', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Clear UQL', exact: true })).toHaveCount(0);
  await expect.poll(() => queries.at(-1)).toBe('');
  await page.getByRole('radio', { name: 'Basic', exact: true }).tap();
  await expect(page.locator('[data-filter-group="inheritance"] .group-title')).toBeVisible();
  await testInfo.attach('mobile-slowdown', {
    body: JSON.stringify({ cpu: 8, records: 12, uqlReadyMs: readyMs }),
    contentType: 'application/json'
  });
});

test('a failed rich editor download keeps the UQL query editable and validated', async ({
  page
}) => {
  await mockDatabase(page);
  await page.route('**/app/DatabaseUqlEditor-*.js', (route) => route.abort());
  const queries: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/search/query?'))
      queries.push(new URL(request.url()).searchParams.get('uql') ?? '');
  });

  const raw = 'Main Speed >= 3\nand Followers < 1000';
  await page.goto(
    `/database?filters=${encodeURIComponent(Buffer.from(JSON.stringify({ uql: raw })).toString('base64'))}`
  );

  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'UQL query', exact: true });
  await expect(editor).toHaveValue(raw);
  await expect.poll(() => queries.at(-1)).toBe('main_blue_factors = 103 and follower_num < 1000');
  await editor.fill('Followers >= 500');
  await expect.poll(() => queries.at(-1)).toBe('follower_num >= 500');
  await editor.fill('Followers >=');
  await expect(page.locator('#uql-plain-status')).not.toBeEmpty();
  await page.waitForTimeout(500);
  expect(queries.at(-1)).toBe('follower_num >= 500');
});
