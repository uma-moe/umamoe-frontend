import { expect, test, type Page } from './fixtures/test';
import { mockAffinity, mockVeteranProfile, profile, veteran } from './fixtures/api';
import races from '../fixtures/resources/race_to_saddle_mapping.json' with { type: 'json' };

const g1Races = races.races
  .map((race) => race.win_saddles.filter((saddle) => saddle.win_saddle_type === 3))
  .filter((saddles) => saddles.length);

const rows = [
  {
    ...veteran,
    id: 1,
    trained_chara_id: 901,
    card_id: 101101,
    creation_time: '2026-01-01',
    inheritance: null,
    factors: [103, 3202, 2000101, 2000201],
    succession_chara_array: [],
    win_saddle_id_array: g1Races[0]!.map((saddle) => saddle.saddle_id)
  },
  {
    ...veteran,
    id: 2,
    member_id: 2,
    trained_chara_id: 902,
    card_id: 106701,
    creation_time: '2026-09-20',
    inheritance: null,
    factors: [203, 3302, 2000103],
    succession_chara_array: [
      {
        position_id: 10,
        card_id: 101101,
        rank: 1,
        rarity: 1,
        talent_level: 1,
        factor_id_array: [2000103]
      }
    ],
    win_saddle_id_array: []
  },
  {
    ...veteran,
    id: 3,
    member_id: 3,
    trained_chara_id: 903,
    card_id: 108801,
    creation_time: null,
    inheritance: null,
    factors: [103, 2000101, 2000201, 2000301],
    succession_chara_array: [],
    win_saddle_id_array: [g1Races[0]![0]!.saddle_id, g1Races[1]![0]!.saddle_id]
  }
];

async function mockCollection(page: Page) {
  await mockVeteranProfile(page);
  await mockAffinity(page);
  await page.route('**/api/v4/user/profile/123456789012', (route) =>
    route.fulfill({ json: { ...profile, veterans: rows } })
  );
}

test('Veterans sorts training dates, unique white counts, white stars and G1 wins', async ({
  page,
  isMobile
}) => {
  await mockCollection(page);
  await page.goto('/veterans/123456789012');
  const cards = page.locator('.veteran-card');
  await expect(cards).toHaveCount(3);
  async function sort(label: string, ascending = false) {
    if (isMobile) {
      await page.getByRole('button', { name: 'Sort veterans', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Sort veterans', exact: true });
      await dialog.getByRole('button', { name: label, exact: true }).click();
      await dialog.getByRole('combobox', { name: 'Order', exact: true }).click();
      await dialog
        .getByRole('option', {
          name:
            label === 'Date Trained'
              ? ascending
                ? 'Oldest first'
                : 'Newest first'
              : ascending
                ? 'Lowest first'
                : 'Highest first',
          exact: true
        })
        .click();

      await dialog.getByRole('button', { name: 'Show 3 veterans', exact: true }).click();
    } else {
      await page.getByRole('combobox', { name: 'Sort', exact: true }).click();
      await page.getByRole('option', { name: label, exact: true }).click();
      const toggle = page.getByRole('button', {
        name:
          label === 'Date Trained'
            ? ascending
              ? 'Sort oldest first'
              : 'Sort newest first'
            : ascending
              ? 'Sort ascending'
              : 'Sort descending',
        exact: true
      });

      if (await toggle.count()) await toggle.click();
    }
  }

  const order = async (names: string[]) =>
    expect
      .poll(() =>
        cards.evaluateAll((elements) => elements.map((el) => el.getAttribute('aria-label')))
      )
      .toEqual(names.map((name) => name + ' veteran'));

  await sort('Date Trained');
  await order(['Satono Diamond', 'Grass Wonder', 'Satono Crown']);
  await sort('Date Trained', true);
  await order(['Grass Wonder', 'Satono Diamond', 'Satono Crown']);
  await sort('White Spark Count');
  await order(['Satono Crown', 'Grass Wonder', 'Satono Diamond']);
  await sort('Total White Stars');
  await order(['Satono Diamond', 'Satono Crown', 'Grass Wonder']);
  await sort('G1 Wins');
  await order(['Satono Crown', 'Grass Wonder', 'Satono Diamond']);
  await sort('G1 Wins', true);
  await order(['Satono Diamond', 'Grass Wonder', 'Satono Crown']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
});

test('Parent picker keeps OR alternatives within their colors and restores the grouped selection', async ({
  page
}) => {
  await mockCollection(page);
  await page.addInitScript(() => localStorage.setItem('auth_token', 'picker-test-token'));
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
        }
      ]
    })
  );

  await page.route('**/api/auth/bookmarks', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/v4/partner/saved', (route) => route.fulfill({ json: [] }));
  await page.goto('/tools/lineage-planner');
  const open = page.getByRole('button', { name: 'Pick Veteran for Parent 1', exact: true });
  await open.click();
  const picker = page.getByRole('dialog', { name: 'Select Parent', exact: true });
  const parents = picker.locator('.parent-row');
  await expect(parents).toHaveCount(3);
  await picker.getByRole('combobox', { name: 'Sort parents', exact: true }).click();
  await picker.getByRole('option', { name: 'Newest first', exact: true }).click();
  await expect(
    parents.first().getByRole('button', { name: 'Select Satono Diamond', exact: true })
  ).toBeVisible();

  async function add(name: string, category = 'Blue stats') {
    await picker.getByRole('button', { name: 'Add Spark', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Add spark filter', exact: true });
    await editor.getByRole('button', { name: category, exact: true }).click();
    await editor.getByRole('button', { name: 'Add ' + name + ' spark', exact: true }).click();
    await editor.getByRole('radio', { name: 'Own', exact: true }).click();
    await editor.getByRole('button', { name: 'Add filter', exact: true }).click();
  }

  await add('Speed');
  await add('Mile', 'Aptitude');
  await add('Stamina');
  await add('Medium', 'Aptitude');
  await expect(parents).toHaveCount(0);
  const blues = picker.getByRole('radiogroup', { name: 'Blue stats matching', exact: true });
  const reds = picker.getByRole('radiogroup', { name: 'Aptitude matching', exact: true });
  await blues.getByRole('radio', { name: 'OR', exact: true }).click();
  await expect(parents).toHaveCount(0);
  await reds.getByRole('radio', { name: 'OR', exact: true }).click();
  await expect(parents).toHaveCount(2);
  await expect(
    picker.getByRole('region', { name: 'Blue stats filters', exact: true })
  ).toContainText('Stamina');

  await expect(
    picker.getByRole('region', { name: 'Aptitude filters', exact: true })
  ).not.toContainText('Stamina');

  await picker.getByRole('button', { name: 'Speed 1–3★ (Own)', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit spark filter', exact: true });
  await editor.getByRole('radio', { name: 'P1', exact: true }).click();
  await editor.getByRole('button', { name: 'Save filter', exact: true }).click();
  await expect(parents).toHaveCount(1);
  await expect(
    parents.first().getByRole('button', { name: 'Select Satono Diamond', exact: true })
  ).toBeVisible();

  await picker.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await open.click();
  await expect(blues.getByRole('radio', { name: 'OR', exact: true })).toBeChecked();
  await expect(reds.getByRole('radio', { name: 'OR', exact: true })).toBeChecked();
  await expect(parents).toHaveCount(1);
  await picker.screenshot({ path: test.info().outputPath('grouped-spark-filters.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
  await picker.getByRole('button', { name: 'Clear all', exact: true }).click();
  await expect(parents).toHaveCount(3);
  await add('Speed');
  await add('Stamina');
  await expect(blues.getByRole('radio', { name: 'AND', exact: true })).toBeChecked();
  await expect(parents).toHaveCount(0);
});
