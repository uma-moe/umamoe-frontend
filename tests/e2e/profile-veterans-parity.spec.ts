import { expect, test, setSliderValue } from './fixtures/test';
import { mockVeteranProfile as mockProfile, profile, veteran } from './fixtures/api';
import { completion } from '../performance/completion';
import factorLoadingState from '../fixtures/resources/factors.json' with { type: 'json' };

test('Veterans defaults to three cards at Full HD and retains an explicit column choice', async ({
  page,
  isMobile
}) => {
  test.skip(isMobile, 'Desktop responsive default');
  await mockProfile(page);
  await page.route('**/api/v4/user/profile/123456789012', (route) =>
    route.fulfill({
      json: {
        ...profile,
        veterans: Array.from({ length: 3 }, (_, index) => ({
          ...veteran,
          id: index + 1,
          trained_chara_id: index + 1
        }))
      }
    })
  );

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/veterans/123456789012');
  const grid = page.locator('.veteran-grid');
  await expect(grid.locator('.veteran-card')).toHaveCount(3);
  const columns = () =>
    grid.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length);

  for (const width of [1920, 2560, 1919, 1536, 390, 1920]) {
    await page.setViewportSize({ width, height: 1080 });
    await expect.poll(columns).toBe(width >= 1920 ? 3 : width < 768 ? 1 : 2);
    expect(await grid.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  }

  await page.getByRole('button', { name: 'Display options', exact: true }).click();
  const perRow = page.getByRole('combobox', { name: 'Per row', exact: true });
  await expect(perRow).toContainText('3');
  await perRow.click();
  await page.getByRole('option', { name: '2', exact: true }).click();
  for (const width of [1536, 2560, 1920]) {
    await page.setViewportSize({ width, height: 1080 });
    await expect.poll(columns).toBe(2);
  }
});

test('standalone Veterans exposes search, removable spark chips and compact veteran details', async ({
  page
}, testInfo) => {
  await mockProfile(page);
  await page.goto('/veterans/123456789012');
  await expect(page.getByRole('searchbox', { name: 'Search', exact: true })).toBeVisible();
  await expect(page.locator('.filters')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('no matching veteran');
  await expect(page.getByText('No veterans match your filters.', { exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search', exact: true }).fill(' Grass ');
  await expect(page.locator('.veteran-card')).toHaveCount(1);
  if (page.viewportSize()!.width < 1024)
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('button', { name: 'Blue stats', exact: true }).click();
  await page.getByRole('button', { name: 'Add Speed spark', exact: true }).click();
  await page.getByRole('button', { name: 'Stats & SP', exact: true }).click();
  await expect(page.locator('.active-filter-chips')).toContainText(
    'Speed · Total 1★+ · Any generation'
  );
  await page
    .getByRole('button', { name: 'Remove Speed · Total 1★+ · Any generation', exact: true })
    .click();

  await expect(page.locator('.active-filter-chips')).toContainText('Name: Grass');
  if (page.viewportSize()!.width < 1024)
    await page.getByRole('button', { name: 'Show 1 veteran', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('veterans-search.png'), fullPage: true });
  await page.getByRole('button', { name: 'View Grass Wonder details', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Training support cards', exact: true })
  ).toContainText('No support cards recorded.');

  await expect(page.getByRole('region', { name: 'Base stat preview', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog').locator('.stats > div')).toHaveCount(5);
  await page.screenshot({ path: testInfo.outputPath('veterans-details.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
});

test('account Veterans retains Angular roster modes and filter controls', async ({ page }) => {
  await mockProfile(page);
  await page.goto('/profile/123456789012/veterans');
  await expect(page.getByRole('heading', { name: 'Parity Trainer' })).toBeVisible();
  await page.getByRole('button', { name: 'Display options', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'View', exact: true })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Veteran workbench' })).toHaveCount(0);
  await expect(page.getByText('Grass Wonder', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search', exact: true })).toBeVisible();
  if (page.viewportSize()!.width < 1024)
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('button', { name: 'Stats & SP', exact: true }).click();
  if (page.viewportSize()!.width < 1024)
    await page.getByRole('button', { name: 'Show 1 veteran', exact: true }).click();
  await page.getByRole('combobox', { name: 'View', exact: true }).click();
  await page.getByRole('option', { name: 'Family tree', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Veteran lineage' })
      .or(page.locator('[aria-label="Veteran lineage"]'))
  ).toBeVisible();
});

test('account Veterans is page-overflow safe at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockProfile(page);
  await page.goto('/profile/123456789012/veterans');
  await expect(page.getByText('Grass Wonder', { exact: true }).first()).toBeVisible();
  const geometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth
  }));

  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport);
});

test('Veteran comparison table keeps aptitudes readable, sorts stats and opens details', async ({
  page
}, testInfo) => {
  await mockProfile(page);
  await page.route('**/resources/*/affinity.json*', (route) =>
    route.fulfill({
      json: { chars: [1011, 1013, 1067, 1088], aff2: Array(16).fill(2), aff3: Array(64).fill(3) }
    })
  );

  const whites = factorLoadingState
    .filter((factor) => ![0, 1, 5].includes(factor.type))
    .slice(0, 4)
    .map((factor) => Number(factor.id) * 10 + 2);

  const comparisonVeteran = { ...veteran, factors: [...whites, 1203, 10010103, 103] };

  await page.route('**/api/v4/user/profile/123456789012', (route) =>
    route.fulfill({
      json: {
        ...profile,
        veterans: [
          comparisonVeteran,
          { ...comparisonVeteran, id: 2, trained_chara_id: 2, card_id: 101301, speed: 1400 }
        ]
      }
    })
  );

  await page.goto('/veterans/123456789012');
  const card = page.locator('.veteran-card').first();
  await expect(card.locator('.white-count')).toContainText('4 white');
  await expect(card.getByLabel(/^P1 affinity: \d+$/)).toBeVisible();
  await expect(card.getByLabel(/^P2 affinity: \d+$/)).toBeVisible();
  const affinityLabels = await card
    .locator('.affinity-sources .affinity')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));

  const parentImages = await card
    .locator('.affinity-parent img')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src')));

  const identity = await card.locator('.veteran-identity').innerText();
  const sparks = await card.locator('.spark-groups').innerText();
  await page.getByRole('button', { name: 'Display options', exact: true }).click();
  await page.getByRole('combobox', { name: 'View', exact: true }).click();
  await page.getByRole('option', { name: 'Table', exact: true }).click();
  const table = page.getByRole('region', { name: 'Veteran comparison', exact: true });
  await expect(table.locator('tbody .table-character')).toHaveCount(2);
  await expect(table.locator('.veteran-identity').first()).toHaveText(identity, {
    useInnerText: true
  });

  await expect(table.locator('.spark-groups').first()).toHaveText(sparks, { useInnerText: true });
  await expect(table.locator('thead th')).toHaveCount(6);
  await expect(table.locator('.table-stats').first().getByRole('term')).toHaveText([
    'Speed',
    'Stamina',
    'Power',
    'Guts',
    'Wit',
    'SP',
    'Total Stats'
  ]);
  for (const identity of await table.locator('.veteran-identity').all()) {
    const stars = (await identity.locator('.rarity').boundingBox())!;
    const metadata = await identity
      .locator('.scenario,.race-style')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().bottom));

    expect(stars.y).toBeGreaterThanOrEqual(Math.max(...metadata));
  }

  const affinity = table.locator('.table-affinity').first();
  await expect(affinity.locator('.affinity')).toHaveCount(3);
  expect(
    await affinity
      .locator('.affinity')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')))
  ).toEqual(affinityLabels);
  expect(
    await affinity
      .locator('.affinity-parent img')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('src')))
  ).toEqual(parentImages);
  expect(
    await affinity.evaluate((node) => node.scrollWidth - node.clientWidth)
  ).toBeLessThanOrEqual(1);
  const affinityRows = await affinity
    .locator('.affinity-main,.affinity-parent')
    .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()));

  await expect(affinity.locator('img')).toHaveCount(3);
  await expect(affinity.locator('.affinity-main img')).toHaveAttribute(
    'src',
    (await table.locator('.portrait img').first().getAttribute('src'))!
  );
  for (let index = 1; index < affinityRows.length; index++) {
    expect(affinityRows[index].top).toBeGreaterThanOrEqual(affinityRows[index - 1].bottom);
    expect(affinityRows[index].height).toBeCloseTo(affinityRows[0].height, 0);
  }

  await expect(table.locator('.table-aptitudes').first().getByRole('listitem')).toHaveCount(10);
  expect(
    await table
      .locator('.table-aptitudes')
      .first()
      .evaluate((el) => el.scrollWidth - el.clientWidth)
  ).toBeLessThanOrEqual(1);
  await expect(table.locator('.table-factors').first()).toContainText('6');
  if (page.viewportSize()!.width < 768) {
    await page.getByRole('button', { name: 'Sort veterans', exact: true }).click();
    await page.getByRole('button', { name: 'Speed', exact: true }).click();
    await page.getByRole('button', { name: 'Show 2 veterans', exact: true }).click();
  } else {
    await page.getByRole('combobox', { name: 'Sort', exact: true }).click();
    await page.getByRole('option', { name: 'Speed', exact: true }).click();
  }

  await expect(table.locator('.table-stats [data-stat="speed"] dd').first()).toHaveText('1,400');
  if (page.viewportSize()!.width < 768) {
    await page.getByRole('button', { name: 'Sort veterans', exact: true }).click();
    await page.getByRole('combobox', { name: 'Order', exact: true }).click();
    await page.getByRole('option', { name: 'Lowest first', exact: true }).click();
    await page.getByRole('button', { name: 'Show 2 veterans', exact: true }).click();
  } else await page.getByRole('button', { name: 'Sort ascending', exact: true }).click();

  await expect(table.locator('.table-stats [data-stat="speed"] dd').first()).toHaveText('1,210');
  await expect(table.locator('.table-stats [data-stat="total"] dd').first()).toHaveText('5,020');
  const totalLabel = (await table
    .locator('.table-stats [data-stat="total"] dt')
    .first()
    .boundingBox())!;

  const totalValue = (await table
    .locator('.table-stats [data-stat="total"] dd')
    .first()
    .boundingBox())!;

  expect(
    Math.abs(totalValue.y + totalValue.height / 2 - totalLabel.y - totalLabel.height / 2)
  ).toBeLessThan(1);
  expect(totalValue.x - totalLabel.x - totalLabel.width).toBeLessThanOrEqual(5);
  await expect(table.locator('.table-stats [data-stat="sp"] dd').first()).toHaveText('200');
  const witBounds = (await table.locator('.table-stats [data-stat="wiz"]').first().boundingBox())!;
  const spBounds = (await table.locator('.table-stats [data-stat="sp"]').first().boundingBox())!;
  expect(spBounds.y).toBeCloseTo(witBounds.y, 0);
  expect(spBounds.x).toBeGreaterThan(witBounds.x);
  await expect(table.locator('thead th').last()).toHaveText('Details');
  await expect(table.locator('.table-character .veteran-identity')).toHaveCount(2);
  await expect(table.locator('.table-factors .spark-group').first()).toHaveAttribute(
    'data-tone',
    'blue'
  );
  if (page.viewportSize()!.width >= 1400)
    expect(await table.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  if (page.viewportSize()!.width < 768)
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await table.evaluate((el) => (el.scrollLeft = 0));
      await table.scrollIntoViewIfNeeded();
      await expect(table.locator('thead')).toBeInViewport();
      const row = table.locator('tbody tr[data-virtual-index]').first();
      await expect(row).toHaveCSS('display', 'table-row');
      expect(await table.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width
      );
      await expect(row.locator('[data-stat="sp"] dd')).toHaveText('200');
      expect(
        await row
          .locator('[data-stat="sp"] dt')
          .evaluate((node) => node.scrollWidth - node.clientWidth)
      ).toBeLessThanOrEqual(1);
      await expect(row.locator('.affinity-parent img')).toHaveCount(2);
      expect(
        await row.locator('.table-affinity').evaluate((node) => node.scrollWidth - node.clientWidth)
      ).toBeLessThanOrEqual(1);
      const chipHeight = (await row.locator('.spark').first().boundingBox())!.height;
      expect(
        Math.abs((await row.locator('.white-count').boundingBox())!.height - chipHeight)
      ).toBeLessThanOrEqual(1);
      const areas = await row
        .locator('th,td')
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()));

      for (const area of areas) {
        expect(area.top).toBeCloseTo(areas[0].top, 0);
        expect(area.bottom).toBeCloseTo(areas[0].bottom, 0);
      }

      expect(areas[0].height).toBeLessThan(95);
      expect(areas[0].width).toBeLessThanOrEqual(120);
      const rankBounds = (await row.locator('.rank strong').boundingBox())!;
      expect(rankBounds.x + rankBounds.width).toBeLessThanOrEqual(areas[0].right);
      expect((await table.locator('table').boundingBox())!.width).toBeLessThanOrEqual(740);
      await table.screenshot({ path: testInfo.outputPath(`table-left-${width}.png`) });
      await table.evaluate((el) => (el.scrollLeft = el.scrollWidth));
      await expect(
        row.getByRole('button', { name: 'Open Grass Wonder details', exact: true })
      ).toBeInViewport();

      expect((await row.locator('th').boundingBox())!.x).toBeCloseTo(areas[0].x, 0);
      await table.screenshot({ path: testInfo.outputPath(`table-right-${width}.png`) });
    }

  await table.evaluate((el) => (el.scrollLeft = 0));
  await page.screenshot({ path: testInfo.outputPath('veteran-table.png'), fullPage: true });
  await table.screenshot({ path: testInfo.outputPath('table-region.png') });
  if (page.viewportSize()!.width < 768)
    await table.getByRole('button', { name: 'View all 4 white sparks', exact: true }).first().tap();
  else {
    await table.getByRole('button', { name: 'View Grass Wonder details', exact: true }).focus();
    await page.keyboard.press('Enter');
  }

  await expect(page.getByRole('dialog', { name: 'Grass Wonder', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
});

test('Veterans race filters select and clear races instead of rendering a read-only calendar', async ({
  page
}, testInfo) => {
  await mockProfile(page);
  await page.goto('/profile/123456789012/veterans');
  await expect(page.locator('.veteran-card')).toHaveCount(1);
  if (page.viewportSize()!.width < 1024)
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('button', { name: 'Race wins', exact: true }).click();
  await page.getByRole('combobox', { name: 'Find a race win', exact: true }).fill('Arima');
  const arima = page.getByRole('option', { name: 'Arima Kinen', exact: true });
  await expect(arima.locator('img')).toHaveAttribute(
    'src',
    '/game-assets/textures/race_banners/thum_race_rt_000_1023_00.webp'
  );
  await expect
    .poll(() =>
      arima
        .locator('img')
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)
    )
    .toBe(true);
  await page
    .getByRole('listbox', { name: 'Find a race win suggestions', exact: true })
    .screenshot({ path: testInfo.outputPath('race-search-icons.png') });

  await arima.click();
  await expect(page.getByText('1 selected race', { exact: true })).toBeVisible();
  await expect(page.locator('.selected-races .race.inline')).toHaveAttribute(
    'aria-label',
    'Arima Kinen, G1'
  );
  const selectedRaceName = page.locator('.selected-races .race-name');
  await expect(selectedRaceName.locator('small')).toHaveText('G1');
  await expect(selectedRaceName.locator('strong')).toHaveText('Arima Kinen');
  await page
    .locator('#facet-saddle')
    .screenshot({ path: testInfo.outputPath('compact-race-selection.png') });

  await page.screenshot({ path: testInfo.outputPath('race-win-filter.png') });
  // This fixture has no matching ancestor wins; clearing must restore it.
  await expect(page.getByText('No veterans match your filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Remove Arima Kinen', exact: true }).first().click();
  await expect(page.locator('.veteran-card')).toHaveCount(1);
  await expect(page.getByText('0 selected races', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Inheritance totals', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Training scenario', exact: true })
  ).toBeVisible();

  const whites = page.getByRole('slider', { name: 'Minimum unique white sparks', exact: true });
  await setSliderValue(whites, 10);
  await expect(page.locator('.veteran-card')).toHaveCount(0);
  await setSliderValue(whites, 0);
  await expect(page.locator('.veteran-card')).toHaveCount(1);
  await setSliderValue(page.getByRole('slider', { name: 'Minimum affinity', exact: true }), 100);
  await expect(page.locator('.veteran-card')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('inheritance-totals.png') });
  await page.getByRole('button', { name: 'Clear Inheritance totals', exact: true }).click();
  await expect(page.locator('.veteran-card')).toHaveCount(1);
});

test('Veteran details retain support deck, stats, aptitudes, races, sparks, skills, and inspectable lineage', async ({
  page
}, testInfo) => {
  await mockProfile(page);
  await page.route('**/api/v4/user/profile/123456789012', (route) =>
    route.fulfill({
      json: {
        ...profile,
        team_stadium: [],
        veterans: [
          {
            ...veteran,
            support_cards: [30028, 30016, 30003, 30009, 20023, 999999],
            support_card_list: [30028, 30016, 30003, 30009, 20023].map(
              (support_card_id, index) => ({ support_card_id, limit_break_count: 4 - index })
            )
          }
        ]
      }
    })
  );

  await page.goto('/profile/123456789012/veterans');
  await page.getByRole('button', { name: 'View Grass Wonder details', exact: true }).click();
  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toBeVisible();
  for (const label of ['Stats', 'Aptitudes', 'Learned skills', 'Sparks', 'Race History']) {
    await expect(
      dialog.getByRole('heading', { name: new RegExp('^' + label + '( \\d+)?$') })
    ).toBeVisible();
  }

  await expect(dialog.getByText('Base stat preview', { exact: true })).toHaveCount(0);
  const sparkBounds = (await dialog.locator('.spark-section').boundingBox())!;
  const skillBounds = (await dialog.locator('.skills-section').boundingBox())!;
  expect(skillBounds.y).toBeGreaterThanOrEqual(sparkBounds.y + sparkBounds.height);
  await expect(dialog.locator('[data-stat="total"]')).toHaveCount(0);
  await expect(dialog.locator('.stats > div')).toHaveCount(5);
  const totals = dialog.locator('.totals > div');
  await expect(
    totals.filter({ has: page.locator('dt', { hasText: /^SP total$/ }) }).locator('dd')
  ).toHaveText('200');

  await expect(
    totals.filter({ has: page.locator('dt', { hasText: /^Total Stats$/ }) }).locator('dd')
  ).toHaveText('5,020');

  await expect(
    dialog.getByRole('listitem', { name: 'Speed: 6 stars total. Main 3, P1 3, P2 0.', exact: true })
  ).toBeVisible();

  const bounds = (await dialog.boundingBox())!;
  expect(Math.abs(bounds.y + bounds.height / 2 - page.viewportSize()!.height / 2)).toBeLessThan(2);
  expect(bounds.height).toBeLessThan(page.viewportSize()!.height);
  const identity = dialog.locator('.dialog-panel > header .veteran-identity');
  await expect(identity.locator('.scenario')).toHaveText('Grand Masters');
  await expect(identity.locator('.race-style')).toContainText('Long · Pace');
  await expect(identity.getByLabel('5 rarity stars')).toHaveText('★★★★★');
  for (const selector of ['.scenario', '.rarity']) {
    const color = await page
      .locator('.veteran-card')
      .first()
      .locator(selector)
      .evaluate((el) => getComputedStyle(el).color);

    await expect(identity.locator(selector)).toHaveCSS('color', color);
  }

  await expect(identity.locator('.portrait')).toHaveCSS('border-width', '0px');
  const deck = dialog.getByRole('region', { name: 'Training support cards', exact: true });
  await expect(deck.locator('li>span')).toHaveText([
    'Kitasan Black',
    'Super Creek',
    'Tokai Teio',
    'Tamamo Cross',
    'Sweep Tosho',
    'Card 999999'
  ]);
  await expect(deck.locator('.support-lb')).toHaveCount(6);
  expect(
    await deck
      .locator('.support-lb')
      .evaluateAll((items) => items.map((item) => item.querySelectorAll('svg.filled').length))
  ).toEqual([4, 3, 2, 1, 0, 0]);
  await expect(deck.locator('.support-lb svg')).toHaveCount(20);
  await expect(deck.locator('.support-rarity')).toHaveCount(5);
  expect(
    await deck
      .locator('.support-rarity')
      .evaluateAll((images) => images.map((image) => image.getAttribute('alt')))
  ).toEqual(['SSR', 'SSR', 'SSR', 'SSR', 'SR']);
  await expect(deck.locator('.support-rarity').first()).toHaveAttribute(
    'src',
    '/game-assets/support-rarity/ssr.png'
  );
  await expect
    .poll(() =>
      deck
        .locator('.support-rarity')
        .evaluateAll((images) =>
          images.every(
            (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
          )
        )
    )
    .toBe(true);
  await expect(deck.locator('li').first().locator('img.support-type')).toHaveAttribute(
    'src',
    '/assets/images/icon/stats/speed.webp'
  );
  await expect(deck.locator('li').nth(1).locator('img.support-type')).toHaveAttribute(
    'alt',
    'Stamina support'
  );
  await expect(deck.getByLabel('Limit break 0 of 4', { exact: true })).toBeVisible();
  await expect(deck.getByLabel('Limit break not recorded', { exact: true })).toBeVisible();
  await expect(
    deck.locator('li').first().getByRole('img', { name: 'Kitasan Black', exact: true })
  ).toHaveAttribute('src', /support_card_s_30028.webp$/);

  await expect(dialog.locator('.aptitude-item>span').first()).toHaveCSS(
    'color',
    'rgb(255, 255, 255)'
  );
  if (page.viewportSize()!.width > 650) {
    const aptitude = (await dialog.locator('.aptitudes .aptitude-grid').boundingBox())!;
    const affinity = (await dialog.locator('.affinity-sources').boundingBox())!;
    expect(affinity.y).toBeCloseTo(aptitude.y, 0);
    expect(affinity.height).toBeCloseTo(aptitude.height, 0);
  }

  await page.screenshot({ path: testInfo.outputPath('veteran-dialog.png') });
  await expect(dialog.getByRole('radio', { name: 'Individual', exact: true })).toHaveCount(0);
  await dialog.getByRole('radio', { name: 'Grass Wonder This veteran', exact: true }).check();
  const sources = dialog.getByRole('group', { name: 'Show sparks from', exact: true });
  await expect(sources.getByRole('radio')).toHaveCount(8);
  expect((await dialog.locator('.spark-sources').boundingBox())!.height).toBeLessThan(
    page.viewportSize()!.width > 650 ? 70 : 120
  );
  await expect(
    dialog.getByRole('radio', { name: 'Grass Wonder This veteran', exact: true })
  ).toBeChecked();

  await expect(dialog.getByRole('heading', { name: 'Sparks 4', exact: true })).toBeVisible();
  await expect(
    dialog.getByRole('listitem', { name: 'Speed: 3 stars.', exact: true })
  ).toBeVisible();

  await dialog.getByRole('radio', { name: 'Satono Crown Parent 2', exact: true }).check();
  await expect(dialog.getByRole('listitem', { name: 'Dirt: 3 stars.', exact: true })).toBeVisible();
  await dialog.getByRole('radio', { name: 'Satono Diamond Parent 1', exact: true }).check();
  await dialog
    .getByRole('radio', { name: 'Satono Diamond Parent 1', exact: true })
    .press('ArrowRight');

  await expect(
    dialog.getByRole('radio', { name: 'Grass Wonder P1 · Grandparent 1', exact: true })
  ).toBeChecked();

  await expect(dialog.locator('.source-name')).toHaveText('Grass Wonder · P1 · Grandparent 1');
  await dialog
    .locator('.spark-section')
    .screenshot({ path: testInfo.outputPath('compact-spark-selector.png') });

  await expect(
    dialog.getByRole('listitem', { name: 'Speed: 2 stars.', exact: true })
  ).toBeVisible();

  await expect(dialog.getByRole('heading', { name: 'Lineage', exact: true })).toBeVisible();
  await expect(dialog.locator('.family-section .lineage-node')).toHaveCount(6);
  await expect(dialog.locator('.family-section .root')).toHaveCount(0);
  // Offscreen sections use content-visibility placeholders until scrolled into view.
  await dialog.locator('.family-section').scrollIntoViewIfNeeded();
  await expect
    .poll(async () => (await dialog.locator('.family-section').boundingBox())!.height)
    .toBeLessThan(180);
  await dialog
    .locator('.family-section')
    .screenshot({ path: testInfo.outputPath('compact-lineage.png') });

  await dialog.getByRole('button', { name: 'P1 legacy 1: Grass Wonder', exact: true }).click();
  await expect(
    dialog.getByRole('radio', { name: 'Grass Wonder P1 · Grandparent 1', exact: true })
  ).toBeChecked();

  await expect(
    dialog.getByRole('listitem', { name: 'Speed: 2 stars.', exact: true })
  ).toBeVisible();

  await dialog.getByRole('radio', { name: 'Combined Own + P1 + P2', exact: true }).click();
  await expect(dialog.getByRole('group', { name: 'Show sparks from', exact: true })).toBeVisible();
  await expect(
    dialog.getByRole('listitem', { name: 'Speed: 6 stars total. Main 3, P1 3, P2 0.', exact: true })
  ).toBeVisible();

  expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  const skillIcons = dialog.locator('.skill-chip img');
  await expect(dialog.locator('.skill-chip').first()).toHaveClass(/rarity-unique-main/);
  await expect(dialog.locator('.skill-name').first()).toHaveText('Shooting Star');
  await expect(skillIcons).toHaveCount(2);
  await skillIcons.first().scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      skillIcons.evaluateAll((images) =>
        images.every(
          (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
        )
      )
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Full Schedule' }).click();
  await expect(page.getByRole('heading', { name: 'Race History', exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('dialog')
      .last()
      .getByLabel(/February Stakes, G1/)
      .filter({ visible: true })
  ).toBeVisible();
});

test('Spark operators stay centered and switch a large collection promptly', async ({
  page,
  isMobile
}) => {
  await mockProfile(page);
  await page.route('**/api/v4/user/profile/123456789012', (route) =>
    route.fulfill({
      json: {
        ...profile,
        veterans: Array.from({ length: 1000 }, (_, i) => ({
          ...veteran,
          id: i + 1,
          trained_chara_id: i + 1,
          factors: i % 2 ? [103] : [103, 203]
        }))
      }
    })
  );

  await page.goto('/veterans/123456789012');
  if (isMobile) await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('button', { name: 'Blue stats', exact: true }).click();
  await page.getByRole('button', { name: 'Add Speed spark', exact: true }).click();
  await page.getByRole('button', { name: 'Blue stats', exact: true }).click();
  await page.getByRole('button', { name: 'Add Stamina spark', exact: true }).click();
  const join = page.getByRole('radiogroup', { name: 'Rule 2 operator' });
  const card = (await page.locator('.requirement').first().boundingBox())!;
  const box = (await join.boundingBox())!;
  expect(box.x + box.width / 2).toBeCloseTo(card.x + card.width / 2, 0);
  const timings = [];
  for (const name of ['OR', 'AND', 'OR']) {
    const measured = await completion(
      page,
      `1000-veteran ${name}`,
      () => join.getByRole('radio', { name, exact: true }).click(),
      { selector: '[aria-label="Rule 2 operator"] [aria-checked="true"]', text: name }
    );

    timings.push(measured.ms);
    await expect(join.getByRole('radio', { name, exact: true })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  }

  console.log('1000-veteran AND/OR switches (ms):', timings);
  await test.info().attach('interaction-metrics', {
    body: JSON.stringify(await page.evaluate(() => window.__stress)),
    contentType: 'application/json'
  });

  if (isMobile)
    await page
      .getByRole('dialog', { name: 'Filter veterans' })
      .getByRole('button', { name: /^Show .* veterans$/ })
      .click();
  await expect(page.getByRole('button', { name: /Show \d+ more/ })).toHaveCount(0);
  expect(await page.locator('.veteran-card').count()).toBeLessThan(50);
  await page.locator('.veteran-grid').evaluate((node) =>
    window.scrollTo({
      top: node.getBoundingClientRect().top + scrollY + node.scrollHeight * 0.8,
      behavior: 'instant'
    })
  );

  await expect
    .poll(async () =>
      Number(
        await page
          .locator('.veteran-grid [data-virtual-index]')
          .first()
          .getAttribute('data-virtual-index')
      )
    )
    .toBeGreaterThan(500);
  expect(await page.locator('.veteran-card').count()).toBeLessThan(50);
});
