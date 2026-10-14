import { expect, test, type Page } from './fixtures/test';

import { mockCommunity } from './fixtures/api';

async function chooseSelect(page: Page, id: string, option: string): Promise<void> {
  await page.locator(id).click();
  const labels: Record<string, string> = {'Total fans':'Total Fans', 'Total gain':'Total Gain', 'Average per day':'Avg/Day', 'Average per week':'Avg/Week', 'Average per month':'Avg/Month', '3-day gain':'3-Day Gain', '7-day gain':'7-Day Gain', '30-day gain':'30-Day Gain'};
  await page.getByRole('option', { name: labels[option] ?? option, exact: true }).click();
}

test('Rankings failed tab requests never display another period and recover through Retry', async ({ page }) => {
  await mockCommunity(page);
  let fail = true;
  await page.route('**/api/v4/rankings/gains?*', route => fail ? route.fulfill({status:503,json:{message:'Rankings temporarily unavailable'}}) : route.fallback());
  await page.goto('/rankings');
  await expect(page.locator('.leader-row')).toBeVisible();
  await page.getByRole('tab', {name:'Gains',exact:true}).click();
  await expect(page.getByText('Ranking data unavailable', {exact:true})).toBeVisible();
  await expect(page.locator('.leader-row')).toHaveCount(0);
  await expect(page.getByText('No rankings found.', {exact:true})).toHaveCount(0);
  await expect(page.getByRole('link', {name:'Report on Discord',exact:true})).toBeVisible();
  await expect(page.locator('.mat-paginator strong')).toHaveText('0 of 0');
  fail = false;
  await page.getByRole('button', {name:'Retry',exact:true}).click();
  await expect(page.locator('.leader-row')).toBeVisible();
  await expect(page.locator('.leader-row dt:visible')).toHaveText(['30d Gain','3d','7d','30d']);
  await expect(page.getByText('Ranking data unavailable', {exact:true})).toHaveCount(0);
  await expect(page.getByRole('tab', {name:'Gains',exact:true})).toHaveAttribute('aria-selected','true');
});

test('Rankings Back cancels pending search and preserves the restored page and forward entry', async ({ page }) => {
  await mockCommunity(page);
  await page.goto('/rankings?tab=gains&page=1&pageSize=20&query=Sirius');
  await expect(page.getByText('Parity Trainer', { exact:true })).toBeVisible();
  const original = page.url();
  await page.getByRole('button', { name:'Clear', exact:true }).click();
  await expect(page.locator('#ranking-search')).toHaveValue('');
  const cleared = page.url();
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.locator('#ranking-search').fill('unfinished draft');
  await page.goBack();
  await expect(page.locator('#ranking-search')).toHaveValue('Sirius');
  await page.clock.runFor(1000);
  await expect(page).toHaveURL(original);
  await expect(page.locator('.mat-paginator strong')).toHaveText('21–40 of 121');
  await page.goForward();
  await expect(page).toHaveURL(cleared);
  await expect(page.locator('#ranking-search')).toHaveValue('');
});

test('Rankings Clear removes the query and resets pagination without changing the selected period', async ({ page }) => {
  await mockCommunity(page);
  const requests: URL[] = [];
  page.on('request', request => { if (request.url().includes('/api/v4/rankings/')) requests.push(new URL(request.url())); });
  await page.goto('/rankings?tab=gains&sortBy=gain_7d&page=1&pageSize=20&query=Sirius');
  await expect(page.getByText('Parity Trainer', { exact:true })).toBeVisible();
  await expect(page.locator('#ranking-search')).toHaveValue('Sirius');
  await page.getByRole('button', { name:'Clear', exact:true }).click();
  await expect(page.locator('#ranking-search')).toHaveValue('');
  await expect(page.getByRole('button', { name:'Clear', exact:true })).toHaveCount(0);
  await expect.poll(() => requests.at(-1)?.searchParams.get('query')).toBeNull();
  expect(requests.at(-1)?.searchParams.get('page')).toBe('0');
  expect(requests.at(-1)?.searchParams.get('sort_by')).toBe('gain_7d');
  expect(new URL(page.url()).searchParams.has('query')).toBe(false);
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  await page.reload();
  await expect(page.locator('#ranking-search')).toHaveValue('');
  await expect(page.getByRole('tab', { name:'Gains', exact:true })).toHaveAttribute('aria-selected','true');
});

test('Clubs restores Angular query filters, pagination, and populated rows', async ({ page }) => {
  await mockCommunity(page); const requests: URL[] = [];
  page.on('request', (request) => { if (request.url().includes('/api/v4/circles/list?')) requests.push(new URL(request.url())); });
  await page.goto('/circles?pageSize=20&query=Sirius&joinStyle=open&hasSpots=true&policy=3');
  await expect(page.getByText('Team Sirius', { exact: true })).toBeVisible();
  await expect(page.getByText('Daily players welcome')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open', exact: true })).toHaveClass(/active/);
  await expect(page.locator('#club-page-size')).toContainText('20');
  await expect.poll(() => requests.at(-1)?.searchParams.get('limit')).toBe('20');
  await expect.poll(() => requests.at(-1)?.searchParams.get('query')).toBe('Sirius');
  await page.getByRole('button', { name: 'Closed' }).click();
  await expect(page.getByText('No clubs match your filters.')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('joinStyle')).toBe('closed');
  await page.getByRole('button', { name: 'Clear all filters' }).click();
  await expect(page.getByText('Team Sirius', { exact: true })).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
  await chooseSelect(page, '#club-page-size', '20');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect.poll(() => requests.at(-1)?.searchParams.get('page')).toBe('1');
  expect(new URL(page.url()).searchParams.get('page')).toBe('1');
});

test('Rankings keeps the selected tab results when an older request finishes last', async ({ page }) => {
  await mockCommunity(page);
  let release!: () => void;
  const delayed = new Promise<void>(resolve => release = resolve);
  await page.route('**/api/v4/rankings/*?*', async route => {
    const monthly = new URL(route.request().url()).pathname.endsWith('/monthly');
    if (monthly) await delayed;
    await route.fulfill({ json: { rankings: [{ viewer_id: 123, trainer_name: monthly ? 'Old monthly trainer' : 'Current gains trainer', rank: 1 }], total: 1, total_pages: 1 } });
  });
  await page.goto('/rankings');
  await page.getByRole('tab', { name: 'Gains', exact: true }).click();
  await expect(page.getByText('Current gains trainer', { exact: true })).toBeVisible();
  const oldResponse = page.waitForResponse(response => response.url().includes('/rankings/monthly?'));
  release();
  await (await oldResponse).finished();
  await expect(page.getByRole('tab', { name: 'Gains', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Current gains trainer', { exact: true })).toBeVisible();
  await expect(page.getByText('Old monthly trainer', { exact: true })).toHaveCount(0);
});

test('Rankings mobile month filters stack and retain the paginator label and controls', async ({ page }) => {
  await mockCommunity(page); await page.goto('/rankings');
  await expect(page.getByText('Parity Trainer',{exact:true})).toBeVisible();
  for (const width of [320,390,768]) {
    await page.setViewportSize({width,height:960});
    const month=await page.locator('#ranking-month').boundingBox(),year=await page.locator('#ranking-year').boundingBox();
    expect(year!.y).toBeGreaterThanOrEqual(month!.y+month!.height);
    expect(year!.width).toBeCloseTo(month!.width,0);
    await expect(page.locator('.mat-paginator>span')).toHaveText('Items per page:');
    await expect(page.locator('.mat-paginator>span')).toBeVisible();
    for (const button of await page.locator('.mat-paginator>button').all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(width < 768 ? 32 : 44);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  }
  await chooseSelect(page,'#ranking-month','January');
  await expect.poll(()=>new URL(page.url()).searchParams.get('month')).toBe('1');
  await chooseSelect(page,'#ranking-page-size','20');
  await page.getByRole('button',{name:'Next page',exact:true}).click();
  await expect.poll(()=>new URL(page.url()).searchParams.get('page')).toBe('1');
  await page.getByRole('button',{name:'Previous page',exact:true}).click();
  await expect.poll(()=>new URL(page.url()).searchParams.has('page')).toBe(false);
});

test('Rankings desktop and mobile values preserve Angular precision, signs, zero and missing data', async ({ page }) => {
  await mockCommunity(page);
  await page.route('**/api/v4/rankings/*?*',route=>route.fulfill({json:{rankings:[{viewer_id:17,trainer_name:'Formatting trainer',rank:1,total_fans:2_000_000_000,monthly_gain:12000,avg_daily:null,active_days:0,total_gain:-12000,avg_day:9999,avg_week:10000,avg_month:1000000,gain_3d:-12500,gain_7d:0,gain_30d:12000}],total:1,total_pages:1}}));
  for (const width of [1536, 768, 390]) {
  await page.setViewportSize({width,height:960});
  await page.goto('/rankings');
  const mobile = width <= 768;
  const values=page.locator('.leader-row dd > span:visible');
  await expect(values).toHaveText(mobile ? ['2.00B','+12.0K'] : ['2,000,000,000','+12,000','-','0d']);
  await expect(page.locator('.leader-row .positive dd')).toHaveCSS('color','rgb(102, 187, 106)');
  await page.getByRole('tab',{name:'All-Time',exact:true}).click();
  await expect(values).toHaveText(mobile ? ['2.00B','1.0M'] : ['2,000,000,000','-12,000','9,999','10,000','1,000,000']);
  for (const [option, selectedLabel] of [['Total fans','Total fans'],['Total gain','Total gain'],['Average per day','Avg/day'],['Average per week','Avg/week'],['Average per month','Avg/month']]) {
    await chooseSelect(page,'#ranking-alltime-sort',option);
    const labels = ['Total fans','Total gain','Avg/day','Avg/week','Avg/month'].filter(label => !mobile || label === 'Total fans' || label === 'Avg/month' || label === selectedLabel);
    await expect(page.locator('.leader-row dt:visible')).toHaveText(labels);
    for (const theme of ['dark','light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await expect(page.locator('.leader-row .emphasized dd')).toHaveCSS('color',theme === 'dark' ? 'rgb(255, 183, 77)' : 'rgb(180, 83, 9)');
      await expect(page.locator('.leader-row .emphasized dt')).toHaveCSS('color','rgba(255, 183, 77, 0.6)');
    }
  }
  await page.getByRole('tab',{name:'Gains',exact:true}).click();
  await expect(values).toHaveText(mobile ? ['+12.0K','-12.5K','+0','+12.0K'] : ['+12,000','+-12,500','+0','+12,000']);
  for (const [option, title, value] of [['3-day gain','3d Gain',mobile ? '-12.5K' : '+-12,500'],['7-day gain','7d Gain','+0'],['30-day gain','30d Gain',mobile ? '+12.0K' : '+12,000']]) {
    await chooseSelect(page,'#ranking-gains-sort',option);
    await expect(page.locator('.leader-row dt').first()).toHaveText(title);
    if (mobile && option !== '30-day gain') {
      await expect(page.locator('.leader-row dt:visible')).toHaveText(['3d','7d','30d']);
      await expect(values).toHaveText(['-12.5K','+0','+12.0K']);
    } else await expect(values.first()).toHaveText(value);
    const summary = page.locator('.leader-row dl>div').first();
    if (option === '30-day gain') await expect(summary).toHaveClass(/emphasized/);
    else await expect(summary).not.toHaveClass(/emphasized/);
    await expect(summary.locator('dd')).toHaveCSS('color','rgb(102, 187, 106)');
    await expect(values).toHaveCount(mobile && option !== '30-day gain' ? 3 : 4);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});

test('Rankings preserves Angular tabs, query aliases, sorting, and page size', async ({ page, isMobile }) => {
  await mockCommunity(page); const requests: URL[] = [];
  page.on('request', (request) => { if (request.url().includes('/api/v4/rankings/')) requests.push(new URL(request.url())); });
  await page.goto('/rankings?tab=gains&page=1&pageSize=20&query=Sirius&sortBy=gain_7d');
  await expect(page.getByText('Parity Trainer', { exact: true })).toBeVisible();
  if (isMobile) await expect(page.getByText('Team Sirius', { exact: true })).not.toBeVisible();
  else await expect(page.getByText('Team Sirius', { exact: true })).toBeVisible();
  await expect(page.locator('.leader-row .identity > strong')).toHaveCSS('font-size', isMobile ? '14px' : '15px');
  await expect(page.locator('.leader-row dd').first()).toHaveCSS('font-size', isMobile ? '11px' : '15px');
  await expect(page.locator('.leader-row .identity > small')).toHaveCount(0);
  await expect(page.locator('.leader-row .identity > a')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Gains' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#ranking-page-size')).toContainText('20');
  await expect.poll(() => requests.at(-1)?.searchParams.get('page')).toBe('1');
  expect(requests.at(-1)?.searchParams.get('query')).toBe('Sirius');
  expect(requests.at(-1)?.searchParams.get('circle_name')).toBe('Sirius');
  expect(requests.at(-1)?.searchParams.get('sort_by')).toBe('gain_7d');
  await page.getByRole('tab', { name: 'All-Time' }).click();
  await expect.poll(() => requests.at(-1)?.pathname).toContain('/rankings/alltime');
  expect(new URL(page.url()).searchParams.get('tab')).toBe('alltime');
  await chooseSelect(page, '#ranking-alltime-sort', 'Total fans');
  await expect.poll(() => requests.at(-1)?.searchParams.get('sort_by')).toBe('total_fans');
  expect(new URL(page.url()).searchParams.get('sortBy')).toBe('total_fans');
  await chooseSelect(page, '#ranking-alltime-sort', 'Average per week');
  const weekly = page.locator('.leader-row dl > div').filter({ has: page.locator('dt', { hasText: 'Avg/week' }) });
  await expect(weekly).toHaveClass(/emphasized/);
  await expect(weekly.locator('dd')).toHaveText('196,000');
  await expect(page.locator('.leader-row dl > div')).toHaveCount(5);
  await expect(page.locator('.leader-row .rank strong')).toHaveText('#5');
  expect(new URL(page.url()).searchParams.get('sortBy')).toBe('avg_week');
  if (isMobile) await page.setViewportSize({ width:1536, height:960 });
  const club = page.getByRole('link', { name: 'Team Sirius', exact: true });
  await expect(club).toHaveAttribute('href', '/circles/7');
  await club.focus(); await club.press('Enter');
  await expect(page).toHaveURL(/\/circles\/7$/);
  await expect(page.getByRole('heading', { name: 'Team Sirius', exact: true })).toBeVisible();
});

test('Club details keeps month navigation, calculated members, preferences, and export', async ({ page }) => {
  await mockCommunity(page); const requests: URL[] = [];
  page.on('request', (request) => { if (request.url().includes('/api/v4/circles?')) requests.push(new URL(request.url())); });
  await page.goto('/circles/7?year=2026&month=8');
  await expect(page.getByRole('heading', { name: 'Team Sirius' }).first()).toBeVisible();
  const members = page.getByRole('region', { name: 'Club members', exact: true });
  await expect(members.getByRole('link', { name: 'McQueen' })).toBeVisible();
  await expect(members.getByRole('link', { name: 'Gold Ship' })).toBeVisible();
  await page.getByRole('button', { name: 'Display Settings' }).click();
  await chooseSelect(page, '#club-member-metric', 'Total Fans');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('circle_details_config') ?? '{}').selectedCalculation)).toBe('total_fans');
  await page.locator('#club-member-search').fill('Gold');
  await expect(members.getByRole('link', { name: 'Gold Ship' })).toBeVisible();
  await expect(members.getByRole('link', { name: 'McQueen' })).toHaveCount(0);
  await page.getByText('Export', { exact: true }).click();
  const download = page.waitForEvent('download'); await page.getByRole('menuitem', { name: 'CSV' }).click();
  await expect((await download).suggestedFilename()).toBe('circle_7_2026_8_stats.csv');
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect.poll(() => requests.at(-1)?.searchParams.get('month')).toBe('9');
  // Angular's month controls are local; the initial deep-link parameters stay unchanged.
  expect(new URL(page.url()).searchParams.get('month')).toBe('8');
});

test('legacy club export URL downloads without changing the route contract', async ({ page }) => {
  await mockCommunity(page);
  const download = page.waitForEvent('download');
  await page.goto('/circles/7/csv?year=2026&month=8');
  await expect((await download).suggestedFilename()).toBe('circle_7_2026_8_stats.csv');
  expect(new URL(page.url()).pathname).toBe('/circles/7/csv');
});

test('Club details exposes populated charts, calendar, row view, and Excel export on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockCommunity(page);
  await page.goto('/circles/7?year=2026&month=8');
  await expect(page.getByRole('region', { name: 'Club Information', exact: true })).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Club progression by observed day' })).toBeVisible();
  await page.getByRole('button', { name: 'Show member calendar' }).click();
  // Mouse movement can open the hover preview over its trigger before a click lands.
  await page.getByRole('button', { name: 'Day 1 contributors', exact: true }).press('Enter');
  await expect(page.getByRole('dialog')).toContainText('Gold Ship');
  await page.getByRole('dialog').getByRole('button', { name: 'Close Day 1 contributors', exact: true }).click();
  await page.getByRole('button', { name: 'Show member rows' }).click();
  await expect(page.getByRole('table')).toContainText('McQueen');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByText('Export', { exact: true }).click();
  const download = page.waitForEvent('download'); await page.getByRole('menuitem', { name: 'Excel (XLSX)' }).click();
  expect((await download).suggestedFilename()).toBe('circle_7_2026_8_stats.xlsx');
});
