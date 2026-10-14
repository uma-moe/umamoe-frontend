import { expect, test } from './fixtures/test';
import { detailTimeline, mockTimelineDetails } from './fixtures/timeline-details';

test('confirmed story and campaign artwork matches the linked English news posts', async ({ page }) => {
  await mockTimelineDetails(page);
  const events = [{ ...detailTimeline.events[2], id: 'news-event-campaign-1002', type: 'campaign',
    title: 'Bonus Star Piece rewards in Career!', is_confirmed: true,
    image: 'https://prd-info-umamusume.akamaized.net/announce/1002/Thumbnail/banner_25800002.png',
    image_path: 'assets/timeline-images/events/campaign/1002.webp',
    umapyoi_url: 'https://umapyoi.net/en/news/1002', expectedImage: '/assets/timeline-images/en/events/campaign/1002.webp' },
  { ...detailTimeline.events[3], id: 'story-event-10_intertwined_memories_banner',
    title: 'Intertwined Memories, Galloping Thoughts', image_path: 'assets/images/story/10_intertwined_memories_banner.webp',
    umapyoi_url: 'https://umapyoi.net/en/news/1023', expectedImage: '/assets/timeline-images/en/images/story/10_intertwined_memories_banner.webp' },
  { ...detailTimeline.events[2], id: 'campaign-199', type: 'campaign',
    title: 'Fall G1 Celebration Missions, Part 2: JBC Series', image_path: 'assets/images/campaign/199.webp',
    umapyoi_url: 'https://umapyoi.net/en/news/1001', expectedImage: '/assets/timeline-images/en/images/campaign/199.webp' }];
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: { events } }));
  await page.goto('/timeline');
  for (const event of events) {
    await page.locator(`.event-card[data-event-id="${event.id}"]`).getByRole('button', { name: /^Open details for / }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('link', { name: 'News post' })).toHaveAttribute('href', event.umapyoi_url);
    await expect(dialog.locator('img.banner')).toHaveAttribute('src', event.expectedImage);
    await expect.poll(() => dialog.locator('img.banner').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
  }
});

test('Gray Week shows all published rates at their original precision', async ({ page }) => {
  await mockTimelineDetails(page);
  const pickups = [100601, 100602, 100702, 100703, 101301, 101302, 101303, 102001, 102002,
    102101, 102102, 102301, 102302, 102303, 103801, 103802, 110601].map(pickup_id => ({
      pickup_id, rate: [100702, 100703, 102102, 102303, 110601].includes(pickup_id) ? .001764 : .001765,
      exchangeable: true
    }));
  const event = { ...detailTimeline.events[0], gacha_id: 30332, gacha_type: 3,
    pickup_card_ids: pickups.map(p => p.pickup_id), image_path: 'assets/images/character/banner/2025_30332.webp' };
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: { events: [event] } }));
  await page.route('**/resources/test/planner_gacha_2026.json*', route => route.fulfill({ json: { gachas: [{
    event_id: event.id, gacha_id: 30332, gacha_type: 3, banner_kind: 'character',
    start_date: event.global_release_date, end_date: event.estimated_end_date,
    provenance: 'jp_master', confidence: 'exact', pickups, featured_pickups: pickups,
    rarity_rates: [{ rarity: 3, rate: .03 }, { rarity: 2, rate: .18 }, { rarity: 1, rate: .79 }]
  }] } }));
  await page.goto('/timeline');
  await page.getByRole('button', { name: /^Open details for / }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('0.1764% per pull', { exact: true })).toHaveCount(5);
  await expect(dialog.getByText('0.1765% per pull', { exact: true })).toHaveCount(12);
  await expect(dialog.getByText('3★ pool 3.00% · Published banner rates')).toBeVisible();
});

test('each Aries Cup retains the artwork and news source for its own edition', async ({ page }) => {
  await mockTimelineDetails(page);
  const base = detailTimeline.events[2]!;
  const events = [
    { ...base, id: 'champions-meeting-11', title: 'Aries Cup', is_confirmed: true,
      image_path: 'assets/timeline-images/events/champions-meeting/global-747.webp',
      umapyoi_url: 'https://umapyoi.net/en/news/747', description: 'Nakayama - Turf<br>2000m - Medium - Clockwise' },
    { ...base, id: 'champions-meeting-23', title: 'Aries Cup', is_confirmed: false,
      image_path: 'assets/timeline-images/events/champions-meeting/1271.webp',
      umapyoi_url: 'https://umapyoi.net/news/1271?lang=jp', description: 'Kyoto - Turf<br>3200m - Long - Clockwise' }
  ];
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: { events } }));
  await page.goto('/timeline');
  for (const [index, event] of events.entries()) {
    const card = page.locator(`.event-card[data-event-id="${event.id}"]`);
    await card.getByRole('button', { name: /^Open details for / }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('link', { name: 'News post' })).toHaveAttribute('href', event.umapyoi_url);
    await expect(dialog.locator('img.banner')).toHaveAttribute('src', index === 0
      ? '/assets/timeline-images/en/events/champions-meeting/global-747.webp'
      : '/assets/timeline-images/jp/events/champions-meeting/1271.webp');
    await expect.poll(() => dialog.locator('img.banner').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
  }
});
