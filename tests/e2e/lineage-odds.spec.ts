import { expect, test } from './fixtures/test';
import { mockAffinity } from './fixtures/api';

test('Lineage odds retain Angular source ordering, combined rolls and separate skill-creation chances', async ({
  page,
  isMobile
}) => {
  await mockAffinity(page);
  await page.addInitScript(() => {
    const skill = { factorId: 20001, name: 'Corner Recovery ○', type: 3, level: 2 };

    localStorage.setItem(
      'lineage-planner-state-v1',
      JSON.stringify([
        { position: 'target', characterId: 106701, sparks: [skill], manualWinSaddleIds: [] },
        {
          position: 'p1',
          characterId: 101301,
          sparks: [
            { factorId: 10, name: 'Speed', type: 0, level: 3 },
            skill,
            { factorId: 30001, name: 'Scenario spark', type: 4, level: 1 }
          ],
          manualWinSaddleIds: []
        },
        {
          position: 'p2',
          characterId: 100601,
          sparks: [{ factorId: 11, name: 'Speed', type: 0, level: 3 }, skill],
          manualWinSaddleIds: []
        },
        { position: 'p1-1-1', characterId: 100101, sparks: [skill], manualWinSaddleIds: [] }
      ])
    );
  });

  await page.goto('/tools/lineage-planner');
  const panel = page.getByRole('region', { name: 'Spark Proc Odds', exact: true });
  const table = panel.getByRole('table');
  await expect(table).toHaveCount(1);
  if (isMobile) {
    await expect(table.getByRole('row')).toHaveCount(19);
    await expect(table.getByRole('row').nth(3)).toContainText('93.60%');
  } else {
    await expect(
      table.getByRole('columnheader', { name: 'Stats 3 star base chance' })
    ).toContainText('90%');

    await expect(table.locator('tbody tr').first()).toContainText('Mejiro McQueen');
    await expect(table.locator('tbody tr').first()).toContainText('93.60%');
  }

  await panel.screenshot({ path: test.info().outputPath('base-odds.png') });
  await expect(page.getByLabel('Total affinity composition')).toHaveText(
    'Total compositionP1 2+Shared 2+P2 2=6'
  );
  await expect(page.getByLabel('Parent 1 contribution to target').locator('b')).toHaveText('2');
  await expect(page.getByLabel('Parent 2 contribution to target').locator('b')).toHaveText('2');
  await expect(page.getByLabel('Shared contribution to target').locator('b')).toHaveText('2');
  await page.screenshot({ path: test.info().outputPath('affinity-flow.png'), fullPage: true });
  const parent = page
    .locator('.node')
    .filter({ has: page.getByRole('button', { name: 'Clear Parent 1', exact: true }) });

  await expect(parent.getByLabel('Spark affinity breakdown')).toHaveText('4=4 Base+0 Race');
  const inheritance = page.getByRole('button', { name: 'Potential Inheritance', exact: true });
  await inheritance.click();
  const popup = page.getByRole('dialog', { name: 'Potential Inheritance', exact: true });
  await expect(popup.locator('.skill-row:not(.skill-header)')).toHaveText(
    'Corner Recovery ○224.2%30.25%48.4%'
  );
  const popupBox = (await popup.boundingBox())!;
  expect(popupBox.x).toBeGreaterThanOrEqual(0);
  expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (isMobile) {
    expect((await inheritance.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for (const button of [
      parent.getByRole('button', { name: /^Change Parent 1:/ }),
      parent.getByRole('button', { name: 'Clear Parent 1', exact: true })
    ]) {
      const box = (await button.boundingBox())!;
      expect(box.height).toBe(32);
      expect(box.width).toBe(32);
    }
  } else {
    const shell = (await page.locator('.planner-scroll').boundingBox())!;
    const tree = (await page.locator('.tree-canvas').boundingBox())!;
    expect(tree.x).toBeGreaterThanOrEqual(shell.x);
    expect(tree.x + tree.width).toBeLessThanOrEqual(shell.x + shell.width + 1);
    const first = (await parent.boundingBox())!;
    const second = (await page.locator('.node.layer-1').nth(1).boundingBox())!;
    expect(first.y).toBeCloseTo(second.y, 1);
    expect(first.height).toBeCloseTo(second.height, 1);
  }

  await popup.screenshot({ path: test.info().outputPath('potential-inheritance.png') });
  await page.keyboard.press('Escape');
  await expect(popup).not.toBeVisible();
  await expect(inheritance).toBeFocused();
  await inheritance.click();
  await popup.getByRole('button', { name: 'Close Potential Inheritance' }).click();
  await expect(inheritance).toBeFocused();
  await panel.getByRole('tab', { name: 'Per Source', exact: true }).click();
  const rows = panel.locator('article');
  await expect(rows).toHaveCount(5);
  await expect(rows.locator('.sum-name')).toHaveText([
    'Speed',
    'Speed',
    'Corner Recovery ○',
    'Corner Recovery ○',
    'Scenario spark'
  ]);
  await expect(rows.locator('.sum-pct')).toHaveText([
    '93.60%',
    '93.60%',
    '6.24%',
    '6.24%',
    '3.12%'
  ]);
  await expect(rows.first().locator('.sum-src')).toHaveAttribute(
    'title',
    'Mejiro McQueen (P1) ♥ 4'
  );
  await panel.screenshot({ path: test.info().outputPath('per-source-odds.png') });
  await panel.getByRole('tab', { name: 'Combined', exact: true }).click();
  await expect(rows).toHaveCount(3);
  await expect(rows.locator('.sum-pct')).toHaveText(['99.59%', '12.09%', '3.12%']);
  await expect(rows.locator('.sum-expected')).toHaveText(['1.87x', '0.12x', '0.03x']);
  await expect(rows.first().locator('.comb-source b')).toHaveText(['3★', '3★']);
  await panel.screenshot({ path: test.info().outputPath('combined-odds.png') });
  const mode = panel.getByRole('button', { name: 'Per Inh.', exact: true });
  if (isMobile) expect((await mode.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await mode.click();
  await expect(rows.locator('.sum-pct')).toHaveText(['100.00%', '22.72%', '6.14%']);
  await expect(rows.locator('.sum-expected')).toHaveText(['3.74x', '0.25x', '0.06x']);
  await panel.getByRole('tab', { name: 'Skill Sparks', exact: true }).click();
  await expect(
    panel.getByText('Chance of developing spark when skill is learned during training')
  ).toBeVisible();
  const skillRow = panel.locator('.skill-row:not(.skill-header)');
  await expect(skillRow).toHaveCount(1);
  await expect(skillRow.locator('img')).toHaveCount(1);
  await skillRow.scrollIntoViewIfNeeded();
  await expect(skillRow.locator('img')).toHaveAttribute(
    'src',
    /\/assets\/images\/skills\/.*\.webp$/
  );
  await expect
    .poll(() =>
      skillRow
        .locator('img')
        .evaluate(
          (image) =>
            (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
        )
    )
    .toBe(true);
  await expect(skillRow).toHaveText('Corner Recovery ○224.2%30.25%48.4%');
  await panel.getByRole('button', { name: 'Per Run', exact: true }).click();
  await expect(skillRow).toHaveText('Corner Recovery ○224.2%30.25%48.4%');
  await panel.screenshot({ path: test.info().outputPath('skill-creation-odds.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width
  );
  await page.getByRole('button', { name: 'Clear Parent 1', exact: true }).click();
  await expect(skillRow).toHaveText('Corner Recovery ○122%27.5%44%');
  await page.getByRole('button', { name: 'Clear Parent 2', exact: true }).click();
  await expect(
    panel.getByText('Add at least one parent to see spark inheritance odds')
  ).toBeVisible();
  await expect(inheritance).toHaveCount(0);
  await expect(page.getByLabel('Total affinity composition')).toHaveText(
    'Total compositionP1 0+Shared 0+P2 0=0'
  );
});
