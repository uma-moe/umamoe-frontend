import { test, expect, type Page } from './fixtures/test';
import { mockTimeline } from './fixtures/api';
import { detailTimeline, mockTimelineDetails } from './fixtures/timeline-details';

const settle = (page: Page) => page.evaluate(async () => {
  for (let i = 0; i < 12; i++) await new Promise(requestAnimationFrame);
});

async function largeTimeline(page: Page, now = new Date('2026-08-29T12:00:00Z')) {
  await mockTimeline(page, false);
  await page.clock.setFixedTime(now);
  const events = Array.from({ length: 700 }, (_, day) => Array.from({ length: day % 7 === 0 ? 9 : 1 }, (_, event) => ({
    id: `scroll-${day}-${event}`, title: `Release ${day}-${event}`, type: 'story_event', is_confirmed: true,
    global_release_date: new Date(Date.UTC(2025, 5, 26 + day, 22)).toISOString(),
    ...(day % 2 === 0 ? { image_path: 'assets/timeline-images/test.webp' } : {})
  }))).flat();
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: { events } }));
  await page.goto('/timeline');
  await page.getByRole('radio', { name: 'Vertical', exact: true }).click();
  await expect(page.locator('.vertical-date.is-today')).toBeInViewport();
  await settle(page);
}

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop timeline gestures');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route(/\/assets\/.*\.(webp|png)(\?.*)?$/, route => route.request().resourceType() !== 'image' ? route.fallback() : route.fulfill({
    contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="125"><rect width="512" height="125" fill="#769"/></svg>'
  }));
});

test('wheel direction is consistent over cards, with Shift for vertical movement and draggable pickups', async ({ page }) => {
  await mockTimelineDetails(page);
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: {
    events: [...detailTimeline.events, ...Array.from({ length: 12 }, (_, i) => ({ id: `future-${i}`, title: `Future ${i}`,
      type: 'campaign', is_confirmed: true, global_release_date: new Date(Date.UTC(2026, 9 + i, 1)).toISOString() }))]
  } }));
  await page.goto('/timeline');
  const board = page.locator('.timeline-board.desktop');
  const pickup = page.locator('#timeline-event-detail-support .pickups img').first();
  await expect(pickup).toBeVisible();
  await pickup.hover();
  const before = await board.evaluate(node => ({ x: node.scrollLeft, y: node.scrollTop }));
  await page.mouse.wheel(0, 100);
  await expect.poll(() => board.evaluate(node => node.scrollLeft)).toBe(before.x + 100);
  expect(await board.evaluate(node => node.scrollTop)).toBe(before.y);
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 100);
  await page.keyboard.up('Shift');
  await expect.poll(() => board.evaluate(node => node.scrollTop)).toBe(before.y + 100);
  expect(await board.evaluate(node => node.scrollLeft)).toBe(before.x + 100);
  const units = await board.evaluate(node => {
    node.scrollLeft = 0;
    node.dispatchEvent(new WheelEvent('wheel', { deltaY: 3, deltaMode: 1, bubbles: true, cancelable: true }));
    const lines = node.scrollLeft;
    node.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, deltaMode: 2, bubbles: true, cancelable: true }));
    const pages = node.scrollLeft - lines;
    node.scrollLeft = node.scrollWidth;
    const edge = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
    node.dispatchEvent(edge);
    return { lines, pages, width: node.clientWidth, prevented: edge.defaultPrevented };
  });
  expect(units).toEqual({ lines: 54, pages: units.width, width: units.width, prevented: true });
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await pickup.scrollIntoViewIfNeeded();
  await settle(page);
  const box = (await pickup.boundingBox())!;
  const left = await board.evaluate(node => node.scrollLeft);
  let popups = 0;
  page.on('popup', () => popups++);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 70, box.y + box.height / 2, { steps: 8 });
  expect(await board.evaluate(node => node.scrollLeft)).toBeGreaterThan(left + 50);
  await page.mouse.up();
  await settle(page);
  expect(popups).toBe(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Today reaches the correct date repeatedly across unmeasured rows of different heights', async ({ page }) => {
  await largeTimeline(page);
  const board = page.locator('.timeline-board.desktop');
  for (const fraction of [0, 1, .3, .8]) {
    await board.evaluate((node, fraction) => node.scrollTo({ top: node.scrollHeight * fraction, behavior: 'instant' }), fraction);
    await settle(page);
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    const today = board.locator('.vertical-date.is-today');
    await expect(today).toBeInViewport();
    await settle(page);
    expect(Math.abs((await today.boundingBox())!.y - (await board.boundingBox())!.y - 56)).toBeLessThan(3);
    expect(await board.locator('.event-card').count()).toBeLessThan(150);
  }
});

test('refresh restores today in the saved vertical view and one click reaches it from the previous year', async ({ page }) => {
  await largeTimeline(page, new Date('2026-10-02T12:00:00Z'));
  const board = page.locator('.timeline-board.desktop');
  const today = board.locator('.vertical-date.is-today');
  await board.evaluate(node => node.scrollTo({ top: 0, behavior: 'instant' }));
  await settle(page);
  await expect(board.locator('time[datetime^="2025"]').first()).toBeInViewport();

  await page.reload();
  await expect(page.getByRole('radio', { name: 'Vertical', exact: true })).toBeChecked();
  await expect(today).toBeInViewport();
  await expect(today.locator(':scope > header time')).toHaveAttribute('datetime', '2026-10-02');
  await settle(page);
  expect(Math.abs((await today.boundingBox())!.y - (await board.boundingBox())!.y - 56)).toBeLessThan(3);

  await board.evaluate(node => node.scrollTo({ top: 0, behavior: 'instant' }));
  await settle(page);
  await expect(today).toHaveCount(0);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(today).toBeInViewport();
  await expect(today.locator(':scope > header time')).toHaveAttribute('datetime', '2026-10-02');
  await settle(page);
  expect(Math.abs((await today.boundingBox())!.y - (await board.boundingBox())!.y - 56)).toBeLessThan(3);
});

test('Today aligns the destination in one click when the page is scaled', async ({ page }) => {
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.zoom = '1.25'));
  await largeTimeline(page);
  const board = page.locator('.timeline-board.desktop');
  const today = board.locator('.vertical-date.is-today');
  await board.evaluate(node => node.scrollTo({ top: 0, behavior: 'instant' }));
  await settle(page);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(today).toBeInViewport();
  await settle(page);
  expect(Math.abs((await today.boundingBox())!.y - (await board.boundingBox())!.y - 56 * 1.25)).toBeLessThan(3);
});

test('vertical dragging keeps the visible date stable when a buffered row changes height', async ({ page }) => {
  await largeTimeline(page);
  const board = page.locator('.timeline-board.desktop');
  const box = (await board.boundingBox())!;
  await page.mouse.move(box.x + box.width - 35, box.y + box.height - 100);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 35, box.y + box.height - 140, { steps: 4 });
  await settle(page);
  const anchor = await board.evaluate(async node => {
    const top = node.getBoundingClientRect().top + 56;
    const rows = Array.from(node.querySelectorAll<HTMLElement>('.vertical-date'));
    const visible = rows.find(row => row.getBoundingClientRect().bottom > top)!;
    const earlier = rows.find(row => row.getBoundingClientRect().bottom < top)!;
    const result = { key: visible.dataset.laneKey!, y: visible.getBoundingClientRect().top, jumps: [] as number[] };
    earlier.style.minHeight = `${earlier.getBoundingClientRect().height + 150}px`;
    for (let i = 0; i < 12; i++) {
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      result.jumps.push(Math.abs(visible.getBoundingClientRect().top - result.y));
    }
    return result;
  });
  expect(Math.max(...anchor.jumps), 'Height changes must be corrected before the next paint').toBeLessThan(3);
  const row = board.locator(`[data-lane-key="${anchor.key}"]`);
  expect(Math.abs((await row.boundingBox())!.y - anchor.y)).toBeLessThan(3);
  await page.mouse.move(box.x + box.width - 35, box.y + box.height - 160);
  await settle(page);
  expect(Math.abs((await row.boundingBox())!.y - anchor.y + 20)).toBeLessThan(3);
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('vertical dragging does not flash displaced rows between animation frames', async ({ page }) => {
  await page.setViewportSize({ width: 1914, height: 940 });
  await largeTimeline(page);
  const jumps = await page.locator('.timeline-board.desktop').evaluate(async node => {
    const rect = node.getBoundingClientRect();
    const x = rect.right - 35;
    let y = rect.bottom - 100;
    node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
    const positions = () => new Map([...node.querySelectorAll<HTMLElement>('.vertical-date')]
      .filter(row => row.getBoundingClientRect().bottom > rect.top + 56 && row.getBoundingClientRect().top < rect.bottom)
      .map(row => [row.dataset.laneKey!, row.getBoundingClientRect().top]));
    const jumps: number[] = [];
    for (const delta of [...Array(100).fill(24), ...Array(200).fill(-24)]) {
      const before = positions();
      y -= delta;
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      for (const [key, top] of positions()) {
        if (before.has(key)) jumps.push(Math.abs(top - before.get(key)! + delta));
      }
    }
    window.dispatchEvent(new MouseEvent('mouseup'));
    return jumps;
  });
  expect(jumps.length).toBeGreaterThan(100);
  expect(Math.max(...jumps), 'Unrequested movement of a visible date during dragging').toBeLessThan(3);
});
