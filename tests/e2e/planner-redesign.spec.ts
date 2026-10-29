import { expect, test } from './fixtures/test';
import { mockAffinity, mockTimeline } from './fixtures/api';

test('Lineage presents readable slots, explicit selection actions and expandable ancestors', async ({
  page,
  isMobile
}, testInfo) => {
  await mockAffinity(page);
  await page.goto('/tools/lineage-planner');
  const tree = page.locator('.tree-canvas');
  await expect(tree).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose Target', exact: true })).toHaveText(
    'Choose Uma'
  );

  await expect(
    page.getByRole('button', { name: 'Pick Veteran for Parent 1', exact: true })
  ).toHaveText('Pick veteran');

  await expect(page.locator('.planner-content')).toHaveCSS('transform', 'none');
  await expect(page.locator('.greats').first()).toBeHidden();
  const p1 = await page
    .getByRole('region', { name: 'Parent 1 lineage', exact: true })
    .boundingBox();

  const p2 = await page
    .getByRole('region', { name: 'Parent 2 lineage', exact: true })
    .boundingBox();

  if (isMobile) expect(p2!.y).toBeGreaterThan(p1!.y);
  else expect(p2!.y).toBeCloseTo(p1!.y, 0);
  const target = await page.locator('.root-node').boundingBox();
  const canvas = await tree.boundingBox();
  expect(target!.x + target!.width / 2).toBeCloseTo(canvas!.x + canvas!.width / 2, 0);
  await page.screenshot({ path: testInfo.outputPath('lineage-empty.png'), fullPage: true });
  await page.getByRole('button', { name: 'Choose Target', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Select Character', exact: true });
  await picker.getByRole('radio', { name: 'Grass Wonder', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Change Target: Grass Wonder', exact: true })
  ).toHaveText('Change');

  await page.getByRole('button', { name: 'Pick Veteran for Parent 1', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Select Parent', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Great-Grandparents', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Choose Great-GP 1', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
  await page.goto('/tools/lineage-planner?cards=100101,101301,100601,101101,106701,108801,100901');
  await expect(
    page.getByRole('button', { name: 'Change Parent 1: Mejiro McQueen', exact: true })
  ).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath('lineage-populated.png'), fullPage: true });
  expect(await tree.evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(
    Math.ceil((await tree.boundingBox())!.width)
  );
});

test('Timeline packs sparse events into readable cards and retains event actions', async ({
  page,
  isMobile
}, testInfo) => {
  await mockTimeline(page);
  await page.goto('/timeline');
  const card = page.locator('.event-card').first();
  await expect(card).toBeVisible();
  if (!isMobile) {
    const lanes = await page
      .locator('.date-lane')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().x));

    for (let i = 1; i < lanes.length; i++) expect(lanes[i]! - lanes[i - 1]!).toBeCloseTo(336, 0);
    expect(await page.locator('.month-span').count()).toBeLessThan(8);
    await expect(page.getByRole('button', { name: 'Compact gaps', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    const bands = await page.locator('.month-span').evaluateAll((nodes) =>
      nodes.map((node) => ({
        height: node.getBoundingClientRect().height,
        width: node.getBoundingClientRect().width,
        labelWidth: node.firstElementChild!.getBoundingClientRect().width
      }))
    );

    for (const band of bands) {
      expect(band.height).toBeGreaterThan(300);
      expect(band.labelWidth).toBeLessThanOrEqual(band.width);
    }

    await expect(card.locator('h3')).toHaveCSS('font-size', '14px');
  }

  await page.screenshot({ path: testInfo.outputPath('timeline-redesign.png'), fullPage: true });
  await card.getByRole('button', { name: /Open details/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
});

test('Carat Planner uses the shared wide container', async ({ page, isMobile }, testInfo) => {
  await mockTimeline(page, false);
  if (!isMobile) await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto('/timeline?tab=carat-planner');
  const planner = page.locator('.planner');
  await expect(planner).toBeVisible();
  expect((await planner.boundingBox())!.width).toBeCloseTo(
    (await page.locator('[data-page-content]').boundingBox())!.width,
    0
  );
  await expect(page.locator('[data-route-id="timeline"]')).toHaveAttribute(
    'data-page-width',
    'wide'
  );
  if (!isMobile) expect((await planner.boundingBox())!.width).toBe(1760);
  await page.screenshot({ path: testInfo.outputPath('carat-wide-container.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width
  );
});
