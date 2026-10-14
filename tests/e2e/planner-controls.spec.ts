import { expect, test } from './fixtures/test';
import { mockTimeline } from './fixtures/api';
import { mockPlannerControls, plannerControlsPlan } from './fixtures/planner-controls';

test('Planner Balance keeps Angular resource groups, editable values and compact mobile controls', async ({ page }) => {
  await mockPlannerControls(page);
  await page.goto('/timeline?tab=carat-planner');
  await page.getByRole('button', { name: /Plan assumptions/ }).click();
  const panel = page.locator('.balance-panel');
  await expect(panel.locator('legend')).toHaveText(['Carats', 'Tickets', 'Uncap Crystals', 'Crystal shards']);
  await expect.poll(() => panel.locator('img').evaluateAll(images => images.length === 4 && images.every(image => image.naturalWidth > 0))).toBe(true);
  const fields = [
    ['Carats', 'Free', '4500'], ['Carats', 'Paid', '300'], ['Tickets', 'Uma', '4'], ['Tickets', 'Support', '5'],
    ['Uncap Crystals', 'Rainbow', '2'], ['Uncap Crystals', 'Gold', '3'], ['Crystal shards', 'Rainbow', '9'], ['Crystal shards', 'Gold', '10']
  ];
  for (const [group, label, value] of fields) await panel.getByRole('group', { name: group!, exact: true }).getByRole('spinbutton', { name: label!, exact: true }).fill(value!);
  const date = panel.getByLabel('Start date', { exact: true });
  await date.fill('2026-09-11');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!).plans[0].projectionStartDate)).toBe('2026-09-11');
  await date.fill('');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!).plans[0].projectionStartDate)).toBe('2026-09-11');
  await page.reload(); await page.getByRole('button', { name: /Plan assumptions/ }).click();
  await expect(date).toHaveValue('2026-09-11');
  for (const [group, label, value] of fields) await expect(panel.getByRole('group', { name: group!, exact: true }).getByRole('spinbutton', { name: label!, exact: true })).toHaveValue(value!);
  for (const width of [page.viewportSize()!.width, 1280, 1024, 768, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const controls = await panel.locator('input').evaluateAll(inputs => inputs.map(input => ({ width: input.getBoundingClientRect().width, height: input.getBoundingClientRect().height })));
    expect(controls).toHaveLength(9);
    if (width < 768) expect(controls.every(input => input.width >= 32 && input.height >= 32)).toBe(true);
    const textSpace = await panel.locator('input[type="number"]').evaluateAll(inputs => inputs.map(input => {
      const style = getComputedStyle(input);
      return input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    }));
    expect(Math.min(...textSpace), 'Balances remain readable between the icon and number stepper').toBeGreaterThanOrEqual(40);
  }
});

test('Planner bulk settings preserve disabled targets, reorder pulls and restore mixed per-banner values', async ({ page, isMobile }, testInfo) => {
  await mockPlannerControls(page);
  await page.goto('/timeline?tab=carat-planner');
  const rows = page.locator('.target');
  await page.locator('.target-list').evaluate(element => element.scrollIntoView({ block: 'end' }));
  await expect(rows).toHaveCount(5);
  await expect.poll(() => rows.evaluateAll(items => items.map(item => item.getAttribute('data-target-id')))).toEqual(['first', 'custom', 'later', 'past-new', 'past-old']);
  await expect(page.getByRole('separator', { name: '0.5-Year Anniversary on 2026-09-05' })).toHaveCount(1);
  await expect(page.getByRole('separator', { name: '1st Anniversary on 2026-09-20' })).toHaveCount(1);
  await expect(page.getByText('Before plan start', { exact: true })).toHaveCount(2);
  const bulk = page.getByRole('group', { name: 'Apply settings to every planned banner' });
  const timing = bulk.getByRole('combobox', { name: 'Pull on', exact: true });
  const paid = bulk.getByRole('combobox', { name: 'Paid Carats', exact: true });
  await expect(timing).toHaveText('Individual'); await expect(paid).toHaveText('Mixed');
  if (isMobile) for (const control of [timing, paid]) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(32);
  await page.locator('.targets').screenshot({ path: testInfo.outputPath('planner-pull-plan.png') });
  await timing.click(); await bulk.getByRole('option', { name: 'Banner start', exact: true }).click();
  await expect.poll(() => rows.evaluateAll(items => items.map(item => item.getAttribute('data-target-id')))).toEqual(['custom', 'first', 'later', 'past-new', 'past-old']);
  await paid.click(); await bulk.getByRole('option', { name: 'Allowed', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!).plans[0]);
  const { bannerStart, bannerEnd, ...hiddenSettings } = plannerControlsPlan().targets.find(item => item.id === 'hidden')!;
  expect(saved.targets.find((item: { id: string }) => item.id === 'hidden')).toMatchObject(hiddenSettings);
  for (const item of saved.targets) { expect(item.bannerStart).toBeUndefined(); expect(item.bannerEnd).toBeUndefined(); }
  for (const item of saved.targets.filter((item: { id: string }) => item.id !== 'hidden')) {
    expect(item).toMatchObject({ pullTiming: 'start', allowPaidJewels: true });
    expect(item.customPullDate).toBeUndefined();
  }
  const custom = page.locator('[data-target-id="custom"]');
  await custom.getByRole('button', { name: 'Target options', exact: true }).click();
  await custom.getByRole('checkbox', { name: 'Allow paid Carats' }).uncheck();
  await custom.getByRole('button', { name: 'Close Target options', exact: true }).click();
  await expect(paid).toHaveText('Mixed');
  await timing.click(); await bulk.getByRole('option', { name: 'Banner end', exact: true }).click();
  await page.reload();
  await expect(timing).toHaveText('Banner end'); await expect(paid).toHaveText('Mixed');
  await page.locator('.target-list').evaluate(element => element.scrollIntoView({ block: 'end' }));
  await expect(rows).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
  await page.setViewportSize({ width: 320, height: 844 });
  await expect(bulk).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await bulk.screenshot({ path: testInfo.outputPath('planner-bulk-320.png') });
});

test('Planner target controls retain desktop steppers, compact mobile input, options and Uncap Crystal limits', async ({ page, isMobile }, testInfo) => {
  await mockTimeline(page);
  const initial = plannerControlsPlan();
  initial.targets = [{ ...initial.targets[0]!, id: 'support', eventId: 'support-1', title: 'Kitasan Black Support Pickup', bannerKind: 'support', bannerStart: '2026-09-01', bannerEnd: '2026-09-10' }];
  initial.balances.supportTickets = 7; initial.balances.rainbowFullCrystals = 1; initial.balances.rainbowCrystals = 25;
  await page.addInitScript(plan => { if (!localStorage.getItem('carat-planner-plans-v1')) localStorage.setItem('carat-planner-plans-v1', JSON.stringify({ version: 1, activePlanId: plan.id, plans: [plan] })); }, initial);
  await page.goto('/timeline?tab=carat-planner');
  const row = page.locator('[data-target-id="support"]');
  const pulls = row.getByRole('spinbutton', { name: 'Planned pulls', exact: true });
  await expect(pulls).toHaveValue('10');
  await expect(row.locator('.at-pull')).toHaveAttribute('aria-label', /7 support tickets available at pull; 7 used and 0 remaining/);
  await expect(row.getByTitle('Rainbow Uncap Crystals available at pull')).toHaveText('2');
  await expect.poll(() => row.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  if (isMobile) {
    await expect(row.getByRole('button', { name: 'Add 100 pulls' })).toBeHidden();
    expect((await pulls.boundingBox())!.height).toBeGreaterThanOrEqual(32);
  } else {
    await row.getByRole('button', { name: 'Add 100 pulls' }).click(); await expect(pulls).toHaveValue('110');
    await row.getByRole('button', { name: 'Add 10 pulls' }).click(); await expect(pulls).toHaveValue('120');
    await row.getByRole('button', { name: 'Remove 10 pulls' }).click(); await expect(pulls).toHaveValue('110');
    await row.getByRole('button', { name: 'Remove 100 pulls' }).click(); await expect(pulls).toHaveValue('10');
  }
  await pulls.fill('6000'); await pulls.blur(); await expect(pulls).toHaveValue('5000');
  if (!isMobile) await expect(row.getByRole('button', { name: 'Add 10 pulls' })).toBeDisabled();
  await pulls.fill('0'); await pulls.blur();
  if (!isMobile) await expect(row.getByRole('button', { name: 'Remove 100 pulls' })).toBeDisabled();
  await pulls.fill('330'); await pulls.blur();
  for (const color of ['Rainbow', 'Gold']) {
    const fewer = row.getByRole('button', { name: `Use one fewer ${color} Uncap Crystal` });
    const more = row.getByRole('button', { name: `Use one more ${color} Uncap Crystal` });
    await expect(fewer).toBeDisabled();
    await more.click(); await expect(row.getByLabel(`${color} Uncap Crystals planned`, { exact: true })).toHaveText('1');
    await fewer.click(); await expect(fewer).toBeDisabled();
    for (let index = 0; index < 20; index++) {
      if (isMobile) await more.tap(); else await more.click();
      await expect(row.getByLabel(`${color} Uncap Crystals planned`, { exact: true })).toHaveText(String(index + 1));
    }
    await expect(more).toBeDisabled();
  }
  await row.getByRole('button', { name: 'Target options', exact: true }).click();
  const options = row.getByRole('dialog', { name: 'Target options', exact: true });
  const timing = options.getByRole('combobox', { name: 'Pull on', exact: true });
  await timing.click(); await options.getByRole('option', { name: 'Custom date', exact: true }).click();
  await options.getByLabel('Pull date', { exact: true }).fill('2026-09-09'); await options.getByLabel('Pull date', { exact: true }).blur();
  await options.getByRole('checkbox', { name: 'Allow paid Carats' }).check();
  await options.getByRole('spinbutton', { name: 'Ticket limit' }).fill('3'); await options.getByRole('spinbutton', { name: 'Ticket limit' }).blur();
  await options.screenshot({ path: testInfo.outputPath('planner-target-options.png') });
  await page.keyboard.press('Escape'); await expect(options).toBeHidden();
  await page.reload(); await expect(pulls).toHaveValue('330');
  await row.getByRole('button', { name: 'Target options', exact: true }).click();
  await expect(timing).toHaveText('Custom date'); await expect(options.getByLabel('Pull date', { exact: true })).toHaveValue('2026-09-09');
  await expect(options.getByRole('checkbox', { name: 'Allow paid Carats' })).toBeChecked();
  await expect(options.getByRole('spinbutton', { name: 'Ticket limit' })).toHaveValue('3');
  await options.getByRole('button', { name: 'Close Target options' }).click();
  for (const color of ['Rainbow', 'Gold']) await expect(row.getByLabel(`${color} Uncap Crystals planned`, { exact: true })).toHaveText('20');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await row.screenshot({ path: testInfo.outputPath('planner-support-320.png') });
});

test('Planner action combobox supports Added rows, keyboard selection, clear, escape and more than 40 banners', async ({ page }, testInfo) => {
  await mockTimeline(page);
  const events = Array.from({ length: 65 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 8, index + 1)).toISOString();
    return { id: `banner-${index}`, title: `Banner ${String(index).padStart(2, '0')}`, type: 'character_banner', global_release_date: date, jp_release_date: date, estimated_end_date: date, planner_data_available: true };
  });
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: { events } }));
  const initial = plannerControlsPlan(); initial.targets = [{ ...initial.targets[0]!, id: 'already-added', eventId: 'banner-0', title: 'Banner 00' }]; initial.disabledEventIds = [];
  await page.addInitScript(plan => localStorage.setItem('carat-planner-plans-v1', JSON.stringify({ version: 1, activePlanId: plan.id, plans: [plan] })), initial);
  await page.goto('/timeline?tab=carat-planner');
  const input = page.getByRole('combobox', { name: 'Search character, support, or paid banners' });
  await input.click();
  const options = page.getByRole('option');
  await expect(options.first()).toBeAttached(); expect(await options.count()).toBeLessThan(40);
  await expect(options.first()).toBeDisabled(); await expect(options.first()).toContainText('Added');
  await expect(input).toHaveAttribute('aria-activedescendant', 'planner-banner-option-1');
  await input.press('ArrowDown'); await expect(input).toHaveAttribute('aria-activedescendant', 'planner-banner-option-2');
  await input.press('Enter');
  await expect(input).toHaveValue(''); await expect(input).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!).plans[0].targets.map((item: { eventId: string }) => item.eventId))).toContain('banner-2');
  await input.click(); await expect(input).toHaveAttribute('aria-expanded', 'true');
  await input.fill('no matching banners'); await expect(page.getByText('No banners match this search and type.')).toBeVisible();
  await input.press('Escape'); await expect(input).toHaveValue('no matching banners'); await expect(input).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Clear banner search' }).click();
  await expect(input).toHaveValue(''); await expect(options.first()).toBeAttached(); expect(await options.count()).toBeLessThan(40);
  const panel = page.getByRole('listbox', { name: 'Search character, support, or paid banners suggestions' });
  await panel.evaluate(element => element.scrollTop = element.scrollHeight);
  expect(await options.count()).toBeLessThan(40);
  await expect(page.getByRole('option',{name:'Banner 64',exact:false})).toBeAttached();
  expect(await panel.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await input.fill('Banner');
  await expect(options.first()).toBeAttached(); expect(await options.count()).toBeLessThan(40);
  for (let index = 0; index < 40; index++) await input.press('ArrowDown');
  await expect(input).toHaveAttribute('aria-activedescendant', 'planner-banner-option-42');
  expect(await options.count()).toBeLessThan(40);
  const active = page.locator('#planner-banner-option-42');
  await expect(active).toBeVisible();
  const bounds = await active.boundingBox(), listBounds = await panel.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(listBounds!.y - 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(listBounds!.y + listBounds!.height + 1);
  await panel.screenshot({ path: testInfo.outputPath('planner-banner-search.png') });
  await input.press('Enter');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!).plans[0].targets.map((item: { eventId: string }) => item.eventId))).toContain('banner-42');
});
