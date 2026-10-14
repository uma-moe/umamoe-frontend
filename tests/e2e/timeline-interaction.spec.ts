import { expect, test } from './fixtures/test';
import { LANE_WIDTH } from '../../src/lib/timeline/timeline-layout';
import { mockTimeline } from './fixtures/api';
import { detailTimeline, mockTimelineDetails } from './fixtures/timeline-details';

test('Direction changes keep a large timeline bounded and preserve scroll positions', async ({ page, isMobile }, info) => {
  test.skip(isMobile, 'Desktop direction controls');
  await mockTimeline(page);
  const events = Array.from({ length: 1200 }, (_, i) => ({ id: `large-${i}`, title: `Release ${i}`, type: 'story_event', is_confirmed: true, global_release_date: new Date(Date.UTC(2025, 5, 26 + i, 22)).toISOString() }));
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: { events } }));
  await page.goto('/timeline');
  const board = page.locator('.timeline-board.desktop');
  await expect(page.locator('.timeline-today-marker')).toBeInViewport();
  const x = await board.evaluate(node => node.scrollLeft);
  const timings = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    await page.getByRole('radio', { name: 'Vertical', exact: true }).click();
    await expect(board).toHaveClass(/vertical/);
    await expect(board.locator('.vertical-date.is-today')).toBeInViewport();
    timings.push(Math.round(performance.now() - start));
    expect(await board.locator('.event-card').count()).toBeLessThan(100);
    expect((await board.locator('.event-card').first().boundingBox())!.width).toBeLessThanOrEqual(LANE_WIDTH);
    await page.getByRole('radio', { name: 'Horizontal', exact: true }).click();
    await expect.poll(() => board.evaluate(node => node.scrollLeft)).toBeCloseTo(x, 0);
    expect(await board.locator('.event-card').count()).toBeLessThan(40);
  }
  await info.attach('direction-switch-ms', { body: JSON.stringify(timings), contentType: 'application/json' });
  console.log('1200-event direction switches (ms):', timings);
  await page.getByRole('radio', { name: 'Vertical', exact: true }).click();
  await board.evaluate(node => node.scrollTo({ top: node.scrollHeight, behavior: 'instant' }));
  await expect(page.locator('#timeline-event-large-1199')).toBeAttached();
  const y = await board.evaluate(async node => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return node.scrollTop; });
  expect(await board.locator('.event-card').count()).toBeLessThan(100);
    expect((await board.locator('.event-card').first().boundingBox())!.width).toBeLessThanOrEqual(LANE_WIDTH);
  await page.getByRole('radio', { name: 'Horizontal', exact: true }).click();
  await page.getByRole('radio', { name: 'Vertical', exact: true }).click();
  // Newly measured rows can shorten the virtual scroll range at its far end.
  // The browser clamps the saved offset, but the last event must stay visible.
  await expect.poll(() => board.evaluate((node, saved) => node.scrollTop - Math.min(saved, node.scrollHeight - node.clientHeight), y)).toBeCloseTo(0, 0);
  await expect(page.locator('#timeline-event-large-1199')).toBeInViewport();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(board.locator('.vertical-date.is-today')).toBeInViewport();
});

test('Timeline drag moves both axes without opening cards; pickups link to GameTora and filters use their colours', async ({ page, isMobile }, info) => {
  await mockTimelineDetails(page);
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: { events: [...detailTimeline.events, ...Array.from({ length: 12 }, (_, i) => ({ id: `future-${i}`, title: `Future ${i}`, type: 'campaign', is_confirmed: true, global_release_date: new Date(Date.UTC(2026, 9 + i, 1)).toISOString() }))] } }));
  if (!isMobile) await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto('/timeline');
  const card = page.locator('#timeline-event-detail-banner');
  const pickup = card.locator('.pickups a').first();
  await expect(pickup).toHaveAttribute('href', 'https://gametora.com/umamusume/characters/101301-mejiro-mcqueen');
  await page.context().route('https://gametora.com/**', route => route.fulfill({ body: 'GameTora pickup' }));
  const opened = page.waitForEvent('popup');
  await pickup.click();
  const destination = await opened;
  await expect(destination).toHaveURL('https://gametora.com/umamusume/characters/101301-mejiro-mcqueen');
  await destination.close();
  await card.locator('.open-action').click();
  await expect(page.getByRole('dialog').locator('.pickups a').first()).toHaveAttribute('href', 'https://gametora.com/umamusume/characters/101301-mejiro-mcqueen');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  if (!isMobile) {
    const board = page.locator('.timeline-board.desktop');
    const rail = page.locator('[data-ad-placement="timeline_sticky_vrec_right"]');
    await expect(rail).toBeVisible();
    const railBox = (await rail.boundingBox())!;
    expect(railBox.y + railBox.height / 2).toBeCloseTo(page.viewportSize()!.height / 2, 0);
    await page.setViewportSize({ width: 1800, height: 600 });
    const box = (await card.locator('.open-action').boundingBox())!;
    const before = await board.evaluate(node => ({ x: node.scrollLeft, y: node.scrollTop }));
    await page.mouse.move(box.x + 200, box.y + 90);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + 30, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => board.evaluate(node => node.scrollTop)).toBeGreaterThan(before.y);
    await expect.poll(() => board.evaluate(node => node.scrollLeft)).toBeGreaterThan(before.x);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(rail).toBeHidden();
    await page.setViewportSize({ width: 1800, height: 1000 });
    await expect(rail).toBeVisible();
    expect((await rail.boundingBox())!.x).toBe(railBox.x);
    const centered = (await rail.boundingBox())!;
    expect(centered.y + centered.height / 2).toBeCloseTo(page.viewportSize()!.height / 2, 0);
    await expect(page.locator('.month-span > span')).toHaveCount(0);
  }
  await page.getByRole('button', { name: isMobile ? 'Search & filters' : 'Filters', exact: true }).click();
  const filters = page.locator('.filter-popover');
  const colors = await filters.locator('.box').evaluateAll(boxes => boxes.map(box => getComputedStyle(box).backgroundColor));
  expect(new Set(colors).size).toBeGreaterThan(6);
  if (!isMobile) expect((await filters.boundingBox())!.height).toBeLessThan(310);
  await filters.screenshot({ path: info.outputPath('compact-coloured-filters.png') });
});
