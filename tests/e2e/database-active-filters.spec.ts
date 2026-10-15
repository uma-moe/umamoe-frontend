import { expect, test } from './fixtures/test';
import { mockDatabase, mockCharacterCatalog } from './fixtures/api';

test.beforeEach(async ({ page }) => {
  await mockDatabase(page);
  await mockCharacterCatalog(page);
});

test('removing a filter chip preserves other requirements and clears support-card limit break with the card', async ({
  page
}) => {
  const requests: URLSearchParams[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/search/query?'))
      requests.push(new URL(request.url()).searchParams);
  });

  const state = {
    fm: 'advanced',
    b: [
      [10, 3, 3],
      [20, 2, 2]
    ],
    sc: '123',
    lb: 4
  };

  await page.goto(
    '/database?filters=' + encodeURIComponent(Buffer.from(JSON.stringify(state)).toString('base64'))
  );
  const chips = page.getByRole('region', { name: 'Active filters', exact: true });
  await chips.getByRole('button', { name: /Blue: .*3★/ }).click();
  await expect(chips.getByRole('button', { name: /^Blue:/ })).toHaveCount(1);
  await expect.poll(() => requests.at(-1)?.getAll('blue_sparks')).toEqual(['202']);

  await chips.getByRole('button', { name: /Support: .* · LB4/ }).click();
  await expect.poll(() => requests.at(-1)?.get('support_card_id')).toBeNull();
  await expect.poll(() => requests.at(-1)?.get('min_limit_break')).toBeNull();
  await expect(chips.getByRole('button', { name: /^Blue:/ })).toHaveCount(1);
  await page.reload();
  await expect(chips.getByRole('button', { name: /^Blue:/ })).toHaveCount(1);
  await expect(chips.getByRole('button', { name: /^Support:/ })).toHaveCount(0);
});

test('UQL shows one query chip and clearing it removes the query from the search', async ({
  page
}) => {
  const requests: URLSearchParams[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/search/query?'))
      requests.push(new URL(request.url()).searchParams);
  });

  const state = { fm: 'uql', uql: 'speed >= 1000', mwc: 5 };

  await page.goto(
    '/database?filters=' + encodeURIComponent(Buffer.from(JSON.stringify(state)).toString('base64'))
  );
  const chips = page.locator('.active-filter-chips > button');
  await expect(chips).toHaveCount(1);
  await expect(chips).toHaveText('UQL: Active');
  await chips.click();
  await expect(chips).toHaveCount(0);
  await expect.poll(() => requests.at(-1)?.get('uql')).toBeNull();
});
