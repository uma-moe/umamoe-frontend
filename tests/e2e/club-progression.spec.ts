import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from './fixtures/test';
import { mockCommunity } from './fixtures/api';
import { clubProgressionFixture } from './fixtures/club-progression';

test.use({ locale: 'en-US', timezoneId: 'UTC' });
async function openClub(page: Page, fixture = clubProgressionFixture('current')) {
  await page.clock.setFixedTime('2026-09-06T12:00:00Z'); await mockCommunity(page);
  await page.route('**/api/v4/circles?*', route => route.fulfill({ json: fixture.response }));
  await page.addInitScript(config => localStorage.setItem('circle_details_config', JSON.stringify(config)), fixture.config);
  await page.goto(`/circles/7?year=${fixture.year}&month=${fixture.month}`);
  const panel = page.getByRole('region', { name: 'Member Progression', exact: true });
  await panel.scrollIntoViewIfNeeded(); await expect(panel.locator('.chart-host svg')).toBeVisible();
  return panel;
}

test('Departed members do not create false calendar gains or a final club progression spike', async ({ page }, testInfo) => {
  const fixture = clubProgressionFixture('current');
  fixture.response.members = [
    { ...fixture.response.members[0]!, viewer_id: 570323472295, trainer_name: 'LinhYeuAnh', daily_fans: [1216184214, 1216184214, ...Array(30).fill(0)], next_month_start: 1731597408 },
    { ...fixture.response.members[1]!, daily_fans: Array.from({ length: 31 }, (_, i) => 1000 + i * 100) }
  ];
  const panel = await openClub(page, fixture);
  await panel.getByRole('button', { name: 'Show member calendar' }).click();
  await expect(panel.locator('[data-day="2"] .day-delta-badge')).toHaveText('+100');
  await panel.getByRole('button', { name: 'Day 2 contributors', exact: true }).click();
  const contributors = page.getByRole('dialog', { name: 'Day 2 contributors', exact: true });
  await expect(contributors.locator('.popover-name')).toHaveText(['Gold "Ship", Jr.']);
  await expect(contributors.locator('.popover-value')).toHaveText(['+100']);
  await contributors.getByRole('button', { name: 'Close Day 2 contributors', exact: true }).click();

  await page.getByText('Export', { exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'JSON', exact: true }).click();
  const path = testInfo.outputPath('departed-member.json');
  await (await download).saveAs(path);
  const data = JSON.parse(await readFile(path, 'utf8'));
  expect(data.history).toHaveLength(30);
  expect(data.history.at(-1).fan_count).toBe(3000);
  expect(data.history.at(-1).fan_count - data.history.at(-2).fan_count).toBe(100);
  const departed = data.members.find((member: { trainer_id: string }) => member.trainer_id === '570323472295');
  expect(departed.monthly_gain).toBe(0);
  expect(departed.daily_fans[30]).toBe(0);
  expect(departed.daily_delta[29]).toBeNull();
});

test('Member charts keep source order, hide/isolate/restore, keyboard access, search and month-local modes', async ({ page }, testInfo) => {
  const panel = await openClub(page), legend = panel.locator('.chart-legend'), buttons = legend.getByRole('button');
  const names = ['McQueen', 'Gold "Ship", Jr.', 'New trainer', 'Correction'];
  await expect(buttons).toHaveText(names);
  const mcqueen = buttons.filter({ hasText: 'McQueen' }), gold = buttons.filter({ hasText: 'Gold' });
  await mcqueen.click(); await expect(mcqueen).toHaveAttribute('aria-pressed', 'false');
  await gold.focus(); await gold.press('Shift+Enter');
  await expect(legend.locator('[aria-pressed="true"]')).toHaveText(['Gold "Ship", Jr.']);
  await gold.press('Shift+Enter');
  await expect(legend.locator('[aria-pressed="true"]')).toHaveText(names.slice(1));
  if (!testInfo.project.name.startsWith('mobile')) {
    await gold.dblclick(); await expect(legend.locator('[aria-pressed="true"]')).toHaveText(['Gold "Ship", Jr.']);
    await gold.dblclick(); await expect(legend.locator('[aria-pressed="true"]')).toHaveText(names.slice(1));
    await gold.hover();
    await expect(panel.locator('.chart-host path[stroke-width="4"]')).not.toHaveCount(0);
  } else for (const button of await buttons.all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(28);
  await page.locator('#club-member-search').fill('7001'); await expect(buttons).toHaveText(['McQueen']);
  await expect(mcqueen).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#club-member-search').fill('Left trainer'); await expect(buttons).toHaveCount(0);
  await page.locator('#club-member-search').fill(''); await expect(buttons).toHaveText(names);
  await panel.getByRole('button', { name: 'Show daily gains' }).click();
  await expect(panel.getByRole('figure')).toHaveAttribute('aria-label', 'Member progression · delta');
  await page.getByRole('button', { name: 'Previous month', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Show cumulative gains' })).toBeVisible();
  await panel.getByRole('button', { name: 'Show member calendar' }).click();
  await page.getByRole('button', { name: 'Next month', exact: true }).click();
  await expect(panel.locator('.card-header-date')).toHaveText('2026 / 09');
  await panel.getByRole('button', { name: 'Show member chart' }).click();
  await expect(buttons).toHaveText(names);
  await expect(panel.getByRole('button', { name: 'Show cumulative gains' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Calendar keeps former members, ignores prior snapshots and gaps, and exposes native contributor popovers', async ({ page }, testInfo) => {
  const panel = await openClub(page);
  await panel.getByRole('button', { name: 'Show member calendar' }).click();
  const day1 = panel.locator('[data-day="1"]'), trigger = day1.getByRole('button', { name: 'Day 1 contributors', exact: true });
  const popup = page.getByRole('dialog', { name: 'Day 1 contributors', exact: true });
  await expect(panel.locator('.card-header-date')).toHaveCSS('font-size', '13.6px');
  await expect(day1.locator('.day-delta-badge')).toHaveText('+100');
  await expect(panel.locator('.calendar-week').first().locator('.day-number')).toHaveText(['31','1','2','3','4','5','6']);
  await expect(panel.locator('[data-day="3"] .contrib-name')).toHaveText(['Gold "Ship", Jr.', 'Correction']);
  await expect(panel.locator('[data-day="5"] .day-delta-badge')).toHaveText('-');
  await expect(panel.locator('[data-day="5"] button')).toHaveCount(0);
  if (!testInfo.project.name.startsWith('mobile')) {
    await trigger.hover(); await expect(popup).toBeVisible();
    await page.mouse.move(0, 0); await expect(popup).not.toBeVisible();
  }
  await trigger.click(); await expect(popup).toBeVisible();
  await expect(popup.locator('.popover-name')).toHaveText(['Left trainer', 'Gold "Ship", Jr.', 'Correction']);
  await expect(popup.locator('.popover-value')).toHaveText(['+60', '+50', '-10']);
  await popup.getByRole('button', { name: 'Close Day 1 contributors', exact: true }).click();
  await expect(popup).not.toBeVisible(); await expect(trigger).toBeFocused();
  await trigger.press('Enter'); await expect(popup).toBeVisible();
  await page.keyboard.press('Escape'); await expect(popup).not.toBeVisible(); await expect(trigger).toBeFocused();
  await trigger.press('Enter'); await expect(popup).toBeVisible();
  await panel.getByRole('heading', { name: 'Member Progression' }).click(); await expect(popup).not.toBeVisible();
  await page.getByRole('button', { name: 'Include Prior Club Data', exact: true }).click();
  await expect(day1.locator('.day-delta-badge')).toHaveText('+100');
  await page.locator('#club-member-search').fill('Left trainer');
  await expect(day1.locator('.day-delta-badge')).toHaveText('+60');
  await page.locator('#club-member-search').fill('');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(panel.locator('.card-header-date')).toHaveCSS('font-size', '13.6px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await panel.locator('.calendar-view').evaluate(el => el.scrollWidth)).toBeLessThan(400);
    for (const button of await panel.locator('.calendar-day .trigger').all()) {
      const box = (await button.boundingBox())!; expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44);
    }
  }
  await panel.screenshot({ path: testInfo.outputPath('calendar-dense-320.png') });
});

test('Contributor Escape uses native visibility before queued toggle events arrive', async ({ page }) => {
  const panel = await openClub(page);
  await panel.getByRole('button', { name: 'Show member calendar' }).click();
  await panel.evaluate(element => {
    const first = element.querySelector<HTMLButtonElement>('button[aria-label="Day 1 contributors"]')!;
    const second = element.querySelector<HTMLButtonElement>('button[aria-label="Day 2 contributors"]')!;
    // Native visibility changes synchronously; toggle notifications are queued.
    second.click(); first.click(); first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  });
  await expect(page.locator('.popover:popover-open')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Day 1 contributors', exact: true })).toBeFocused();
});

test('Chart rendering includes prior dashes and source tooltip values with pointer/touch dismissal', async ({ page }, testInfo) => {
  const panel = await openClub(page);
  await expect(panel.locator('.chart-host path[stroke-dasharray]')).not.toHaveCount(0);
  const label = panel.locator('.chart-host svg text').filter({ hasText: /^02\.09$/ });
  await expect(label).toBeVisible();
  const x = (await label.boundingBox())!, chart = (await panel.locator('.chart-host').boundingBox())!;
  const point = { x: x.x + x.width / 2, y: chart.y + chart.height / 2 };
  if (testInfo.project.name.startsWith('mobile')) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.move(point.x, point.y);
  await expect(page.getByText('Gold "Ship", Jr.: 80 (+30)', { exact: true })).toBeVisible();
  await expect(page.getByText('McQueen: 50', { exact: true })).toBeVisible();
  if (testInfo.project.name.startsWith('mobile')) { await panel.getByRole('heading').tap(); await expect(page.getByText('McQueen: 50', { exact: true })).not.toBeVisible(); }
  else { await panel.getByRole('heading').click(); await expect(page.getByText('McQueen: 50', { exact: true })).not.toBeVisible(); }
  await panel.getByRole('button', { name: 'Show daily gains' }).click();
  await panel.screenshot({ path: testInfo.outputPath('member-daily-gains.png') });
});

test('Full clubs retain every legend item and scrollable contributor; colors and fonts follow the source theme', async ({ page }, testInfo) => {
  const fixture = clubProgressionFixture('current');
  fixture.response.members = Array.from({ length: 30 }, (_, i) => ({ ...fixture.response.members[0]!, viewer_id: 8000 + i, trainer_name: `Trainer ${i + 1}`, daily_fans: [100, 200 + i, 300 + i, 400 + i, 500 + i] }));
  const panel = await openClub(page, fixture), legend = panel.locator('.chart-legend');
  await expect(legend.getByRole('button')).toHaveCount(30);
  expect(await legend.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
  await legend.getByRole('button', { name: 'Trainer 30', exact: true }).click();
  await expect(legend.getByRole('button', { name: 'Trainer 30', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await panel.getByRole('button', { name: 'Show member calendar' }).click();
  for (const theme of ['light', 'dark']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
    await expect(panel).toHaveCSS('background-color', theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(22, 22, 22)');
    await expect(panel.getByRole('heading')).toHaveCSS('font-family', /Inter/);
    await expect(panel.getByRole('heading')).toHaveCSS('font-weight', '600');
    await panel.getByRole('button', { name: 'Day 1 contributors', exact: true }).click();
    const popup = page.getByRole('dialog', { name: 'Day 1 contributors', exact: true });
    await expect(popup.locator('li')).toHaveCount(30);
    await expect(popup.locator('.popover-name').first()).toHaveText('Trainer 30');
    await popup.getByText('Trainer 1', { exact: true }).scrollIntoViewIfNeeded();
    await expect(popup.getByText('Trainer 1', { exact: true })).toBeVisible();
    expect(await popup.locator('.popover-list').evaluate(element => element.scrollTop > 0)).toBe(true);
    const box = (await popup.boundingBox())!, viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await popup.screenshot({ path: testInfo.outputPath(`calendar-contributors-${theme}.png`) });
    await popup.getByRole('button', { name: 'Close Day 1 contributors', exact: true }).click();
  }
});

test('a full club tooltip stays inside the viewport and lets every member be read', async ({ page, isMobile }) => {
  const fixture = clubProgressionFixture('current');
  fixture.response.members = Array.from({ length: 30 }, (_, index) => ({ ...fixture.response.members[0]!, viewer_id: 9000 + index, trainer_name: `Trainer ${index + 1} with a longer name`, daily_fans: [100000000, 200000000 + index, 300000000 + index, 400000000 + index, 500000000 + index] }));
  const panel = await openClub(page, fixture);
  for (const [width,height] of isMobile ? [[390,540],[320,540]] : [[1920,1080],[1300,540],[768,540]]) {
    await page.setViewportSize({ width, height });
    const host = panel.locator('.chart-host');
    await host.evaluate(element => { element.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); });
    const label = (await host.locator('svg text').filter({ hasText: /^02\.09$/ }).boundingBox())!;
    const chart = (await host.boundingBox())!;
    const point = { x: label.x + label.width / 2, y: chart.y + 100 };
    if (isMobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.move(point.x, point.y);
    const tooltip = page.locator('[class^="chart-tooltip-"]:visible');
    await expect(tooltip).toHaveCount(1);
    const box = (await tooltip.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(320);
    if(height<=600 || width<1024) expect(box.height).toBeLessThanOrEqual(232);
    else expect(box.height).toBeGreaterThan(232);
    expect(box.x).toBeGreaterThanOrEqual(7); expect(box.x + box.width).toBeLessThanOrEqual(width - 7);
    expect(box.y).toBeGreaterThanOrEqual(7); expect(box.y + box.height).toBeLessThanOrEqual(height-7);
    expect(await tooltip.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(height<=600 || width<1024);
    if (isMobile) await page.touchscreen.tap(box.x + 10, box.y + 10); else await tooltip.hover();
    await tooltip.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(tooltip).toBeVisible();
    await expect(tooltip.getByText(/^Trainer 1 with a longer name:/)).toBeInViewport();
    expect(await tooltip.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await tooltip.screenshot({ path: test.info().outputPath(`member-tooltip-${width}.png`) });
    if (isMobile) await panel.getByRole('heading').tap(); else await panel.getByRole('heading').click();
    await expect(tooltip).toHaveCount(0);
  }
});
