import { expect, test, type Page } from './fixtures/test';
import {
  mockAffinity,
  mockDatabase,
  mockVeteranProfile,
  mockParentRowProfile,
  record
} from './fixtures/api';

test('Shared legacy context survives URLs and presets without silently persisting in preferences', async ({
  page,
  isMobile
}) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
  await mockDatabase(page);
  await mockAffinity(page);
  const requests: URLSearchParams[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/search/query?'))
      requests.push(new URL(request.url()).searchParams);
  });

  const state = { t: [1013], p2c: 1006, p2w: [100, 101], p2i: 42 };

  await page.goto(
    `/database?filters=${encodeURIComponent(Buffer.from(JSON.stringify(state)).toString('base64'))}`
  );
  await expect.poll(() => requests.at(-1)?.get('p2_main_chara_id')).toBe('1006');
  expect(requests.at(-1)?.get('main_parent_id')).toBeNull();
  expect(requests.at(-1)?.get('p2_win_saddle')).toBe('100,101');
  expect(requests.at(-1)?.get('exclude_main_parent_id')).toBe('1006');
  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(
    page.locator('.shared-legacy').getByText('Shared legacy #42', { exact: true })
  ).toBeVisible();

  await page.locator('.presets summary').click();
  await page.getByRole('textbox', { name: 'Preset name', exact: true }).fill('Shared affinity');
  await page.getByRole('button', { name: 'Save current filters', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(
          atob(JSON.parse(localStorage.getItem('database-filter-presets-v1') ?? '[]')[0].state)
        )
      )
    )
    .toMatchObject({ p2c: 1006, p2w: [100, 101], p2i: 42, t: [1013, null, null, null] });

  const preference = await page.evaluate(() =>
    JSON.parse(atob(JSON.parse(localStorage.getItem('database-filter-state-v2') ?? '{}').formState))
  );

  for (const key of ['p2c', 'p2w', 'p2i']) expect(preference).not.toHaveProperty(key);
  await page.reload();
  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(
    page.locator('.shared-legacy').getByText('Shared legacy #42', { exact: true })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Clear selected legacy', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.get('p2_main_chara_id')).toBeNull();
  expect(requests.at(-1)?.get('exclude_main_parent_id')).toBeNull();
  await page.locator('.presets summary').click();
  await page.getByRole('button', { name: /^Shared affinity.*filter/ }).click();
  await page.locator('.presets summary').click();
  await expect(
    page.locator('.shared-legacy').getByText('Shared legacy #42', { exact: true })
  ).toBeVisible();

  await expect.poll(() => requests.at(-1)?.get('p2_main_chara_id')).toBe('1006');
  expect(requests.at(-1)?.get('main_parent_id')).toBeNull();
  if (isMobile) {
    const clear = await page
      .getByRole('button', { name: 'Clear selected legacy', exact: true })
      .boundingBox();

    expect(clear!.width).toBeGreaterThanOrEqual(28);
    expect(clear!.height).toBeGreaterThanOrEqual(28);
  }

  await page.screenshot({ path: test.info().outputPath('shared-legacy-context.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width
  );
  await page.goto('/database');
  await expect.poll(() => requests.at(-1)?.get('p2_main_chara_id')).toBeNull();
});

async function prepare(
  page: Page,
  authenticated = false,
  filters?: Record<string, unknown>,
  profile: (page: Page) => Promise<unknown> = mockVeteranProfile
) {
  await mockDatabase(page);
  await mockAffinity(page);
  if (authenticated) {
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
            trainer_name: 'First account',
            verification_status: 'verified'
          },
          {
            id: 2,
            account_id: '222222222222',
            trainer_name: 'Second account',
            verification_status: 'verified'
          },
          {
            id: 3,
            account_id: '333333333333',
            trainer_name: 'Unverified',
            verification_status: 'pending'
          }
        ]
      })
    );

    await profile(page);
    await page.route('**/api/v4/user/profile/222222222222', (route) =>
      route.fulfill({ json: { veterans: [] } })
    );

    await page.route('**/api/auth/bookmarks', (route) => route.fulfill({ json: [record()] }));
    await page.route('**/api/v4/partner/saved', (route) => route.fulfill({ json: [] }));
  }

  await page.goto(
    `/database${filters ? `?filters=${encodeURIComponent(Buffer.from(JSON.stringify(filters)).toString('base64'))}` : ''}`
  );
  await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Pick your legacy', exact: true }).click();
  return page.getByRole('dialog', { name: 'Select Parent', exact: true });
}

for (const target of [false, true])
  test(`parent picker keeps accounts and combined Uma identities on single rows at narrow widths${target ? ' with affinity' : ''}`, async ({
    page
  }) => {
    const dialog = await prepare(page, true, target ? { t: [100102] } : undefined);
    const summary = dialog.locator('.parent-row .veteran-summary').first();
    await expect(summary.locator('.summary-parent')).toHaveCount(2);
    for (const width of [500, 390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const title = (await dialog
        .getByRole('heading', { name: 'Select Parent', exact: true })
        .boundingBox())!;

      const accounts = dialog.getByRole('radiogroup', { name: 'Linked account' });
      const accountBounds = (await accounts.boundingBox())!;
      expect(accountBounds.y).toBeLessThan(title.y + title.height);
      expect(accountBounds.y + accountBounds.height).toBeGreaterThan(title.y);
      expect(accountBounds.x).toBeGreaterThanOrEqual(title.x + title.width);
      await accounts.getByRole('radio', { name: 'Second account', exact: true }).click();
      await expect(dialog.locator('.drop strong')).toHaveText('Upload veterans');
      await accounts.getByRole('radio', { name: 'First account', exact: true }).click();
      await expect(summary).toBeVisible();
      const main = (await summary.locator('.summary-head').boundingBox())!;
      expect((await summary.locator('h3').boundingBox())!.width).toBeGreaterThan(10);
      let right = main.x + main.width;
      for (const parent of await summary.locator('.summary-parent').all()) {
        const bounds = (await parent.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(right);
        right = bounds.x + bounds.width;
        expect(bounds.y).toBeLessThan(main.y + main.height);
        expect(bounds.y + bounds.height).toBeGreaterThan(main.y);
      }

      expect(
        await summary.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        `Summary fits ${width}px`
      ).toBe(true);
      expect(
        await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
      ).toBe(true);
      await dialog.screenshot({
        path: test.info().outputPath(`parent-picker-${width}.png`),
        scale: 'css'
      });
    }
  });

test('Parent rows preserve Angular encoded factors, legacy inheritance, star ordering and empty-parent omission', async ({
  page,
  isMobile
}) => {
  if (isMobile) await page.setViewportSize({ width: 500, height: 844 });
  await prepare(page, true, undefined, mockParentRowProfile);
  const dialog = page.getByRole('dialog', { name: 'Select Parent', exact: true });
  await expect(dialog.locator('.parent-row')).toHaveCount(3);
  const rows = dialog.locator('.parent-row');
  const display = dialog.getByRole('radiogroup', { name: 'Parent spark display' });
  await expect(display.getByRole('radio', { name: 'Combined', exact: true })).toBeChecked();
  await expect(rows.first().locator('.factor-list .spark')).toHaveText(['9★Speed', '3★Stamina']);
  await display.getByRole('radio', { name: 'Split', exact: true }).click();
  if (!isMobile) {
    const header = (await rows.first().locator('.summary-head').boundingBox())!;
    const sparks = (await rows.first().locator('.factor-list').boundingBox())!;
    const parentSparks = (await rows.first().locator('.parent-factors').boundingBox())!;
    expect(sparks.x).toBeGreaterThan(header.x + header.width);
    expect(sparks.y).toBeLessThan(header.y + header.height);
    expect(sparks.x).toBe(parentSparks.x);
    expect(parentSparks.x - (await rows.first().boundingBox())!.x).toBeLessThan(190);
    expect((await rows.first().boundingBox())!.height).toBeLessThan(110);
  } else {
    const parent = rows.first().locator('.summary-parent').first();
    const identity = (await parent.locator('.parent-id').boundingBox())!;
    const sparks = (await parent.locator('.parent-factors').boundingBox())!;
    expect(sparks.y).toBeGreaterThanOrEqual(identity.y + identity.height);
    expect(sparks.width).toBeCloseTo((await parent.boundingBox())!.width, 0);
  }

  for (const [index, expected] of [
    [0, ['3 Speed', '3 Stamina', '1 Speed']],
    [1, ['3 Speed', '3 Stamina', '1 Speed']],
    [2, ['3 Speed', '3 Stamina', '1 Speed', '1 Stamina']]
  ] as const) {
    await expect(rows.nth(index).locator('.factor-list .spark')).toHaveText(
      expected.map((text) => text.replace(' ', '★'))
    );
    const portrait = (await rows.nth(index).locator('.summary-head .art').boundingBox())!;
    const heading = (await rows.nth(index).locator('.identity').boundingBox())!;
    expect(heading.y).toBeGreaterThanOrEqual(portrait.y);
    expect(heading.y).toBeLessThan(portrait.y + portrait.height);
  }

  await expect(rows.first().locator('.summary-parent')).toHaveCount(1);
  await expect(rows.first().locator('.summary-parent .spark')).toHaveText(['3★Speed', '2★Speed']);
  await expect(rows.first().locator('.factor-list .spark').first()).toHaveAttribute(
    'aria-label',
    /3 star Speed/
  );
  await expect(rows.locator('.rank-score')).toHaveCount(0);
  await display.getByRole('radio', { name: 'Combined', exact: true }).click();
  await expect(rows.first().locator('.parent-factors')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Add Spark', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Add spark filter', exact: true });
  await expect(editor.getByRole('button', { name: 'Blue stats', exact: true })).toBeFocused();
  await editor.getByRole('button', { name: 'Add Speed spark', exact: true }).click();
  await editor.getByRole('radio', { name: 'Own', exact: true }).click();
  await editor.getByRole('button', { name: 'Add filter', exact: true }).click();
  await expect(rows).toHaveCount(3);
  await expect(rows.first().locator('.factor-list .spark.matched')).toHaveText(['9★Speed']);
  await display.getByRole('radio', { name: 'Split', exact: true }).click();
  await expect(rows.first().locator('.factor-list .spark.matched')).toHaveText([
    '3★Speed',
    '1★Speed'
  ]);
  await expect(rows.first().locator('.parent-factors .spark.matched')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Speed 1–3★ (Own)', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit spark filter', exact: true });
  await edit.getByRole('radio', { name: 'Combined', exact: true }).click();
  await edit.getByRole('slider', { name: 'Stars minimum' }).fill('6');
  await edit.getByRole('button', { name: 'Save filter', exact: true }).click();
  await expect(rows.first().locator('.parent-factors .spark.matched')).toHaveText([
    '3★Speed',
    '2★Speed'
  ]);
  await expect(rows.first().locator('.factor-list .spark.matched')).toHaveText([
    '3★Speed',
    '1★Speed'
  ]);
  await dialog.screenshot({
    path: test.info().outputPath('split-matched-parents.png'),
    scale: 'css'
  });

  await dialog.getByRole('button', { name: 'Speed 6–9★ (Combined)', exact: true }).click();
  await edit.getByRole('radio', { name: 'P1', exact: true }).click();
  await edit.getByRole('button', { name: 'Save filter', exact: true }).click();
  await expect(rows.first().locator('.factor-list .spark.matched')).toHaveCount(0);
  await expect(rows.first().locator('.parent-factors .spark.matched')).toHaveText(['3★Speed']);
  await display.getByRole('radio', { name: 'Combined', exact: true }).click();
  await expect(rows.first().locator('.factor-list .spark.matched')).toHaveText(['9★Speed']);
  await dialog.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expect(rows.locator('.spark.matched')).toHaveCount(0);
  await dialog.screenshot({ path: test.info().outputPath('parent-rows.png') });
  await rows.nth(1).locator('.select-parent').focus();
  await page.keyboard.press('Enter');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear selected legacy' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width
  );
});

test('Veterans without an outfit ID retain the Angular name, portrait, search and owned selection', async ({
  page
}) => {
  const queries: URLSearchParams[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/search/query?')) queries.push(new URL(request.url()).searchParams);
  });

  // Install the intended profile before navigation, not through an artificial
  // setup reload racing Database's pending Advanced-mode search debounce.
  await prepare(page, true, undefined, async (page) => {
    const parents = await mockParentRowProfile(page);
    await page.route('**/api/v4/user/profile/123456789012', (route) =>
      route.fulfill({
        json: {
          veterans: parents.map((parent, index) =>
            index === 0 ? { ...parent, card_id: null, trained_chara_id: 1013 } : parent
          )
        }
      })
    );
  });

  const dialog = page.getByRole('dialog', { name: 'Select Parent', exact: true });
  await dialog.getByRole('textbox', { name: 'Search parents', exact: true }).fill('Mejiro McQueen');
  await expect(dialog.locator('.parent-row')).toHaveCount(1);
  await expect(dialog.locator('.summary-head h3')).toHaveText('Mejiro McQueen');
  await expect(dialog.locator('.summary-head .art img')).toHaveAttribute(
    'src',
    '/game-assets/character_thumbs/chara_stand_1013_101301.webp'
  );
  await dialog.getByRole('button', { name: 'Select Mejiro McQueen', exact: true }).press('Enter');
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Legacy spark display' })
    .getByRole('radio', { name: 'Split', exact: true })
    .click();

  await expect(page.locator('.tree-group--veteran .parent-factors .spark--blue')).toHaveCount(2);
  await page
    .locator('.affinity-tree')
    .screenshot({ path: test.info().outputPath('selected-veteran.png') });

  await expect.poll(() => queries.at(-1)?.get('p2_main_chara_id')).toBe('1013');
  const encoded = new URL(page.url()).searchParams.get('filters');
  expect(JSON.parse(Buffer.from(encoded!, 'base64').toString()).vet).toEqual(['123456789012', 1]);
  const restoredSearch = page.waitForResponse(
    (response) =>
      response.url().includes('/search/query?') &&
      new URL(response.url()).searchParams.get('p2_main_chara_id') === '1013'
  );

  await page.reload();
  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(page.locator('.tree-group--veteran h3')).toBeVisible();
  // Complete the restored search before this test leaves for an unrelated route.
  expect(await (await restoredSearch).finished()).toBeNull();
  await page.goto('/tools/lineage-planner');
  await page.getByRole('button', { name: 'Pick Veteran for Parent 1', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Search parents', exact: true }).fill('Mejiro McQueen');
  await dialog.getByRole('button', { name: 'Select Mejiro McQueen', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Change Parent 1: Mejiro McQueen', exact: true })
  ).toBeVisible();

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('lineage-planner-state-v1')!).find(
      (node: { position: string }) => node.position === 'p1'
    )
  );

  expect(saved.characterId).toBe(101301);
  expect(saved.veteran.card_id).toBeNull();
  expect(saved.veteran.trained_chara_id).toBe(1013);
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Change Parent 1: Mejiro McQueen', exact: true })
  ).toBeVisible();
});

test('Manual character selectors rank affinity against the target and main parent without losing dialog state', async ({
  page
}) => {
  const dialog = await prepare(page, false, { t: [1013] });
  await dialog.getByRole('tab', { name: /Manual/ }).click();
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Entry name (optional)' }).fill('Keep this draft');
  await dialog.getByRole('button', { name: 'Choose Parent 1', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Select Character', exact: true });
  await expect(picker.getByRole('button', { name: 'Sort: Affinity' })).toBeVisible();
  const search = picker.getByRole('searchbox', { name: 'Search characters' });
  await search.fill('Oguri Cap');
  await expect(picker.getByRole('radio').getByLabel('Affinity: 2', { exact: true })).toBeVisible();
  await picker.getByRole('radio').click();
  await expect(picker).not.toBeVisible();
  const trigger = dialog.getByRole('button', { name: 'Choose Grandparent 1', exact: true });
  await trigger.focus();
  await trigger.press('Enter');
  await expect(search).toHaveValue('');
  await search.fill('Mejiro McQueen');
  await expect(
    picker.getByRole('radio').first().getByLabel('Affinity: 4', { exact: true })
  ).toBeVisible();

  await picker.getByRole('button', { name: 'Sort: Affinity' }).click();
  await picker.getByRole('menuitemradio', { name: 'Name (A–Z)' }).click();
  await expect(picker.getByRole('button', { name: 'Sort: Name' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(dialog.getByRole('textbox', { name: 'Entry name (optional)' })).toHaveValue(
    'Keep this draft'
  );

  await trigger.press('Enter');
  await expect(search).toHaveValue('');
  await expect(picker.getByRole('button', { name: 'Sort: Affinity' })).toBeVisible();
  await search.fill('Mejiro McQueen');
  await picker.getByRole('radio').first().click();
  await dialog.getByRole('button', { name: 'Save Entry', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Select Keep this draft' })).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('vpd_manual_entries')!)[0])
  ).toMatchObject({ label: 'Keep this draft', mainCardId: 100601, p1CardId: 101301 });
});

test('Veteran picker uses shared spark colors in both themes', async ({ page }) => {
  const dialog = await prepare(page, true);
  await dialog.getByRole('tab', { name: /Bookmarks/ }).click();
  const pink = dialog.locator('.factor-list .spark--pink').first(),
    green = dialog.locator('.factor-list .spark--green').first();

  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    await expect(pink).toHaveCSS('background-color', 'rgba(233, 30, 99, 0.15)');
    await expect(green).toHaveCSS('background-color', 'rgba(76, 175, 80, 0.15)');
    await expect(pink).toHaveCSS('border-top-color', 'rgba(233, 30, 99, 0.5)');
    await expect(green).toHaveCSS(
      'color',
      theme === 'dark' ? 'rgb(129, 199, 132)' : 'rgb(15, 118, 110)'
    );
  }
});

test('Parent picker distinguishes anonymous, filtered and bookmarked empty states and closes on sign-in', async ({
  page
}) => {
  const dialog = await prepare(page);
  await expect(dialog.locator('.drop strong')).toHaveText('Upload veterans');
  await expect(
    dialog.getByText('Stored on this device. Sign in to add to your account.', { exact: true })
  ).toBeVisible();

  await dialog.screenshot({ path: test.info().outputPath('veteran-signin-state.png') });
  await expect(dialog.getByRole('textbox', { name: 'Search parents', exact: true })).toBeVisible();
  await dialog.getByRole('tab', { name: /Bookmarks/ }).click();
  await dialog.getByRole('textbox', { name: 'Search parents', exact: true }).fill('Missing');
  await dialog.getByRole('tab', { name: /Veterans/ }).click();
  await expect(
    dialog.getByRole('heading', { name: 'No veterans match your filters' })
  ).toBeVisible();

  await dialog
    .locator('.empty')
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();

  await dialog.getByRole('tab', { name: /Bookmarks/ }).click();
  await expect(dialog.getByRole('heading', { name: 'Sign in to use bookmarks' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(1);
  await dialog.getByRole('tab', { name: /Veterans/ }).click();
  await dialog.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=\/veterans$/);
  await expect(dialog).not.toBeVisible();
});

test('Unlinked parent picker supports device imports and links to account settings', async ({
  page
}) => {
  const dialog = await prepare(page, true, undefined, async (page) => {
    await mockVeteranProfile(page);
    await page.route('**/api/auth/accounts', (route) => route.fulfill({ json: [] }));
  });

  await expect(dialog.locator('.drop strong')).toHaveText('Upload veterans');
  await expect(dialog.locator('.empty-upload .drop')).toContainText(
    'Drop your JSON files here or click to browse.'
  );
  await dialog.getByRole('link', { name: 'Open Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(dialog).not.toBeVisible();
});

test('Select Parent uses linked accounts, scoped factors, bookmarks and restores the Angular owned reference', async ({
  page
}) => {
  const dialog = await prepare(page, true);
  await expect(dialog.locator('.parent-row')).toHaveCount(1);
  await expect(dialog.getByRole('radio', { name: 'Unverified' })).toHaveCount(0);
  await dialog.getByRole('radio', { name: 'Second account', exact: true }).click();
  await expect(dialog.locator('.drop strong')).toHaveText('Upload veterans');
  await expect(dialog.locator('.empty-upload .drop')).toContainText(
    'Drop your JSON files here or click to browse.'
  );
  await expect(dialog.getByRole('link', { name: 'Get umadump', exact: true })).toHaveAttribute(
    'href',
    'https://werseter.github.io/umadump/'
  );

  await dialog.screenshot({ path: test.info().outputPath('veteran-upload-state.png') });
  await dialog.getByRole('radio', { name: 'First account', exact: true }).click();
  await dialog.getByRole('button', { name: 'Add Spark', exact: true }).click();
  const addFilter = page.getByRole('dialog', { name: 'Add spark filter', exact: true });
  await addFilter.getByRole('button', { name: 'Add Speed spark', exact: true }).click();
  await addFilter.getByRole('radio', { name: 'P2', exact: true }).click();
  await addFilter.getByRole('button', { name: 'Add filter', exact: true }).click();
  await expect(dialog.locator('.parent-row')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Speed 1–3★ (P2)', exact: true }).click();
  const editFilter = page.getByRole('dialog', { name: 'Edit spark filter', exact: true });
  await editFilter.getByRole('radio', { name: 'P1', exact: true }).click();
  await editFilter.getByRole('button', { name: 'Save filter', exact: true }).click();
  await expect(dialog.locator('.parent-row')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: 'Speed 1–3★ (P1)', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('parent-picker.png') });
  await dialog.locator('.select-parent').click();
  await expect(page.getByRole('button', { name: 'Clear selected legacy' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const encoded = new URL(location.href).searchParams.get('filters');
        return encoded ? JSON.parse(atob(encoded)).vet : null;
      })
    )
    .toEqual(['123456789012', 1]);

  await page.reload();
  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(page.getByRole('button', { name: 'Clear selected legacy' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear selected legacy' }).click();
  await page.getByRole('button', { name: 'Pick your legacy', exact: true }).click();
  await dialog.getByRole('tab', { name: /Bookmarks/ }).click();
  await expect(dialog.locator('.parent-row')).toHaveCount(1);
  await dialog.locator('.select-parent').click();
  const popup = page.waitForEvent('popup');
  await page.locator('.inheritance-card').first().getByTitle('Open in Lineage Planner').click();
  const planner = await popup;
  await expect(planner).toHaveURL(/lineage/);
  // A warm catalog need not make a request. Wait for the populated UI instead.
  await expect(planner.locator('.spark--blue').first()).toContainText('Speed');
  await expect
    .poll(() =>
      planner.evaluate(() =>
        JSON.parse(localStorage.getItem('lineage-planner-state-v1') ?? '[]')
          .find((node: { position: string }) => node.position === 'p2')
          ?.sparks.map((spark: { factorId: number }) => spark.factorId)
      )
    )
    .toEqual([10, 120, 1001010, 200010]);
  await planner.reload();
  await expect(
    planner.getByRole('button', { name: /Change Parent 2: Mejiro McQueen/ })
  ).toBeVisible();

  await planner.getByRole('button', { name: 'Pick Veteran for Parent 1', exact: true }).click();
  const shared = planner.getByRole('dialog', { name: 'Select Parent', exact: true });
  await expect(shared).toBeVisible();
  await shared.getByRole('tab', { name: /Manual/ }).click();
  await shared.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await planner.getByRole('button', { name: 'Pick Veteran for Parent 1', exact: true }).click();
  await expect(shared.getByRole('tab', { name: /Manual/ })).toHaveAttribute(
    'aria-selected',
    'true'
  );
});

test('Manual parent entries retain Angular storage, editing, selection, cancellation and deletion', async ({
  page,
  isMobile
}) => {
  if (isMobile) await page.setViewportSize({ width: 320, height: 844 });
  const dialog = await prepare(page);
  await dialog.getByRole('tab', { name: /Manual/ }).click();
  expect(
    (await dialog.getByRole('button', { name: 'Add', exact: true }).boundingBox())!.height
  ).toBeLessThanOrEqual(
    (await dialog.getByRole('textbox', { name: 'Search parents', exact: true }).boundingBox())!
      .height
  );

  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  const main = dialog.getByRole('region', { name: 'Parent 1', exact: true });
  const parentBounds = await main.boundingBox(),
    gp1Bounds = await dialog
      .getByRole('region', { name: 'Grandparent 1', exact: true })
      .boundingBox(),
    gp2Bounds = await dialog
      .getByRole('region', { name: 'Grandparent 2', exact: true })
      .boundingBox();

  if (isMobile) {
    expect(gp1Bounds!.y).toBeGreaterThan(parentBounds!.y + parentBounds!.height);
    expect(gp2Bounds!.y).toBeGreaterThan(gp1Bounds!.y + gp1Bounds!.height);
    expect(gp1Bounds!.x).toBe(parentBounds!.x);
    expect(gp1Bounds!.x).toBe(gp2Bounds!.x);
  } else {
    expect(gp1Bounds!.y).toBe(parentBounds!.y);
    expect(gp2Bounds!.y).toBe(parentBounds!.y);
    expect(gp1Bounds!.x).toBeGreaterThan(parentBounds!.x + parentBounds!.width);
    expect(gp2Bounds!.x).toBeGreaterThan(gp1Bounds!.x + gp1Bounds!.width);
  }

  expect(gp1Bounds!.width).toBeCloseTo(gp2Bounds!.width, 0);
  await dialog.getByRole('textbox', { name: 'Entry name (optional)' }).fill('Test parent');
  await dialog.getByRole('button', { name: 'Clear entry name' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Entry name (optional)' })).toBeFocused();
  await dialog.getByRole('textbox', { name: 'Entry name (optional)' }).fill('Test parent');
  await dialog.getByRole('button', { name: 'Choose Parent 1', exact: true }).click();
  const character = page.getByRole('dialog', { name: 'Select Character', exact: true });
  await expect(character.getByRole('radio').first().locator('img')).toHaveAttribute(
    'src',
    /100101\.webp$/
  );
  await expect(character.getByRole('radio', { name: /Chrono Genesis/ })).toHaveCount(0);
  await character.getByRole('searchbox', { name: 'Search characters' }).fill('Mejiro McQueen');
  await character
    .getByRole('radio', { name: /Mejiro McQueen/ })
    .first()
    .click();

  await expect(main.getByRole('combobox')).toHaveCount(0);
  const add = main.getByRole('button', { name: 'Add Spark', exact: true });
  await add.click();
  const search = main.getByRole('combobox', { name: 'Add spark to Parent 1', exact: true });
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await expect(main.getByRole('listbox')).toHaveCount(0);
  await expect(main.getByRole('radio', { name: '3★', exact: true })).toHaveAttribute(
    'aria-checked',
    'true'
  );

  if (isMobile) {
    expect((await search.boundingBox())!.height).toBeGreaterThanOrEqual(32);
    expect(
      (await main.getByRole('radio', { name: '3★', exact: true }).boundingBox())!.height
    ).toBeGreaterThanOrEqual(32);
  }

  await search.fill('Speed');
  await main.getByRole('option', { name: 'Speed', exact: true }).click();
  await expect(add).toBeFocused();
  await expect(main.locator('.spark')).toHaveAttribute('aria-label', '3 star Speed');
  await add.click();
  await search.fill('Speed');
  await main.getByRole('radio', { name: '2★', exact: true }).click();
  const suggestions = main.getByRole('listbox');
  await expect(suggestions).toBeVisible();
  const popupBounds = await suggestions.boundingBox(),
    editorBounds = await main.locator('.spark-add-control').boundingBox();

  expect(
    popupBounds!.y >= editorBounds!.y + editorBounds!.height ||
      popupBounds!.y + popupBounds!.height <= editorBounds!.y
  ).toBe(true);
  expect(popupBounds!.width).toBeCloseTo(editorBounds!.width, 0);
  await main.getByRole('option', { name: 'Speed', exact: true }).click();
  await expect(main.locator('.spark')).toHaveCount(2);
  await expect(main.locator('.spark').last()).toHaveAttribute('aria-label', '2 star Speed');
  await main
    .getByRole('button', { name: 'Remove Speed from Parent 1', exact: true })
    .first()
    .click();

  await expect(main.locator('.spark')).toHaveCount(1);
  await add.click();
  await expect(main.getByRole('radio', { name: '2★', exact: true })).toHaveAttribute(
    'aria-checked',
    'true'
  );

  await search.fill('Stamina');
  await search.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(add).toBeFocused();
  await add.click();
  await expect(search).toHaveValue('');
  await expect(main.getByRole('listbox')).toHaveCount(0);
  await search.fill('Stamina');
  await search.press('Enter');
  await expect(main.locator('.spark').last()).toHaveAttribute('aria-label', '2 star Stamina');
  await main.getByRole('button', { name: 'Remove Stamina from Parent 1', exact: true }).click();
  await add.click();
  await main.getByRole('button', { name: 'Close spark editor for Parent 1', exact: true }).click();
  await expect(add).toBeFocused();
  await dialog.getByRole('button', { name: 'Save Entry', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Select Test parent', exact: true })
  ).toBeVisible();

  await dialog.getByRole('button', { name: 'Edit Test parent' }).click();
  await dialog.getByRole('textbox', { name: 'Entry name (optional)' }).fill('Cancelled edit');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Select Test parent', exact: true })
  ).toBeVisible();

  await dialog.getByRole('button', { name: 'Select Test parent', exact: true }).click();
  await page.getByRole('button', { name: 'Clear selected legacy' }).click();
  await page.getByRole('button', { name: 'Pick your legacy', exact: true }).click();
  await dialog.getByRole('tab', { name: /Manual/ }).click();
  await dialog.getByRole('button', { name: 'Edit Test parent' }).click();
  await dialog.getByRole('textbox', { name: 'Entry name (optional)' }).fill('Saved edit');
  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('vpd_manual_entries') ?? '[]')[0].ownSparkIds
    )
  ).toEqual([102]);
  await dialog.getByRole('button', { name: 'Delete Saved edit' }).click();
  await expect(dialog.getByRole('heading', { name: 'No saved entries' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width
  );
});

test('Manual node changes preserve their sparks and races, removal clears only that node, and edits retain entry order', async ({
  page,
  isMobile
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'vpd_manual_entries',
      JSON.stringify([
        {
          id: 'first',
          label: 'First entry',
          mainCardId: 100601,
          ownSparkIds: [],
          p1CardId: null,
          p1SparkIds: [],
          p2CardId: null,
          p2SparkIds: [],
          createdAt: '2025-01-01'
        },
        {
          id: 'edit',
          label: 'Editable tree',
          mainCardId: 100601,
          ownSparkIds: [103],
          p1CardId: 101301,
          p1SparkIds: [202],
          p2CardId: 106701,
          p2SparkIds: [303],
          mainWinSaddleIds: [15],
          p1WinSaddleIds: [16],
          p2WinSaddleIds: [17],
          createdAt: '2025-02-01'
        }
      ])
    )
  );

  const dialog = await prepare(page, false, { t: [101301] });
  await dialog.getByRole('tab', { name: /Manual/ }).click();
  await dialog.getByRole('button', { name: 'Edit Editable tree', exact: true }).click();
  const main = dialog.getByRole('region', { name: 'Parent 1', exact: true }),
    gp1 = dialog.getByRole('region', { name: 'Grandparent 1', exact: true });

  if (isMobile) {
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      for (const node of [main, gp1]) {
        await node.getByRole('button', { name: 'Add Spark', exact: true }).click();
        const editor = node.locator('.spark-add-control'),
          search = node.getByRole('combobox'),
          stars = node.getByRole('radio', { name: '3★', exact: true });

        const bounds = await editor.boundingBox(),
          inputBounds = await search.boundingBox(),
          starBounds = await stars.boundingBox();

        expect(inputBounds!.height).toBeGreaterThanOrEqual(width <= 767 ? 32 : 44);
        expect(starBounds!.height).toBeGreaterThanOrEqual(width <= 767 ? 32 : 44);
        if (bounds!.width >= 320) expect(inputBounds!.y).toBeCloseTo(starBounds!.y, 0);
        else expect(starBounds!.y).toBeGreaterThanOrEqual(inputBounds!.y + inputBounds!.height);
        const identity = node.locator('.identity'),
          identityBounds = await identity.boundingBox();

        if (identityBounds!.width >= 300)
          expect((await node.locator('.node-actions').boundingBox())!.y).toBeCloseTo(
            identityBounds!.y,
            0
          );
        await search.press('Escape');
      }

      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      await dialog.screenshot({ path: test.info().outputPath(`manual-density-${width}.png`) });
    }

    await page.setViewportSize({ width: 390, height: 844 });
  }

  await dialog.getByRole('button', { name: 'Change Parent 1', exact: true }).click();
  const character = page.getByRole('dialog', { name: 'Select Character', exact: true });
  await character.getByRole('searchbox', { name: 'Search characters' }).fill('Satono Diamond');
  await character.getByRole('radio', { name: /Satono Diamond/ }).click();
  await expect(main.locator('.spark')).toHaveAttribute('aria-label', '3 star Speed');
  await expect(
    main.getByRole('button', { name: 'Race wins for Parent 1', exact: true })
  ).toHaveAttribute('title', '1 race wins');

  await gp1.getByRole('button', { name: 'Remove Grandparent 1', exact: true }).click();
  await gp1.getByRole('button', { name: 'Choose Grandparent 1', exact: true }).click();
  await character.getByRole('searchbox', { name: 'Search characters' }).fill('Mejiro McQueen');
  await character
    .getByRole('radio', { name: 'Mejiro McQueen', exact: true })
    .filter({ has: page.locator('img[src$="101301.webp"]') })
    .click();

  await expect(gp1.locator('.spark')).toHaveCount(0);
  await expect(
    gp1.getByRole('button', { name: 'Race wins for Grandparent 1', exact: true })
  ).toHaveAttribute('title', '0 race wins');

  await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click();
  let saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('vpd_manual_entries') ?? '[]')
  );

  expect(saved.map((entry: { id: string }) => entry.id)).toEqual(['first', 'edit']);
  expect(saved[1]).toMatchObject({
    mainCardId: 106701,
    ownSparkIds: [103],
    mainWinSaddleIds: [15],
    p1CardId: 101301,
    p1SparkIds: [],
    p1WinSaddleIds: [],
    p2CardId: 106701,
    p2SparkIds: [303],
    p2WinSaddleIds: [17],
    createdAt: '2025-02-01'
  });

  await dialog.getByRole('button', { name: 'Edit Editable tree', exact: true }).click();
  await main.getByRole('button', { name: 'Remove Parent 1', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Save Changes', exact: true })).toBeDisabled();
  await main.getByRole('button', { name: 'Choose Parent 1', exact: true }).click();
  await character.getByRole('searchbox', { name: 'Search characters' }).fill('Oguri Cap');
  await character.getByRole('radio', { name: /Oguri Cap/ }).click();
  await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click();
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('vpd_manual_entries') ?? '[]'));
  expect(saved[1]).toMatchObject({
    mainCardId: 100601,
    ownSparkIds: [],
    mainWinSaddleIds: [],
    p1CardId: 101301,
    p2SparkIds: [303],
    p2WinSaddleIds: [17]
  });
});

test('Partner lookup preserves anonymous cached and streamed results, failure recovery and ID validation', async ({
  page
}) => {
  let lookups = 0;
  await page.route('**/api/v4/partner/lookup', (route) => {
    lookups++;
    expect(route.request().postDataJSON()).toEqual({
      partner_id: '123456789',
      label: null,
      require_persistence: false
    });

    return route.fulfill({
      json:
        lookups === 1
          ? { task_id: 7, will_persist: false }
          : {
              task_id: null,
              will_persist: false,
              result: {
                account_id: '123456789012',
                inheritance: { ...record().inheritance, account_id: '123456789012' }
              }
            }
    });
  });

  await page.route('**/api/v4/partner/lookup/7/stream', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body: 'event: processing\ndata: {}\n\nevent: failed\ndata: {"error":"Lookup unavailable"}\n\n'
    })
  );

  const dialog = await prepare(page);
  await dialog.getByRole('tab', { name: /Partner/ }).click();
  await dialog.getByRole('textbox', { name: 'Practice or trainer ID' }).fill('123');
  await expect(dialog.getByRole('button', { name: 'Fetch', exact: true })).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Practice or trainer ID' }).fill('123456789');
  await dialog.getByRole('button', { name: 'Fetch', exact: true }).click();
  await expect(dialog.getByText('Lookup unavailable', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Fetch', exact: true }).click();
  await expect(dialog.locator('.parent-row')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('partner-lookups:anon'))).toBeNull();
  await dialog.locator('.select-parent').click();
  await expect(page.getByRole('button', { name: 'Clear selected legacy' })).toBeVisible();
});

test('Partner lookup follows backend persistence, separates direct results from filtered history and recovers from timeout', async ({
  page,
  isMobile
}) => {
  const dialog = await prepare(page, true);
  let lookups = 0,
    savedReads = 0;

  const saved = {
    ...record().inheritance,
    id: 71,
    account_id: '123456789012',
    trainer_name: 'Saved trainer'
  };

  await page.route('**/api/v4/partner/saved', (route) => {
    savedReads++;
    return route.fulfill({ json: [saved] });
  });

  let releaseLookup: () => void = () => {};

  await page.route('**/api/v4/partner/lookup', async (route) => {
    lookups++;
    expect(route.request().postDataJSON()).toEqual({
      partner_id: '123456789012',
      label: null,
      require_persistence: true
    });

    if (lookups === 2) await new Promise<void>((resolve) => (releaseLookup = resolve));
    await route.fulfill({
      json:
        lookups === 1
          ? {
              task_id: null,
              will_persist: false,
              result: { account_id: '123456789012', inheritance: saved }
            }
          : lookups === 4
            ? {
                task_id: null,
                will_persist: false,
                result: { account_id: '123456789012', inheritance: null }
              }
            : { task_id: 7, will_persist: true }
    });
  });

  await page.route('**/api/v4/partner/lookup/7/stream', (route) =>
    route.fulfill({
      contentType: 'text/event-stream',
      body:
        lookups === 3
          ? 'event: timeout\ndata: {}\n\n'
          : `event: completed\ndata: ${JSON.stringify({ inheritance: saved })}\n\n`
    })
  );

  await dialog.getByRole('tab', { name: /Partner/ }).click();
  await expect(dialog.getByRole('heading', { name: 'No saved partners yet' })).toBeVisible();
  const input = dialog.getByRole('textbox', { name: 'Practice or trainer ID' }),
    fetch = dialog.getByRole('button', { name: 'Fetch', exact: true });

  await input.fill('abc123456789');
  await expect(input).toHaveValue('123456789');
  await input.fill('123456789012');
  await fetch.click();
  await expect(dialog.getByRole('heading', { name: 'Lookup result', exact: true })).toBeVisible();
  expect(savedReads).toBe(0);
  await expect(dialog.getByRole('tab', { name: /Partner/ }).locator('small')).toHaveText('0');
  await dialog.getByRole('textbox', { name: 'Search parents' }).fill('does not match');
  await expect(dialog.locator('.parent-row')).toHaveCount(1);
  await expect(dialog.locator('.parent-row').getByRole('button', { name: /Delete/ })).toHaveCount(
    0
  );

  const inputBounds = await input.boundingBox(),
    fetchBounds = await fetch.boundingBox();

  expect(inputBounds!.height).toBe(fetchBounds!.height);
  expect(inputBounds!.y).toBe(fetchBounds!.y);
  if (isMobile) expect(fetchBounds!.height).toBeGreaterThanOrEqual(28);
  await fetch.click();
  await expect(dialog.getByRole('heading', { name: 'Request queued…' })).toBeVisible();
  await expect(dialog.locator('.parent-row')).toHaveCount(0);
  await expect(fetch).toBeDisabled();
  releaseLookup();
  await expect(dialog.getByRole('heading', { name: 'Saved partners', exact: true })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Lookup result', exact: true })).toHaveCount(0);
  expect(savedReads).toBe(1);
  await expect(dialog.getByRole('tab', { name: /Partner/ }).locator('small')).toHaveText('1');
  await expect(dialog.locator('.parent-row')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Clear filters', exact: true }).first().click();
  await expect(dialog.locator('.parent-row')).toHaveCount(1);
  await dialog
    .getByRole('radiogroup', { name: 'Parent spark display' })
    .getByRole('radio', { name: 'Split', exact: true })
    .click();

  await expect(dialog.locator('.parent-row .rank-score')).toHaveCount(0);
  if (!isMobile) {
    const row = (await dialog.locator('.parent-row').boundingBox())!;
    const sparks = (await dialog.locator('.parent-factors').first().boundingBox())!;
    expect(sparks.x - row.x).toBeLessThan(190);
  }

  await page.screenshot({ path: test.info().outputPath('partner-saved-history.png') });
  await fetch.click();
  await expect(dialog.getByRole('heading', { name: 'No response - timed out' })).toBeVisible();
  await expect(dialog.locator('.parent-row')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Clear partner ID' }).click();
  await expect(input).toHaveValue('');
  await expect(fetch).toBeDisabled();
  await expect(dialog.locator('.parent-row')).toHaveCount(1);
  await input.fill('123456789012');
  await fetch.click();
  await expect(
    dialog.getByText('Lookup completed without inheritance data. Please try again.')
  ).toBeVisible();
  await expect(dialog.locator('.parent-row')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width
  );
});

test('Partner persistence queues a fresh history read behind an older request', async ({
  page
}) => {
  const dialog = await prepare(page, true);
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  let historyReads = 0,
    releaseHistory: () => void = () => {};

  const saved = {
    ...record().inheritance,
    id: 72,
    account_id: '123456789012',
    trainer_name: 'Fresh partner'
  };

  await page.route('**/api/v4/partner/saved', async (route) => {
    const read = ++historyReads;
    if (read === 1) await new Promise<void>((resolve) => (releaseHistory = resolve));
    await route.fulfill({ json: read === 1 ? [] : [saved] });
  });

  await page.route('**/api/v4/partner/lookup', (route) =>
    route.fulfill({
      json: {
        task_id: null,
        will_persist: true,
        result: { account_id: '123456789012', inheritance: saved }
      }
    })
  );

  await page.getByRole('button', { name: 'Pick your legacy', exact: true }).click();
  await dialog.getByRole('tab', { name: /Partner/ }).click();
  await expect.poll(() => historyReads).toBe(1);
  await expect(
    dialog.getByRole('status').filter({ hasText: 'Loading saved partners...' })
  ).toBeVisible();

  await dialog.getByRole('textbox', { name: 'Practice or trainer ID' }).fill('123456789012');
  const response = page.waitForResponse('**/api/v4/partner/lookup');
  await dialog.getByRole('button', { name: 'Fetch', exact: true }).click();
  await response;
  await expect(dialog.getByRole('button', { name: 'Fetch', exact: true })).toBeEnabled();
  expect(historyReads).toBe(1);
  releaseHistory();
  await expect(dialog.getByRole('heading', { name: 'Saved partners', exact: true })).toBeVisible();
  await expect(dialog.locator('.parent-row')).toHaveCount(1);
  await expect(dialog.getByText('Fresh partner', { exact: true })).toBeVisible();
  expect(historyReads).toBe(2);
});

test('Manual character and Best Fits choices use the released resource, not historical display records', async ({
  page
}) => {
  await mockDatabase(page);
  await mockAffinity(page);
  await page.route('**/resources/test/affinity.json', (route) =>
    route.fulfill({
      json: { chars: [1133, 1013, 1006, 1067], aff2: Array(16).fill(2), aff3: Array(64).fill(3) }
    })
  );

  await page.goto(
    `/database?filters=${encodeURIComponent(Buffer.from(JSON.stringify({ t: [101301] })).toString('base64'))}`
  );

  await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Pick your legacy', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Select Parent', exact: true });
  await dialog.getByRole('tab', { name: /Manual/ }).click();
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog
    .getByRole('region', { name: 'Parent 1', exact: true })
    .getByRole('button', { name: 'Best Fits', exact: true })
    .click();

  const fits = dialog.getByRole('region', { name: 'Best Fits for Parent 1', exact: true });
  await expect(fits.locator('.best-name')).toHaveText([
    'Mejiro McQueen',
    'Oguri Cap',
    'Satono Diamond'
  ]);
  await fits.getByRole('button', { name: 'Close best fits' }).click();
  await dialog.getByRole('button', { name: 'Choose Parent 1', exact: true }).click();
  const character = page.getByRole('dialog', { name: 'Select Character', exact: true });
  await expect(character.getByRole('radio')).toHaveCount(9);
  await character.getByRole('searchbox', { name: 'Search characters' }).fill('Chrono');
  await expect(character.getByRole('radio')).toHaveCount(0);
});

test('Manual parent race wins and best fits preserve unsaved edits when storage fails', async ({
  page
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'vpd_manual_entries',
      JSON.stringify([
        {
          id: 'old-angular-entry',
          label: 'Existing parent',
          mainCardId: 100601,
          ownSparkIds: [103],
          p1CardId: null,
          p1SparkIds: [],
          p2CardId: null,
          p2SparkIds: [],
          mainWinSaddleIds: [],
          createdAt: '2025-01-01'
        }
      ])
    )
  );

  const dialog = await prepare(page, false, { t: [101301] });
  await dialog.getByRole('tab', { name: /Manual/ }).click();
  await dialog.getByRole('button', { name: 'Edit Existing parent' }).click();
  await dialog
    .getByRole('region', { name: 'Grandparent 1', exact: true })
    .getByRole('button', { name: 'Best Fits', exact: true })
    .click();

  const best = dialog.getByRole('region', { name: 'Best Fits for Grandparent 1', exact: true });
  await expect(best.getByRole('button', { name: 'Close best fits' })).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(best.locator('.best-list button')).toHaveCount(3);
  await expect(best.locator('.best-name')).toHaveText([
    'Mejiro McQueen',
    'Oguri Cap',
    'Satono Diamond'
  ]);
  await expect(best.locator('.best-score')).toHaveText(['5', '5', '5']);
  await expect(best.locator('.best-delta')).toHaveText(['+3', '+3', '+3']);
  await page.screenshot({ path: test.info().outputPath('manual-best-fits.png') });
  await page.keyboard.press('Escape');
  await expect(best).not.toBeVisible();
  const trigger = dialog
    .getByRole('region', { name: 'Grandparent 1', exact: true })
    .getByRole('button', { name: 'Best Fits', exact: true });

  await expect(trigger).toBeFocused();
  await trigger.press('Enter');
  await best.locator('.best-list button').first().click();
  await expect(
    dialog.getByRole('button', { name: 'Change Grandparent 1', exact: true })
  ).toBeFocused();

  await expect(
    dialog
      .getByRole('region', { name: 'Parent 1', exact: true })
      .getByLabel('Affinity 5', { exact: true })
  ).toBeVisible();

  await expect(
    dialog
      .getByRole('region', { name: 'Grandparent 1', exact: true })
      .getByLabel('Affinity 3', { exact: true })
  ).toBeVisible();

  await dialog.getByRole('button', { name: 'Race wins for Parent 1', exact: true }).click();
  const races = page.getByRole('dialog', { name: 'Select Race Wins', exact: true });
  await races.getByRole('searchbox', { name: 'Search races' }).fill('February');
  await races.getByRole('button', { name: 'Add race: Senior Year, Feb Late', exact: true }).click();
  await page.getByRole('button', { name: 'Select February Stakes', exact: true }).click();
  await races.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Race wins for Parent 1', exact: true })
  ).toHaveAttribute('title', '1 race wins');

  await page.screenshot({ path: test.info().outputPath('manual-parent-editor.png') });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'vpd_manual_entries') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });

  await dialog.getByRole('button', { name: 'Save Changes' }).click();
  await expect(dialog.getByText(/Could not save manual entries/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save Changes' })).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('vpd_manual_entries') ?? '[]')[0].mainWinSaddleIds
    )
  ).toEqual([]);
});

test('selected legacy retains the original veteran summary without its stat strip', async ({
  page
}) => {
  const { veteran } = await import('./fixtures/api');
  const dialog = await prepare(page, true, { t: [100102] }, async (page) => {
    await page.route('**/resources/test/affinity.json', (route) =>
      route.fulfill({
        json: { chars: [1001, 1011, 1067, 1088], aff2: Array(16).fill(2), aff3: Array(64).fill(3) }
      })
    );

    await page.route('**/api/v4/user/profile/123456789012', (route) =>
      route.fulfill({ json: { veterans: [{ ...veteran, name: 'test', win_saddle_id_array: [] }] } })
    );
  });

  await dialog.locator('.select-parent').first().click();
  const summary = page.locator('.affinity-tree .veteran-summary');
  await expect(summary.locator('.summary-head')).toBeVisible();
  await expect(summary.locator('.rank-score')).toBeVisible();
  await expect(summary.locator('.factor-list .spark').first()).toBeVisible();
  await expect(summary.locator('.summary-parent')).toHaveCount(2);
  await expect(summary.locator('.stats')).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: 'Legacy spark display' })).toBeVisible();
  await expect(
    page
      .getByRole('radiogroup', { name: 'Legacy spark display' })
      .getByRole('radio', { name: 'Combined', exact: true })
  ).toBeChecked();

  await expect(page.getByRole('button', { name: 'Clear selected legacy' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width
  );
  await expect(summary.locator('h3')).toHaveText('Grass Wonder');
  const name = (await summary.locator('h3').boundingBox())!,
    scenario = (await summary.locator('.scenario').boundingBox())!;

  expect(scenario.y).toBeGreaterThanOrEqual(name.y + name.height);
  for (const copy of await summary.locator('.parent-copy').all()) {
    const name = (await copy.locator('strong').boundingBox())!,
      position = (await copy.locator('.parent-position').boundingBox())!;

    expect(position.y).toBeGreaterThanOrEqual(name.y + name.height);
  }

  await expect(
    page.getByRole('button', { name: 'Clear selected legacy', exact: true })
  ).toHaveClass(/ui-button/);

  await expect(summary.locator('.leading-affinity .affinity')).toHaveCount(1);
  await expect(summary.locator('.leading-affinity .affinity')).toHaveAttribute(
    'aria-label',
    'Total affinity: 8'
  );
  await expect(summary.locator('.parent-id .affinity')).toHaveText(['3', '3']);
  await expect(summary.locator('.summary-affinity')).toHaveCount(0);
  for (const row of [
    summary.locator('.summary-head'),
    ...(await summary.locator('.parent-id').all())
  ]) {
    const badge = (await row.locator('.affinity').first().boundingBox())!;
    const portrait = (await row.locator('.art').boundingBox())!;
    expect(badge.x + badge.width).toBeLessThanOrEqual(portrait.x);
  }

  const ace = page.locator('.ace.selected');
  const portraitBounds = (await ace.locator('.ace-portrait').boundingBox())!;
  const nameBounds = (await ace.locator('strong').boundingBox())!;
  const compact = page.viewportSize()!.width <= 900;
  if (compact) {
    expect(nameBounds.x).toBeGreaterThanOrEqual(portraitBounds.x + portraitBounds.width);
    const selection = (await page.locator('.target-selection').boundingBox())!;
    expect(selection.width).toBe((await page.locator('.affinity-tree').boundingBox())!.width);
    const clear = (await page
      .getByRole('button', { name: 'Clear target character', exact: true })
      .boundingBox())!;

    expect(Math.abs(clear.y + clear.height / 2 - selection.y - selection.height / 2)).toBeLessThan(
      1
    );
    await expect(
      page.getByRole('button', { name: 'Change target character', exact: true })
    ).toBeVisible();
  } else {
    expect(nameBounds.y).toBeGreaterThanOrEqual(portraitBounds.y + portraitBounds.height);
    expect((await ace.boundingBox())!.width).toBeLessThanOrEqual(148);
  }

  expect(portraitBounds.width).toBe(compact ? 48 : 76);
  const modes = page.getByRole('radiogroup', { name: 'Legacy spark display' });
  await modes.getByRole('radio', { name: 'Combined', exact: true }).click();
  expect((await ace.locator('.ace-portrait').boundingBox())!.width).toBe(compact ? 48 : 76);
  await page
    .locator('.affinity-context')
    .screenshot({ path: test.info().outputPath('affinity-combined.png') });

  await modes.getByRole('radio', { name: 'Split', exact: true }).click();
  // Safari taps do not focus buttons; exercise keyboard focus restoration explicitly.
  const changeTarget = page.getByRole('button', { name: 'Change target character', exact: true });
  await changeTarget.focus();
  await changeTarget.press('Enter');
  const targetDialog = page.getByRole('dialog', { name: 'Select Character', exact: true });
  await expect(targetDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(changeTarget).toBeFocused();
  await page.getByRole('button', { name: 'Clear target character', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Pick target character', exact: true })
  ).toBeVisible();

  await expect(summary.locator('h3')).toHaveText('Grass Wonder');
  await expect(summary.locator('.affinity')).toHaveCount(0);
  const view = page.getByRole('radiogroup', { name: 'Legacy spark display' });
  await view.getByRole('radio', { name: 'Combined', exact: true }).click();
  await expect(summary.locator('.summary-parent')).toHaveCount(2);
  await expect(summary.locator('.parent-factors')).toHaveCount(0);
  await expect(summary.locator('.factor-list .spark--blue')).toHaveAttribute(
    'aria-label',
    '6 star Speed'
  );
  await expect(summary.locator('.factor-list .spark--pink')).toHaveAttribute(
    'aria-label',
    '6 star Dirt'
  );
  const headerBounds = (await summary.locator('.summary-head').boundingBox())!;
  const parentBounds = await summary.locator('.summary-parent').evaluateAll((rows) =>
    rows.map((row) => {
      const box = row.getBoundingClientRect();
      return { x: box.x, y: box.y, bottom: box.bottom };
    })
  );

  const sparkBounds = (await summary.locator('.factor-section').boundingBox())!;
  if ((await summary.boundingBox())!.width > 760) {
    expect(parentBounds[0].x - headerBounds.x - headerBounds.width).toBeLessThanOrEqual(12);
    expect(parentBounds[0].y).toBeLessThan(headerBounds.y + headerBounds.height);
  }

  expect(sparkBounds.y).toBeGreaterThanOrEqual(
    Math.max(headerBounds.y + headerBounds.height, ...parentBounds.map((row) => row.bottom))
  );
  expect(sparkBounds.width).toBeGreaterThan((await summary.boundingBox())!.width - 20);
  await expect(summary.locator('.factor-list .spark-row')).toHaveCount(4);
  await expect(summary.locator('.factor-list .type--blue')).toBeVisible();
  await expect(summary.locator('.factor-list .type--pink')).toBeVisible();
  await summary.screenshot({ path: test.info().outputPath('combined-veteran-summary.png') });
  await view.getByRole('radio', { name: 'Split', exact: true }).click();
  await expect(summary.locator('.parent-factors')).toHaveCount(2);
  await expect(summary.locator('.factor-list .spark--blue')).toHaveAttribute(
    'aria-label',
    '3 star Speed, Main parent'
  );
  await summary.screenshot({ path: test.info().outputPath('original-veteran-summary.png') });
  await page.getByRole('button', { name: 'Clear selected legacy', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pick your legacy', exact: true })).toBeFocused();
});

test('combined legacy uses the full width for fifty sparks without overflow', async ({ page }) => {
  const { veteran } = await import('./fixtures/api');
  const dialog = await prepare(page, true, { t: [100102] }, async (page) => {
    await page.route('**/api/v4/user/profile/123456789012', (route) =>
      route.fulfill({
        json: {
          veterans: [
            {
              ...veteran,
              factors: Array.from({ length: 50 }, (_, index) => 2000101 + index * 100),
              inheritance: null
            }
          ]
        }
      })
    );
  });

  await dialog.locator('.select-parent').first().click();
  await page
    .getByRole('radiogroup', { name: 'Legacy spark display' })
    .getByRole('radio', { name: 'Combined', exact: true })
    .click();

  const summary = page.locator('.affinity-tree .veteran-summary');
  await expect(summary.locator('.factor-list .spark')).toHaveCount(52);
  await expect(summary.locator('.factor-list .spark-row').first().locator('.type')).toHaveClass(
    /type--blue/
  );
  expect(
    await summary.locator('.factor-list .spark').evaluateAll((chips) =>
      chips.every((chip) => {
        const bounds = chip.getBoundingClientRect(),
          container = chip.parentElement!.getBoundingClientRect();

        return bounds.left >= container.left - 1 && bounds.right <= container.right + 1;
      })
    )
  ).toBe(true);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width
  );
  await summary.screenshot({ path: test.info().outputPath('combined-fifty-sparks.png') });
});

test('selected legacy UUID restores fresh data from a shared URL and clears deleted records on reload', async ({
  page
}) => {
  const { veteran } = await import('./fixtures/api');
  const id = 'b4608a48-729c-4ba4-a59f-5cf7937c0c21';
  let exists = true;
  const current = { ...veteran, id, trainer_id: '123456789012', win_saddle_id_array: [101, 102] };

  const queries: URLSearchParams[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/search/query?')) queries.push(new URL(request.url()).searchParams);
  });

  const dialog = await prepare(page, true, { t: [100102] }, async (page) => {
    await page.route('**/api/v4/user/profile/123456789012', (route) =>
      route.fulfill({ json: { veterans: [current] } })
    );

    await page.route(`**/api/v4/user/profile/veterans/${id}`, (route) =>
      exists
        ? route.fulfill({ json: current })
        : route.fulfill({ status: 404, json: { message: 'Not found' } })
    );
  });

  await dialog.locator('.select-parent').click();
  const state = () =>
    page.evaluate(() => JSON.parse(atob(new URL(location.href).searchParams.get('filters')!)));

  await expect.poll(async () => (await state()).vet).toBe(id);
  const shared = page.url();
  current.win_saddle_id_array = [103];
  // Restore from the URL even without device preferences or linked-account discovery.
  await page.evaluate(() => localStorage.removeItem('database-filter-state-v2'));
  queries.length = 0;
  await page.goto(shared);
  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(page.locator('.affinity-tree h3')).toHaveText('Grass Wonder');
  await expect.poll(() => queries.at(-1)?.get('p2_win_saddle')).toBe('103');
  expect(queries.every((query) => query.get('p2_win_saddle') === '103')).toBe(true);
  await expect(page.getByRole('button', { name: 'Change selected legacy' })).toBeVisible();
  exists = false;
  queries.length = 0;
  await page.reload();
  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(page.getByRole('button', { name: 'Pick your legacy', exact: true })).toBeVisible();
  await expect(page.locator('.shared-legacy')).toHaveCount(0);
  await expect.poll(async () => (await state()).vet).toBeUndefined();
  await expect.poll(() => queries.length).toBeGreaterThan(0);
  expect(
    queries.every((query) => !query.has('p2_main_chara_id') && !query.has('p2_win_saddle'))
  ).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(page.getByRole('button', { name: 'Pick your legacy', exact: true })).toBeVisible();
});
