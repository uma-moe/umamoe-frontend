import { test, expect, type Page } from './fixtures/test';
import { accountId, mockDatabase, mockTimeline, mockStatistics, mockCommunity, mockProfilePresentation, mockActivity, mockAffinity, mockVeteranProfile, mockOwnerProfile, mockResources, mockAdvertising, veteran, record } from './fixtures/api';
import skills from '../fixtures/resources/skills.json' with { type: 'json' };

const pages: Array<{ name: string; path: string; setup: (page: Page) => Promise<unknown>; ready: string }> = [
  { name: 'database', path: '/database', setup: async page => { await mockDatabase(page); await mockAffinity(page); }, ready: '.inheritance-card' },
  { name: 'timeline', path: '/timeline', setup: mockTimeline, ready: '.event-card' },
  { name: 'planner', path: '/timeline?tab=carat-planner', setup: mockTimeline, ready: '.planner' },
  { name: 'statistics', path: '/tools/statistics', setup: mockStatistics, ready: '[data-testid="selected-samples"]' },
  { name: 'clubs', path: '/circles', setup: mockCommunity, ready: '.club-list' },
  { name: 'club-details', path: '/circles/7?year=2026&month=8', setup: mockCommunity, ready: 'figure' },
  { name: 'rankings', path: '/rankings', setup: mockCommunity, ready: '.leaderboard' },
  { name: 'profile', path: `/profile/${accountId}`, setup: mockProfilePresentation, ready: '.inheritance-card' },
  { name: 'veterans', path: `/veterans/${accountId}`, setup: mockVeteranProfile, ready: 'main' },
  { name: 'activity', path: '/activity', setup: mockActivity, ready: 'main' },
  { name: 'lineage', path: '/tools/lineage-planner', setup: mockAffinity, ready: 'main' }
];

async function prepareMouse(page: Page) {
  await mockAdvertising(page.context()); await mockResources(page.context());
  await page.addInitScript(() => {
    localStorage.setItem('page-introduction-audience-v1', 'existing');
    localStorage.setItem('lastSeenUpdateVersion', '18');
  });
}

async function controlStyles(page: Page, rootSelector = '.route-view') {
  return page.locator(rootSelector).evaluate(root => {
    const selectors = ['.app-page', '.page-sections', '.page-heading', '.event-card', '.veteran-card', '.card-body', '.skill-filter', '.spark-filter', '.filter-shell', '.segments', '.segments button', '.ui-button', '.icon-button', '.select-control', '.tab', '.ranking-row', '.plan', '.filterbar', '.parent-search input', '.parent-row', '.picker-body', '.manual-tree', '.manual-node', '.spark-add'];
    const properties = ['height', 'width', 'padding', 'row-gap', 'column-gap', 'font-size', 'line-height', 'min-height', 'min-width', 'border-radius'];
    return Object.fromEntries(selectors.map(selector => [selector, [...root.querySelectorAll(selector)].filter(node => node.checkVisibility()).slice(0, 8).map(node => {
      const style = getComputedStyle(node);
      return Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)]));
    })]));
  });
}

for (const entry of pages) test(`mobile layout: ${entry.name}`, async ({ page, browser, baseURL, isMobile, userAgent, deviceScaleFactor }, info) => {
  await entry.setup(page);
  await page.goto(entry.path);
  await expect(page.locator(entry.ready).first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: info.outputPath(`${entry.name}.png`), fullPage: true, scale: 'css' });
  await page.screenshot({ path: info.outputPath(`${entry.name}-viewport.png`), scale: 'css' });
  const layout = await page.evaluate(() => ({
    viewport: innerWidth,
    width: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll('main *')].filter(node => {
      const box = node.getBoundingClientRect();
      return box.width && (box.left < -1 || box.right > innerWidth + 1);
    }).slice(0, 12).map(node => ({ tag: node.tagName, class: node.className }))
  }));
  expect(layout.width, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewport);
  // Match the browser, viewport, UA and mobile mode; change only the pointer type.
  const mouseContext = await browser.newContext({ baseURL, viewport: page.viewportSize(), isMobile, userAgent, deviceScaleFactor, hasTouch: false });
  try {
    const mousePage = await mouseContext.newPage();
    await prepareMouse(mousePage);
    await entry.setup(mousePage);
    await mousePage.goto(entry.path);
    await expect(mousePage.locator(entry.ready).first()).toBeVisible();
    await mousePage.evaluate(() => document.fonts.ready);
    // Render the same offscreen lazy content before comparing computed dimensions.
    await mousePage.screenshot({ path: info.outputPath(`${entry.name}-mouse-full.png`), fullPage: true, scale: 'css' });
    await expect.poll(() => controlStyles(page)).toEqual(await controlStyles(mousePage));
    await mousePage.screenshot({ path: info.outputPath(`${entry.name}-mouse.png`), scale: 'css' });
  } finally { await mouseContext.close(); }
});

test('mobile layout: dense veteran chips stay compact and resolve catalog names', async ({ page }, info) => {
  await mockVeteranProfile(page);
  await page.route(`**/api/v4/user/profile/${accountId}`, async route => {
    const item = { ...veteran, skills: skills.slice(0, 20).map(skill => skill.skill_id * 10 + 1) };
    await route.fulfill({ json: { trainer: { account_id: accountId, name: 'Dense roster' }, veterans: [item] } });
  });
  await page.goto(`/veterans/${accountId}`);
  const card = page.locator('.veteran-card');
  await expect(card.locator('.skill-filter')).toHaveCount(20);
  await expect(card.getByRole('button', { name: /Filter by Shooting Star:/ })).toBeVisible();
  await expect(card.getByRole('button', { name: /Filter by Right-Handed ○:/ })).toBeVisible();
  await expect(card).not.toContainText('Unknown Factor');
  const sizes = await card.locator('.spark-filter,.skill-filter').evaluateAll(nodes => nodes.map(node => ({
    button: node.getBoundingClientRect().height,
    chip: node.firstElementChild!.getBoundingClientRect().height
  })));
  for (const size of sizes) {
    expect(size.button).toBeGreaterThanOrEqual(24);
    expect(size.button - size.chip).toBeLessThanOrEqual(6);
  }
  await card.screenshot({ path: info.outputPath('dense-veteran.png'), scale: 'css' });
  await card.locator('.skill-filter').first().tap();
  await expect(card.locator('.skill-filter.matched')).toHaveCount(1);
});

async function openLegacyPicker(page: Page, withTarget = false) {
  await mockDatabase(page); await mockAffinity(page);
  await mockOwnerProfile(page, []); await mockVeteranProfile(page);
  await page.goto('/database');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  if (withTarget) {
    await page.getByRole('button', { name: 'Pick target character', exact: true }).click();
    const characters = page.getByRole('dialog', { name: 'Select Character', exact: true });
    await characters.getByRole('searchbox', { name: 'Search characters' }).fill('Mejiro McQueen');
    await characters.getByRole('radio').first().click();
  }
  await page.getByRole('button', { name: 'Pick your legacy', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Select Parent', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.parent-row')).toHaveCount(1);
  return dialog;
}

test('mobile layout: legacy picker', async ({ page, browser, baseURL, isMobile, userAgent, deviceScaleFactor }, info) => {
  const dialog = await openLegacyPicker(page);
  await page.screenshot({ path: info.outputPath('legacy-picker.png'), scale: 'css' });
  const mouseContext = await browser.newContext({ baseURL, viewport: page.viewportSize(), isMobile, userAgent, deviceScaleFactor, hasTouch: false });
  try {
    const mousePage = await mouseContext.newPage();
    await prepareMouse(mousePage);
    const mouseDialog = await openLegacyPicker(mousePage);
    for (const name of ['Veterans', 'Bookmarks', 'Partner', 'Manual']) {
      await dialog.getByRole('tab', { name: new RegExp(name) }).tap();
      await mouseDialog.getByRole('tab', { name: new RegExp(name) }).click();
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await expect.poll(() => controlStyles(page, 'dialog[open]')).toEqual(await controlStyles(mousePage, 'dialog[open]'));
      await page.screenshot({ path: info.outputPath(`legacy-${name}.png`), scale: 'css' });
    }
  } finally { await mouseContext.close(); }
});

test('mobile layout: parent pairs and database headers stay ordered at narrow widths', async ({ page }, info) => {
  const dialog = await openLegacyPicker(page, true);
  await expect(dialog.locator('.parent-id .affinity')).toHaveCount(2);
  for (const width of [320, 393, 412]) {
    await page.setViewportSize({ width, height: 851 });
    const row = dialog.locator('.parent-row').first();
    const parents = row.locator('.summary-parent');
    await expect(parents).toHaveCount(2);
    const main = (await row.locator('.summary-head').boundingBox())!;
    const p1 = (await parents.nth(0).boundingBox())!;
    const p2 = (await parents.nth(1).boundingBox())!;
    expect(p1.y).toBeGreaterThanOrEqual(main.y + main.height);
    expect(p2.y).toBe(p1.y);
    expect(p2.x).toBeGreaterThan(p1.x);
    expect(Math.abs(p1.width - p2.width)).toBeLessThan(1);
    expect(await row.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.screenshot({ path: info.outputPath(`parent-pair-${width}.png`), scale: 'css' });
  }
  await dialog.getByRole('button', { name: 'Select Grass Wonder', exact: true }).tap();
  await expect(dialog).toBeHidden();

  const item = record();
  item.trainer_name = 'MaybeAnt@Kitasan';
  item.inheritance.main_win_saddles = [30, 100, 101];
  await page.route('**/search/query?*', route => route.fulfill({ json: { items: [item], total: 1, page: 0, limit: 12, total_pages: 1 } }));
  await page.reload();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('radio', { name: 'Advanced', exact: true }).click();
  await page.getByRole('button', { name: 'Pick your legacy', exact: true }).click();
  const updatedResults = page.waitForResponse(response => response.url().includes('/search/query?'));
  await dialog.getByRole('button', { name: 'Select Grass Wonder', exact: true }).tap();
  await updatedResults;
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const card = page.locator('.inheritance-card').first();
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'Optimal Races', exact: true })).toBeVisible();
  await expect(card.locator('.cross-race')).toBeVisible();
  for (const width of [320, 393, 412]) {
    await page.setViewportSize({ width, height: 851 });
    await card.scrollIntoViewIfNeeded();
    const trainer = (await card.locator('.trainer-copy').boundingBox())!;
    const actions = (await card.locator('.record-actions').boundingBox())!;
    const metrics = (await card.locator('.summary-metrics').boundingBox())!;
    const meta = (await card.locator('.summary-meta').boundingBox())!;
    expect(Math.abs(actions.y - trainer.y)).toBeLessThan(1);
    expect(actions.x).toBeGreaterThanOrEqual(trainer.x + trainer.width);
    expect(await card.locator('.record-actions button span').evaluateAll(spans => spans.every(span => getComputedStyle(span).display === 'none'))).toBe(true);
    expect(metrics.y).toBeGreaterThanOrEqual(actions.y + actions.height);
    expect(meta.y).toBeGreaterThanOrEqual(metrics.y + metrics.height);
    expect(await card.locator('.record-header').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await card.screenshot({ path: info.outputPath(`database-card-${width}.png`), scale: 'css' });
  }
  await card.getByRole('button', { name: 'Races', exact: true }).tap();
  await expect(page.getByRole('dialog', { name: 'Race History' })).toBeVisible();
});
