import { test, expect } from './fixtures/test';
import { mockTimeline } from './fixtures/api';
import { loadVisibleTimelineEvents } from './fixtures/timeline-details';

test('Timeline keeps compact artwork cards and Carat Planner preserves banner alignment', async ({ page, isMobile }, info) => {
  await mockTimeline(page);
  const artworkModules: string[] = [];
  page.on('request', request => {
    if (request.resourceType() === 'script' && /\/timeline-images\/.*\.webp/.test(request.url())) artworkModules.push(request.url());
  });
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: { events: [{
    id: 'artwork-entry', type: 'character_banner', title: 'Featured banner', is_confirmed: true, planner_data_available: true,
    global_release_date: '2026-09-01T00:00:00Z', image_path: 'assets/images/character/banner/2021_30002.webp'
  }] } }));
  await page.goto('/tools');
  await page.getByRole('button', { name:'Open Timeline subsections', includeHidden:true }).first().evaluate((node: HTMLButtonElement) => node.click());
  await page.locator('.navigation-subsections a[href="/timeline"]').first().evaluate((node: HTMLAnchorElement) => node.click());
  const art = page.locator('[data-event-id="artwork-entry"] img').first();
  await expect(art).toBeVisible();
  await expect.poll(() => art.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
  expect(artworkModules).toEqual([]);
  const card = page.locator('[data-event-id="artwork-entry"]');
  expect((await card.boundingBox())!.height).toBeLessThanOrEqual(isMobile ? 200 : 195);
  if (!isMobile) expect((await card.boundingBox())!.width).toBe(285);
  const media = (await card.locator('.event-media').boundingBox())!;
  expect(media.width / media.height).toBeCloseTo(512 / 125, 1);
  await card.screenshot({path:info.outputPath('compact-timeline-card.png')});
  await card.getByRole('button',{name:'Add Featured banner to Carat Planner',exact:true}).click();
  await page.goto('/timeline?tab=carat-planner');
  const target = page.locator('.target').filter({has:page.getByText('Featured banner',{exact:true})});
  const image = target.locator('.target-title > img');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((node:HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
  for (const width of isMobile ? [390,320] : [1536,1301,1024,768]) {
    await page.setViewportSize({width,height:900});
    await expect(image).toHaveCSS('object-fit','contain');
    const boxes = await target.locator('.target-title > img,.banner-identity,.target-controls').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()));
    expect(boxes[0].right).toBeLessThanOrEqual(boxes[1].left);
    expect(boxes[1].right).toBeLessThanOrEqual(width);
    const header = (await target.locator('.target-title').boundingBox())!;
    expect(boxes[2].x >= header.x + header.width - 1 || boxes[2].y >= header.y + header.height - 1).toBe(true);
    expect(await target.evaluate(node=>node.scrollWidth <= node.clientWidth)).toBe(true);
    await target.screenshot({path:info.outputPath(`planner-banner-${width}.png`),scale:'css'});
  }
});

test('Timeline preserves grouped-event expansion, marker order, spacing and the mobile filter sheet', async ({ page, isMobile }) => {
  await mockTimeline(page);
  const events = ['campaign', 'paid_banner', 'story_event', 'support_card_banner', 'character_banner'].map((type, index) => ({ id: `group-${index}`, type, title: `Grouped release ${index}`, global_release_date: '2026-09-01T22:00:00Z', jp_release_date: '2024-09-01T22:00:00Z', is_confirmed: true }));
  events.push({ ...events[0]!, id: 'december', title: 'December release', global_release_date: '2026-12-01T22:00:00Z' });
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: { events, anniversaries: [{ index: 1, label: 'First anniversary', jp_date: '2024-09-01', global_date: '2026-09-01T22:00:00Z', is_confirmed: true }] } }));
  await page.goto('/timeline');
  const lane = page.locator('[data-lane-key="2026-09-01"]');
  await expect(lane).toBeVisible();
  if (isMobile) {
    await expect(lane.locator('.event-card')).toHaveCount(5);
    await expect(page.getByRole('radiogroup', { name: 'Timeline direction' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Search & filters', exact: true }).click();
    const sheet = page.locator('.mobile-filter-sheet');
    await expect(sheet).toBeVisible();
    const toolbarBox = (await page.getByRole('navigation', { name: 'Timeline actions' }).boundingBox())!;
    const sheetBox = (await sheet.boundingBox())!;
    expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(toolbarBox.y + 1);
    expect((await sheet.getByRole('searchbox').boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await sheet.getByRole('button', { name: 'Unselect all' }).click();
    await expect(page.locator('.timeline-board .event-card')).toHaveCount(0);
    await sheet.getByRole('button', { name: 'Select all', exact: true }).click();
    await sheet.getByRole('searchbox').fill('Grouped release 4');
    await page.getByRole('button', { name: 'Close filters', exact: true }).click();
    await expect(page.locator('.timeline-board .event-card')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Search & filters', exact: true })).toBeFocused();
  } else {
    await expect(page.getByRole('button', { name: 'Compact gaps', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await lane.locator('[id^="timeline-event-"]').evaluateAll(nodes => nodes.slice(0,3).map(node => node.id))).toEqual(['timeline-event-group-4', 'timeline-event-group-3', 'timeline-event-group-1']);
    await loadVisibleTimelineEvents(page);
    await expect(lane.locator('.event-card')).toHaveCount(5);
    await expect(lane.getByRole('button', { name: /Show .*events/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Compact gaps', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Compact gaps', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('radio', { name: 'Vertical', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Compact gaps', exact: true })).toBeDisabled();
    await expect(lane.locator('.event-card')).toHaveCount(5);
    await expect(page.locator('.month-header').filter({ hasText: 'September' })).toContainText('5 events');
    expect((await lane.locator('.event-card').first().boundingBox())!.width).toBe(285);
    await page.reload();
    await expect(page.getByRole('radio', { name: 'Vertical', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('button', { name: 'Compact gaps', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    // The shared filter popover can cover the card's center; keyboard activation also verifies stacked overlays.
    await lane.locator('.open-action').first().focus();
    await lane.locator('.open-action').first().press('Enter');
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.locator('.filter-popover')).toBeVisible();
    await page.getByRole('button', { name: 'Close filters' }).click();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Long timelines mount a bounded window and Today returns from the far end', async ({ page, isMobile }) => {
  await mockTimeline(page);
  const events = Array.from({ length: 180 }, (_, index) => ({ id: `long-${index}`, title: `Release ${index}`, type: 'story_event', global_release_date: new Date(Date.UTC(2026, 5, 1 + index, 22)).toISOString(), jp_release_date: '2024-06-01T22:00:00Z', is_confirmed: true }));
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: { events } }));
  await page.goto('/timeline');
  const board = page.locator('.timeline-board');
  await expect(board).toBeVisible();
  await expect(page.locator('.timeline-today-marker')).toBeInViewport();
  expect(await board.locator('.event-card').count()).toBeLessThan(40);
  if (isMobile) {
    await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await expect(page.locator('#timeline-event-long-179')).toBeAttached();
    await page.locator('#timeline-event-long-179').scrollIntoViewIfNeeded();
    await expect(page.locator('#timeline-event-long-179')).toBeInViewport();
    expect(await board.locator('.event-card').count()).toBeLessThan(40);
    // Like Angular, the action bar hides when the footer enters the viewport.
    await page.evaluate(() => scrollBy({ top: -innerHeight, behavior: 'instant' }));
  } else {
    const beforeWheel = await board.evaluate(node => node.scrollLeft);
    await board.hover({ position: { x: 80, y: 12 } });
    await page.mouse.wheel(0, 480);
    await expect.poll(() => board.evaluate(node => node.scrollLeft)).toBeGreaterThan(beforeWheel);
    const afterWheel = await board.evaluate(node => node.scrollLeft);
    await page.mouse.wheel(0, -240);
    await expect.poll(() => board.evaluate(node => node.scrollLeft)).toBeLessThan(afterWheel);
    const height = (await board.boundingBox())!.height;
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    expect((await board.boundingBox())!.height).toBeCloseTo(height, 0);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await board.evaluate(node => node.scrollTo({ left: node.scrollWidth, behavior: 'instant' }));
    await expect(page.locator('#timeline-event-long-179')).toBeInViewport();
    await board.focus();
    const before = await board.evaluate(node => node.scrollLeft);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => board.evaluate(node => node.scrollLeft)).toBeLessThan(before);
  }
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.locator('.timeline-today-marker')).toBeInViewport();
  expect(await board.locator('.event-card').count()).toBeLessThan(40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Timeline wheel preserves tall stacks, trackpad scrolling and browser zoom', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Mouse wheel behavior applies to the desktop timeline.');
  await mockTimeline(page);
  const events = Array.from({ length: 46 }, (_, index) => ({ id: `wheel-${index}`, title: `Release ${index}`, type: 'story_event', global_release_date: new Date(Date.UTC(2026, 8, Math.max(1, index - 4), 22)).toISOString(), jp_release_date: '2024-09-01T22:00:00Z', is_confirmed: true }));
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: { events } }));
  await page.setViewportSize({ width: 1536, height: 600 });
  await page.goto('/timeline');
  const board = page.locator('.timeline-board');
  const lane = page.locator('[data-lane-key="2026-09-01"]');
  await loadVisibleTimelineEvents(page);
  await board.evaluate(node => node.scrollTo({ top: 0, behavior: 'instant' }));
  await lane.locator('.event-card').first().hover();
  const before = await board.evaluate(node => ({ left: node.scrollLeft, top: node.scrollTop }));
  await page.mouse.wheel(0, 180);
  await expect.poll(() => board.evaluate(node => node.scrollLeft)).toBeGreaterThan(before.left);
  expect(await board.evaluate(node => node.scrollTop)).toBe(before.top);
  const horizontal = await board.evaluate(node => node.scrollLeft);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 180);
  await page.keyboard.up('Shift');
  await expect.poll(() => board.evaluate(node => node.scrollTop)).toBeGreaterThan(before.top);
  expect(await board.evaluate(node => node.scrollLeft)).toBe(horizontal);
  await board.hover({ position: { x: 80, y: 12 } });
  await page.mouse.wheel(160, 0);
  await expect.poll(() => board.evaluate(node => node.scrollLeft)).toBeGreaterThan(horizontal);
  const zoom = await board.evaluate(node => {
    const before = node.scrollLeft;
    const event = new WheelEvent('wheel', { deltaY: 120, ctrlKey: true, bubbles: true, cancelable: true });
    node.dispatchEvent(event);
    return { moved: node.scrollLeft !== before, prevented: event.defaultPrevented };
  });
  expect(zoom).toEqual({ moved: false, prevented: false });
  await page.getByRole('radio', { name: 'Vertical', exact: true }).click();
  await board.evaluate(node => node.scrollTo({ top: 0, behavior: 'instant' }));
  await board.hover({ position: { x: 200, y: 100 } });
  await page.mouse.wheel(0, 180);
  await expect.poll(() => board.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  expect(await board.evaluate(node => node.scrollLeft)).toBe(0);
});

test('Timeline uses the Angular mobile feed up to 1149px without overwriting desktop preferences', async ({ page }) => {
  await mockTimeline(page);
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.addInitScript(() => localStorage.setItem('umamoe.timeline.desktop-preferences.v1', JSON.stringify({ direction: 'vertical', spacing: 'calendar' })));
  await page.goto('/timeline');
  await expect(page.locator('.mobile-feed')).toBeVisible();
  expect((await page.locator('.mobile-feed').boundingBox())!.width).toBeCloseTo((await page.locator('[data-page-content]').boundingBox())!.width, 0);
  await expect(page.getByRole('radiogroup', { name: 'Timeline direction' })).toHaveCount(0);
  await page.setViewportSize({ width: 1150, height: 900 });
  await expect(page.locator('.timeline-board.vertical')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Vertical', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: 'Compact gaps', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.addStyleTag({ content: 'html{overflow-y:scroll;scrollbar-gutter:stable}::-webkit-scrollbar{width:15px}' });
  for (const width of [1699, 1700, 1714, 1715, 1699]) {
    await page.setViewportSize({ width, height: 1080 });
    const rail = page.locator('[data-ad-placement="timeline_sticky_vrec_right"]');
    if (width >= 1700) await expect(rail).toBeVisible();
    else await expect(rail).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('Timeline retains its full-width track and planner retains the wide container across tab changes', async ({ page, isMobile }, testInfo) => {
  await mockTimeline(page, false);
  const events = Array.from({ length: 1000 }, (_, index) => ({ id: `retained-${index}`, title: `Release ${index}`, type: 'story_event', global_release_date: new Date(Date.UTC(2025, 5, 26 + index, 22)).toISOString(), jp_release_date: '2024-06-01T22:00:00Z', is_confirmed: true }));
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: { events } }));
  if (!isMobile) await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto('/timeline');
  const board = page.locator('.timeline-board');
  await expect(page.locator('.timeline-today-marker')).toBeInViewport();
  const originalBoard = (await board.elementHandle())!;
  const position = await board.evaluate(node => ({ left: node.scrollLeft, top: scrollY }));
  const tabs = page.getByRole('navigation', { name: 'Timeline tools' });
  if (isMobile) {
    const header = page.locator('.page-heading');
    await expect(header).toBeInViewport();
    const bar = (await page.locator('.utility-bar').boundingBox())!;
    expect((await header.boundingBox())!.y).toBeCloseTo(bar.y + bar.height, 0);
  }
  // Do not let Playwright scroll the desktop heading into view in the long mobile feed.
  await tabs.getByRole('link', { name: /Carat Planner/ }).evaluate((node: HTMLAnchorElement) => node.click());
  await expect(board).toBeHidden();
  expect(await originalBoard.evaluate(node => node.isConnected)).toBe(true);
  const planner = page.locator('.planner');
  await expect(planner).toBeVisible();
  const originalPlanner = (await planner.elementHandle())!;
  await planner.locator('.assumption-bar').click();
  await expect(page.locator('#planner-setup-workspace')).toBeVisible();
  await page.locator('#planner-balance-freeJewels').fill('32100');
  for (let turn = 0; turn < 2; turn++) {
    await tabs.getByRole('link', { name: 'Timeline', exact: true }).evaluate((node: HTMLAnchorElement) => node.click());
    await expect(board).toBeVisible();
    expect(await originalBoard.evaluate(node => node.isConnected)).toBe(true);
    expect(await originalPlanner.evaluate(node => node.isConnected)).toBe(true);
    await expect.poll(() => board.evaluate(node => node.scrollLeft)).toBeCloseTo(position.left, 0);
    if (isMobile) await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(position.top, 0);
    expect(await board.locator('.event-card').count()).toBeLessThan(40);
    const box = (await board.boundingBox())!;
    expect(box.width).toBeCloseTo((await page.locator('[data-page-content]').boundingBox())!.width, 0);
    await expect(page.locator('[data-route-id="timeline"]')).toHaveAttribute('data-page-width', 'wide');
    expect(box.width).toBeCloseTo((await page.locator('[data-page-frame]').boundingBox())!.width, 0);
    await expect(page.locator('[data-ad-position]')).toHaveCount(isMobile ? 0 : 1);
    if (!isMobile) await expect(page.locator('[data-ad-placement="timeline_sticky_vrec_right"]')).toBeVisible();
    if (!isMobile) {
      const footerBox = (await page.locator('.site-footer').boundingBox())!;
      expect(box.y + box.height).toBeCloseTo(footerBox.y, 0);
      expect(footerBox.y + footerBox.height).toBeCloseTo(page.viewportSize()!.height, 0);
    }
    if (!isMobile) {
      const heading = (await page.locator('.page-heading').boundingBox())!;
      const toolbar = (await page.locator('.toolbar').boundingBox())!;
      expect(heading.width).toBeLessThanOrEqual(1760);
      expect(toolbar.x).toBeCloseTo(heading.x, 0);
      expect(toolbar.width).toBeCloseTo(heading.width, 0);
      expect(box.width).toBeGreaterThan(heading.width);
    }
    await page.screenshot({ path: testInfo.outputPath('timeline-full-width.png') });
    await tabs.getByRole('link', { name: /Carat Planner/ }).evaluate((node: HTMLAnchorElement) => node.click());
    await expect(page.locator('#planner-setup-workspace')).toBeVisible();
    await expect(page.locator('#planner-balance-freeJewels')).toHaveValue('32100');
    await expect(page.locator('[data-ad-position]')).toHaveCount(2);
    if (isMobile) await expect(page.locator('.ad-rail--right')).toBeHidden();
    else {
      await expect(page.locator('.ad-rail--right')).toBeVisible();
      expect((await planner.boundingBox())!.width).toBe(1760);
      expect((await planner.boundingBox())!.width).toBeLessThan((await page.locator('[data-page-frame]').boundingBox())!.width);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Timeline leaves space for the footer through resizing and mobile navigation', async ({ page }, testInfo) => {
  await mockTimeline(page, false);
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.goto('/timeline');
  const footer = page.locator('.site-footer');
  for (const direction of ['Horizontal', 'Vertical']) {
    await page.getByRole('radio', { name: direction, exact: true }).click();
    for (const viewport of [{ width: 1536, height: 960 }, { width: 1150, height: 600 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      const board = page.locator('.timeline-board');
      await expect.poll(async () => {
        const boardBox = (await board.boundingBox())!, footerBox = (await footer.boundingBox())!;
        return Math.abs(boardBox.y + boardBox.height - footerBox.y);
      }).toBeLessThan(1);
      await expect.poll(async () => {
        const box = (await footer.boundingBox())!;
        return Math.abs(box.y + box.height - viewport.height);
      }).toBeLessThan(1);
      await page.screenshot({ path: testInfo.outputPath(`timeline-footer-${direction}-${viewport.width}.png`) });
    }
  }
  // The full-width timeline also keeps the footer visible on short desktop windows.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  const shortFooter = (await footer.boundingBox())!;
  expect(shortFooter.y + shortFooter.height).toBeCloseTo(720, 0);
  await expect(footer.getByRole('link', { name: 'Privacy', exact: true })).toBeInViewport();
  for (const width of [390, 640, 767]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('.mobile-feed')).toBeVisible();
    await expect.poll(async () => {
      await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      const footerBox = (await footer.boundingBox())!;
      return Math.abs(footerBox.y + footerBox.height - page.viewportSize()!.height);
    }).toBeLessThan(1);
    await expect(footer.getByRole('link', { name: 'Privacy', exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`timeline-footer-${width}.png`) });
  }
});
