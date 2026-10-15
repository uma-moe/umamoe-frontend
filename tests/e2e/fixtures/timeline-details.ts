import { expect, type Page } from '@playwright/test';
import { mockTimeline } from './api.ts';

export async function loadVisibleTimelineEvents(page: Page) {
  while (await page.locator('.lane-overflow').count()) {
    const key = await page
      .locator('.lane-overflow')
      .first()
      .locator('..')
      .getAttribute('data-lane-key');

    const lane = page.locator(`[data-lane-key="${key}"]`);
    const before = await lane.evaluate((element) => {
      const sentinel = element.querySelector('.lane-overflow');
      if (!sentinel) return null;
      const count = element.querySelectorAll('.event-card').length;
      sentinel.scrollIntoView({ block: 'end', behavior: 'instant' });
      return count;
    });

    if (before === null) continue;
    await expect.poll(() => lane.locator('.event-card').count()).toBeGreaterThan(before);
  }
}

const prediction = {
  kind: 'extrapolated',
  acceleration_rate: 0.78,
  schedule_adjustment_days: 2,
  anchor_global_date: '2026-08-01T00:00:00Z',
  anchor_jp_date: '2023-08-01T00:00:00Z',
  calendar_likelihood: {
    month_character_banner_count: 3,
    month_character_banner_count_probability: 0.7,
    weekday: 'thursday',
    weekday_probability: 0.8,
    day_of_month: 10,
    day_of_month_probability: 0.8,
    previous_character_gap_days: 10,
    previous_character_gap_probability: 0.6,
    next_character_gap_days: 10,
    next_character_gap_probability: 0.6,
    score: 0.7
  }
};

const dates = {
  global_release_date: '2026-09-10T00:00:00Z',
  jp_release_date: '2023-09-10T00:00:00Z',
  estimated_end_date: '2026-09-20T00:00:00Z'
};

export const detailTimeline = {
  calculation: {
    confirmed_anchor_count: 60,
    character_banner_gap_likelihoods: [{ value: 10, samples: 12, probability: 0.6 }],
    character_banner_month_day_likelihoods: [
      { value: 10, samples: 20, probability: 0.8 },
      { value: 12, samples: 10, probability: 0.4 }
    ],
    character_banner_weekday_likelihoods: [{ value: 'thursday', samples: 30, probability: 0.8 }]
  },
  events: [
    {
      ...dates,
      id: 'detail-banner',
      type: 'character_banner',
      title: 'Mejiro McQueen Pickup',
      description: '<p>Featured character pickup.</p>',
      gacha_id: 9001,
      pickup_card_ids: [101301, 100601],
      related_characters: ['Mejiro McQueen', 'Oguri Cap'],
      planner_data_available: true,
      is_confirmed: false,
      prediction,
      image_path: 'assets/images/character/banner/2021_30002.webp',
      umapyoi_url: 'https://umamusume.com/news/detail/fixture',
      gametora_url: 'https://gametora.com/umamusume'
    },
    {
      ...dates,
      id: 'detail-support',
      type: 'support_card_banner',
      title: 'Kitasan Black Support',
      gacha_id: 9002,
      pickup_card_ids: [20066, 30028],
      related_support_cards: ['Kitasan Black', 'Kitasan Black'],
      planner_data_available: true,
      is_confirmed: true,
      prediction: { kind: 'confirmed' }
    },
    {
      ...dates,
      id: 'detail-cm',
      type: 'champions_meeting',
      title: 'Mile Champions Meeting',
      description:
        '<p>Tokyo - Turf<br>1600m - Mile - Counterclockwise<br>Firm - Spring - Sunny</p>',
      is_confirmed: true
    },
    {
      ...dates,
      id: 'detail-story',
      type: 'story_event',
      title: 'Summer story',
      description: '<h2>Summer memories</h2><p>Complete all chapters to earn rewards.</p>',
      is_confirmed: true
    },
    {
      ...dates,
      id: 'detail-legend',
      type: 'legend_race',
      title: 'Legend Race',
      pickup_card_ids: [101301, 100601],
      related_characters: ['Mejiro McQueen', 'Oguri Cap'],
      description: '3200m - Long - Turf',
      is_confirmed: true
    }
  ]
};

export const detailGachas = {
  gachas: [
    {
      event_id: 'detail-banner',
      gacha_id: 9001,
      gacha_type: 3,
      banner_kind: 'character',
      start_date: dates.global_release_date,
      end_date: dates.estimated_end_date,
      free_pulls: 10,
      free_pulls_source_url: 'https://umamusume.com/news/free-pulls',
      pickups: [
        { pickup_id: 101301, label: 'Character 101301', rate: 0.0075 },
        { pickup_id: 100601, label: 'Character 100601', rate: 0.0075 }
      ],
      rarity_rates: [
        { rarity: 3, rate: 0.03 },
        { rarity: 2, rate: 0.18 },
        { rarity: 1, rate: 0.79 }
      ]
    },
    {
      event_id: 'detail-support',
      gacha_id: 9002,
      gacha_type: 3,
      banner_kind: 'support',
      start_date: dates.global_release_date,
      end_date: dates.estimated_end_date,
      free_pulls: 20,
      pickups: [
        { pickup_id: 20066, label: 'Support Card 20066', rate: 0.0225 },
        { pickup_id: 30028, label: 'Support Card 30028', rate: 0.0075 }
      ],
      rarity_rates: [
        { rarity: 3, rate: 0.03 },
        { rarity: 2, rate: 0.18 },
        { rarity: 1, rate: 0.79 }
      ]
    }
  ]
};

export const detailRewards = {
  rewards: [
    {
      id: 'banner-gift',
      event_id: 'detail-banner',
      currency: 'free_jewels',
      amount: 900,
      label: 'Banner gift',
      available_at: '2026-09-10',
      default_enabled: true
    }
  ],
  event_benefits: [
    {
      id: 'selector',
      event_id: 'detail-banner',
      kind: 'trainee_selector',
      item_id: 164,
      amount: 1,
      label: 'Trainee selector',
      available_at: '2026-09-10',
      planner_effect: 'linked_inventory_benefit'
    }
  ],
  free_pull_campaigns: [
    {
      id: 'free',
      label: 'Free pulls',
      total_pulls: 10,
      default_allocations: [{ event_id: 'detail-banner', gacha_id: 9001, pulls: 10 }]
    }
  ]
};

export async function mockTimelineDetails(page: Page): Promise<void> {
  await mockTimeline(page);
  await page.route('**/resources/test/banner_timeline.json*', (route) =>
    route.fulfill({ json: detailTimeline })
  );

  await page.route('**/resources/test/planner_core.json*', (route) =>
    route.fulfill({
      json: {
        jewel_cost_per_pull: 150,
        gacha_shard_by_event: { 'detail-banner': '2026', 'detail-support': '2026' }
      }
    })
  );

  await page.route('**/resources/test/planner_gacha_2026.json*', (route) =>
    route.fulfill({ json: detailGachas })
  );

  await page.route('**/resources/test/planner_rewards.json*', (route) =>
    route.fulfill({ json: detailRewards })
  );
}
