import { test, expect } from './fixtures/test';
import { mockDatabase, mockVeteranProfile, profile, veteran, record, mockTimeline, mockAffinity } from './fixtures/api';

test('database keeps 600 results searchable while bounding mounted cards on deep scrolling', async ({ page }) => {
  await mockDatabase(page);
  await page.route('**/search/query?*', route => route.fulfill({ json: {
    items: Array.from({ length: 600 }, (_, index) => {
      const item = record(String(123456789012 + index));
      item.inheritance.inheritance_id = index + 1;
      item.trainer_name = `Scroll Trainer ${index}`;
      return item;
    }), total: 600, page: 0, limit: 600, total_pages: 1,
  } }));
  await page.goto('/database?page=1');
  const list = page.locator('.inheritance-list').first();
  await expect(list.locator('.inheritance-card').first()).toContainText('Scroll Trainer 0');
  await expect.poll(() => list.locator('.inheritance-card').count()).toBeLessThan(25);
  await list.evaluate(node => window.scrollTo({ top: node.getBoundingClientRect().top + scrollY + 520 * 640, behavior: 'instant' }));
  await expect.poll(async () => Number(await list.locator('[data-virtual-index]').first().getAttribute('data-virtual-index'))).toBeGreaterThan(400);
  await expect.poll(() => list.locator('.inheritance-card').count()).toBeLessThan(25);
  await expect(list.getByText('Scroll Trainer 0', { exact: true })).toHaveCount(0);
  await list.evaluate(node => window.scrollTo({ top: node.getBoundingClientRect().top + scrollY, behavior: 'instant' }));
  await expect(list.locator('.inheritance-card').first()).toContainText('Scroll Trainer 0');
  await expect.poll(() => list.locator('.inheritance-card').count()).toBeLessThan(25);
});

test('Veterans evicts distant cards and table rows while preserving the complete filtered collection', async ({ page }) => {
  await mockVeteranProfile(page);
  await page.route('**/api/v4/user/profile/123456789012', route => route.fulfill({ json: { ...profile,
    veterans: Array.from({ length: 600 }, (_, index) => ({ ...veteran, id: index + 1, trained_chara_id: index + 1 })),
  } }));
  await page.goto('/veterans/123456789012');
  const grid = page.locator('.veteran-grid');
  await expect(grid.locator('.veteran-card').first()).toBeVisible();
  await grid.evaluate(node => window.scrollTo({ top: node.getBoundingClientRect().top + scrollY + node.scrollHeight * .8, behavior: 'instant' }));
  await expect.poll(async () => Number(await grid.locator('[data-virtual-index]').first().getAttribute('data-virtual-index'))).toBeGreaterThan(350);
  expect(await grid.locator('.veteran-card').count()).toBeLessThan(50);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.getByRole('button', { name: 'Display options', exact: true }).click();
  await page.getByRole('combobox', { name: 'View', exact: true }).click();
  await page.getByRole('option', { name: 'Table', exact: true }).click();
  const table = page.locator('.table-wrap tbody');
  await expect(table.locator('[data-virtual-index]').first()).toBeVisible();
  await table.evaluate(node => window.scrollTo({ top: node.getBoundingClientRect().top + scrollY + node.scrollHeight * .8, behavior: 'instant' }));
  await expect.poll(async () => Number(await table.locator('[data-virtual-index]').first().getAttribute('data-virtual-index'))).toBeGreaterThan(350);
  expect(await table.locator('[data-virtual-index]').count()).toBeLessThan(60);
});


test('profile history tables keep distant records out of the DOM', async ({ page }) => {
  await mockVeteranProfile(page);
  await page.route('**/api/v4/user/profile/123456789012', route => route.fulfill({ json: { ...profile,
    circle_history: Array.from({ length: 600 }, (_, index) => ({ ...profile.circle_history[0], circle_id: index + 1, circle_name: 'History Club ' + index })),
  } }));
  await page.goto('/profile/123456789012');
  const table = page.getByRole('table', { name: 'Circle History', exact: true });
  await table.locator('tbody').evaluate(node => window.scrollTo({ top: node.getBoundingClientRect().top + scrollY + node.scrollHeight * .8, behavior: 'instant' }));
  await expect.poll(async () => Number(await table.locator('[data-virtual-index]').first().getAttribute('data-virtual-index'))).toBeGreaterThan(350);
  expect(await table.locator('[data-virtual-index]').count()).toBeLessThan(100);
  await expect(table.getByText('History Club 0', { exact: true })).toHaveCount(0);
});

test('horizontal Timeline evicts earlier events within a dense day', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Mobile uses the independently virtualized date feed.');
  await mockTimeline(page);
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: {
    events: Array.from({ length: 600 }, (_, index) => ({ id: 'dense-' + index, type: 'character_banner', title: 'Dense banner ' + index,
      global_release_date: '2026-09-01T00:00:00Z', is_confirmed: true })),
  } }));
  await page.goto('/timeline');
  const board = page.locator('.timeline-board.horizontal');
  await expect(board.locator('.event-card').first()).toBeVisible();
  expect(await board.locator('.event-card').count()).toBeLessThan(30);
  await board.evaluate(node => node.scrollTo({ top: node.scrollHeight * .8, behavior: 'instant' }));
  await expect.poll(async () => Number(await board.locator('.lane-events [data-virtual-index]').first().getAttribute('data-virtual-index'))).toBeGreaterThan(300);
  expect(await board.locator('.event-card').count()).toBeLessThan(30);
});

for (const virtualize of [true, false]) for (const failOnce of [false, true]) test('database resumes pagination after a fast jump and ' + (failOnce ? 'an explicit retry' : 'a slow response') + (virtualize ? ' with virtualization' : ' without virtualization'), async ({ page }) => {
  await mockDatabase(page);
  await mockAffinity(page);
  await page.addInitScript(enabled => { localStorage.setItem('db-list-mode', 'infinite'); localStorage.setItem('uma-virtual-scrolling', String(enabled)); }, virtualize);
  let release!: () => void;
  const pending = new Promise<void>(resolve => release = resolve);
  const requests: number[] = [];
  let secondAttempts = 0;
  const item = (index: number) => {
    const value = record(String(123456789012 + index));
    value.inheritance.inheritance_id = index + 1;
    value.trainer_name = 'Paged Trainer ' + index;
    return value;
  };
  await page.route('**/search/query?*', async route => {
    const index = Number(new URL(route.request().url()).searchParams.get('page'));
    requests.push(index);
    if (index === 1 && ++secondAttempts === 1) {
      await pending;
      if (failOnce) { await route.fulfill({ status: 400, json: { detail: 'Page could not be loaded' } }); return; }
    }
    // Overlapping results leave the end nearby after deduplication, without another scroll.
    const items = index === 0 ? Array.from({length:12}, (_, i) => item(i))
      : index === 1 ? [...Array.from({length:11}, (_, i) => item(i)), item(12)]
      : Array.from({length:12}, (_, i) => item(i + 13));
    await route.fulfill({ json: { items, total: 25, page: index, limit: 12, total_pages: 3 } });
  });
  const jumpToBottom = () => page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  try {
    await page.goto('/database');
    await expect(page.locator('.inheritance-card').first()).toBeVisible();
    await jumpToBottom();
    await expect.poll(() => requests).toEqual([0, 1]);
    await jumpToBottom();
    release();
    if (failOnce) {
      const retry = page.getByRole('button', { name: 'Retry loading more', exact: true });
      await expect(retry).toBeVisible();
      await jumpToBottom();
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForTimeout(250);
      expect(requests).toEqual([0, 1]);
      await retry.click();
    }
    await expect.poll(() => requests).toEqual(failOnce ? [0, 1, 1, 2] : [0, 1, 2]);
    await jumpToBottom();
    await expect(page.getByText('Paged Trainer 24', { exact: true })).toBeAttached();
    if (virtualize) expect(await page.locator('.inheritance-card').count()).toBeLessThan(25);
    else await expect(page.locator('.inheritance-card')).toHaveCount(25);
  } finally { release(); }
});


test('global virtual scrolling preference updates loaded lists, survives reloads, and reaches Timeline', async ({ page, isMobile }, info) => {
  await mockDatabase(page); await mockAffinity(page); await mockVeteranProfile(page); await mockTimeline(page);
  await page.route('**/search/query?*', route => route.fulfill({ json: {
    items: Array.from({ length: 60 }, (_, index) => { const item=record(String(123456789012+index)); item.inheritance.inheritance_id=index+1; return item; }),
    total: 60, page: 0, limit: 60, total_pages: 1,
  } }));
  await page.route('**/api/v4/user/profile/123456789012', route => route.fulfill({ json: { ...profile,
    veterans: Array.from({ length: 60 }, (_, index) => ({ ...veteran, id: index+1, trained_chara_id: index+1 })),
  } }));
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: {
    events: Array.from({ length: 60 }, (_, index) => ({ id: 'preference-'+index, type: 'character_banner', title: 'Preference banner '+index,
      global_release_date: new Date(Date.UTC(2026,8,index+1)).toISOString(), is_confirmed: true })),
  } }));
  await page.goto('/database');
  await expect(page.locator('.inheritance-card').first()).toBeVisible();
  const display = page.getByRole('button', { name: 'Display options', exact: true });
  for (const width of isMobile ? [390,320] : [1920,1468,1280]) {
    await page.setViewportSize({ width, height:1080 });
    await expect(page.locator('#database-display-options')).toBeHidden();
    const bottoms = await page.locator('.display-toggle, #database-sort').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().bottom));
    expect(Math.abs(bottoms[0]! - bottoms[1]!)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if(width===1920 || width===390) await page.locator('.results-header').screenshot({ path:info.outputPath('database-header-'+width+'.png') });
  }
  await display.click();
  await expect(page.locator('#database-display-options').getByRole('checkbox', { name: 'Virtual scrolling', exact: true })).toHaveCount(0);
  await page.locator('.results-header').screenshot({path:info.outputPath('database-display-options.png')});
  const settings = page.locator('.site-footer').getByRole('button', { name: 'Global settings', exact: true });
  await settings.click();
  const preference = page.getByRole('checkbox', { name: 'Virtual scrolling', exact: true });
  await expect(preference).toBeChecked();
  const menu = page.getByRole('dialog', { name: 'Global settings', exact: true });
  await expect.poll(() => menu.evaluate(node => node.matches(':modal'))).toBe(true);
  await menu.screenshot({path:info.outputPath('global-settings.png'), animations:'disabled'});
  const bounds = (await menu.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await preference.uncheck();
  await expect(page.locator('.inheritance-card')).toHaveCount(60);
  await page.reload();
  await expect(page.locator('.inheritance-card')).toHaveCount(60);
  await page.goto('/veterans/123456789012');
  await expect(page.locator('.veteran-card')).toHaveCount(60);
  await page.goto('/timeline');
  await expect(page.locator('.timeline-board .event-card')).toHaveCount(60);
  if (!isMobile) {
    await page.getByRole('radio', { name: 'Vertical', exact: true }).click();
    await expect(page.locator('.timeline-board.vertical .event-card')).toHaveCount(60);
  }
  await page.goto('/database');
  await settings.click(); await expect(preference).not.toBeChecked(); await preference.check();
  await expect.poll(() => page.locator('.inheritance-card').count()).toBeLessThan(25);
  await page.reload(); await settings.click(); await expect(preference).toBeChecked();
});
