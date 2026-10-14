import { expect, test, replaceQuery, type Page } from './fixtures/test';

import { mockDatabase, mockAffinity, record } from './fixtures/api';


test('Database keeps populated Angular results, filter modes, sharing, and Trainer submission', async ({ page, isMobile }) => {
  await mockDatabase(page);
  await page.route('**/support_card_s_30189.webp', (route) => route.fulfill({ status: 404, body: '' }));
  let submitted = '';
  await page.route('**/api/tasks/submit', async (route) => { submitted = (route.request().postDataJSON() as { trainer_id: string }).trainer_id; await route.fulfill({ json: { success: true } }); });
  await page.goto('/database?trainer_id=123456789012');
  await expect(page.getByText('Parity Trainer').first()).toBeVisible();
  await expect(page.getByText('25 records found')).toBeVisible();
  await expect(page.getByTitle('Copy trainer ID 123456789012')).toBeVisible();
  await page.locator('.support-card-section').scrollIntoViewIfNeeded();
  await expect(page.locator('.support-card-section img')).toHaveAttribute('src', '/game-assets/umamusume_cards/tex_support_card_30189.webp');
  await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByRole('radio', { name: 'Advanced' }).click();
  if (isMobile) {
    for (const id of ['characters', 'support', 'search']) await page.locator(`[data-filter-group="${id}"] .group-title`).click();
    for (const name of ['Inheritance Factors', 'Main Parent Factors', 'General Criteria', 'Total Star Count']) {
      const group = page.getByRole('button', { name, exact: true });
      await expect(group).toHaveAttribute('aria-expanded', 'false');
      await group.click();
    }
    await page.getByRole('button', { name: /Race Schedule Filter/ }).click();
  }
  await expect(page.locator('#trainer-id')).toHaveValue('123456789012');
  await expect(page.locator('.legacy-quick')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Preferred White Factors' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Main Parent Factors' })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Training Scenario', { exact: true })).toBeVisible();
  await expect(page.getByText('Main Parent White Categories', { exact: true })).toBeVisible();
  await expect(page.getByText('White Factor Categories', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Race Schedule Filter/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Parent Rank')).toBeVisible();
  await page.getByRole('button', { name: 'Add Trainer ID' }).click();
  await page.getByLabel('Trainer ID').last().fill('123 456 789 012');
  await page.getByRole('dialog', { name: 'Add Trainer ID', exact: true }).getByRole('button', { name: 'Add trainer', exact: true }).click();
  await expect.poll(() => submitted).toBe('123456789012');
  await expect(page.getByText('Trainer ID submitted successfully!')).toBeVisible();
});

test('Database keeps authenticated bookmark loading, stale filters, and removal contracts', async ({ page }, testInfo) => {
  await mockDatabase(page);
  await page.addInitScript(() => localStorage.setItem('auth_token', 'test-token'));
  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { id: 'user-1', display_name: 'Bookmark Tester', created_at: '2026-01-01T00:00:00Z' } }));
  await page.route('**/api/auth/accounts', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/auth/bookmarks', (route) => route.fulfill({ json: [record(), record('999999999999', true)] }));
  let removed = '';
  await page.route('**/api/auth/bookmarks/*', async (route) => { removed = route.request().url().split('/').at(-1) ?? ''; await route.fulfill({ status: 204, body: '' }); });
  await page.goto('/database');
  await page.getByRole('tab', { name: /Bookmarks/ }).click();
  await expect(page.getByText('2 bookmarked records')).toBeVisible();
  const status = page.getByRole('radiogroup', { name: 'Bookmark status filter', exact: true });
  await expect(status.getByRole('radio', { name: 'All (2)', exact: true })).toBeChecked();
  await status.getByRole('radio', { name: 'All (2)', exact: true }).press('ArrowRight');
  await expect(status.getByRole('radio', { name: 'Unchanged (1)', exact: true })).toBeChecked();
  await expect(page.getByText('Modified Trainer', { exact: true })).toHaveCount(0);
  await status.getByRole('radio', { name: 'Modified (1)', exact: true }).click();
  await expect(status.getByRole('radio', { name: 'Modified (1)', exact: true })).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('bookmark-status.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(page.getByText('Modified Trainer').first()).toBeVisible();
  await expect(page.getByText('Parity Trainer').first()).toHaveCount(0);
  await page.getByTitle('Remove bookmark').click();
  await expect.poll(() => removed).toBe('999999999999');
  await expect(page.getByText('Bookmark removed')).toBeVisible();
});

test('Database race schedule keeps Angular calendar encoding and backend saddle filters', async ({ page, isMobile }, testInfo) => {
  await mockDatabase(page);
  let filteredRequest = '';
  page.on('request', (request) => { if (request.url().includes('/search/query?') && request.url().includes('main_win_saddle=')) filteredRequest = request.url(); });
  await page.goto('/database');
  await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByRole('radio', { name: 'Advanced' }).click();
  if (isMobile) await page.getByRole('button', { name: /Race Schedule Filter/ }).click();
  await expect(page.getByRole('button', { name: /Race Schedule Filter/ })).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('Search and add race').fill('Arima Kinen');
  // Result dialogs also contain calendars; assert only the editable filter.
  await expect(page.locator('.schedule-filter .race-schedule .calendar-cell')).toHaveCount(72);
  await expect(page.locator('.schedule-filter .month-label')).toHaveCount(36);
  await expect(page.locator('.schedule-filter .calendar-head').first()).toHaveText('MonthEarlyLate');
  await page.getByRole('button', { name: /Arima Kinen.*Classic Year/ }).first().click();
  await expect(page.getByText('1 selected race · one race per calendar slot')).toBeVisible();
  await expect.poll(() => filteredRequest).toContain('main_win_saddle=');
  await expect.poll(() => new URL(page.url()).searchParams.get('filters')).not.toBeNull();
  await page.getByRole('button', { name: 'Remove Arima Kinen' }).click();
  await page.getByRole('button', { name: 'Add race: Classic Year, Dec Late', exact: true }).click();
  await page.getByRole('button', { name: 'Select Arima Kinen', exact: true }).click();
  await expect(page.getByText('1 selected race · one race per calendar slot')).toBeVisible();
  const schedule = page.locator('.schedule-filter .race-schedule');
  await expect(schedule.locator('.race.inline')).toHaveCount(1);
  expect((await schedule.locator('.race.inline').boundingBox())!.height).toBeLessThan(40);
  await schedule.screenshot({path:testInfo.outputPath('race-picker.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('Database UQL blocks invalid requests and compiles Angular shorthand and directives', async ({ page }) => {
  await mockDatabase(page);
  const requests: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/search/query?')) requests.push(request.url()); });
  const form = Buffer.from(JSON.stringify({ b: [[10, 2, 2]], mwc: 9, sc: '30137' })).toString('base64');
  await page.goto(`/database?filters=${encodeURIComponent(form)}`);
  await expect(page.getByText('Parity Trainer').first()).toBeVisible();
  await page.getByRole('button', { name: /Filters/ }).click();
  // Settle the valid empty-UQL mode search before measuring invalid-query requests.
  // A fixed delay can expire before catalog loading dispatches this request.
  const modeSearch = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/search/query') && !url.searchParams.has('blue_sparks') && url.searchParams.get('sort_by') === 'trending';
  });
  await page.getByRole('radio', { name: 'UQL' }).click();
  await modeSearch;
  await expect(page.locator('#database-uql')).toBeVisible();
  const beforeInvalid = requests.length;
  await replaceQuery(page.locator('#database-uql'), 'mystery_score > 4');
  await expect(page.getByRole('alert')).toContainText('Unknown field or function: mystery_score');
  await page.waitForTimeout(450);
  expect(requests).toHaveLength(beforeInvalid);

  await replaceQuery(page.locator('#database-uql'), 'Speed >= 6 and followers < 1000 and sort by = affinity');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => requests.findLast((url) => new URL(url).searchParams.has('uql')) ?? '').toContain('uql=');
  const query = new URL(requests.findLast((url) => new URL(url).searchParams.has('uql'))!);
  expect(query.searchParams.get('uql')).toBe('overlaps(blue_sparks, (106, 107, 108, 109)) and follower_num < 1000');
  expect(query.searchParams.get('sort_by')).toBe('affinity_score');
  expect(query.searchParams.get('max_follower_num')).toBe('1000');
  for (const key of ['blue_sparks', 'min_win_count', 'support_card_id', 'parent_rank']) expect(query.searchParams.get(key)).toBeNull();

  await replaceQuery(page.locator('#database-uql'), "trainer_name = 'followers and blue stars' and Common white stars >= 3");
  const compiled = "trainer_name = 'followers and blue stars' and common_white_stars_sum >= 3";
  await expect.poll(() => new URL(requests.at(-1)!).searchParams.get('uql')).toBe(compiled);
  expect(new URL(requests.at(-1)!).searchParams.get('max_follower_num')).toBe('999');
  await replaceQuery(page.locator('#database-uql'), 'Main Speed >= 3 and Any GP Long != 2 and Main Straightaway Adept >= 2');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => new URL(requests.at(-1)!).searchParams.get('uql')).toBe('main_blue_factors = 103 and (left_pink_factors != 3402 and right_pink_factors != 3402) and overlaps(main_white_factors, (2003602, 2003603))');
  await page.reload(); await page.getByRole('button', { name: /Filters/ }).click();
  await expect(page.locator('#database-uql')).toContainText('Main Speed >= 3 and Any GP Long != 2 and Main Straightaway Adept >= 2');
  await expect.poll(() => new URL(requests.at(-1)!).searchParams.get('sort_by')).toBe('affinity_score');
});

test('Database UQL restores named expressions before searching and keeps costume, support and scoring controls working', async ({ page }) => {
  await mockDatabase(page);
  const requests: URLSearchParams[] = [];
  page.on('request', request => { if (request.url().includes('/search/query?')) requests.push(new URL(request.url()).searchParams); });
  const raw = 'Main character = Tokai Teio [Anime Collab] and Support card = Kitasan Black [SSR] (Speed) and limitbreak >= 4 and Race wins has Arima Kinen';
  const compiled = 'main_chara_id = 100302 and support_card(30028, lb >= 4) and overlaps(main_win_saddles, (2, 6, 10, 146))';
  const state = Buffer.from(JSON.stringify({ uql: raw })).toString('base64');
  await page.goto(`/database?filters=${encodeURIComponent(state)}`);
  await expect(page.getByText('Parity Trainer').first()).toBeVisible();
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every(request => request.get('uql') === compiled)).toBe(true);
  await page.getByRole('button', { name: /Filters/ }).click();
  const editor = page.getByRole('textbox', { name: 'UQL query', exact: true });
  await expect(editor).toContainText('Tokai Teio [Anime Collab]');
  await expect(page.locator('.uql-status')).toHaveText('Valid');
  // Angular offers character values inside lists; comparison completion is absent there too.
  await replaceQuery(editor, 'Characters in (Tokai Te');
  const apple = await page.evaluate(() => /Mac/.test(navigator.platform) || (/Apple Computer/.test(navigator.vendor) && (/Mobile\/\w+/.test(navigator.userAgent) || navigator.maxTouchPoints > 2)));
  await editor.press(apple ? 'Meta+Space' : 'Control+Space');
  await page.getByRole('option', { name: 'Tokai Teio [Anime Collab]', exact: true }).click();
  await editor.pressSequentially(')');
  await editor.press('Escape');
  await expect.poll(() => requests.at(-1)?.get('uql')).toBe('(main_chara_id in (100302) or left_chara_id in (100302) or right_chara_id in (100302))');
  await replaceQuery(editor, 'Main has all (Groundwork, Ignited Spirit WIT) and Speed + Stamina >= 6');
  await expect.poll(() => requests.at(-1)?.get('uql')).toBe('(overlaps(main_white_factors, (2016001, 2016002, 2016003)) and overlaps(main_white_factors, (2100501, 2100502, 2100503))) and spark_sum(blue_sparks, 10) + spark_sum(blue_sparks, 20) >= 6');
  const guide = page.locator('.uql-wiki-panel');
  await guide.locator('summary').click();
  await guide.getByRole('button', { name: /Scoring & raw syntax/ }).click();
  await guide.getByRole('button', { name: 'Use optional-white parameter example', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.get('uql')).toContain('optional_white(201600, 210050, priority = 0, type_weight = 150, level_weight = 2)');
  const last = requests.at(-1)!.get('uql');
  await page.reload();
  await expect.poll(() => requests.at(-1)?.get('uql')).toBe(last);
  await expect(page.getByText('Parity Trainer').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Database UQL name-load failure preserves the saved query and never sends an unfiltered search', async ({ page }) => {
  await mockDatabase(page);
  await page.route('**/*character_names*', route => route.abort());
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/search/query?')) requests.push(request.url()); });
  const raw = 'Main character = Tokai Teio [Anime Collab]';
  const state = Buffer.from(JSON.stringify({ uql: raw })).toString('base64');
  await page.goto(`/database?filters=${encodeURIComponent(state)}`);
  await expect(page.getByText('UQL unavailable', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(page.getByRole('textbox', { name: 'UQL query', exact: true })).toContainText(raw);
  await page.unroute('**/*character_names*');
  await page.getByRole('button', { name: 'Reload UQL', exact: true }).click();
  await expect(page.getByText('Parity Trainer').first()).toBeVisible();
  expect(requests.every(url => new URL(url).searchParams.get('uql') === 'main_chara_id = 100302')).toBe(true);
});

test('Database UQL retains cursor completion, editing, the Angular guide and clear behavior', async ({ page, isMobile }) => {
  await mockDatabase(page);
  const requests: URLSearchParams[] = [];
  page.on('request', request => { if (request.url().includes('/search/query?')) requests.push(new URL(request.url()).searchParams); });
  await page.goto('/database');
  await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByRole('radio', { name: 'UQL' }).click();
  const editor = page.getByRole('textbox', { name: 'UQL query', exact: true });
  const appleKeyboard = await page.evaluate(() => /Mac/.test(navigator.platform) || (/Apple Computer/.test(navigator.vendor) && (/Mobile\/\w+/.test(navigator.userAgent) || navigator.maxTouchPoints > 2)));
  const modifier = appleKeyboard ? 'Meta' : 'Control';
  await expect(editor).toBeVisible();
  await expect(page.getByText('SQL for your umas', { exact: true })).toBeVisible();
  await replaceQuery(editor, 'Spe'); await editor.press(`${modifier}+Space`);
  const speed = page.getByRole('option', { name: 'Speed', exact: true });
  await expect(speed).toBeVisible();
  // CodeMirror replaces its list when async results arrive; re-query instead of measuring a detached row.
  if (isMobile) await expect.poll(async () => (await speed.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  // CodeMirror deliberately ignores completion keys for 75ms after opening.
  await page.waitForTimeout(100);
  await editor.press('Tab');
  await expect(editor).toContainText('Speed'); await expect(editor).toBeFocused();
  await editor.pressSequentially(' >= 3'); await editor.press('Escape');
  await expect.poll(() => requests.at(-1)?.get('uql')).toBe('overlaps(blue_sparks, (103, 104, 105, 106, 107, 108, 109))');
  await replaceQuery(editor, 'Speed >= 3 and GP1 Lon'); await editor.press(`${modifier}+Space`);
  await page.getByRole('option', { name: 'Long', exact: true }).click();
  await editor.pressSequentially(' >= 2'); await editor.press('Escape');
  await expect(editor).toContainText('GP1 Long >= 2');
  await expect.poll(() => requests.at(-1)?.get('uql')).toContain('left_pink_factors in (3402, 3403)');
  await editor.pressSequentially('0'); await editor.press(`${modifier}+z`);
  await expect(editor).not.toContainText('GP1 Long >= 20');
  await editor.press(appleKeyboard ? 'Meta+Shift+Z' : 'Control+y');
  await expect(editor).toContainText('GP1 Long >= 20');
  await replaceQuery(editor, 'Speed >= 3 and GP1 Long >= 2');
  const guide = page.locator('.uql-wiki-panel');
  if (isMobile) expect((await guide.locator('summary').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await guide.locator('summary').click();
  for (const [topic, heading] of [
    ['Fields & properties', 'Fields and properties'], ['Scopes & matching', 'Scopes and matching semantics'],
    ['Operators', 'Operators and expressions'], ['Values & names', 'Values, skills, and readable names'],
    ['Directives & sorting', 'Editor directives and sorting'], ['Scoring & raw syntax', 'White-skill ranking and raw functions']
  ]) {
    await guide.getByRole('button', { name: new RegExp(topic!) }).click();
    await expect(guide.getByRole('heading', { name: heading!, exact: true })).toBeVisible();
    if (isMobile) expect((await guide.getByRole('button', { name: new RegExp(topic!) }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await guide.getByRole('button', { name: 'Use example: White count >= 12', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.get('uql')).toContain('white_count >= 12');
  await guide.locator('summary').click();
  await replaceQuery(editor, "has Straightaway Adept");
  await expect(page.locator('.uql-cm-chip')).toContainText('Straightaway Adept');
  await page.screenshot({ path: test.info().outputPath('uql-editor.png') });
  const clear = page.getByRole('button', { name: 'Clear UQL', exact: true });
  if (isMobile) expect((await clear.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await clear.click(); await expect(editor).toBeFocused();
  await expect.poll(() => requests.at(-1)?.get('uql')).toBeNull();
  await expect(clear).toHaveCount(0);
  for (const width of isMobile ? [390, 320] : [1536]) {
    await page.setViewportSize({ width, height: 844 });
    await guide.locator('summary').click();
    await guide.getByRole('button', { name: /Scoring & raw syntax/ }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await guide.screenshot({ path: test.info().outputPath(`uql-guide-${width}.png`) });
    await guide.locator('summary').click();
  }
});

test('Database Plan consumes the legacy one-shot transfer in Lineage Planner', async ({ page }) => {
  await mockDatabase(page);
  await page.goto('/database');
  const popupPromise = page.waitForEvent('popup');
  await page.getByTitle('Open in Lineage Planner').click();
  const planner = await popupPromise;
  await expect(planner.getByRole('heading', { name: 'Lineage Planner' })).toBeVisible();
  await expect(planner.getByRole('button', { name: /Change Parent 1: Mejiro McQueen/ })).toBeVisible();
  await expect(planner.getByRole('button', { name: /Change Grandparent 1: Oguri Cap/ })).toBeVisible();
  await expect(planner.getByRole('button', { name: /Change Grandparent 2: Satono Diamond/ })).toBeVisible();
  expect(await planner.evaluate(() => localStorage.getItem('planner_transfer'))).toBeNull();
});

test('Database exposes the Angular Race History action without another API service', async ({ page }) => {
  await mockDatabase(page);
  await page.goto('/database');
  await expect(page.getByText('Parity Trainer').first()).toBeVisible();
  await page.getByTitle('View race results for main parent').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Race History' })).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel(/February Stakes, G1/).first()).toBeVisible();
  await page.getByRole('button', { name: 'List view', exact: true }).click();
  await expect(page.getByText('1st').first()).toBeVisible();
  const list = await page.getByRole('button', { name: 'List view', exact: true }).boundingBox();
  await page.mouse.move(list!.x + list!.width / 2, list!.y + list!.height / 2);
  await page.mouse.down();
  await page.mouse.move(2, 2);
  await page.mouse.up();
  await expect(page.getByRole('dialog', { name: 'Race History', exact: true })).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(page.getByRole('dialog', { name: 'Race History', exact: true })).not.toBeVisible();
});

for (const mode of ['advanced', 'uql']) test(`Database ${mode} pagination replaces results, restores page links and resets on filter changes`, async ({ page }) => {
  await mockDatabase(page);
  const requests: number[] = [];
  await page.route('**/search/query?*', async route => {
    const query = new URL(route.request().url()).searchParams;
    const currentPage = Number(query.get('page'));
    requests.push(currentPage);
    const item = record(String(123456789012 + currentPage));
    item.trainer_name = `Page ${currentPage + 1} Trainer`;
    item.inheritance.inheritance_id = currentPage + 1;
    await route.fulfill({json:{items:[item],total:36,page:currentPage,limit:12,total_pages:3}});
  });
  const filters = mode === 'uql' ? `&filters=${encodeURIComponent(Buffer.from(JSON.stringify({uql:'Speed >= 3'})).toString('base64'))}` : '';
  await page.goto(`/database?page=2${filters}`);
  const cards = page.locator('.inheritance-card');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('Page 2 Trainer');
  await page.getByRole('button',{name:'Next page',exact:true}).click();
  await expect(cards).toContainText('Page 3 Trainer');
  await expect(page).toHaveURL(/page=3/);
  await expect(page.getByRole('button',{name:'Next page',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Previous page',exact:true}).click();
  await expect(cards).toContainText('Page 2 Trainer');
  await page.reload();
  await expect(cards).toContainText('Page 2 Trainer');
  await page.getByRole('button',{name:'Display options',exact:true}).click();
  await page.getByRole('button',{name:'Include accounts at the maximum follower limit',exact:true}).click();
  await expect(cards).toContainText('Page 1 Trainer');
  await expect(page.getByRole('button',{name:'Previous page',exact:true})).toBeDisabled();
  expect(requests).toContain(2);
});

test('Database preserves existing cards and dialogs during infinite loading, failure and retry', async ({ page }) => {
  await mockDatabase(page);
  await mockAffinity(page);
  let releaseMore!: () => void;
  const morePending = new Promise<void>((resolve) => releaseMore = resolve);
  let attempts = 0;
  let moreSucceeds = false;
  const firstPage = Array.from({ length: 12 }, (_, index) => { const item = record(String(123456789012 + index)); item.inheritance.inheritance_id = index + 1; return item; });
  const lastRecord = record('999999999999', true);
  lastRecord.inheritance.inheritance_id = 13;
  await page.route('**/search/query?*', async (route) => {
    const currentPage = Number(new URL(route.request().url()).searchParams.get('page'));
    if (currentPage === 0) {
      await route.fulfill({ json: { items: firstPage, total: 13, page: 0, limit: 12, total_pages: 2 } });
    } else {
      attempts++;
      if (!moreSucceeds) {
        await morePending;
        await route.fulfill({ status: 503, json: { detail: 'Temporarily unavailable' } });
      } else {
        await route.fulfill({ json: { items: [lastRecord], total: 13, page: 1, limit: 12, total_pages: 2 } });
      }
    }
  });
  try {
    await page.goto('/database');
    await page.getByTitle('View race results for main parent').first().click();
    const dialog = page.getByRole('dialog', { name: 'Race History', exact: true });
    await expect(dialog).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => attempts).toBe(1);
    await expect(page.locator('.inheritance-card')).toHaveCount(12);
    await expect(dialog).toBeVisible();
    releaseMore();
    await expect(page.getByText('More records could not be loaded', { exact: true })).toBeVisible();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
    const failedAttempts = attempts;
    moreSucceeds = true;
    await page.getByRole('button', { name: 'Retry loading more' }).click();
    await expect(page.locator('.inheritance-card')).toHaveCount(13);
    await expect(page.getByText('More records could not be loaded', { exact: true })).toHaveCount(0);
    expect(attempts).toBe(failedAttempts + 1);
  } finally { releaseMore(); }
});

test('Database synchronizes result display controls and exposes source affinity on desktop and touch', async ({ page, isMobile }, testInfo) => {
  await mockDatabase(page);
  await mockAffinity(page);
  await page.route('**/search/query?*', (route) => route.fulfill({ json: { items: [record(), record('999999999999', true)], total: 2, page: 0, limit: 12, total_pages: 1 } }));
  await page.goto('/database');
  const cards = page.locator('.inheritance-card');
  await expect(cards).toHaveCount(2);
  const first = cards.first();
  await expect(first.locator('.support-card-section img')).toHaveAttribute('src', '/assets/images/support_card/half/support_card_s_30189.webp');
  await expect(first.locator('.record-footer')).toContainText('Verified');
  await expect(first.locator('.record-footer time')).toHaveAttribute('datetime', '2026-08-28T12:00:00Z');
  const toggle = page.getByRole('button', { name: 'Display options', exact: true });
  await expect(page.locator('#database-display-options')).toBeHidden();
  const bottoms = await page.locator('.display-toggle, #database-sort').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().bottom));
  expect(Math.abs(bottoms[0]! - bottoms[1]!)).toBeLessThanOrEqual(1);
  await toggle.click();
  await expect(page.getByRole('combobox', { name: 'Spark display', exact: true })).toBeVisible();
  await first.getByRole('button', { name: 'Total affinity breakdown', exact: true }).click();
  const total = page.getByRole('dialog', { name: 'Total affinity breakdown', exact: true });
  await expect(total).toBeVisible();
  await expect(total).toContainText('Base:');
  const box = await total.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await total.getByRole('button', { name: 'Close Total affinity breakdown' }).click();
  await expect(total).not.toBeVisible();
  await expect(first.getByRole('button', { name: 'Total affinity breakdown', exact: true })).toBeFocused();

  await first.getByRole('button', { name: 'Main parent affinity breakdown', exact: true }).click();
  const source = page.getByRole('dialog', { name: 'Main parent affinity breakdown', exact: true });
  await expect(source).toContainText('Base:');
  await expect(source).toContainText('Race:');
  await page.keyboard.press('Escape');
  await expect(source).not.toBeVisible();
  // Affinity inspection must not also select the parent underneath it.
  await expect(first.getByTitle('Focus primary parent sparks; click again to clear')).toHaveAttribute('aria-pressed', 'false');

  await first.getByRole('button', { name: 'Per Inh.', exact: true }).click();
  await cards.last().scrollIntoViewIfNeeded();
  await expect(cards.last().getByRole('button', { name: 'Per Run', exact: true })).toBeVisible();
  await expect(cards.getByRole('button', { name: 'Per Run', exact: true })).toHaveCount(2);
  await first.getByRole('button', { name: '★ Stars', exact: true }).click();
  await expect(cards.getByRole('button', { name: '× Occurrences', exact: true })).toHaveCount(2);
  await first.getByTitle('Focus primary parent sparks; click again to clear').click();
  await expect(first.getByRole('button', { name: '× Occurrences', exact: true })).toHaveCount(0);
  await expect(first.locator('.factor-source[data-owner="main"]')).not.toHaveCount(0);
  await expect(first.locator('.factor-source[data-owner="left"]')).toHaveCount(0);
  await first.getByTitle('Focus primary parent sparks; click again to clear').click();
  await expect(first.getByRole('button', { name: '× Occurrences', exact: true })).toBeVisible();

  const whiteSections = cards.locator('.white-section').filter({ has: page.locator('summary', { hasText: 'Normal whites' }) });
  await expect(whiteSections).toHaveCount(2);
  await whiteSections.first().locator('summary').click();
  await expect(whiteSections.first()).not.toHaveAttribute('open');
  await expect(whiteSections.last()).not.toHaveAttribute('open');
  await whiteSections.last().locator('summary').click();
  await expect(whiteSections.first()).toHaveAttribute('open');
  await expect(whiteSections.last()).toHaveAttribute('open');
  if (isMobile) {
    const focusFits = await page.locator('.focus-options').evaluate((container) => { const frame = container.getBoundingClientRect(); return [...container.querySelectorAll('button')].every((button) => { const box = button.getBoundingClientRect(); return box.top >= frame.top && box.bottom <= frame.bottom; }); });
    expect(focusFits).toBe(true);
    const centers = await first.locator('.source-affinity').evaluateAll((elements) => elements.map((element) => { const box = element.getBoundingClientRect(); return box.y + box.height / 2; }));
    expect(centers).toHaveLength(3);
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
    for (const selector of ['.spark-modes button', '.white-section summary', '.inspect .trigger']) {
      const heights = await first.locator(selector).evaluateAll((elements) => elements.filter((element) => element.getBoundingClientRect().height > 0).map((element) => element.getBoundingClientRect().height));
      expect(heights.length).toBeGreaterThan(0);
      for (const height of heights) expect(height).toBeGreaterThanOrEqual(24);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await first.screenshot({ path: testInfo.outputPath('inheritance-result.png') });
});

test('Database keeps records usable when affinity resources fail and can retry without reloading', async ({ page }) => {
  await mockDatabase(page);
  await mockAffinity(page);
  let fail = true;
  await page.route('**/resources/manifest.json*', (route) => fail ? route.fulfill({ status: 503, body: 'Resource service unavailable' }) : route.fallback());
  await page.goto('/database');
  await expect(page.getByText('Parity Trainer').first()).toBeVisible();
  const failure = page.locator('.inheritance-results .banner').filter({ hasText: 'Affinity details unavailable' });
  await expect(failure).toBeVisible();
  await expect(failure.getByRole('link', { name: 'Report on Discord' })).toBeVisible();
  await page.getByRole('button', { name: 'Total affinity breakdown', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Total affinity breakdown', exact: true })).toContainText('Stored record score');
  await page.keyboard.press('Escape');
  fail = false;
  await failure.getByRole('button', { name: 'Retry affinity' }).click();
  await expect(failure).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Main parent affinity breakdown', exact: true })).toBeVisible();
});

test('Database highlights selected factors without highlighting other parent sources', async ({ page }) => {
  await mockDatabase(page);
  await mockAffinity(page);
  const state = Buffer.from(JSON.stringify({ b: [[10, 5, 5]] })).toString('base64');
  await page.goto(`/database?filters=${encodeURIComponent(state)}`);
  const card = page.locator('.inheritance-card');
  await expect(card.locator('.matched-filter')).toHaveCount(1);
  await expect(card.locator('.matched-filter')).toContainText('Speed');
  await expect(card.locator('.matched-filter .spark')).toHaveCSS('border-color','rgb(255, 215, 0)');
  await card.getByTitle('Focus primary parent sparks; click again to clear').click();
  await expect(card.locator('.matched-filter')).toHaveCount(0);
  await card.getByTitle('Focus primary parent sparks; click again to clear').click();
  await expect(card.locator('.matched-filter')).toHaveCount(1);
});

test('Database retains the P1–P2 race summary and support limit breaks without hiding mobile metrics', async ({ page, isMobile }, testInfo) => {
  await mockDatabase(page);
  await mockAffinity(page);
  const shared = record();
  shared.inheritance.main_win_saddles = [30, 30];
  shared.support_card.limit_break_count = 2;
  const separate = record('999999999999', true);
  separate.inheritance.main_win_saddles = [];
  await page.route('**/search/query?*', route => route.fulfill({ json: { items: [shared, { ...separate, support_card: { support_card_id: 30189 } }], total: 2, page: 0, limit: 12, total_pages: 1 } }));
  const filters = Buffer.from(JSON.stringify({ t: [106701], p2c: 1006, p2w: [30] })).toString('base64');
  await page.goto(`/database?filters=${encodeURIComponent(filters)}`);
  const cards = page.locator('.inheritance-card');
  const first = cards.filter({ has: page.getByTitle('Copy trainer ID 123456789012') });
  const summary = first.getByLabel('Inheritance summary');
  const crossRace = summary.locator('.cross-race');
  await expect(crossRace).toHaveText('3P1–P2 Race');
  await expect(crossRace.locator('strong')).toHaveCSS('color', 'rgb(255, 202, 40)');
  await expect(summary.locator('.stat > span')).toHaveText(['Affinity', 'P1–P2 Race', 'G1 Wins', 'White Skills', 'Score']);
  await expect(cards.nth(1).locator('.cross-race')).toHaveCount(0);
  await expect(cards.nth(1).locator('.limit-break')).toHaveCount(0);
  await first.getByRole('button', { name: 'Total affinity breakdown', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Total affinity breakdown', exact: true })).toContainText('Includes P1–P2 races: 3');
  await page.keyboard.press('Escape');
  const limitBreak = first.getByLabel('Limit break 2 of 4', { exact: true });
  await expect(limitBreak.locator('svg')).toHaveCount(4);
  await expect(limitBreak.locator('svg.filled')).toHaveCount(2);
  await expect(limitBreak.locator('svg.filled').first()).toHaveCSS('fill', 'rgb(100, 181, 246)');
  for (const [theme, main, parent] of [['light', 'rgb(163, 79, 63)', 'rgb(37, 99, 235)'], ['dark', 'rgb(217, 147, 131)', 'rgb(100, 181, 246)']]) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await expect(first.locator('.source-affinity[data-owner="main"]')).toHaveCSS('color', main);
    await expect(first.locator('.source-affinity[data-owner="left"]')).toHaveCSS('color', parent);
  }
  for (const width of isMobile ? [390, 320] : [1536, 768]) {
    await page.setViewportSize({ width, height: 960 });
    const geometry = await summary.evaluate(element => ({ overflow: element.scrollWidth > element.clientWidth, height: element.getBoundingClientRect().height }));
    expect(geometry.overflow, `Summary content fits at ${width}px`).toBe(false);
    expect(geometry.height).toBeLessThanOrEqual(100);
    await expect(summary.getByText('White Skills', { exact: true })).toBeVisible();
    await expect(summary.locator('.rank-score')).toBeVisible();
    if (width <= 768) {
      await expect(first.locator('.support-card-section')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      const support = await first.locator('.support-card-section').evaluate(element => {
        const frame = element.getBoundingClientRect(); const image = element.querySelector('.art')!.getBoundingClientRect();
        return { frame, image };
      });
      expect(support.image.top).toBeGreaterThanOrEqual(support.frame.top);
      expect(support.image.bottom).toBeLessThanOrEqual(support.frame.bottom);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await first.screenshot({ path: testInfo.outputPath(`inheritance-pair-${width}.png`) });
  }
  await page.goto(`/database?filters=${encodeURIComponent(Buffer.from('{}').toString('base64'))}`);
  await expect(first.locator('.cross-race')).toHaveCount(0);
  await expect(first.locator('.source-affinity.breeding')).toHaveCount(3);
  for (const [theme, color] of [['light', 'rgb(163, 79, 63)'], ['dark', 'rgb(217, 147, 131)']]) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await expect(first.locator('.source-affinity').first()).toHaveCSS('color', color);
  }
});

test('Database keeps the scenario logo and score aligned on mobile without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDatabase(page);
  await page.goto('/database');
  await expect(page.getByText('Parity Trainer').first()).toBeVisible();
  await expect(page.locator('.record-actions button')).toHaveCount(5);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const summary = page.locator('.record-stats').first();
    await expect(summary).toBeVisible();
    const geometry = await summary.evaluate((element) => {
      const centers = [...element.querySelectorAll('.scenario-mark, .rank-score')].map((child) => { const box = child.getBoundingClientRect(); return box.y + box.height / 2; });
      return { height: element.getBoundingClientRect().height, spread: Math.max(...centers) - Math.min(...centers), overflow: element.scrollWidth > element.clientWidth };
    });
    expect(geometry.height).toBeLessThanOrEqual(100);
    expect(geometry.spread).toBeLessThanOrEqual(1);
    expect(geometry.overflow, `Summary contents must fit at ${width}px, not only the page`).toBe(false);
  }
  const geometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport);
});

test('Database keeps Angular mobile filter groups compact until explicitly opened', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDatabase(page);
  await page.goto('/database');
  await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByRole('radio', { name: 'Advanced' }).click();

  await expect(page.getByRole('button', { name: 'Inheritance Factors' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Main Parent Factors' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'General Criteria' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: /Race Schedule Filter/ })).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('button', { name: 'General Criteria' }).click();
  await expect(page.getByLabel('Parent Rank')).toBeVisible();
  await expect(page.getByLabel('Parent Rank').locator('img')).toBeVisible();

  const geometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport);
});

test('Database search errors stay inside the result body without breaking filters', async ({ page }) => {
  await page.route('**/search/query?*', (route) => route.fulfill({ status: 500, json: { message: 'Database temporarily unavailable' } }));
  await page.goto('/database');

  const results = page.locator('.inheritance-results');
  await expect(results.getByRole('heading', { name: 'Results' })).toBeVisible();
  await expect(results.getByRole('alert')).toContainText('Inheritance search unavailable');
  await expect(results.getByRole('alert')).toContainText('500 Internal Server Error');
  await expect(results.getByRole('link', { name: 'Report on Discord' })).toHaveAttribute('href', 'https://discord.uma.moe/');
  await expect(page.locator('.content-container > .banner')).toHaveCount(0);

  await page.getByRole('button', { name: /Filters/ }).click();
  await expect(page.locator('[data-filter-group="affinity"]')).toBeVisible();
});
