import { expect, test } from './fixtures/test';
import { mockAffinity, mockDatabase, record } from './fixtures/api';

test('spark order is independent of counts, persists, and applies to bookmarks and split sparks', async ({ page, isMobile }, testInfo) => {
  await mockDatabase(page);
  await mockAffinity(page);
  const result = record();
  Object.assign(result.inheritance, {
    main_white_factors: [2003603, 2016001, 2000101], left_white_factors: [2016001, 2000101], right_white_factors: [2000101],
    white_sparks: [2003603, 2016002, 2000103]
  });
  await page.route('**/search/query?*', route => route.fulfill({ json: { items: [result], total: 1, page: 0, limit: 12, total_pages: 1 } }));
  await page.addInitScript(() => localStorage.setItem('auth_token', 'test-token'));
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'user-1', display_name: 'Tester', created_at: '2026-01-01T00:00:00Z' } }));
  await page.route('**/api/auth/accounts', route => route.fulfill({ json: [] }));
  await page.route('**/api/auth/bookmarks', route => route.fulfill({ json: [result] }));
  let searches = 0;
  page.on('request', request => { if (request.url().includes('/search/query?')) searches++; });
  const filters = Buffer.from(JSON.stringify({ uql: 'optional_white(201600)' })).toString('base64');
  await page.goto(`/database?filters=${encodeURIComponent(filters)}`);
  const card = page.locator('.inheritance-card');
  await card.scrollIntoViewIfNeeded();
  const names = card.locator('.spark--white .name');
  const mainOrder = ['Straightaway Adept', 'Groundwork', 'Right-Handed ○'];
  const alphaOrder = ['Groundwork', 'Right-Handed ○', 'Straightaway Adept'];
  await expect(names).toHaveText(mainOrder);
  const initialSearches = searches;
  await page.getByRole('button', { name: 'Display options', exact: true }).click();
  const picker = page.getByRole('combobox', { name: 'Spark order', exact: true });
  await expect(picker).toContainText('Main parent first');
  for (const [order, expected] of [
    ['Most stars', ['Right-Handed ○', 'Straightaway Adept', 'Groundwork']],
    ['Most occurrences', ['Right-Handed ○', 'Groundwork', 'Straightaway Adept']],
    ['Alphabetical', alphaOrder], ['Main parent first', mainOrder]
  ] as const) {
    await picker.click();
    await page.getByRole('option', { name: order, exact: true }).click();
    await expect(names).toHaveText([...expected]);
    await expect(card.locator('.matched-filter .name')).toHaveText(['Groundwork']);
  }
  await picker.focus(); await picker.press('ArrowDown'); await picker.press('End'); await picker.press('Enter');
  await expect(picker).toContainText('Alphabetical');
  await card.getByRole('button', { name: '★ Stars', exact: true }).click();
  await expect(names).toHaveText(alphaOrder);
  expect(searches).toBe(initialSearches);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('spark-order.png'), fullPage: true });
  await page.getByRole('tab', { name: /Bookmarks/ }).click();
  await expect(names).toHaveText(alphaOrder);
  await page.getByRole('tab', { name: 'Database', exact: true }).click();
  await picker.click(); await page.getByRole('option', { name: 'Most occurrences', exact: true }).click();
  await page.locator('#spark-display').click(); await page.getByRole('option', { name: 'Split sparks', exact: true }).click();
  await expect(names).toHaveText(['Right-Handed ○', 'Right-Handed ○', 'Right-Handed ○', 'Groundwork', 'Groundwork', 'Straightaway Adept']);
  await page.reload();
  await card.scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Display options', exact: true }).click();
  await expect(picker).toContainText('Most occurrences');
  await expect(names).toHaveText(['Right-Handed ○', 'Groundwork', 'Straightaway Adept']);
  await page.evaluate(() => localStorage.setItem('db-spark-order', 'invalid'));
  await page.reload();
  await card.scrollIntoViewIfNeeded();
  await expect(names).toHaveText(mainOrder);
});
