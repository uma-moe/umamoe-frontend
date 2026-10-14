import type { Page } from '@playwright/test';
import { detailRewards, detailTimeline, mockTimelineDetails } from './timeline-details.ts';

const media = 'assets/images/character/banner/2021_30002.webp';
export const cardTypes = ['character_banner', 'support_card_banner', 'paid_banner', 'story_event', 'champions_meeting', 'legend_race', 'campaign', 'league_of_heroes', 'masters_challenge', 'trainer_skills_test', 'factor_research', 'strongest_team', 'racing_carnival', 'scenario_release'];
export const cardTimeline = {
  ...detailTimeline,
  events: [
    ...detailTimeline.events.map(event => event.id === 'detail-banner' ? { ...event, gacha_type: 5, gacha_type_name: 'guaranteed', tags: ['rerun-banner'] } : event),
    ...cardTypes.map(type => ({ id: `card-${type}`, type, title: 'A longer event title that wraps onto a second line', global_release_date: '2026-09-10T00:00:00Z', jp_release_date: '2023-09-10T00:00:00Z', image_path: media, is_confirmed: false })),
    { ...detailTimeline.events[2]!, id: 'cm-media', image_path: media },
    { ...detailTimeline.events[4]!, id: 'legend-media', image_path: media },
    { ...detailTimeline.events[4]!, id: 'legend-no-pickups', image_path: media, pickup_card_ids: [], related_characters: [] },
    { ...detailTimeline.events[0]!, id: 'scout-no-pickups', pickup_card_ids: [], related_characters: [] },
    { ...detailTimeline.events[0]!, id: 'broken-media', image_path: 'https://example.test/missing-card.webp' },
    { ...detailTimeline.events[0]!, id: 'news-event-campaign-994', type: 'campaign', title: 'Umayuru Celebration', image_path: 'assets/timeline-images/events/campaign/994.webp', image: 'https://example.test/source-banner.webp' }
  ]
};

export async function mockTimelineCards(page: Page) {
  await mockTimelineDetails(page);
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: cardTimeline }));
  await page.route('**/resources/test/planner_rewards.json*', route => route.fulfill({ json: { ...detailRewards, competitive_variants: [{ id: 'legend-clear', competition: 'legend_race', event_id: 'legend-no-pickups', label: 'First clear', source_items: [{ item_category: 90, item_id: 43, amount: 300 }] }] } }));
  await page.route('https://example.test/missing-card.webp', route => route.fulfill({ status: 404, body: '' }));
  await page.route('https://example.test/source-banner.webp', route => route.fulfill({ path: 'src/pages/ui/fixtures/timeline-support-banner.webp', contentType: 'image/webp' }));
}
