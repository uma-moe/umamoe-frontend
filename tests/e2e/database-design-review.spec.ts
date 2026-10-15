import { expect, test } from './fixtures/test';
import { mockDatabase, mockAffinity } from './fixtures/api';

test('Populated parent rules keep aligned rows and compact add controls', async ({
  page,
  isMobile
}) => {
  await mockDatabase(page);
  await mockAffinity(page);
  if (!isMobile) await page.setViewportSize({ width: 1760, height: 1000 });
  await page.goto('/database');
  await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  if (isMobile) await page.locator('[data-filter-group="characters"] .group-title').click();
  for (const [group, mode, count] of [
    ['Main parent (P1/P2)', 'included', 1],
    ['Main parent (P1/P2)', 'excluded', 5],
    ['Great parent (GP1/GP2)', 'included', 4],
    ['Great parent (GP1/GP2)', 'excluded', 1]
  ] as const) {
    const add = page.getByRole('button', {
      name: `Add ${mode} characters to ${group}`,
      exact: true
    });

    await add.click();
    const dialog = page.getByRole('dialog', {
      name: mode === 'included' ? 'Include Characters' : 'Exclude Characters',
      exact: true
    });

    for (let index = 0; index < count; index++)
      await dialog.locator('.character-grid button').nth(index).click();
    await dialog
      .getByRole('button', { name: `Add ${count} Character${count === 1 ? '' : 's'}`, exact: true })
      .click();

    await expect(add).toHaveClass(/icon-only/);
    await expect(add).toHaveText('');
  }

  const tree = page.locator('.legacy-tree');
  if (!isMobile) {
    const rows = await tree.evaluate((el) =>
      [...el.querySelectorAll('.tree-box')].map((group) =>
        [group, ...group.querySelectorAll('.rule')].map((row) => {
          const box = row.getBoundingClientRect();
          return { top: box.top, height: box.height };
        })
      )
    );

    expect(rows[0]).toEqual(rows[1]);
    await expect(tree.locator('.tree-box').nth(1)).toHaveCSS('border-left-width', '1px');
  } else await expect(tree.locator('.tree-box').nth(1)).toHaveCSS('border-top-width', '1px');

  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    await tree.screenshot({ path: test.info().outputPath(`populated-parents-${theme}.png`) });
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
});

test('Database review controls share sizing, empty numbers and toggle state without changing picker actions', async ({
  page,
  isMobile
}) => {
  await mockDatabase(page);
  await mockAffinity(page);
  if (!isMobile) await page.setViewportSize({ width: 1760, height: 1000 });
  await page.goto('/database');
  await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  const targetPicker = page.getByRole('button', { name: 'Pick target character', exact: true });
  const legacyPicker = page.getByRole('button', { name: 'Pick your legacy', exact: true });
  for (const picker of [targetPicker, legacyPicker]) {
    await expect(picker).toBeVisible();
    const bounds = (await picker.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(68);
    expect(bounds.height).toBeGreaterThanOrEqual(68);
  }

  if (!isMobile) {
    const target = (await targetPicker.boundingBox())!,
      legacy = (await legacyPicker.boundingBox())!;

    expect(target.height).toBe(legacy.height);
    expect(target.y).toBe(legacy.y);
  }

  for (const input of await page.locator('.threshold-grid input[type=number]').all())
    await expect(input).toHaveAttribute('placeholder', '0');
  const toggle = page.getByRole('button', {
    name: 'Include max follower accounts in filters',
    exact: true
  });

  if (isMobile) await page.getByRole('button', { name: 'General Criteria', exact: true }).click();
  const before = await toggle.getAttribute('aria-pressed');
  await toggle.click();
  const controls = await page.evaluate(() =>
    ['#minimum-wins', '#minimum-rank', '.toggle-field.labeled .ui-toggle'].map((selector) => {
      const el = document.querySelector(selector)!;
      const style = getComputedStyle(el);
      return { height: el.getBoundingClientRect().height, background: style.backgroundColor };
    })
  );

  expect(controls[0].height).toBe(controls[1].height);
  expect(controls[0].height).toBe(controls[2].height);
  const wins = page.locator('#minimum-wins');
  const winButtons = wins.locator('..').getByRole('button');
  await winButtons.first().click();
  await expect(wins).toHaveValue('1');
  await winButtons.last().click();
  await expect(wins).toHaveValue('0');
  await expect(winButtons.last()).toBeDisabled();
  await wins.fill('');
  await expect(toggle).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
  await page.getByRole('button', { name: 'Display options', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: 'Include accounts at the maximum follower limit',
      exact: true
    })
  ).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');

  await page.getByRole('button', { name: 'Display options', exact: true }).click();
  const slider = page.locator('#support-limit-break-advanced-start');
  if (isMobile) await page.locator('[data-filter-group="support"] .group-title').click();
  await slider.scrollIntoViewIfNeeded();
  const supportBox = await page.locator('.support-quick .compact-trigger').boundingBox();
  expect(Math.abs(supportBox!.width - supportBox!.height)).toBeLessThan(1);
  await page.locator('.support-quick .compact-trigger').click();
  const supportDialog = page.getByRole('dialog', { name: 'Select Support Card', exact: true });
  await supportDialog.getByRole('radio').first().click();
  await expect(page.locator('.selected-support-copy strong')).toBeVisible();
  await expect(page.locator('.support-identity strong')).toHaveText('Kitasan Black');
  await expect(page.locator('.support-identity img')).toHaveAttribute('alt', 'SSR');
  await expect
    .poll(() =>
      page.locator('.support-rarity').evaluate((img: HTMLImageElement) => img.naturalWidth)
    )
    .toBe(128);
  await expect(page.locator('.support-subtitle img')).toHaveAttribute('alt', 'Speed');
  await expect(page.locator('.selected-support-copy small')).toHaveText('[Fire at My Heels]');
  const textEdges = await page
    .locator('.selected-support-copy')
    .evaluate((el) =>
      ['strong', 'small'].map(
        (selector) => el.querySelector(selector)!.getBoundingClientRect().left
      )
    );

  expect(textEdges[0]).toBe(textEdges[1]);
  const selectedBox = await page.locator('.support-quick .compact-trigger').boundingBox();
  const actionsBox = await page.locator('.support-quick .card-actions').boundingBox();
  expect(selectedBox!.width).toBe(selectedBox!.height);
  expect(selectedBox!.width).toBe(96);
  expect(selectedBox!.x).toBe(actionsBox!.x);
  expect(selectedBox!.width).toBe(actionsBox!.width);
  await expect(page.locator('.support-quick .compact-visual img')).toHaveCSS(
    'object-fit',
    'contain'
  );
  await page
    .locator('.support-quick')
    .screenshot({ path: test.info().outputPath('selected-support.png') });

  const changeSupport = page.getByRole('button', { name: 'Change support card', exact: true });
  if (isMobile)
    for (const id of ['main', 'characters']) {
      const toggle = page.locator(`[data-filter-group="${id}"] .group-title`);
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    }

  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    const background = theme === 'dark' ? 'rgb(20, 20, 20)' : 'rgb(247, 249, 252)';
    await expect(changeSupport).toHaveClass(/ui-button--secondary/);
    await expect(page.getByRole('button', { name: 'Clear support', exact: true })).toHaveClass(
      /ui-button--secondary/
    );

    await expect(changeSupport).toHaveCSS('background-color', background);
    await expect(page.getByRole('button', { name: 'Clear support', exact: true })).toHaveCSS(
      'background-color',
      background
    );

    for (const control of [
      page.locator('#minimum-wins'),
      page.locator('#minimum-rank'),
      page.locator('.category-filter .tabs button').first(),
      page.locator('.filter-row--allow').first(),
      targetPicker,
      legacyPicker
    ]) {
      await expect(control).toHaveCSS('background-color', background);
    }

    if (!isMobile)
      await page
        .locator('.affinity-tree')
        .screenshot({ path: test.info().outputPath(`affinity-fields-${theme}.png`) });
  }

  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  if (!isMobile) {
    await changeSupport.hover();
    await expect(changeSupport).toHaveCSS('transform', 'none');
  }

  await changeSupport.click();
  await expect(supportDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Clear support', exact: true }).click();
  await expect(page.locator('.selected-support-copy')).toHaveCount(0);
  const track = page.locator('.lb-control .track-hit:visible').first();
  const trackBox = (await track.boundingBox())!;
  await track.click({ position: { x: trackBox.width - 1, y: trackBox.height / 2 } });
  await expect(slider).toHaveValue('4');
  await track.click({ position: { x: 1, y: trackBox.height / 2 } });
  await expect(slider).toHaveValue('0');
  await page.locator('.filter-row--allow').first().click();
  const picker = page.getByRole('dialog', { name: 'Include Characters', exact: true });
  await expect(picker.getByRole('searchbox', { name: 'Search characters' })).toBeVisible();
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    await expect(
      picker.getByRole('searchbox', { name: 'Search characters' }).locator('..')
    ).toHaveCSS('background-color', theme === 'dark' ? 'rgb(20, 20, 20)' : 'rgb(247, 249, 252)');

    const surfaces = await picker.evaluate((el) =>
      ['header', '.content', 'footer'].map(
        (selector) => getComputedStyle(el.querySelector(selector)!).backgroundColor
      )
    );

    expect(new Set(surfaces).size).toBe(1);
    await picker.screenshot({ path: test.info().outputPath(`character-dialog-${theme}.png`) });
  }

  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await picker.locator('.character-grid button').first().click();
  await picker.getByRole('button', { name: 'Add 1 Character', exact: true }).click();
  await expect(picker).not.toBeVisible();
  const selection = page.locator('.legacy-tree .chips').first();
  await expect(selection).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(selection).toHaveCSS('border-top-width', '0px');
  await expect(selection.locator('.filter-row')).toHaveCSS('background-color', 'rgb(20, 20, 20)');
  await expect(page.locator('.legacy-tree .rule.exclude').first()).toHaveCSS(
    'border-top-width',
    '0px'
  );
  await page
    .locator('.legacy-tree')
    .screenshot({ path: test.info().outputPath('include-exclude.png') });

  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
  await expect(page.locator('.legacy-tree .chip').first()).toHaveCSS('color', 'rgb(21, 128, 61)');
  await page
    .locator('.legacy-tree')
    .screenshot({ path: test.info().outputPath('include-exclude-light.png') });

  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await page.locator('.legacy-tree .chip button').first().click();
  await expect(page.locator('.legacy-tree .chip')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add Trainer ID', exact: true }).first().click();
  const share = page.getByRole('dialog', { name: 'Add Trainer ID', exact: true });
  await expect(
    share.getByText('Add your inheritance team to the database.', { exact: true })
  ).toBeVisible();

  await expect(share.getByRole('button', { name: 'Add trainer', exact: true })).toBeDisabled();
  await share.getByRole('textbox', { name: 'Trainer ID', exact: true }).fill('123456789012');
  await expect(share.getByRole('button', { name: 'Add trainer', exact: true })).toBeEnabled();
  const centers = await share.evaluate((el) =>
    ['.header-icon', 'h2'].map((selector) => {
      const box = el.querySelector(selector)!.getBoundingClientRect();
      return box.top + box.height / 2;
    })
  );

  expect(Math.abs(centers[0] - centers[1])).toBeLessThanOrEqual(1);
  for (const theme of ['dark', 'light']) {
    await page.evaluate((value) => (document.documentElement.dataset.theme = value), theme);
    await expect(share.getByRole('textbox', { name: 'Trainer ID', exact: true })).toHaveCSS(
      'background-color',
      theme === 'dark' ? 'rgb(20, 20, 20)' : 'rgb(247, 249, 252)'
    );

    await expect(share.getByRole('button', { name: 'Add trainer', exact: true })).toHaveClass(
      /ui-button--secondary/
    );

    await expect(share.getByRole('button', { name: 'Add trainer', exact: true })).toHaveCSS(
      'color',
      theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(17, 24, 39)'
    );

    await share.screenshot({ path: test.info().outputPath(`share-trainer-${theme}.png`) });
  }

  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await page.keyboard.press('Escape');
  await expect(share).not.toBeVisible();
  await page.locator('.inheritance-card').first().scrollIntoViewIfNeeded();
  const combinedMain = page
    .locator('.inheritance-card')
    .first()
    .locator('.spark')
    .filter({ has: page.locator('.contribution.main') })
    .first();

  await expect(combinedMain.locator('.contribution.main')).toBeVisible();
  expect(
    await combinedMain.evaluate(
      (el) =>
        getComputedStyle(el.querySelector('.level')!).color ===
        getComputedStyle(el.querySelector('.star')!).color
    )
  ).toBe(true);
  await expect(combinedMain).not.toHaveClass(/highlightMain/);
  await expect(combinedMain.locator('.contribution.main')).toHaveCSS('color', 'rgb(217, 147, 131)');
  await page.getByRole('button', { name: 'Display options', exact: true }).click();
  await page.locator('#spark-display').click();
  await page.getByRole('option', { name: 'Split + portraits', exact: true }).click();
  const result = page.locator('.inheritance-card').first();
  await expect(result.locator('.spark .source-portrait').first()).toBeVisible();
  await expect(result.locator('.factor-source').first()).toHaveCSS('outline-style', 'none');
  await expect(result.locator('.factor-source[data-owner="main"] .spark--blue').first()).toHaveCSS(
    'border-top-color',
    'rgba(33, 150, 243, 0.5)'
  );
  await expect(result.locator('.factor-source[data-owner="main"] .level').first()).toHaveCSS(
    'color',
    'rgb(217, 147, 131)'
  );
  await expect(result.locator('.source-portrait').first()).toHaveCSS('border-top-width', '0px');
  await expect(result.locator('.spark').first()).not.toHaveClass(/subtle/);
  await result.screenshot({ path: test.info().outputPath('split-portraits.png') });
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
  await expect(result.locator('.factor-source[data-owner="main"] .level').first()).toHaveCSS(
    'color',
    'rgb(163, 79, 63)'
  );
  await result.screenshot({ path: test.info().outputPath('split-portraits-light.png') });
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await page.locator('#spark-display').click();
  await page.getByRole('option', { name: 'Split sparks', exact: true }).click();
  await expect(result.locator('.source-portrait')).toHaveCount(0);
  await result.screenshot({ path: test.info().outputPath('split-plain.png') });
  for (const [owner, title] of [
    ['main', 'Focus primary parent sparks; click again to clear'],
    ['left', 'Focus Legacy 1 sparks; click again to clear'],
    ['right', 'Focus Legacy 2 sparks; click again to clear']
  ]) {
    const portrait = result.getByTitle(title, { exact: true });
    await portrait.click();
    const colors = await result
      .locator(`.lineage-person[data-owner="${owner}"]`)
      .evaluate((el) => ({
        border: getComputedStyle(el.querySelector('.lineage-node')!).borderColor,
        badge: getComputedStyle(el.querySelector('.source-affinity')!).color
      }));

    expect(colors.border).toBe(colors.badge);
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width
  );
});
