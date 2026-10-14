import { expect, test } from './fixtures/test';
import { mockTimeline } from './fixtures/api';

test('Timeline starts artwork downloads around Today without fetching the opening dates', async ({ page }) => {
  await mockTimeline(page);
  const images: number[] = [];
  await page.route('https://timeline-artwork.test/*.webp', route => {
    images.push(Number(new URL(route.request().url()).pathname.match(/\d+/)![0]));
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="125"><rect width="512" height="125" fill="#436"/></svg>' });
  });
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: { events: Array.from({ length: 180 }, (_, index) => ({
    id: `loading-${index}`, title: `Release ${index}`, type: 'story_event',
    global_release_date: new Date(Date.UTC(2026, 5, 1 + index, 22)).toISOString(),
    is_confirmed: true, image: `https://timeline-artwork.test/${index}.webp`
  })) } }));
  await page.goto('/timeline');
  await expect(page.locator('.timeline-today-marker')).toBeInViewport();
  await expect.poll(() => images.length).toBeGreaterThan(0);
  expect(images.every(index => index > 30), `Downloaded event indices: ${images}`).toBe(true);
});

test('Timeline cards stay compact and usable while artwork loads or fails', async ({ page }, info) => {
  await mockTimeline(page);
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: { events: [{
    id: 'slow-artwork', title: 'Featured banner', type: 'character_banner',
    global_release_date: '2026-09-01T00:00:00Z', is_confirmed: true, planner_data_available: true,
    image: 'https://timeline-artwork.test/slow.webp'
  }] } }));
  let release!: () => void;
  const pending = new Promise<void>(resolve => release = resolve);
  await page.route('https://timeline-artwork.test/slow.webp', async route => { await pending; await route.fulfill({ status: 404 }); });
  try {
    await page.goto('/timeline');
    const card = page.locator('[data-event-id="slow-artwork"]');
    await expect(card.getByRole('heading', { name: 'Featured banner' })).toBeVisible();
    await expect(card.getByRole('img', { name: 'Loading artwork' })).toBeVisible();
    const before = (await card.boundingBox())!.height;
    expect(before).toBeLessThanOrEqual(200);
    const media = (await card.locator('.event-media').boundingBox())!;
    expect(media.width / media.height).toBeCloseTo(512 / 125, 1);
    await card.screenshot({ path: info.outputPath('compact-card-loading.png') });
    await card.getByRole('button', { name: 'Add Featured banner to Carat Planner', exact: true }).click();
    await expect(card.getByRole('button', { name: 'Remove Featured banner from Carat Planner', exact: true })).toBeVisible();
    release();
    await expect(card.getByRole('img', { name: 'Artwork unavailable' })).toBeVisible();
    expect((await card.boundingBox())!.height).toBeCloseTo(before, 0);
  } finally { release(); }
});

test('Timeline shows placeholders while data loads and can retry a failed load', async ({ page }, info) => {
  await mockTimeline(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => release = resolve);
  let fail = true;
  await page.route('**/resources/test/banner_timeline.json*', async route => {
    if (!fail) return route.fallback();
    await pending;
    return route.fulfill({ status: 500, body: 'Unavailable' });
  });
  try {
    await page.goto('/timeline');
    await expect(page.locator('.timeline-loading')).toBeVisible();
    await expect(page.locator('.skeleton-card')).toHaveCount(3);
    await page.screenshot({ path: info.outputPath('timeline-data-loading.png') });
    release();
    await expect(page.getByText('Timeline could not be loaded', { exact: true })).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.locator('.timeline-board')).toBeVisible();
    await expect(page.locator('.timeline-error')).toHaveCount(0);
  } finally { release(); }
});
