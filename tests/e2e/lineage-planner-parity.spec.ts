import { expect, test } from './fixtures/test';
import { mockAffinity } from './fixtures/api';

const populatedTree =
  '/tools/lineage-planner?cards=100101,100201,100601,101301,100701,100801,100901,101001,101101,101401,101701,101801,102401,102701,103001';

test('Lineage legacy card URLs preserve Angular slot positions and ignore underspecified trees', async ({
  page
}) => {
  await mockAffinity(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      'lineage-planner-state-v1',
      JSON.stringify([
        { position: 'target', characterId: 100601, sparks: [], manualWinSaddleIds: [] }
      ])
    )
  );

  await page.goto('/tools/lineage-planner?cards=100101,101301');
  await expect(page.getByRole('button', { name: 'Choose Target', exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('lineage-planner-state-v1')!)[0].characterId
    )
  ).toBe(100601);
  await page.goto('/tools/lineage-planner?cards=1001,invalid,100601,999999,101301');
  await expect(
    page.getByRole('button', { name: 'Change Target: Special Week', exact: true })
  ).toBeVisible();

  await expect(page.getByRole('button', { name: 'Choose Parent 1', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Change Parent 2: Oguri Cap', exact: true })
  ).toBeVisible();

  await expect(
    page.getByRole('button', { name: 'Choose Grandparent 1', exact: true })
  ).toBeVisible();

  await expect(
    page.getByRole('button', { name: 'Change Grandparent 2: Mejiro McQueen', exact: true })
  ).toBeVisible();

  await page.goto('/tools/lineage-planner?tree=invalid');
  await expect(page.getByText('Invalid lineage planner URL state.', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Change Target: Oguri Cap', exact: true })
  ).toBeVisible();
});

test('Lineage Optimal Races follows both parent wins and refreshes after a parent is cleared', async ({
  page,
  isMobile
}) => {
  await mockAffinity(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      'lineage-planner-state-v1',
      JSON.stringify([
        { position: 'target', characterId: 100101, sparks: [], manualWinSaddleIds: [] },
        { position: 'p1', characterId: 101301, sparks: [], manualWinSaddleIds: [16, 20] },
        { position: 'p2', characterId: 100601, sparks: [], manualWinSaddleIds: [16, 17, 15, 30] }
      ])
    )
  );

  await page.goto('/tools/lineage-planner');
  const trigger = page.getByRole('button', { name: 'Optimal Races', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Optimal Races', exact: true });
  await expect(dialog).toBeVisible();
  if (isMobile) {
    await expect(dialog.locator('.mobile-schedule .year--classic .affinity')).toHaveText(
      '+6P1 + P2'
    );
    await expect(dialog.locator('.mobile-schedule .year--senior .race')).toHaveCount(3);
  } else await expect(dialog.getByRole('region', { name: 'Optimal G1 races' })).toBeVisible();

  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(dialog).toHaveCount(0);
  // Safari touch activation does not focus buttons. Keyboard activation must
  // restore the focused trigger, while touch still opens/closes the same dialog.
  await trigger.focus();
  await trigger.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: 'Clear Parent 2', exact: true }).click();
  await trigger.click();
  if (isMobile)
    await expect(dialog.locator('.mobile-schedule .affinity')).toHaveText(['+3P1', '+3P1']);
  await page.screenshot({ path: test.info().outputPath('lineage-optimal-races.png') });
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Clear Parent 1', exact: true }).click();
  await expect(trigger).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width
  );
});

test('Lineage character picker matches released variants, slot exclusions, sorting and swap cleanup', async ({
  page,
  isMobile
}) => {
  await mockAffinity(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      'lineage-planner-state-v1',
      JSON.stringify([
        { position: 'target', characterId: 100101, sparks: [], manualWinSaddleIds: [] },
        {
          position: 'p1',
          characterId: 101301,
          sparks: [{ factorId: 10, name: 'Speed', type: 0, level: 3 }],
          manualWinSaddleIds: [1],
          veteran: { card_id: 101301 },
          succession: { card_id: 101301 }
        },
        { position: 'p2', characterId: 100601, sparks: [], manualWinSaddleIds: [] },
        { position: 'p1-1', characterId: 101101, sparks: [], manualWinSaddleIds: [] },
        { position: 'p1-2', characterId: 106701, sparks: [], manualWinSaddleIds: [] }
      ])
    )
  );

  await page.goto('/tools/lineage-planner');
  await page.getByRole('button', { name: 'Change Target: Special Week', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Select Character', exact: true });
  await expect(dialog.getByRole('tab')).toHaveCount(0);
  await expect(dialog.getByRole('radio')).toHaveCount(6);
  await expect(dialog.getByRole('radio', { name: /McQueen|Oguri|Chrono/ })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Sort: Affinity', exact: true })).toBeVisible();
  await dialog.getByRole('searchbox').fill('Satono');
  await expect(dialog.getByRole('radio')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Change Parent 1: Mejiro McQueen', exact: true }).click();
  await expect(dialog.getByRole('searchbox')).toHaveValue('');
  await expect(dialog.getByRole('radio')).toHaveCount(4);
  await expect(dialog.getByRole('radio', { name: /Special Week|Oguri|Grass|Diamond/ })).toHaveCount(
    0
  );

  const bounds = await dialog.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(600);
  if (isMobile) {
    expect(bounds!.x).toBeGreaterThanOrEqual(8);
    for (const control of [
      dialog.getByRole('button', { name: 'Close dialog' }),
      dialog.getByRole('button', { name: 'Sort: Affinity', exact: true })
    ]) {
      const box = await control.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  }

  await dialog.getByRole('radio', { name: 'Gold Ship', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Change Parent 1: Gold Ship', exact: true })
  ).toBeVisible();

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('lineage-planner-state-v1')!)
  );

  expect(saved.find((node: { position: string }) => node.position === 'p1')).toEqual({
    position: 'p1',
    characterId: 100701,
    sparks: [],
    manualWinSaddleIds: []
  });

  expect(saved.find((node: { position: string }) => node.position === 'p1-1').characterId).toBe(
    101101
  );
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Change Parent 1: Gold Ship', exact: true })
  ).toBeVisible();

  await page
    .getByRole('button', { name: 'Change Grandparent 1: Grass Wonder', exact: true })
    .click();

  await expect(dialog.getByRole('radio', { name: /Gold Ship|Satono Diamond/ })).toHaveCount(0);
  await expect(dialog.getByRole('radio', { name: 'Special Week', exact: true })).toHaveCount(2);
  await page.screenshot({ path: test.info().outputPath('lineage-character-picker.png') });
});

test('Lineage node sparks are edited inline with source defaults and empty slots open Veterans directly', async ({
  page
}) => {
  await mockAffinity(page);
  await page.goto('/tools/lineage-planner?cards=100101,101301,0,0,0');
  const node = page.getByRole('region', { name: 'Sparks for Parent 1', exact: true });
  await expect(node.getByText('No sparks on this character')).toBeVisible();
  await node.getByRole('button', { name: 'Add Spark', exact: true }).click();
  await expect(node.getByRole('radio', { name: '3★', exact: true })).toHaveAttribute(
    'aria-checked',
    'true'
  );

  await node.getByRole('combobox', { name: 'Add spark to Parent 1', exact: true }).fill('Speed');
  await node.getByRole('option', { name: 'Speed', exact: true }).click();
  await expect(node.locator('.spark').first()).toHaveAttribute('aria-label', /^3 star Speed,/);
  await node.getByRole('button', { name: 'Add Spark', exact: true }).click();
  await node.getByRole('radio', { name: '1★', exact: true }).click();
  await node.getByRole('combobox').fill('Stamina');
  await node.getByRole('option', { name: 'Stamina', exact: true }).click();
  await expect(node.locator('.spark').last()).toHaveAttribute('aria-label', /^1 star Stamina,/);
  await node.getByRole('button', { name: 'Per Inh.', exact: true }).click();
  await expect(node.getByRole('button', { name: 'Per Run', exact: true })).toBeVisible();
  await node.getByRole('button', { name: 'Remove Speed from Parent 1', exact: true }).click();
  await page.reload();
  await expect(node.locator('.spark')).toHaveCount(1);
  await expect(node.locator('.spark')).toHaveAttribute('aria-label', /^1 star Stamina,/);
  await page.getByRole('button', { name: 'Pick Veteran for Parent 2', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Select Parent', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: test.info().outputPath('lineage-inline-sparks.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width
  );
});

test('imported parent sparks remain editable and the populated lineage adapts to available width', async ({
  page
}) => {
  await mockAffinity(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      'lineage-planner-state-v1',
      JSON.stringify([
        { position: 'target', characterId: 100101, sparks: [], manualWinSaddleIds: [] },
        ...['p1', 'p2', 'p1-1', 'p1-2', 'p2-1', 'p2-2'].map((position, index) => ({
          position,
          characterId: [101301, 100601, 101101, 106701, 101101, 106701][index],
          sparks: [
            { factorId: 10, name: 'Speed', type: 0, level: 3 },
            { factorId: 20, name: 'Stamina', type: 0, level: 2 }
          ],
          manualWinSaddleIds: [1],
          ...(index < 2
            ? { veteran: { card_id: index === 0 ? 101301 : 100601, factor_id_array: [103, 202] } }
            : {})
        }))
      ])
    )
  );

  await page.goto('/tools/lineage-planner');
  for (const parent of ['Parent 1', 'Parent 2']) {
    const sparks = page.getByRole('region', { name: `Sparks for ${parent}`, exact: true });
    await sparks.getByRole('button', { name: `Remove Speed from ${parent}`, exact: true }).click();
    await sparks.getByRole('button', { name: 'Add Spark', exact: true }).click();
    await sparks.getByRole('radio', { name: '1★', exact: true }).click();
    await sparks
      .getByRole('combobox', { name: `Add spark to ${parent}`, exact: true })
      .fill('Speed');

    await sparks.getByRole('option', { name: 'Speed', exact: true }).click();
    await expect(sparks.locator('.spark').filter({ hasText: 'Speed' })).toHaveAttribute(
      'aria-label',
      /^1 star Speed,/
    );
  }

  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('lineage-planner-state-v1')!)
  );

  for (const position of ['p1', 'p2']) {
    const node = saved.find((node: { position: string }) => node.position === position);
    expect(node.sparks.find((spark: { factorId: number }) => spark.factorId === 10).level).toBe(1);
    expect(node.veteran.factor_id_array).toEqual([103, 202]);
  }

  await page.reload();
  for (const parent of ['Parent 1', 'Parent 2'])
    await expect(
      page
        .getByRole('region', { name: `Sparks for ${parent}`, exact: true })
        .locator('.spark')
        .filter({ hasText: 'Speed' })
    ).toHaveAttribute('aria-label', /^1 star Speed,/);
  for (const width of [1920, 1440, 1024, 850, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const tree = page.locator('.planner-shell');
    const branches = page.locator('.parent-branch');
    const first = await branches.nth(0).boundingBox();
    const second = await branches.nth(1).boundingBox();
    if ((await tree.boundingBox())!.width <= 1040)
      expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
    else expect(Math.abs(first!.y - second!.y)).toBeLessThan(2);
    expect(await tree.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const bounds = await tree.boundingBox();
    for (const badge of await page.locator('.gp-flow').all()) {
      const box = (await badge.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
    }

    const odds = page.getByRole('region', { name: 'Spark Proc Odds', exact: true });
    const table = odds.locator('table:visible');
    await expect(table.locator('tbody td').first()).toContainText('%');
    expect(
      await table.locator('tbody td').evaluateAll((cells) =>
        cells.every((cell) => {
          const range = document.createRange();
          range.selectNodeContents(cell);
          const text = range.getBoundingClientRect();
          const box = cell.getBoundingClientRect();
          return text.left >= box.left + 3 && text.right <= box.right - 3;
        })
      )
    ).toBe(true);

    expect((await odds.locator('header').boundingBox())!.height).toBeLessThanOrEqual(62);
    expect((await table.locator('thead').boundingBox())!.height).toBeLessThanOrEqual(62);
    if ([1920, 850, 390].includes(width)) {
      await tree.screenshot({ path: test.info().outputPath(`lineage-responsive-${width}.png`) });
      await odds.screenshot({ path: test.info().outputPath(`lineage-odds-${width}.png`) });
    }
  }

  const odds = page.getByRole('region', { name: 'Spark Proc Odds', exact: true });
  await odds.getByRole('button', { name: 'Per Inh.', exact: true }).click();
  await expect(odds.getByRole('button', { name: 'Per Run', exact: true })).toBeVisible();
  for (const name of ['Per Source', 'Combined', 'Skill Sparks']) {
    await odds.getByRole('tab', { name, exact: true }).click();
    expect(await odds.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  }

  await page.setViewportSize({ width: 850, height: 1000 });
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await odds.getByRole('tab', { name: 'Base Odds', exact: true }).click();
  await odds.screenshot({
    path: test.info().outputPath('lineage-odds-light.png'),
    animations: 'disabled'
  });
});

test('Lineage character resource errors remain in the dialog and retry without losing the tree', async ({
  page
}) => {
  await mockAffinity(page);
  let fail = true;
  await page.route('**/resources/*/character.json*', (route) =>
    fail ? route.fulfill({ status: 503, json: { error: 'Unavailable' } }) : route.fallback()
  );

  await page.goto('/tools/lineage-planner?cards=100101,0,0,0,0');
  await page.getByRole('button', { name: 'Change Target: Character 100101', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Select Character', exact: true });
  await expect(dialog.getByText('Character data unavailable', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Discord/ })).toBeVisible();
  await expect(dialog.getByText('No characters available.')).toHaveCount(0);
  fail = false;
  await dialog.getByRole('button', { name: 'Retry character data', exact: true }).click();
  await expect(dialog.getByRole('radio')).toHaveCount(9);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Change Target: Special Week', exact: true })
  ).toBeVisible();
});

test('Lineage rejects conflicting Veteran choices and keeps imported race history read-only', async ({
  page
}) => {
  await mockAffinity(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      'vpd_manual_entries',
      JSON.stringify([
        {
          id: 'conflict',
          label: 'Conflicting Veteran',
          mainCardId: 100601,
          ownSparkIds: [],
          p1CardId: null,
          p2CardId: null,
          p1SparkIds: [],
          p2SparkIds: [],
          createdAt: '2026-01-01'
        }
      ])
    );

    localStorage.setItem(
      'lineage-planner-state-v1',
      JSON.stringify([
        { position: 'target', characterId: 100101, sparks: [], manualWinSaddleIds: [] },
        {
          position: 'p1',
          characterId: 101301,
          sparks: [],
          manualWinSaddleIds: [1],
          veteran: { card_id: 101301, win_saddle_id_array: [1] }
        },
        { position: 'p2', characterId: 100601, sparks: [], manualWinSaddleIds: [] }
      ])
    );
  });

  await page.goto('/tools/lineage-planner');
  await page.getByRole('button', { name: 'Pick Veteran for Parent 1', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Select Parent', exact: true });
  await picker.getByRole('tab', { name: /Manual/ }).click();
  await picker.getByRole('button', { name: 'Select Conflicting Veteran', exact: true }).click();
  await expect(
    page.getByText('This slot cannot use the same character as a conflicting slot.', {
      exact: true
    })
  ).toBeVisible();

  await expect(
    page.getByRole('button', { name: 'Change Parent 1: Mejiro McQueen', exact: true })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Edit race wins for Parent 1', exact: true }).click();
  const history = page.getByRole('dialog', { name: 'Race History', exact: true });
  await expect(history).toBeVisible();
  await expect(history.getByRole('button', { name: 'Confirm', exact: true })).toHaveCount(0);
  await expect(history.getByRole('button', { name: /Add race|Remove .*Kinen/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lineage-planner-state-v1')!).find(
          (node: { position: string }) => node.position === 'p1'
        ).veteran.win_saddle_id_array
    )
  ).toEqual([1]);
});

test('Lineage Planner restores the complete Angular tree and persistence workflow', async ({
  page,
  isMobile
}) => {
  await page.goto(populatedTree);
  await expect(page.getByRole('heading', { name: 'Lineage Planner' })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Inheritance tree planner' })
      .or(page.locator('[aria-label="Inheritance tree planner"]'))
  ).toBeVisible();

  await expect(page.getByRole('button', { name: /Change Target: Special Week/ })).toBeVisible();
  await page
    .getByRole('region', { name: 'Parent 2 lineage', exact: true })
    .scrollIntoViewIfNeeded();

  await expect(page.getByRole('button', { name: 'Great-Grandparents' })).toHaveCount(4);
  await page.getByRole('button', { name: 'Great-Grandparents' }).last().click();
  await expect(page.getByRole('button', { name: /Change Great-GP 8:/ })).toBeAttached();
  await page
    .locator('.planner-scroll')
    .evaluate((element) => element.scrollIntoView({ block: 'end' }));

  await expect(page.getByRole('heading', { name: 'Spark Proc Odds' })).toBeVisible();
  await page.getByRole('button', { name: 'Save / Load' }).click();
  await expect(page.getByRole('dialog', { name: 'Lineage Trees' })).toBeVisible();
  await expect(page.getByLabel('Tree name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import .json Load a file' })).toBeVisible();
});

test('Lineage Planner keeps readable parent branches and expandable ancestors inside the viewport', async ({
  page
}) => {
  await page.goto(populatedTree);
  for (const width of [320, 390, 768, 1024, 1536, 1920, 2560, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const toggle = page.getByRole('button', { name: 'Great-Grandparents' }).first();
    await expect(toggle).toBeVisible();
    if (!(await page.getByRole('button', { name: /Change Great-GP 1:/ }).isVisible()))
      await toggle.click();
    await expect(page.getByRole('button', { name: /Change Great-GP 1:/ })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (width > 768)
      await expect
        .poll(async () => {
          const shell = (await page.locator('.planner-scroll').boundingBox())!;
          const tree = (await page.locator('.tree-canvas').boundingBox())!;
          return tree.x >= shell.x && tree.x + tree.width <= shell.x + shell.width + 1;
        })
        .toBe(true);
  }
});

test('Lineage race wins occupy one slot each in saved order and retain individual repeated wins', async ({
  page
}) => {
  await mockAffinity(page);
  await page.addInitScript(() => {
    if (localStorage.getItem('lineage-planner-state-v1')) return;
    localStorage.setItem(
      'lineage-planner-state-v1',
      JSON.stringify([
        {
          position: 'p1',
          characterId: 101301,
          sparks: [],
          manualWinSaddleIds: [999999, 23, 11, 16, 15, 62, 64]
        }
      ])
    );
  });

  await page.goto('/tools/lineage-planner');
  const open = page.getByRole('button', { name: 'Edit race wins for Parent 1', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Select Race Wins', exact: true });
  const classic = dialog.locator('.year--classic'),
    senior = dialog.locator('.year--senior');

  for (const name of ['Mile Championship', 'Kikuka Sho', 'St. Lite Kinen'])
    await expect(classic.getByRole('button', { name: `Remove ${name}`, exact: true })).toHaveCount(
      1
    );
  for (const name of ['Japan Cup', 'Tenno Sho (Autumn)', 'All Comers'])
    await expect(senior.getByRole('button', { name: `Remove ${name}`, exact: true })).toHaveCount(
      1
    );
  expect(
    await dialog
      .locator('.cell-races')
      .evaluateAll((cells) => cells.every((cell) => cell.querySelectorAll('.race').length <= 1))
  ).toBe(true);
  await expect(dialog.getByText('6 races selected', { exact: true })).toBeVisible();
  await dialog.getByRole('searchbox', { name: 'Search races' }).fill('Japan');
  await expect(senior.getByRole('button', { name: 'Remove Japan Cup', exact: true })).toHaveCount(
    1
  );

  await dialog.getByRole('searchbox', { name: 'Search races' }).fill('');
  await classic.getByRole('button', { name: 'Remove Mile Championship', exact: true }).click();
  await expect(classic.getByRole('button', { name: 'Remove Japan Cup', exact: true })).toHaveCount(
    1
  );

  await dialog
    .getByRole('button', { name: 'Add race: Senior Year, Nov Late', exact: true })
    .click();

  await page.getByRole('button', { name: 'Select Japan Cup', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Remove Japan Cup', exact: true })).toHaveCount(
    2
  );

  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('lineage-planner-state-v1')!).find(
          (node: { position: string }) => node.position === 'p1'
        ).manualWinSaddleIds
    )
  ).toEqual([999999, 11, 16, 15, 62, 64, 11]);
  await page.reload();
  await open.click();
  await expect(dialog.getByRole('button', { name: 'Remove Japan Cup', exact: true })).toHaveCount(
    2
  );

  await senior.getByRole('button', { name: 'Remove Japan Cup', exact: true }).click();
  await expect(classic.getByRole('button', { name: 'Remove Japan Cup', exact: true })).toHaveCount(
    1
  );

  await expect(senior.getByRole('button', { name: 'Remove Japan Cup', exact: true })).toHaveCount(
    0
  );

  await dialog.screenshot({ path: test.info().outputPath('ordered-race-wins.png') });
});

test('Lineage race wins require confirmation and cancellation keeps the prior saved wins', async ({
  page
}) => {
  await page.goto(populatedTree);
  await page.getByRole('button', { name: 'Edit race wins for Parent 1', exact: true }).click();
  await page.getByRole('button', { name: 'Add race: Classic Year, Dec Late', exact: true }).click();
  await page.getByRole('button', { name: 'Select Arima Kinen', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove Arima Kinen', exact: true }).first()
  ).toBeVisible();

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Edit race wins for Parent 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove Arima Kinen', exact: true })).toHaveCount(
    0
  );

  await page.getByRole('button', { name: 'Add race: Classic Year, Dec Late', exact: true }).click();
  await page.getByRole('button', { name: 'Select Arima Kinen', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Edit race wins for Parent 1', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove Arima Kinen', exact: true }).first()
  ).toBeVisible();

  await page.getByRole('button', { name: 'Remove Arima Kinen', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Remove Arima Kinen', exact: true })).toHaveCount(
    0
  );

  await expect(
    page.getByRole('button', { name: 'Add race: Classic Year, Dec Late', exact: true })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('lineage-planner-state-v1')!).find(
            (node: { position: string }) => node.position === 'p1'
          ).manualWinSaddleIds
      )
    )
    .toEqual([]);
});
