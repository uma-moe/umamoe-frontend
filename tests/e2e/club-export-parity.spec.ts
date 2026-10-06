import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures/test';
import { mockCommunity } from './fixtures/api';
import { clubExportCases, clubExportFixture } from './fixtures/club-exports';
import { clubWorkbookSnapshot } from './fixtures/club-export-workbook';
import reference from './fixtures/club-exports-reference.json' with { type: 'json' };

test.use({ locale: 'en-US', timezoneId: 'UTC' });

for (const name of clubExportCases) test(`Club exports match corrected reference file contents: ${name}`, async ({ page }, testInfo) => {
  const fixture = clubExportFixture(name), expected = reference.cases[name];
  await page.clock.setFixedTime('2026-09-06T12:00:00Z'); await mockCommunity(page);
  await page.route('**/api/v4/circles?*', route => route.fulfill({ json: fixture.response }));
  await page.addInitScript(config => localStorage.setItem('circle_details_config', JSON.stringify(config)), fixture.config);
  await page.goto(`/circles/7?year=${fixture.year}&month=${fixture.month}`);
  await expect(page.getByRole('region', { name: 'Club Information', exact: true })).toBeVisible();
  // Filtering only affects the view: Angular exports all members in metric order.
  await page.locator('#club-member-search').fill('Gold');
  for (const [format, label] of [['json', 'JSON'], ['csv', 'CSV'], ['xlsx', 'Excel (XLSX)']] as const) {
    await page.getByText('Export', { exact: true }).click();
    const downloaded = page.waitForEvent('download'); await page.getByRole('menuitem', { name: label, exact: true }).click();
    const file = await downloaded, path = testInfo.outputPath(`${name}.${format}`); await file.saveAs(path);
    expect(file.suggestedFilename()).toBe(`circle_7_${fixture.year}_${fixture.month}_stats.${format}`);
    if (format === 'json') expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(expected.json);
    else if (format === 'csv') expect(await readFile(path, 'utf8')).toBe(expected.csv);
    else expect(await clubWorkbookSnapshot(path)).toEqual(expected.xlsx);
  }
  if (name === 'current') {
    await page.locator('#club-member-search').fill('');
    await expect(page.locator('.chart-legend').getByRole('button', { name: 'Left trainer', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Show member calendar' }).click();
    await page.getByRole('button', { name: 'Day 1 contributors', exact: true }).click();
    // Former members remain in the historical calendar, but not the active chart.
    const former = page.getByRole('dialog').getByRole('listitem').filter({ hasText: 'Left trainer' });
    await expect(former.locator('.popover-name')).toHaveText('Left trainer');
    await expect(former.locator('.popover-value')).toHaveText('+60');
  }
});

test('Club exports preserve formula safety, native aliases and empty-data behavior', async ({ page }, testInfo) => {
  const fixture = clubExportFixture('incomplete');
  fixture.response.members[0]!.trainer_name = '=HYPERLINK("https://example.invalid")';
  await mockCommunity(page);
  await page.route('**/api/v4/circles?*', route => route.fulfill({ json: fixture.response }));
  await page.goto('/circles/7?year=2026&month=8');
  await page.getByText('Export', { exact: true }).click();
  const download = page.waitForEvent('download'); await page.getByRole('menuitem', { name: 'CSV', exact: true }).click();
  const path = testInfo.outputPath('safe.csv'); await (await download).saveAs(path);
  const csv = await readFile(path, 'utf8');
  expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"")"');
  expect(csv).toContain(',-100,'); // A numeric correction must not be escaped as a formula.
  for (const alias of ['xls', 'excel', 'exel', 'XLSX']) {
    const downloaded = page.waitForEvent('download'); await page.goto(`/circles/7/${alias}?year=2026&month=8`);
    expect((await downloaded).suggestedFilename()).toBe('circle_7_2026_8_stats.xlsx');
  }
  fixture.response.members = [];
  const emptyDownloads: string[] = []; page.on('download', file => emptyDownloads.push(file.suggestedFilename()));
  await page.goto('/circles/7/json?year=2026&month=8');
  await expect(page.getByText('No members match your search.', { exact: true })).toBeVisible();
  await page.getByText('Export', { exact: true }).click(); await page.getByRole('menuitem', { name: 'CSV', exact: true }).click();
  expect(emptyDownloads).toEqual([]);
});

test('Member List Settings stages every control, cancels on all dismissal paths and applies export preferences', async ({ page }, testInfo) => {
  test.setTimeout(60_000); // Eight select options, eight checkboxes and four dismissal paths on mobile WebKit.
  const fixture = clubExportFixture('current');
  await page.clock.setFixedTime('2026-09-06T12:00:00Z'); await mockCommunity(page);
  await page.route('**/api/v4/circles?*', route => route.fulfill({ json: fixture.response }));
  await page.addInitScript(config => { if (!localStorage.getItem('circle_details_config')) localStorage.setItem('circle_details_config', JSON.stringify(config)); }, fixture.config);
  await page.goto('/circles/7?year=2026&month=9');
  const trigger = page.getByRole('button', { name: 'Display Settings', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Member List Settings', exact: true });
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('circle_details_config')!));
  const select = async (label: string) => { await page.locator('#club-member-metric').click(); await page.getByRole('option', { name: label, exact: true }).click(); };
  for (const theme of ['light', 'dark']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
    await trigger.click();
    await expect(dialog.locator('.dialog-panel')).toHaveCSS('background-color', theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(22, 22, 22)');
    await expect(dialog.locator('label[for="club-member-metric"]')).toHaveCSS('color', theme === 'light' ? 'rgb(17, 24, 39)' : 'rgb(255, 255, 255)');
    await expect(dialog.getByRole('checkbox')).toHaveCount(8);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  for (const method of ['cancel', 'escape', 'close', 'backdrop']) {
    // Restore the keyboard opener; Safari intentionally does not focus pointer-clicked buttons.
    await trigger.focus(); await trigger.press('Enter'); await expect(dialog).toBeVisible();
    await select('Total Fans'); await dialog.getByRole('checkbox', { name: 'Today', exact: true }).uncheck();
    expect(await stored()).toEqual(fixture.config);
    await expect(page.locator('.primary-metric > span').first()).toHaveText('Monthly Gain');
    if (method === 'cancel') await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    else if (method === 'escape') await page.keyboard.press('Escape');
    else if (method === 'close') await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    else await page.mouse.click(2, 2);
    await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused(); expect(await stored()).toEqual(fixture.config);
  }
  await trigger.click();
  await expect(page.locator('#club-member-metric')).toContainText('Monthly Gain');
  const options = ['Today', 'Monthly Gain', 'Weekly Gain', 'Daily Gain', 'Avg Daily Gain (7d)', 'Daily Avg (Month)', 'Projected Monthly', 'Total Fans'];
  for (const label of options) { await select(label); await expect(page.locator('#club-member-metric')).toContainText(label); }
  const labels = ['Total Fans', 'Today', '7 Day Average', 'Daily Average (Month)', 'Daily Gain', 'Weekly Gain', 'Projected Monthly', 'Monthly Gain'];
  await expect(dialog.getByRole('checkbox')).toHaveCount(labels.length);
  for (const label of labels) { const checkbox = dialog.getByRole('checkbox', { name: label, exact: true }); await checkbox.uncheck(); await expect(checkbox).not.toBeChecked(); }
  expect(await stored()).toEqual(fixture.config);
  await dialog.screenshot({ path: testInfo.outputPath('member-list-settings.png') });
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(page.locator('.primary-metric > span').first()).toHaveText('Total Fans');
  expect(await stored()).toEqual({ ...fixture.config, selectedCalculation: 'total_fans', showTotalFans: false, showTodayGain: false, showSevenDayAvg: false, showDailyAvg: false, showDailyGain: false, showWeeklyGain: false, showProjectedMonthly: false, showMonthlyGain: false });
  await page.reload(); await trigger.click(); await expect(page.locator('#club-member-metric')).toContainText('Total Fans');
  for (const label of labels) await expect(dialog.getByRole('checkbox', { name: label, exact: true })).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByText('Export', { exact: true }).click();
  const download = page.waitForEvent('download'); await page.getByRole('menuitem', { name: 'CSV', exact: true }).click();
  const path = testInfo.outputPath('selected-columns.csv'); await (await download).saveAs(path);
  expect((await readFile(path, 'utf8')).split('\n')[0]).toMatch(/^"Rank","Name","Trainer ID","Role","Status","Total Fans","Last Updated",,Delta 1,/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
