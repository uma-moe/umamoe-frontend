import { expect, test } from './fixtures/test';
import { mockDatabase } from './fixtures/api';

test('mobile Database groups display settings and keeps cards compact without losing actions', async ({
  page
}) => {
  await mockDatabase(page);
  await page.goto('/database');
  const card = page.locator('.inheritance-card').first();
  await expect(card).toBeVisible();

  for (const width of [320, 390, 470, 547, 767]) {
    await page.setViewportSize({ width, height: 844 });
    const display = page.getByRole('button', { name: 'Display options', exact: true });
    const options = page.locator('#database-display-options');
    await expect(display).toHaveAttribute('aria-expanded', 'false');
    await expect(options).toBeHidden();
    expect((await page.locator('.results-header').boundingBox())!.height).toBeLessThan(72);
    await expect(page.getByRole('combobox', { name: 'Sort by', exact: true })).toBeVisible();
    const countBox = (await page.locator('.results-info p').boundingBox())!;
    const sortBox = (await page.locator('#database-sort').boundingBox())!;
    const displayBox = (await display.boundingBox())!;
    expect(
      Math.abs(countBox.y + countBox.height / 2 - sortBox.y - sortBox.height / 2)
    ).toBeLessThan(1);
    expect(displayBox.y).toBe(sortBox.y);
    expect(displayBox.height).toBe(sortBox.height);

    for (const button of await card.locator('.record-actions button').all()) {
      await expect(button).toBeVisible();
      const box = (await button.boundingBox())!;
      expect(box.height).toBe(28);
      expect(box.width).toBe(28);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await expect(button.locator('svg')).toHaveCSS('width', '18px');
    }

    const trainer = (await card.locator('.trainer-copy').boundingBox())!;
    const actions = (await card.locator('.record-actions').boundingBox())!;
    expect(Math.abs(trainer.y + trainer.height / 2 - actions.y - actions.height / 2)).toBeLessThan(
      2
    );
    const name = (await card.locator('.trainer-copy strong').boundingBox())!;
    const id = (await card.locator('.trainer-copy > span').boundingBox())!;
    expect(name.x + name.width).toBeLessThan(id.x);
    expect(Math.abs(name.y + name.height / 2 - id.y - id.height / 2)).toBeLessThan(2);
    expect(id.x + id.width).toBeLessThan(actions.x);
    await expect(card.getByRole('button', { name: 'Save', exact: true })).toHaveCSS(
      'color',
      'rgb(255, 215, 0)'
    );

    await expect(card.getByRole('button', { name: 'Plan', exact: true })).toHaveCSS(
      'color',
      'rgb(100, 181, 246)'
    );

    await expect(card.getByRole('button', { name: 'Share', exact: true })).toHaveCSS(
      'color',
      'rgb(77, 182, 172)'
    );

    for (const selector of [
      '.record-stats .stat:not(.score) strong',
      '.record-stats .stat:not(.score) > span'
    ]) {
      const lines = await card
        .locator(selector)
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().y));

      expect(Math.max(...lines) - Math.min(...lines)).toBeLessThan(1);
    }

    expect(
      await card
        .locator('.character-panel')
        .evaluate((node) => getComputedStyle(node).backgroundColor)
    ).not.toBe('rgba(0, 0, 0, 0)');
    await expect(card.locator('.lineage-main .art')).toHaveCSS('width', '40px');
    await expect(card.locator('.lineage-grandparent .art').first()).toHaveCSS('width', '40px');
    await expect(card.locator('.support-card-section .art')).toHaveCSS('width', '56px');
    const portraits = await card.locator('.character-panel .art').evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      })
    );

    const spacing = portraits[1].x - portraits[0].x;
    for (let index = 1; index < portraits.length; index++) {
      expect(Math.abs(portraits[index].y - portraits[0].y)).toBeLessThan(1);
      expect(Math.abs(portraits[index].x - portraits[index - 1].x - spacing)).toBeLessThan(1);
    }

    const roles = await card
      .locator('.lineage-role, .support-role')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().y));

    expect(Math.max(...roles) - Math.min(...roles)).toBeLessThan(1);
    for (const spark of await card.locator('.spark').all()) {
      expect((await spark.boundingBox())!.height).toBeLessThanOrEqual(22);
      await expect(spark.locator('.name')).toBeVisible();
    }

    const whiteGroup = card.locator('.white-section').first();
    const label = (await whiteGroup.locator('summary').boundingBox())!;
    const factors = (await whiteGroup.locator('.spark-list').boundingBox())!;
    expect(label.y + label.height).toBeLessThanOrEqual(factors.y + 1);

    await display.click();
    await expect(options).toBeVisible();
    await options.getByRole('button', { name: 'Main Parent', exact: true }).click();
    await display.click();
    await expect(options).toBeHidden();
    await expect(card.locator('.lineage-main > button')).toHaveAttribute('aria-pressed', 'true');
    await display.click();
    await options.getByRole('button', { name: 'All', exact: true }).click();
    await display.click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (width === 320 || width === 390)
      await card
        .locator('.record-stats')
        .screenshot({ path: test.info().outputPath(`scenario-summary-${width}.png`) });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole('button', { name: 'Display options', exact: true })).toBeHidden();
  await expect(page.locator('#database-display-options')).toBeVisible();
  await expect(card.locator('.lineage-main .art')).toHaveCSS('width', '80px');
  await card
    .locator('.record-stats')
    .screenshot({ path: test.info().outputPath('scenario-summary-desktop.png') });
});
