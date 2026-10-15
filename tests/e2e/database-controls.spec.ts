import { expect, test } from './fixtures/test';
import { mockDatabase, mockCharacterCatalog } from './fixtures/api';

test.beforeEach(async ({ page, isMobile }) => {
  await mockDatabase(page);
  await mockCharacterCatalog(page);
  await page.goto('/database');
  await page.getByRole('button', { name: /Filters/ }).click();
  if (isMobile) await page.getByRole('button', { name: 'Spark Filters', exact: true }).click();
});

test('factor selects retain focus, expose the whole menu, and keep keyboard choices visible', async ({
  page
}) => {
  await page.getByRole('button', { name: 'Add Pink Factor', exact: true }).click();
  const factor = page.locator('#pink-factors-factor-0');
  await factor.click();
  await factor.press('End');
  const lastOption = page.getByRole('option', { name: 'Long', exact: true });
  await expect(lastOption).toBeInViewport();
  await factor.press('Enter');
  await expect(factor).toContainText('Long');
  await expect(factor).toBeFocused();
  await factor.press('ArrowDown');
  await factor.press('Tab');
  await expect(factor).toHaveAttribute('aria-expanded', 'false');
});

test('white factor search commits a clicked result without reopening or losing focus', async ({
  page
}) => {
  await page.getByRole('button', { name: 'Add White Factor', exact: true }).click();
  const factor = page.locator('#white-factors-factor-0');
  await factor.fill('February');
  await page.getByRole('option', { name: 'February S.', exact: true }).click();
  await expect(factor).toHaveValue('February S.');
  await expect(factor).toHaveAttribute('aria-expanded', 'false');
  await expect(factor).toBeFocused();
  await factor.fill('not a factor');
  await factor.press('Tab');
  await expect(factor).toHaveValue('February S.');
  await expect(factor).toHaveAttribute('aria-expanded', 'false');
});

test('opening a factor panel reserves space before its controls become interactive', async ({
  page
}) => {
  const disclosure = page.getByRole('button', { name: 'Spark Filters', exact: true });
  await disclosure.click();
  await expect(page.getByRole('button', { name: 'Add White Factor', exact: true })).toBeHidden();
  await disclosure.click();
  const contained = await page
    .getByRole('button', { name: 'Add White Factor', exact: true })
    .evaluate((button) => {
      const bounds = button.getBoundingClientRect();
      const panel = button.closest('.database-filter-card')!.getBoundingClientRect();
      return bounds.top >= panel.top && bounds.bottom <= panel.bottom;
    });

  expect(contained, 'Expanded controls must not overlap the next filter panel').toBe(true);
  await page.getByRole('button', { name: 'Add White Factor', exact: true }).click();
  await expect(page.locator('#white-factors-factor-0')).toBeVisible();
});

test('factor ranges, operators, and presets preserve the Angular search and storage state', async ({
  page
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/search/query?')) requests.push(request.url());
  });

  const blue = page.getByRole('region', { name: 'Blue Factors (Stats)', exact: true });
  await blue.getByRole('button', { name: 'Add Blue Factor', exact: true }).click();
  await page.locator('#blue-factors-factor-0').click();
  await page.getByRole('option', { name: 'Speed', exact: true }).click();
  const minimum = blue.getByRole('slider', { name: 'Star range minimum', exact: true });
  await minimum.press('ArrowRight');
  await minimum.press('ArrowRight');
  await expect(minimum).toHaveValue('3');
  await blue.getByRole('button', { name: 'Add Blue Factor', exact: true }).click();
  await page.locator('#blue-factors-factor-1').click();
  await page.getByRole('option', { name: 'Stamina', exact: true }).click();
  await blue.getByRole('radio', { name: 'AND', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(blue.getByRole('radio', { name: 'OR', exact: true })).toHaveAttribute(
    'aria-checked',
    'true'
  );

  const queryBefore = '103,104,105,106,107,108,109,201,202,203,204,205,206,207,208,209';
  await expect
    .poll(() =>
      requests.length ? new URL(requests.at(-1)!).searchParams.getAll('blue_sparks') : []
    )
    .toEqual([queryBefore]);
  await page.locator('.presets summary').click();
  await page.getByLabel('Preset name').fill('Speed or stamina');
  await page.getByRole('button', { name: 'Save current filters' }).click();
  await expect(page.getByText('Preset saved.', { exact: true })).toBeVisible();
  await page.locator('.presets summary').click();
  await blue.getByRole('button', { name: 'Remove Speed', exact: true }).click();
  await expect(page.locator('#blue-factors-factor-0')).toContainText('Stamina');
  await page.locator('.presets summary').click();
  await page.getByRole('button', { name: /Speed or stamina.*filters/ }).click();
  await expect(page.locator('#blue-factors-factor-0')).toContainText('Speed');
  await expect(blue.getByRole('radio', { name: 'OR', exact: true })).toHaveAttribute(
    'aria-checked',
    'true'
  );

  await expect
    .poll(() => new URL(requests.at(-1)!).searchParams.get('blue_sparks'))
    .toBe(queryBefore);
  await page.reload();
  await page.getByRole('button', { name: /Filters/ }).click();
  await page.locator('.presets summary').click();
  await expect(page.getByRole('button', { name: /Speed or stamina.*filters/ })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Speed or stamina', exact: true }).click();
  await expect(page.getByText('No presets yet')).toBeVisible();
});

test('mixed AND/OR factor toggles update the search and survive a shared-link reload', async ({
  page,
  isMobile
}) => {
  const requests: URLSearchParams[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/search/query?'))
      requests.push(new URL(request.url()).searchParams);
  });

  const blue = page.getByRole('region', { name: 'Blue Factors (Stats)', exact: true });
  for (const [index, name] of ['Speed', 'Stamina', 'Speed'].entries()) {
    await blue.getByRole('button', { name: 'Add Blue Factor', exact: true }).click();
    await page.locator(`#blue-factors-factor-${index}`).click();
    await page.getByRole('option', { name, exact: true }).click();
  }

  const speed = '101,102,103,104,105,106,107,108,109';
  const stamina = '201,202,203,204,205,206,207,208,209';
  await expect.poll(() => requests.at(-1)?.getAll('blue_sparks')).toEqual([speed, stamina, speed]);
  const relations = blue.getByRole('radiogroup', { name: 'Requirement operator' });
  await relations.nth(0).getByRole('radio', { name: 'OR', exact: true }).click();
  const predicate = `overlaps(blue_sparks, (${speed},${stamina})) and overlaps(blue_sparks, (${speed}))`;
  await expect.poll(() => requests.at(-1)?.get('uql')).toBe(predicate);
  expect(requests.at(-1)?.has('blue_sparks')).toBe(false);
  await relations.nth(1).getByRole('radio', { name: 'OR', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.getAll('blue_sparks')).toEqual([`${speed},${stamina}`]);
  expect(requests.at(-1)?.has('uql')).toBe(false);
  await relations.nth(1).getByRole('radio', { name: 'AND', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.get('uql')).toBe(predicate);
  await page.reload();
  await expect.poll(() => requests.at(-1)?.get('uql')).toBe(predicate);
  await page.getByRole('button', { name: /Filters/ }).click();
  if (isMobile)
    await page.getByRole('button', { name: 'Inheritance Factors', exact: true }).click();
  await expect(relations.nth(0).getByRole('radio', { name: 'OR', exact: true })).toBeChecked();
  await expect(relations.nth(1).getByRole('radio', { name: 'AND', exact: true })).toBeChecked();
});

test('target, include/exclude, legacy, and support dialogs retain selection and cancellation behavior', async ({
  page,
  isMobile
}) => {
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  // Start with keyboard focus; Safari intentionally does not focus touch-clicked buttons.
  await page.getByRole('button', { name: 'Pick target character', exact: true }).focus();
  await page.keyboard.press('Enter');
  const target = page.getByRole('dialog', { name: 'Select Character', exact: true });
  await target.getByRole('searchbox', { name: 'Search characters' }).fill('Mejiro McQueen');
  await target
    .getByRole('radio', { name: /Mejiro McQueen/ })
    .first()
    .click();

  await expect(target).not.toBeVisible();
  await expect(page.locator('.ace')).toBeFocused();
  await page.getByRole('button', { name: 'Clear target character' }).click();
  await page.getByRole('button', { name: 'Pick your legacy', exact: true }).click();
  const legacy = page.getByRole('dialog', { name: 'Select Parent', exact: true });
  await expect(
    legacy.getByRole('button', { name: 'Upload veteran JSON', exact: true })
  ).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(legacy).not.toBeVisible();
  if (isMobile) await page.locator('[data-filter-group="characters"] .group-title').click();
  const allow = page.locator('.tree-box[aria-label="Main parent (P1/P2)"] .filter-row--allow');
  await allow.click();
  const include = page.getByRole('dialog', { name: 'Include Characters', exact: true });
  await include.getByRole('searchbox', { name: 'Search characters' }).fill('Special Week');
  await include
    .getByRole('button', { name: /Special Week/ })
    .first()
    .click();

  await page.keyboard.press('Escape');
  await expect(allow).toContainText('Add character');
  await allow.click();
  await include.getByRole('searchbox', { name: 'Search characters' }).fill('Special Week');
  await include
    .getByRole('button', { name: /Special Week/ })
    .first()
    .click();

  await include.getByRole('button', { name: 'Add 1 Character', exact: true }).click();
  await expect(allow.locator('..')).toContainText('Special Week');
  await allow
    .locator('..')
    .getByRole('button', {
      name: 'Remove Special Week from Main parent (P1/P2) include',
      exact: true
    })
    .click();

  await expect(allow).toContainText('Add character');
  if (isMobile) await page.locator('[data-filter-group="support"] .group-title').click();
  await page.getByRole('button', { name: 'Borrow support card', exact: true }).focus();
  await page.keyboard.press('Enter');
  const support = page.getByRole('dialog', { name: 'Select Support Card', exact: true });
  await support.getByRole('searchbox', { name: 'Search support cards' }).fill('Kitasan Black');
  await support.getByRole('combobox', { name: 'Rarity', exact: true }).click();
  await support.getByRole('option', { name: 'SSR', exact: true }).click();
  await support.getByRole('radio').first().click();
  await expect(support).not.toBeVisible();
  await expect(page.locator('.compact-trigger.selected')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
});

test('character dialogs reset like Angular and their shared sort menu supports keyboard dismissal', async ({
  page,
  isMobile
}) => {
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  const targetButton = page.getByRole('button', { name: 'Pick target character', exact: true });
  await targetButton.focus();
  await targetButton.press('Enter');
  const target = page.getByRole('dialog', { name: 'Select Character', exact: true });
  const sort = target.getByRole('button', { name: 'Sort: Default', exact: true });
  await sort.focus();
  await sort.press('ArrowDown');
  const menu = page.getByRole('menu', { name: 'Character sort order' });
  await expect(menu.getByRole('menuitemradio', { name: 'Default', exact: true })).toBeFocused();
  await expect(
    menu.getByRole('menuitemradio', { name: 'Affinity (n/a)', exact: true })
  ).toBeDisabled();

  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(target.getByRole('button', { name: 'Sort: Name', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  await expect(target).toBeVisible();
  await target.getByRole('searchbox', { name: 'Search characters' }).fill('Mejiro');
  await page.keyboard.press('Escape');
  await expect(targetButton).toBeFocused();
  await targetButton.press('Enter');
  await expect(target.getByRole('searchbox', { name: 'Search characters' })).toHaveValue('');
  await expect(target.getByRole('button', { name: 'Sort: Default', exact: true })).toBeVisible();
  if (isMobile)
    expect(
      (await target.getByRole('button', { name: 'Sort: Default' }).boundingBox())!.height
    ).toBeGreaterThanOrEqual(32);
  await page.keyboard.press('Escape');
  if (isMobile) await page.locator('[data-filter-group="characters"] .group-title').click();
  const allow = page.locator('.tree-box[aria-label="Main parent (P1/P2)"] .filter-row--allow');
  await allow.click();
  const include = page.getByRole('dialog', { name: 'Include Characters', exact: true });
  await include.getByRole('searchbox', { name: 'Search characters' }).fill('Special Week');
  await include
    .getByRole('button', { name: /Special Week/ })
    .first()
    .click();

  await include.getByRole('button', { name: 'Add 1 Character', exact: true }).click();
  await expect(allow.locator('..')).toContainText('Special Week');
  await allow.focus();
  await allow.press('Enter');
  await expect(
    include.getByRole('button', { name: 'Add 0 Characters', exact: true })
  ).toBeDisabled();

  await expect(include.getByRole('button', { name: /Special Week/ }).first()).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  await include.getByRole('searchbox', { name: 'Search characters' }).fill('Mejiro McQueen');
  await include
    .getByRole('button', { name: /Mejiro McQueen/ })
    .first()
    .click();

  await include.screenshot({ path: test.info().outputPath('include-characters.png') });
  await include.getByRole('button', { name: 'Add 1 Character', exact: true }).click();
  await expect(allow.locator('..')).toContainText('Special Week');
  await expect(allow.locator('..')).toContainText('Mejiro McQueen');
});

test('character choices preserve released variants and resolve same-role conflicts without changing IDs', async ({
  page,
  isMobile
}) => {
  const requests: URLSearchParams[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/search/query?'))
      requests.push(new URL(request.url()).searchParams);
  });

  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Pick target character', exact: true }).click();
  const target = page.getByRole('dialog', { name: 'Select Character', exact: true });
  await expect(target.getByRole('radio')).toHaveCount(9);
  await expect(target.locator('.copy strong').first()).toHaveCSS('font-family', /Inter/);
  await expect(target.getByRole('radio', { name: /Chrono Genesis|Raw / })).toHaveCount(0);
  await expect(target.getByRole('radio', { name: /Special Week/ })).toHaveCount(2);
  await target
    .getByRole('radio', { name: /Special Week/ })
    .nth(1)
    .click();

  await expect.poll(() => requests.at(-1)?.get('player_chara_id')).toBe('100102');
  if (isMobile) await page.locator('[data-filter-group="characters"] .group-title').click();
  const main = page.locator('.tree-box[aria-label="Main parent (P1/P2)"]'),
    great = page.locator('.tree-box[aria-label="Great parent (GP1/GP2)"]');

  await main.locator('.filter-row--allow').click();
  const include = page.getByRole('dialog', { name: 'Include Characters', exact: true });
  await include
    .getByRole('button', { name: /Special Week/ })
    .first()
    .click();

  await include.getByRole('button', { name: 'Add 1 Character', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.get('main_parent_id')).toBe('100101');
  expect(requests.at(-1)?.get('player_chara_id')).toBeNull();
  await expect(
    page.getByRole('button', { name: 'Pick target character', exact: true })
  ).toBeVisible();

  await main.locator('.exclude .filter-row').click();
  const exclude = page.getByRole('dialog', { name: 'Exclude Characters', exact: true });
  await exclude
    .getByRole('button', { name: /Special Week/ })
    .nth(1)
    .click();

  await exclude.getByRole('button', { name: 'Add 1 Character', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.get('exclude_main_parent_id')).toBe('100102');
  await expect(main.locator('.filter-row--allow')).toContainText('Add character');
  expect(requests.at(-1)?.get('main_parent_id')).toBeNull();
  await great.locator('.filter-row--allow').click();
  await include
    .getByRole('button', { name: /Special Week/ })
    .first()
    .click();

  await include.getByRole('button', { name: 'Add 1 Character', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.get('parent_id')).toBe('100101');
  expect(requests.at(-1)?.get('exclude_main_parent_id')).toBe('100102');
  await page.reload();
  await expect.poll(() => requests.at(-1)?.get('parent_id')).toBe('100101');
  expect(requests.at(-1)?.get('exclude_main_parent_id')).toBe('100102');
});

test('a failed character resource stays inside the picker and can be retried without resetting filters', async ({
  page
}) => {
  const fail = (route: import('@playwright/test').Route) =>
    route.fulfill({ status: 503, json: { error: 'Catalog offline' } });

  await page.route('**/resources/*/character.json*', fail);
  // This case exercises a cold catalog failure, not a working persisted fallback.
  await page.addInitScript(() => localStorage.removeItem('umamoe_resource_meta_v1:character'));
  await page.reload();
  await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Pick target character', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Select Character', exact: true });
  await expect(dialog.getByText('Character data unavailable', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Report on Discord' })).toBeVisible();
  await expect(dialog.getByText('No characters available.', { exact: true })).toBeHidden();
  await page.unroute('**/resources/*/character.json*', fail);
  await dialog.getByRole('button', { name: 'Retry character data', exact: true }).click();
  await expect(dialog.getByRole('radio')).toHaveCount(9);
  await dialog
    .getByRole('radio', { name: /Special Week/ })
    .first()
    .click();

  await expect(page.getByRole('radio', { name: 'Advanced', exact: true })).toHaveAttribute(
    'aria-checked',
    'true'
  );

  await expect(page.getByRole('button', { name: 'Clear target character' })).toBeVisible();
});
