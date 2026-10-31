import { expect, test, replaceQuery, type Page } from './fixtures/test';
import { mockDatabase, mockAffinity, mockVeteranProfile, record } from './fixtures/api';
import { resourceFixtures } from '../fixtures/resource-data';

const veteran = {
  id: 'veteran-uuid',
  member_id: 42,
  trainer_id: '123456789012',
  card_id: 101101,
  trained_chara_id: 991,
  factors: [103],
  win_saddle_id_array: [30, 31],
  speed: 1200,
  stamina: 900,
  power: 1000,
  guts: 700,
  wiz: 900,
  rank_score: 15000
};

const path = (uql: string) =>
  `/database?filters=${encodeURIComponent(Buffer.from(JSON.stringify({ uql })).toString('base64'))}`;

test('empty UQL filters reopen after reload, clearing, and loading a preset', async ({ page }) => {
  await prepare(page);
  await page.goto('/database');
  const filters = page.getByRole('button', { name: 'Filters', exact: true });
  const editor = page.getByRole('textbox', { name: 'UQL query', exact: true });
  await filters.click();
  await expect(page.getByRole('radio', { name: 'Basic', exact: true })).toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Pick target character', exact: true })
  ).toBeVisible();

  await expect(page.getByRole('region', { name: 'Active filters', exact: true })).toBeHidden();
  await page.getByRole('radio', { name: 'UQL', exact: true }).click();
  await expect(editor).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('database-filter-mode-v1')))
    .toBe('uql');
  await page.reload();
  await filters.click();
  await expect(editor).toBeVisible();
  await expect(editor.locator('.cm-placeholder')).toBeVisible();

  await page.locator('.presets summary').click();
  await page.getByLabel('Preset name').fill('Empty UQL');
  await page.getByRole('button', { name: 'Save current filters' }).click();
  await page.locator('.presets summary').click();
  await replaceQuery(editor, 'speed >= 1000');
  await page.getByRole('button', { name: 'Clear UQL', exact: true }).click();
  await filters.click();
  await filters.click();
  await expect(editor.locator('.cm-placeholder')).toBeVisible();

  await replaceQuery(editor, 'speed >= 1000');
  await page.locator('.presets summary').click();
  await page.getByRole('button', { name: /Empty UQL.*filters/ }).click();
  await filters.click();
  await filters.click();
  await expect(editor).toBeVisible();
  await expect(editor.locator('.cm-placeholder')).toBeVisible();
  await expect(page.locator('#app-error')).toBeHidden();
});

async function prepare(page: Page) {
  await mockDatabase(page);
  await mockAffinity(page);
  await page.route('**/resources/*/character.json*', (route) =>
    route.fulfill({ json: resourceFixtures.character })
  );

  await page.route('**/resources/*/character_names.json*', (route) =>
    route.fulfill({ json: resourceFixtures.character_names })
  );

  const requests: URLSearchParams[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/search/query?'))
      requests.push(new URL(request.url()).searchParams);
  });

  return requests;
}

test('UQL highlights searched sparks and keeps main-parent sparks first', async ({
  page,
  isMobile
}, testInfo) => {
  await prepare(page);
  const result = record();
  Object.assign(result.inheritance, {
    main_blue_factors: 203,
    left_blue_factors: 203,
    right_blue_factors: 202,
    blue_sparks: [208],
    main_pink_factors: 1102,
    left_pink_factors: 3403,
    right_pink_factors: 3402,
    pink_sparks: [1102, 3405],
    main_green_factors: 10030102,
    left_green_factors: 10010103,
    right_green_factors: 10020102,
    green_sparks: [10030102, 10010103, 10020102],
    main_white_factors: [2016001, 2003602],
    left_white_factors: [2016003, 2003601],
    right_white_factors: [2000102],
    white_sparks: [2016004, 2003603, 2000102]
  });

  await page.route('**/search/query?*', (route) =>
    route.fulfill({ json: { items: [result], total: 1, page: 0, limit: 12, total_pages: 1 } })
  );

  await page.addInitScript(() => localStorage.setItem('auth_token', 'test-token'));
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      json: { id: 'user-1', display_name: 'Tester', created_at: '2026-01-01T00:00:00Z' }
    })
  );

  await page.route('**/api/auth/accounts', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/auth/bookmarks', (route) => route.fulfill({ json: [result] }));
  await page.goto(
    path(
      'where Long >= 4 and Stamina >= 7 and Optional main white in (Straightaway Adept) and main white factors has all (Groundwork)'
    )
  );
  const card = page.locator('.inheritance-card');
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('.matched-filter .name')).toHaveText([
    'Stamina',
    'Long',
    'Groundwork',
    'Straightaway Adept'
  ]);
  await expect(card.locator('.matched-filter .spark').first()).toHaveCSS(
    'border-color',
    'rgb(255, 215, 0)'
  );
  await expect(card.locator('.spark--pink .name')).toHaveText(['Turf', 'Long']);
  await expect(card.locator('.spark--green').first()).toHaveAttribute('data-source', 'main');
  await page.screenshot({ path: testInfo.outputPath('uql-spark-highlights.png'), fullPage: true });
  await card.getByTitle('Focus Legacy 1 sparks. Click again to clear.').click();
  await expect(card.locator('.matched-filter')).toHaveCount(0);
  await card.getByTitle('Focus Legacy 1 sparks. Click again to clear.').click();
  await expect(card.locator('.matched-filter')).toHaveCount(4);
  await page.getByRole('tab', { name: /Bookmarks/ }).click();
  await expect(card.locator('.matched-filter .name')).toHaveText([
    'Stamina',
    'Long',
    'Groundwork',
    'Straightaway Adept'
  ]);
  await page.getByRole('tab', { name: 'Database', exact: true }).click();
  await page.getByRole('button', { name: 'Display options', exact: true }).click();
  await page.locator('#spark-display').click();
  await page.getByRole('option', { name: 'Split sparks', exact: true }).click();
  await expect(card.locator('.matched-filter .name')).toHaveText([
    'Groundwork',
    'Straightaway Adept'
  ]);
  await expect(card.locator('.matched-filter:not([data-owner="main"])')).toHaveCount(0);
  await page.getByRole('button', { name: /Filters/ }).click();
  const editor = page.getByRole('textbox', { name: 'UQL query', exact: true });
  await replaceQuery(editor, 'GP1 Groundwork >= 3');
  await expect(card.locator('.matched-filter .name')).toHaveText(['Groundwork']);
  await expect(card.locator('.matched-filter')).toHaveAttribute('data-owner', 'left');
  await replaceQuery(editor, 'Followers < 1000');
  await expect(card.locator('.matched-filter')).toHaveCount(0);
});

test('UQL target and UUID legacy restore atomically, survive reload and clear their affinity context', async ({
  page
}) => {
  const requests = await prepare(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route('**/api/v4/user/profile/veterans/veteran-uuid', async (route) => {
    await pending;
    await route.fulfill({ json: veteran });
  });

  const raw =
    'target = [Tokai Teio [Anime Collab]] and owned legacy = [Grass Wonder #veteran-uuid] and Main Speed >= 3';

  await page.goto(path(raw));
  await page.getByRole('button', { name: /Filters/ }).click();
  const editor = page.getByRole('textbox', { name: 'UQL query', exact: true });
  await expect(page.getByText('Loading legacy…', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
  release();
  await expect(page.locator('.uql-status')).toHaveText('Valid');
  await expect.poll(() => requests.at(-1)?.get('p2_main_chara_id')).toBe('1011');
  await expect
    .poll(() =>
      editor
        .locator('.uql-cm-chip-img')
        .evaluateAll(
          (images) =>
            images.length > 0 &&
            images.every(
              (image) =>
                (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
            )
        )
    )
    .toBe(true);
  expect(
    requests.every(
      (request) =>
        request.get('player_chara_id') === '100302' &&
        request.get('p2_main_chara_id') === '1011' &&
        request.get('p2_win_saddle') === '30,31' &&
        request.get('exclude_main_parent_id') === '1011' &&
        request.get('uql') === 'main_blue_factors = 103'
    )
  ).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(editor).toContainText('#veteran-uuid');
  await expect(page.locator('.uql-status')).toHaveText('Valid');
  await expect(page.locator('.active-filter-chips > button')).toHaveCount(1);
  await replaceQuery(editor, 'Main Speed >= 2');
  await expect.poll(() => requests.at(-1)?.get('uql')).toBe('main_blue_factors in (102, 103)');
  for (const key of [
    'player_chara_id',
    'p2_main_chara_id',
    'p2_win_saddle',
    'exclude_main_parent_id'
  ])
    expect(requests.at(-1)?.get(key)).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});

test('UQL failed and stale legacy lookups never run a query without its context', async ({
  page
}) => {
  const requests = await prepare(page);
  let failed = true;
  await page.route('**/api/v4/user/profile/veterans/veteran-uuid', (route) =>
    failed
      ? route.fulfill({ status: 500, json: { message: 'Offline' } })
      : route.fulfill({ json: veteran })
  );

  await page.goto(path('owned legacy = [Grass Wonder #veteran-uuid] and Speed >= 3'));
  await expect(page.getByText('Legacy unavailable', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
  failed = false;
  await page.getByRole('button', { name: 'Retry legacy', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.get('p2_main_chara_id')).toBe('1011');
  await page.getByRole('button', { name: /Filters/ }).click();
  const editor = page.getByRole('textbox', { name: 'UQL query', exact: true });
  await page.route('**/api/v4/user/profile/veterans/missing-uuid', (route) =>
    route.fulfill({ status: 500, json: { message: 'Offline' } })
  );

  await replaceQuery(editor, 'owned legacy = [Grass Wonder #missing-uuid]');
  await expect(page.getByText('Legacy unavailable', { exact: true })).toBeVisible();
  await replaceQuery(editor, 'owned legacy = [Grass Wonder #veteran-uuid] and Speed >= 3');
  await expect(page.locator('.uql-status')).toHaveText('Valid');
  await expect(page.getByText('Legacy unavailable', { exact: true })).toHaveCount(0);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route('**/api/v4/user/profile/veterans/another-uuid', async (route) => {
    await pending;
    await route.fulfill({ json: { ...veteran, id: 'another-uuid', card_id: 100101 } });
  });

  await replaceQuery(editor, 'owned legacy = [Special Week #another-uuid] and Speed >= 6');
  await expect(page.getByText('Loading legacy…', { exact: true })).toBeVisible();
  await replaceQuery(editor, 'Followers < 1000');
  await expect.poll(() => requests.at(-1)?.get('uql')).toBe('follower_num < 1000');
  release();
  await expect(page.locator('.uql-status')).toHaveText('Valid');
  await expect.poll(() => requests.at(-1)?.get('p2_main_chara_id')).toBeNull();
  expect(
    requests.every(
      (request) => request.get('uql') !== 'overlaps(blue_sparks, (106, 107, 108, 109))'
    )
  ).toBe(true);
});

test('UQL opens the shared legacy picker, supports cancellation and preserves account/member choices', async ({
  page
}) => {
  const requests = await prepare(page);
  await mockVeteranProfile(page);
  await page.addInitScript(() => localStorage.setItem('auth_token', 'picker-token'));
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: { id: 'owner', display_name: 'Owner', created_at: '2025-01-01' } })
  );

  await page.route('**/api/auth/accounts', (route) =>
    route.fulfill({
      json: [
        {
          id: 1,
          account_id: '123456789012',
          verification_status: 'verified',
          trainer_name: 'My account'
        }
      ]
    })
  );

  await page.goto(path('owned legacy = [] and Main Speed >= 3'));
  const dialog = page.getByRole('dialog', { name: 'Select Parent', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.parent-row')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: /Filters/ }).click();
  const editor = page.getByRole('textbox', { name: 'UQL query', exact: true });
  // Re-select the picker completion without changing the cancelled placeholder.
  await editor.press('Control+Home');
  for (let index = 0; index < 'owned legacy = ['.length; index++) await editor.press('ArrowRight');
  await editor.press('Control+Space');
  await page.getByRole('option', { name: /Open legacy picker/ }).click();
  await expect(dialog).toBeVisible();
  await dialog.locator('.select-parent').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.uql-status')).toHaveText('Valid');
  await expect.poll(() => requests.at(-1)?.get('p2_main_chara_id')).toBe('1011');
  await expect(editor).toContainText('Grass Wonder #1');
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(atob(new URL(location.href).searchParams.get('filters')!)).uql)
    )
    .toContain('owned legacy = [Grass Wonder #1]');
  await replaceQuery(editor, 'owned legacy = [Grass Wonder #1 @123456789012] and Main Speed >= 3');
  await expect(page.locator('.uql-status')).toHaveText('Valid');
  await page.reload();
  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(page.locator('.uql-status')).toHaveText('Valid');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});

test('multiple UQL context directives validate together and use Angular’s last target and legacy', async ({
  page
}) => {
  const requests = await prepare(page);
  let lookups = 0;
  await page.route('**/api/v4/user/profile/veterans/*', (route) => {
    lookups++;
    const id = new URL(route.request().url()).pathname.split('/').at(-1)!;
    // Distinct historical UUIDs may belong to the same account/member slot.
    return route.fulfill({
      json: { ...veteran, id, card_id: id === 'first-uuid' ? 100101 : 101101 }
    });
  });

  await page.goto(
    path(
      'target = 100101 and legacy = [Special Week #first-uuid] and target = 100302 and legacy = [Grass Wonder #last-uuid] and Main Speed >= 3'
    )
  );
  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(page.locator('.uql-status')).toHaveText('Valid');
  await expect.poll(() => requests.at(-1)?.get('p2_main_chara_id')).toBe('1011');
  expect(lookups).toBe(2);
  expect(
    requests.every(
      (request) =>
        request.get('player_chara_id') === '100302' && request.get('p2_main_chara_id') === '1011'
    )
  ).toBe(true);
  const editor = page.getByRole('textbox', { name: 'UQL query', exact: true });
  await replaceQuery(editor, 'legacy = [Special Week #first-uuid]]');
  await expect(page.locator('.uql-status')).toHaveText('Invalid');
  expect(lookups).toBe(2);
  await page.getByRole('button', { name: 'Clear UQL', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.get('uql')).toBeNull();
  expect(requests.at(-1)?.get('p2_main_chara_id')).toBeNull();
});
