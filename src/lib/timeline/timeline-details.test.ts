import { describe, expect, it } from 'vitest';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
import { buildTimelinePrediction } from './prediction/timeline-prediction';
import {
  toTimelineCalculation,
  toTimelinePrediction
} from './prediction/timeline-prediction-types';
import {
  timelineCardContext,
  timelineCardRaceLines,
  timelineRaceEventFacts
} from './events/timeline-race-facts';
import {
  buildTimelineRewardSummaries,
  withTimelineRewardFallbacks
} from './events/timeline-reward-summary';
import { timelinePickups } from './events/timeline-pickups';
import type { PlannerRewardEntry } from '../carat-planner/carat-planner';

function event(overrides: Partial<TimelineRecord> = {}): TimelineRecord {
  return {
    id: 'event',
    eventType: 'character_banner',
    title: 'Banner',
    typeLabel: 'Character scout',
    date: new Date('2026-09-10T00:00:00Z'),
    dateLabel: '',
    gachaIds: [],
    pickupCardIds: [],
    relatedCharacters: [],
    relatedSupportCards: [],
    relatedSupportCardNames: [],
    plannerRewardAvailable: false,
    tags: [],
    ...overrides
  };
}

describe('Angular Timeline detail parity', () => {
  it('replaces recurring estimates only with matching positive Carats within one UTC day or an exact ID', () => {
    const reward = (
      id: string,
      label: string,
      available_at: string,
      extra: Partial<PlannerRewardEntry> = {}
    ): PlannerRewardEntry => ({
      id,
      label,
      available_at,
      currency: 'free_jewels',
      amount: 500,
      ...extra
    });

    const rewards = [
      reward('login', 'Cumulative login', '2025-08-14T23:00:00-02:00'),
      reward('valentine', 'Valentine gift', '2026-02-16'),
      reward('white', 'White Day', '2026-03-13'),
      reward('christmas', 'Christmas', '2026-12-11', { amount: 0 }),
      reward('wrong-currency', 'Christmas', '2026-12-11', { currency: 'paid_jewels' }),
      reward('invalid-date', 'Christmas', 'invalid'),
      reward('expected-50-day-login-100', 'Exact published ID', 'invalid', { amount: 0 })
    ];

    const result = withTimelineRewardFallbacks({ rewards }, [
      event({ date: new Date('2026-12-31') })
    ]);

    const addedIds = result.rewards.slice(rewards.length).map((reward) => reward.id);
    expect(addedIds).not.toContain('expected-50-day-login-50');
    expect(addedIds).not.toContain('expected-50-day-login-100');
    expect(addedIds).not.toContain('expected-white-day-gift-2026');
    expect(addedIds).toContain('expected-valentines-gift-2026');
    expect(addedIds).toContain('expected-christmas-gift-2026');
    expect(withTimelineRewardFallbacks(result, [event({ date: new Date('2026-12-31') })])).toEqual(
      result
    );
  });

  it('keeps compact card race lines and context distinct from the richer detail facts', () => {
    const legend = event({ eventType: 'legend_race', description: '3200m - Long - Turf' });
    expect(timelineCardRaceLines(legend)).toEqual(['3200m · Long · Turf']);
    expect(timelineCardContext(legend)).toBe('3200m · Long · Turf');
    expect(timelineRaceEventFacts(legend).map((fact) => fact.label)).toEqual([
      'Course',
      'Distance'
    ]);
    const compact = event({
      eventType: 'champions_meeting',
      description: '<p>Tokyo Turf 1600m (Mile), Counterclockwise Spring Sunny Firm</p>'
    });

    expect(timelineCardRaceLines(compact)).toEqual([
      'Tokyo · Turf',
      '1600m · Mile · Counterclockwise',
      'Spring · Sunny · Firm'
    ]);
    expect(timelineCardContext(compact)).toBe('Tokyo · 1600m · Mile · Turf');
    const split = event({
      eventType: 'league_of_heroes',
      description: '<p>Tokyo - Turf<br>1600m - Mile - Counterclockwise<br>Firm - Spring - Sunny</p>'
    });

    expect(timelineCardRaceLines(split)).toEqual([
      'Tokyo · Turf',
      '1600m · Mile · Counterclockwise',
      'Firm · Spring · Sunny'
    ]);
    expect(timelineCardContext(split)).toBe('Tokyo · 1600m · Mile · Turf');
    expect(timelineCardRaceLines(event({ description: compact.description }))).toEqual([]);
    expect(timelineCardContext(event())).toBe('');
  });

  it('preserves all four prediction models and alternative scores from the live Angular service', () => {
    // Captured by .tmp/timeline-oracle.mjs from the separate Angular checkout's src/app/services.
    const goldens = [
      {
        kind: 'confirmed',
        subtitle: 'Date comes from the confirmed global schedule.',
        fitScore: 0.91296,
        alternatives: []
      },
      {
        kind: 'interpolated',
        subtitle: 'Placed between confirmed JP/global anchors.',
        fitScore: 0.9061600000000001,
        alternatives: [
          { day: 9, fitScore: 0.7852824644482117, reason: 'Schedule + Month shape' },
          { day: 11, fitScore: 0.7852824644482117, reason: 'Schedule + Month shape' },
          { day: 8, fitScore: 0.6919708925981252, reason: 'Schedule + Month shape' },
          { day: 12, fitScore: 0.6359708925981252, reason: 'Schedule + Month shape + Day 12 (10)' }
        ]
      },
      {
        kind: 'extrapolated',
        subtitle: 'Projected from the current catch-up curve.',
        fitScore: 0.85176,
        alternatives: [
          { day: 9, fitScore: 0.7399263057049217, reason: 'Schedule + Month shape' },
          { day: 11, fitScore: 0.7399263057049217, reason: 'Schedule + Month shape' },
          { day: 8, fitScore: 0.6541550628932262, reason: 'Schedule + Month shape' },
          { day: 12, fitScore: 0.5981550628932262, reason: 'Schedule + Month shape + Day 12 (10)' }
        ]
      },
      {
        kind: 'fallback',
        subtitle: 'Projected with the fallback schedule model.',
        fitScore: 0.7181,
        alternatives: [
          { day: 9, fitScore: 0.640580514508358, reason: 'Schedule + Month shape' },
          { day: 11, fitScore: 0.640580514508358, reason: 'Schedule + Month shape' },
          { day: 8, fitScore: 0.586453704039762, reason: 'Schedule + Month shape' },
          { day: 7, fitScore: 0.541325317865468, reason: 'Schedule + Month shape' }
        ]
      }
    ];

    const calculation = toTimelineCalculation({
      confirmed_anchor_count: 60,
      character_banner_gap_likelihoods: [{ value: 10, samples: 12, probability: 0.6 }],
      character_banner_month_day_likelihoods: [
        { value: 10, samples: 20, probability: 0.8 },
        { value: 12, samples: 10, probability: 0.4 }
      ],
      character_banner_weekday_likelihoods: [{ value: 'thursday', samples: 30, probability: 0.8 }]
    });

    for (const golden of goldens) {
      const prediction = toTimelinePrediction({
        kind: golden.kind,
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
      });

      const insight = buildTimelinePrediction(
        event({ predicted: golden.kind !== 'confirmed', prediction }),
        calculation
      )!;

      expect(insight.subtitle).toBe(golden.subtitle);
      expect(insight.fitScore).toBeCloseTo(golden.fitScore, 12);
      expect(insight.metrics).toHaveLength(10);
      expect(
        insight.alternatives.map((a) => ({
          day: a.date.getUTCDate(),
          fitScore: a.fitScore,
          reason: a.reason
        }))
      ).toEqual(golden.alternatives);
    }

    expect(toTimelinePrediction({ kind: 'unknown' })).toBeUndefined();
    expect(buildTimelinePrediction(event())).toBeNull();
  });

  it('keeps Angular race-description layouts and the normal-description fallback', () => {
    const facts = (eventType: string, description: string) =>
      timelineRaceEventFacts(event({ eventType, description })).map(
        ({ label, primary, secondary }) => [label, primary, secondary]
      );

    expect(
      facts(
        'champions_meeting',
        'Tokyo - Turf<br>1600m - Mile - Counterclockwise<br>Firm - Spring - Sunny'
      )
    ).toEqual([
      ['Course', 'Tokyo', 'Turf'],
      ['Distance', '1600m', 'Mile · Counterclockwise'],
      ['Conditions', 'Firm · Spring · Sunny', undefined]
    ]);
    expect(
      facts(
        'league_of_heroes',
        '<h2>Target Races</h2>Nakayama Turf 1200m (short distance), right, outside, winter, daytime<br>Random weather.<h2>Team Formation</h2>Rules'
      )
    ).toEqual([
      ['Course', 'Nakayama', 'Turf'],
      ['Distance', '1200m', 'Short · Right · Outside'],
      ['Conditions', 'Winter · Daytime', undefined]
    ]);
    expect(facts('legend_race', '3200m - Long - Turf')).toEqual([
      ['Course', 'Turf', undefined],
      ['Distance', '3200m', 'Long']
    ]);
    expect(facts('champions_meeting', '1600m')).toEqual([]);
    expect(facts('story_event', 'Tokyo Turf 1600m (Mile) Left')).toEqual([]);
  });

  it('keeps reward totals, placement ranges, fallback rewards, and managed free pulls distinct', () => {
    const events = [
      event({ id: 'story', eventType: 'story_event' }),
      event({ id: 'cm', eventType: 'champions_meeting' }),
      event({ id: 'legend', eventType: 'legend_race', pickupCardIds: [101301, 100601] })
    ];

    const resource = {
      rewards: [
        {
          id: 'published',
          event_id: 'fixed',
          label: 'Gift',
          currency: 'free_jewels' as const,
          amount: 900,
          available_at: '2026-09-10'
        }
      ],
      free_pull_campaigns: [
        {
          id: 'campaign',
          label: 'Free pulls',
          total_pulls: 10,
          default_allocations: [{ event_id: 'fixed', pulls: 10 }]
        }
      ],
      event_benefits: [
        {
          id: 'duplicate',
          event_id: 'fixed',
          campaign_id: 'campaign',
          kind: 'free_pulls',
          label: 'Managed',
          amount: 10,
          available_at: '2026-09-10',
          planner_effect: 'free_pulls'
        }
      ]
    };

    const summaries = buildTimelineRewardSummaries(resource, events);
    expect(buildTimelineRewardSummaries(resource, events)).toBe(summaries);
    expect(buildTimelineRewardSummaries({ ...resource }, [...events])).toEqual(summaries);
    expect(summaries.get('fixed')).toMatchObject({ carats: 900, freePulls: 10, mode: 'fixed' });
    expect(summaries.get('story')).toMatchObject({ carats: 2010, mode: 'fixed' });
    expect(summaries.get('cm')).toMatchObject({ mode: 'placement', previewLabel: 'Finals' });
    expect(summaries.get('cm')!.previewItems[0]?.countLabel).toBe('500–2,500');
    expect(summaries.get('legend')).toMatchObject({
      mode: 'per_opponent',
      previewLabel: 'All clears'
    });

    expect(summaries.get('legend')!.previewItems[0]?.countLabel).toBe('300');
    const filled = withTimelineRewardFallbacks(resource, events);
    expect(withTimelineRewardFallbacks(resource, events)).toBe(filled);
    expect(
      withTimelineRewardFallbacks({ ...resource, rewards: [] }, events).rewards.some(
        (reward) => reward.id === 'published'
      )
    ).toBe(false);

    expect(withTimelineRewardFallbacks(filled, events)).toEqual(filled);
    expect(summaries.get('fixed')!.items[0]?.iconPath).toContain('item_icon_00043');
  });

  it('resolves variants and legacy Legend Race image references through the shared catalog', () => {
    const pickups = timelinePickups(
      event({
        eventType: 'legend_race',
        pickupCardIds: [101301],
        relatedCharacters: [
          'Mejiro McQueen',
          '/assets/images/character_stand/chara_stand_100601.webp'
        ]
      }),
      {
        characters: { '1013': { name: 'Mejiro McQueen' }, '1006': { name: 'Oguri Cap' } },
        supports: new Map()
      }
    );

    expect(pickups.map((p) => [p.id, p.name, p.subLabel])).toEqual([
      ['101301', 'Mejiro McQueen', 'Legend Race participant'],
      ['100601', 'Oguri Cap', 'Legend Race participant']
    ]);
    expect(pickups[0]?.image).toBe('/game-assets/character_thumbs/chara_stand_1013_101301.webp');
    expect(pickups[0]?.gametoraUrl).toBe(
      'https://gametora.com/umamusume/characters/101301-mejiro-mcqueen'
    );
    const support = timelinePickups(
      event({
        eventType: 'support_card_banner',
        pickupCardIds: [20005],
        relatedSupportCards: ['T.M. Opera O']
      }),
      { characters: {}, supports: new Map() }
    );

    expect(support[0]?.gametoraUrl).toBe(
      'https://gametora.com/umamusume/supports/20005-tm-opera-o'
    );
  });
});
