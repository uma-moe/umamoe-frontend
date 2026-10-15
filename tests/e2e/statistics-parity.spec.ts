import { expect, test } from './fixtures/test';
import { mockStatistics } from './fixtures/api';

test('distance overview shares, training means and deck slots follow the same quick filters', async ({
  page
}) => {
  await mockStatistics(page);
  await page.route('**/assets/statistics/datasets.json', (route) =>
    route.fulfill({
      json: {
        datasets: [
          {
            id: 'fixture',
            name: 'Distance comparison',
            basePath: '/assets/statistics/fixture',
            format_version: 4,
            index: { distances: ['1', '2'], character_ids: ['100101'], total_entries: 40 }
          }
        ]
      }
    })
  );

  const distance = (count: number, speed: number, composition: Record<string, number>) => {
    const scope = {
      total_entries: count,
      uma_distribution: { '100101': { count } },
      stat_averages: { speed: { mean: speed, count } },
      support_card_combinations: { ['deck-' + speed]: { count, composition } }
    };

    return { by_team_class: { '6': { overall: scope, by_scenario: { '1': scope } } } };
  };

  await page.route('**/assets/statistics/fixture/global/global.json*', (route) =>
    route.fulfill({
      json: {
        metadata: { total_entries: 40 },
        scenario_distribution: { '1': { count: 40 } },
        by_distance: {
          '1': distance(10, 100, { speed: 4, stamina: 2 }),
          '2': distance(30, 300, { guts: 3, wisdom: 2, friend: 1 })
        }
      }
    })
  );

  await page.goto('/tools/statistics');
  await expect(page.getByTestId('selected-samples')).toHaveText('40');
  const breakdown = page.getByRole('figure', { name: 'Distance breakdown', exact: true });
  await expect(breakdown).toContainText('25%');
  await expect(breakdown).toContainText('75%');
  const matrix = page.getByRole('table', { name: 'Support deck composition counts and shares' });
  await expect(matrix.getByLabel('wit: 2', { exact: true })).toHaveText('2');
  await expect(matrix.getByLabel('speed: 4', { exact: true })).toHaveText('4');
  await expect(
    page.getByLabel('Average training stats', { exact: true }).locator('[data-stat="speed"] dd')
  ).toHaveText('200');

  const focus = page.getByRole('radiogroup', { name: 'Distance focus' });
  await focus.getByRole('radio', { name: 'All distances' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('selected-samples')).toHaveText('10');
  await expect(breakdown).not.toContainText('Mile');
  await expect(matrix.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Supports', exact: true }).click();
  await expect(focus.getByRole('radio', { name: 'Sprint', exact: true })).toHaveAttribute(
    'aria-checked',
    'true'
  );

  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await focus.getByRole('radio', { name: 'All distances' }).click();
  await breakdown.getByRole('button', { name: 'Analyze Special Week for Mile' }).click();
  await expect(page.getByRole('tab', { name: 'Characters', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );

  await expect(focus.getByRole('radio', { name: 'Mile', exact: true })).toHaveAttribute(
    'aria-checked',
    'true'
  );

  await expect(page.getByTestId('selected-samples')).toHaveText('30');
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.getByTestId('selected-samples')).toHaveText('40');
});

test('overview rankings retain portraits, readable themes, class charts and empty states', async ({
  page
}) => {
  await mockStatistics(page);
  await page.goto('/tools/statistics');
  const popular = page.getByRole('list', { name: 'Most Popular Uma Musume', exact: true });
  const portrait = popular.locator('img');
  await expect(portrait).toHaveAttribute('src', /character_thumbs\/chara_stand_1001_100101.webp/);
  expect(
    await portrait.evaluate(async (image: HTMLImageElement) => {
      await image.decode();
      return image.naturalWidth > 0;
    })
  ).toBe(true);

  await page.getByRole('button', { name: 'Team class breakdown', exact: true }).click();
  const classes = page.getByRole('figure', { name: 'Team Class Distribution chart', exact: true });
  await classes.scrollIntoViewIfNeeded();
  const legend = classes.locator('svg text').filter({ hasText: /^Class 6$/ });
  await expect(legend).toBeVisible();
  const darkColor = await legend.getAttribute('fill');
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await expect(legend).not.toHaveAttribute('fill', darkColor!);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('button', { name: 'Deselect all classes', exact: true }).click();
  await expect(popular).toHaveCount(0);
  await page.getByRole('button', { name: 'Select all classes', exact: true }).click();
  await page.getByRole('button', { name: 'Deselect all distances', exact: true }).click();
  await expect(popular).toHaveCount(0);
  await page.getByRole('button', { name: 'Select all distances', exact: true }).click();
  await page.getByRole('checkbox', { name: 'URA', exact: true }).click();
  await page.getByRole('button', { name: 'Show results', exact: true }).click();
  await expect(page.getByTestId('selected-samples')).toHaveText('0');
  await expect(
    page
      .getByRole('figure', { name: 'Most Popular Uma Musume', exact: true })
      .getByText('No data available', { exact: true })
  ).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    await page.evaluate(() => innerWidth)
  );
});

test('failed chart chunks show a recoverable error without breaking the explorer', async ({
  page
}) => {
  await mockStatistics(page);
  await page.route(/\/EChartsSurface[.-]/, (route) => route.abort());
  await page.goto('/tools/statistics');
  await page.getByRole('tab', { name: 'Stats', exact: true }).click();
  await expect(page.getByText('Chart renderer could not be loaded').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload page' }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(
    page.getByRole('list', { name: 'Most Popular Uma Musume', exact: true }).getByRole('listitem')
  ).toHaveCount(1);
});

test('statistics resolves character names, outfits, cards and skills from the resource manifest', async ({
  page
}) => {
  await mockStatistics(page);
  const resources: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/resources/')) resources.push(new URL(request.url()).pathname);
  });

  await page.route('**/resources/manifest.json*', (route) =>
    route.fulfill({
      json: {
        version: 'catalog-check',
        files: {
          character: '/resources/catalog-check/character.json',
          character_names: '/resources/catalog-check/character_names.json',
          'support-cards-db': '/resources/catalog-check/support-cards-db.json',
          skills: '/resources/catalog-check/skills.json'
        }
      }
    })
  );

  await page.route('**/resources/*/character_names.json*', (route) =>
    route.fulfill({
      json: { '1001': { name: 'Resource Week', skins: { '01': 'Resource outfit' } } }
    })
  );

  await page.route('**/resources/*/support-cards-db.json*', (route) =>
    route.fulfill({ json: [{ id: '10001', name: 'Resource support', rarity: 3, type: 'stamina' }] })
  );

  await page.route('**/resources/*/skills.json*', (route) =>
    route.fulfill({
      json: [
        { skill_id: 200132, name: 'Resource skill', rarity: 2, icon: 'utx_ico_skill_20013.webp' }
      ]
    })
  );

  await page.goto('/tools/statistics');
  await expect(
    page.getByRole('button', { name: 'Analyze Resource Week', exact: true })
  ).toBeVisible();

  await expect(
    page.getByRole('list', { name: 'Popular support cards', exact: true })
  ).toContainText('Resource support');

  await expect(
    page.getByRole('list', { name: 'Popular support cards', exact: true })
  ).toContainText('Stamina · SSR');

  await expect(
    page.getByRole('list', { name: 'Common skills', exact: true }).locator('img')
  ).toHaveAttribute('src', '/assets/images/skills/utx_ico_skill_20013.webp');

  await page.getByRole('tab', { name: 'Characters', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Character Analysis', exact: true })).toContainText(
    'Resource outfit'
  );

  for (const name of ['character', 'character_names', 'support-cards-db', 'skills'])
    expect(resources).toContain('/resources/catalog-check/' + name + '.json');
});

test('older ID-format datasets load without gzip and merge separate distance files', async ({
  page
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/statistics/fixture/'))
      requests.push(new URL(request.url()).pathname);
  });

  await mockStatistics(page, 2);
  await page.goto('/tools/statistics');
  await page.getByRole('tab', { name: 'Supports', exact: true }).click();
  await expect(
    page.getByRole('list', { name: 'Most Used Deck Compositions' }).getByRole('listitem')
  ).toHaveCount(1);

  expect(requests).toContain('/assets/statistics/fixture/global/global.json');
  expect(requests).toContain('/assets/statistics/fixture/distance/1.json');
  expect(requests.some((path) => path.endsWith('.gz'))).toBe(false);
});

test('legacy distance names, flat class scopes and name-keyed Uma rankings retain working drilldowns', async ({
  page
}) => {
  await mockStatistics(page, 1);
  await page.route('**/assets/statistics/datasets.json', (route) =>
    route.fulfill({
      json: {
        datasets: [
          {
            id: 'fixture',
            name: 'Legacy fixture',
            basePath: '/assets/statistics/fixture',
            index: { distances: ['Sprint'], character_ids: ['100101'], total_entries: 10 }
          }
        ]
      }
    })
  );

  await page.route('**/assets/statistics/fixture/global/global.json', (route) =>
    route.fulfill({ json: { metadata: { total_entries: 10 } } })
  );

  await page.route('**/assets/statistics/fixture/distance/sprint.json', (route) =>
    route.fulfill({
      json: {
        by_team_class: {
          '6': {
            total_entries: 10,
            uma_distribution: { 'Special Week': { character_id: '100101', count: 10 } }
          }
        }
      }
    })
  );

  await page.goto('/tools/statistics');
  await expect(page.getByTestId('selected-samples')).toHaveText('10');
  await expect(
    page.getByRole('list', { name: 'Most Popular Uma Musume', exact: true }).locator('img')
  ).toHaveAttribute('src', /chara_stand_1001_100101.webp/);

  await page.getByRole('button', { name: 'Analyze Special Week', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Compared with the field', exact: true })
  ).toBeVisible();
});

test('overview opens character analysis and every analysis view remains available', async ({
  page
}) => {
  await mockStatistics(page);
  await page.goto('/tools/statistics');
  await page.getByRole('button', { name: 'Analyze Special Week', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Characters', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );

  await expect(page.getByRole('heading', { name: 'Special Week', exact: true })).toBeInViewport();
  await expect(
    page.getByRole('heading', { name: 'Compared with the field', exact: true })
  ).toBeVisible();

  for (const [tab, heading] of [
    ['Overview', 'The field at a glance'],
    ['Supports', 'Build your support deck'],
    ['Skills', 'Explore the skill pool'],
    ['Stats', 'Look beyond the averages']
  ]) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeInViewport();
  }

  await page.getByRole('tab', { name: 'Skills', exact: true }).click();
  await expect(
    page.getByRole('list', { name: 'Most Used Skills' }).getByText('Standard Distance ○')
  ).toBeVisible();

  await page.getByRole('tab', { name: 'Supports', exact: true }).click();
  const decks = page.getByRole('list', { name: 'Most Used Deck Compositions' });
  await expect(decks.getByRole('img')).toHaveCount(6);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Class 1', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'URA', exact: true }).click();
  await expect(decks).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'URA', exact: true }).click();
  await expect(decks.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Show results', exact: true }).click();
});

test('filter groups update live, reset and fit desktop and narrow mobile in both themes', async ({
  page
}, testInfo) => {
  await mockStatistics(page);
  const distances = ['1', '2', '3', '4', '5'];
  const scenarios = ['1', '2', '3', '4'];
  const scope = { total_entries: 10, uma_distribution: { '100101': { count: 10 } } };

  await page.route('**/assets/statistics/datasets.json', (route) =>
    route.fulfill({
      json: {
        datasets: [
          {
            id: 'fixture',
            name: 'All filter options',
            basePath: '/assets/statistics/fixture',
            format_version: 4,
            index: { distances, character_ids: ['100101'], total_entries: 200 }
          }
        ]
      }
    })
  );

  await page.route('**/assets/statistics/fixture/global/global.json*', (route) =>
    route.fulfill({
      json: {
        metadata: { total_entries: 200 },
        scenario_distribution: Object.fromEntries(scenarios.map((id) => [id, { count: 50 }])),
        by_distance: Object.fromEntries(
          distances.map((id) => [
            id,
            {
              by_team_class: {
                '6': {
                  overall: { ...scope, total_entries: 40 },
                  by_scenario: Object.fromEntries(scenarios.map((id) => [id, scope]))
                }
              }
            }
          ])
        )
      }
    })
  );

  await page.goto('/tools/statistics');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Statistics filters' });
  await expect(dialog.getByRole('checkbox')).toHaveCount(15);
  await expect(dialog.getByRole('status')).toContainText('200');
  await expect(dialog.getByRole('button', { name: 'Reset filters' })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'URA', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(dialog.getByRole('checkbox', { name: 'URA', exact: true })).not.toBeChecked();
  await expect(dialog.getByRole('status')).toContainText('150');
  await dialog.getByRole('button', { name: 'Select all scenarios' }).click();
  await dialog.getByRole('button', { name: 'Deselect all scenarios' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Matching training samples0');
  await dialog.getByRole('button', { name: 'Reset filters' }).click();
  await expect(dialog.getByRole('status')).toContainText('200');
  await dialog.getByRole('checkbox', { name: 'Class 1', exact: true }).uncheck();
  await expect(dialog.getByRole('group', { name: 'Team class' })).toContainText('5 / 6');
  await dialog.screenshot({ path: testInfo.outputPath('statistics-filters-dark.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(dialog.getByRole('checkbox', { name: 'Class 1', exact: true })).not.toBeChecked();
  await dialog.screenshot({ path: testInfo.outputPath('statistics-filters-light.png') });
  await page.setViewportSize({ width: 320, height: 640 });
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect(dialog.getByRole('button', { name: 'Show results' })).toBeInViewport();
  await dialog.getByRole('checkbox', { name: 'Dirt', exact: true }).uncheck();
  await expect(dialog.getByRole('status')).toContainText('160');
  await dialog.screenshot({ path: testInfo.outputPath('statistics-filters-narrow.png') });
  await dialog.getByRole('button', { name: 'Show results' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId('selected-samples')).toHaveText('160');
});

test('tabs retain filters, character search and selection with keyboard navigation', async ({
  page
}) => {
  await mockStatistics(page);
  await page.goto('/tools/statistics');
  const selectedCount = page.getByTestId('selected-samples');
  await expect(selectedCount).toHaveText('10');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Sprint', exact: true }).click();
  await page.getByRole('button', { name: 'Show results', exact: true }).click();
  await expect(selectedCount).toHaveText('0');
  await page.getByRole('tab', { name: 'Supports', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Most Used Deck Compositions' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Stats', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Characters', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Characters', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search Umas by name or ID' }).fill('Special');
  await page.getByRole('button', { name: 'Analyze Special Week', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Special Week', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Skills', exact: true }).click();
  await page.getByRole('tab', { name: 'Characters', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Special Week', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(selectedCount).toHaveText('10');
  await page.getByRole('button', { name: 'Back to character selection', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search Umas by name or ID' })).toHaveValue(
    'Special'
  );
});

test('character comparisons, distances and support decks respond to the same filters', async ({
  page
}) => {
  await mockStatistics(page);
  await page.goto('/tools/statistics');
  await page.getByRole('button', { name: 'Analyze Special Week', exact: true }).click();
  const comparison = page.getByRole('figure', {
    name: 'Compared with the field chart',
    exact: true
  });

  await comparison.scrollIntoViewIfNeeded();
  await expect(
    comparison.locator('svg text').filter({ hasText: /^All selected Umas$/ })
  ).toBeVisible();

  const distance = page.getByRole('figure', { name: 'Distance Preference chart', exact: true });
  await distance.scrollIntoViewIfNeeded();
  await expect(distance.locator('svg text').filter({ hasText: /^Sprint$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Class and support breakdown', exact: true }).click();
  const classes = page.getByRole('figure', {
    name: 'Team Stadium Class Distribution chart',
    exact: true
  });

  await classes.scrollIntoViewIfNeeded();
  await expect(classes.locator('svg text').filter({ hasText: /^Class 6$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Sprint', exact: true }).click();
  await expect(distance).toHaveCount(0);
  await expect(comparison).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Most Used Deck Compositions' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Sprint', exact: true }).click();
  await expect(
    page.getByRole('list', { name: 'Most Used Deck Compositions' }).getByRole('listitem')
  ).toHaveCount(1);

  await page.getByRole('button', { name: 'Show results', exact: true }).click();
});

test('stat explorer switches distributions and normalizes histogram counts to percentages', async ({
  page
}) => {
  await mockStatistics(page);
  await page.goto('/tools/statistics');
  await page.getByRole('tab', { name: 'Stats', exact: true }).click();
  const chart = page.getByRole('figure', { name: 'Speed Stat Distribution chart', exact: true });
  await chart.scrollIntoViewIfNeeded();
  await expect(chart.locator('svg text').filter({ hasText: /^5$/ })).toBeVisible();
  await page.getByRole('radio', { name: 'Percent', exact: true }).click();
  await expect(chart.locator('svg text').filter({ hasText: /^50%$/ })).toBeVisible();
  await expect(chart.locator('svg text').filter({ hasText: /^5$/ })).toHaveCount(0);
  for (const stat of ['Stamina', 'Power', 'Guts', 'Wit']) {
    await page.getByRole('radio', { name: stat, exact: true }).click();
    await expect(
      page.getByRole('heading', { name: stat + ' Stat Distribution', exact: true })
    ).toBeVisible();
  }

  await page.getByRole('radio', { name: 'Count', exact: true }).click();
  await expect(
    page
      .getByRole('figure', { name: 'Wit Stat Distribution chart', exact: true })
      .locator('svg text')
      .filter({ hasText: /^5$/ })
  ).toBeVisible();
});

test('rankings search the complete dataset, sort, expand and recover from no matches', async ({
  page
}) => {
  await mockStatistics(page);
  const skills = Object.fromEntries(
    Array.from({ length: 26 }, (_, index) => [
      'lab-' + index,
      { name: 'Ability ' + String(26 - index).padStart(2, '0'), count: 26 - index }
    ])
  );

  const scope = { total_entries: 10, skills };

  await page.route('**/assets/statistics/fixture/global/global.json*', (route) =>
    route.fulfill({
      json: {
        metadata: { total_entries: 10 },
        scenario_distribution: { '1': { count: 10 } },
        by_distance: {
          '1': { by_team_class: { '6': { overall: scope, by_scenario: { '1': scope } } } }
        }
      }
    })
  );

  await page.goto('/tools/statistics');
  await page.getByRole('tab', { name: 'Skills', exact: true }).click();
  const ranking = page.getByRole('list', { name: 'Most Used Skills', exact: true });
  await expect(ranking.getByRole('listitem')).toHaveCount(20);
  await expect(ranking.getByRole('listitem').first()).toContainText('Ability 26');
  await ranking.getByRole('listitem').last().scrollIntoViewIfNeeded();
  await expect(ranking.getByRole('listitem')).toHaveCount(26);
  await page.getByLabel('Sort Most Used Skills').selectOption('name');
  await expect(ranking.getByRole('listitem').first()).toContainText('Ability 01');
  const search = page.getByRole('searchbox', { name: 'Search skills', exact: true });
  await search.fill('lab-25');
  await expect(ranking.getByRole('listitem')).toHaveCount(1);
  await expect(ranking).toContainText('Ability 01');
  await expect(ranking).toContainText('0.3%');
  await search.fill('no matching skill');
  await expect(page.getByText('No matches found', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect.poll(() => ranking.getByRole('listitem').count()).toBeGreaterThanOrEqual(20);
  await expect(ranking.getByRole('listitem').first()).toContainText('Ability 01');
});

test('switching Statistics versions ignores an older in-flight response', async ({ page }) => {
  await mockStatistics(page);
  const index = { distances: ['1'], character_ids: ['100101'], total_entries: 10 };

  await page.route('**/assets/statistics/datasets.json', (route) =>
    route.fulfill({
      json: {
        datasets: [
          {
            id: 'fixture',
            name: 'Parity fixture',
            basePath: '/assets/statistics/fixture',
            format_version: 4,
            index
          },
          {
            id: 'slow',
            name: 'Slow dataset',
            basePath: '/assets/statistics/slow',
            format_version: 4,
            index
          }
        ]
      }
    })
  );

  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/assets/statistics/slow/global/global.json.gz', async (route) => {
    await gate;
    await route.fulfill({ json: { metadata: { total_entries: 999 }, scenario_distribution: {} } });
  });

  try {
    await page.goto('/tools/statistics');
    await expect(page.getByText('of 10 training samples', { exact: true })).toBeVisible();
    await page.getByLabel('Statistics Version').click();
    const requested = page.waitForRequest('**/assets/statistics/slow/global/global.json.gz');
    await page.getByRole('option', { name: 'Slow dataset', exact: true }).click();
    await requested;
    await page.getByLabel('Statistics Version').click();
    await page.getByRole('option', { name: 'Parity fixture', exact: true }).click();
    await expect(page.getByText('of 10 training samples', { exact: true })).toBeVisible();
    const response = page.waitForResponse('**/assets/statistics/slow/global/global.json.gz');
    release();
    await (await response).finished();
    await expect(page.getByLabel('Statistics Version')).toContainText('Parity fixture');
    await expect(page.getByText('of 10 training samples', { exact: true })).toBeVisible();
    await expect(page.getByText('of 999 training samples', { exact: true })).toHaveCount(0);
  } finally {
    release();
  }
});

test('Statistics uses the standard frame, grouped tabs and a centered right rail', async ({
  page,
  isMobile
}) => {
  test.skip(isMobile, 'Desktop rail layout');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await mockStatistics(page);
  await page.goto('/tools/statistics');
  await expect(page.getByRole('tablist', { name: 'Statistics sections' })).toHaveClass(
    /navigation/
  );

  await expect(page.locator('.workspace-navigation')).toHaveCSS('border-bottom-width', '0px');
  await expect(page.locator('.content-area')).toHaveCSS('padding-top', '6px');
  await expect(
    page.locator(
      '[data-page-content] > .page-body > .app-page > .page-sections > .statistics-content'
    )
  ).toBeVisible();
  await expect(page.locator('.statistics-page')).toHaveCount(0);
  const rail = page.locator('[data-ad-placement="statistics_sticky_vrec_right"]');
  await expect(rail).toBeVisible();
  await expect(rail.locator('[data-fuse]')).toHaveAttribute(
    'data-fuse',
    'stadiumstat_sticky_vrec_rhs'
  );
  const columns = await page
    .locator('.overview-grid')
    .first()
    .evaluate((node) =>
      getComputedStyle(node).gridTemplateColumns.split(' ').map(Number.parseFloat)
    );

  expect(columns).toHaveLength(3);
  expect(columns[0]).toBeLessThan(columns[1]);
  expect(columns[2]).toBeLessThan(columns[1]);
  const box = (await rail.boundingBox())!;
  expect(box.y + box.height / 2).toBeCloseTo(540, 0);
  for (const width of [1536, 1920, 2200]) {
    await page.setViewportSize({ width, height: 1080 });
    const frame = page.locator('[data-route-id="statistics"]');
    await expect(frame).toHaveAttribute('data-page-width', 'wide');
    const geometry = await frame.evaluate((node) => {
      const content = node.querySelector('[data-page-content]')!.getBoundingClientRect();
      const frame = node.getBoundingClientRect();
      const heading = node.querySelector('h1')!.getBoundingClientRect();
      const header = node.querySelector('.page-heading')!.getBoundingClientRect();
      const summary = node.querySelector('.dataset-summary')!.getBoundingClientRect();
      return {
        left: content.left - frame.left,
        width: content.width,
        heading: heading.left,
        headerTop: header.top,
        frameTop: frame.top,
        summary: summary.left,
        columns: getComputedStyle(node).gridTemplateColumns.split(' ').length
      };
    });

    expect(geometry.left).toBeLessThanOrEqual(32);
    expect(geometry.width).toBeGreaterThan(1300);
    expect(geometry.heading).toBeCloseTo(geometry.summary, 0);
    expect(geometry.headerTop).toBe(geometry.frameTop);
    expect(geometry.columns).toBe(width >= 1700 ? 2 : 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.screenshot({
      path: test.info().outputPath(`statistics-standard-frame-${width}.png`),
      fullPage: true
    });
  }
});
