import { buildTimelineRewardSummaries } from './planner-reward-summary';

describe('buildTimelineRewardSummaries', () => {
  it('shows every quantified reward for a timeline event without overflow shorthand', () => {
    const summaries = buildTimelineRewardSummaries({
      rewards: [
        { id: 'carats', event_id: 'anniversary', label: 'Carats', currency: 'free_jewels', amount: 1700, available_at: '2026-09-02' },
        { id: 'uma-ticket', event_id: 'anniversary', label: 'Uma ticket', currency: 'uma_ticket', amount: 2, available_at: '2026-09-02' },
        { id: 'support-ticket', event_id: 'anniversary', label: 'Support ticket', currency: 'support_ticket', amount: 2, available_at: '2026-09-02' },
      ],
      event_benefits: [{
        id: 'selector', event_id: 'anniversary', kind: 'trainee_selector', label: 'Selector', amount: 1,
        item_id: 178, available_at: '2026-09-02', planner_effect: 'informational',
      }],
      free_pull_campaigns: [],
    });

    expect(summaries.get('anniversary')?.label).toBe('1,700 Carats \u00b7 4 tickets \u00b7 1 selector');
    expect(summaries.get('anniversary')?.items.map(item => [item.kind, item.countLabel, item.iconPath])).toEqual([
      ['carats', '1,700', 'assets/images/item/item_icon_00043.webp'],
      ['uma_ticket', '2', 'assets/images/item/item_icon_00041.webp'],
      ['support_ticket', '2', 'assets/images/item/item_icon_00111.webp'],
      ['trainee_selector', '1', 'assets/images/item/item_icon_00178.webp'],
    ]);
  });

  it('uses campaign allocations once instead of double-counting managed free-pull benefits', () => {
    const summaries = buildTimelineRewardSummaries({
      rewards: [],
      event_benefits: [{
        id: 'campaign-benefit', event_id: 'banner-a', campaign_id: 'free-100', kind: 'free_pulls',
        label: 'Free pulls', amount: 40, available_at: '2026-09-04', planner_effect: 'target_free_pulls',
      }],
      free_pull_campaigns: [{
        id: 'free-100', label: '100 free pulls', total_pulls: 100,
        default_allocations: [
          { event_id: 'banner-a', pulls: 40 },
          { event_id: 'banner-b', pulls: 60 },
        ],
      }],
    });

    expect(summaries.get('banner-a')?.label).toBe('40 free pulls');
    expect(summaries.get('banner-b')?.label).toBe('60 free pulls');
    expect(summaries.get('banner-a')?.items[0]).toEqual(jasmine.objectContaining({
      kind: 'free_pulls',
      countLabel: '40 pulls',
      iconPath: 'assets/images/item/item_icon_00041.webp',
    }));
  });
  it('keeps result-based competitive rewards informative without inventing a total', () => {
    const summaries = buildTimelineRewardSummaries({
      rewards: [],
      competitive_variants: [{
        id: 'loh-platinum',
        competition: 'league_of_heroes',
        event_id: 'loh-1',
        master_event_id: 1,
        label: 'Platinum',
        source_items: [
          { item_category: 90, item_id: 43, amount: 1200 },
          { item_category: 40, item_id: 41, amount: 3 },
          { item_category: 164, item_id: 149, amount: 1 },
          { item_category: 164, item_id: 150, amount: 1 },
        ],
      }],
    });

    expect(summaries.get('loh-1')).toEqual(jasmine.objectContaining({
      carats: 0,
      variable: true,
      variableOutcomeCount: 1,
      variableRewardLabels: ['Carats', 'Trainee tickets', 'Rainbow crystals', 'Gold crystals'],
      label: 'Rewards vary by result',
      mode: 'cumulative',
      previewLabel: 'Cumulative',
      previewItems: [
        jasmine.objectContaining({ key: 'carats', countLabel: '1,200' }),
        jasmine.objectContaining({ key: 'uma-ticket', countLabel: '3' }),
        jasmine.objectContaining({ key: 'rainbow-crystal', countLabel: '1' }),
      ],
      variableOutcomes: [jasmine.objectContaining({
        key: 'loh-platinum',
        label: 'Platinum',
        items: [
          jasmine.objectContaining({ key: 'carats', countLabel: '1,200' }),
          jasmine.objectContaining({ key: 'uma-ticket', countLabel: '3' }),
          jasmine.objectContaining({ key: 'rainbow-crystal', countLabel: '1' }),
          jasmine.objectContaining({ key: 'gold-crystal', countLabel: '1' }),
        ],
      })],
    }));
  });

  it('uses the published Global finals table when Champions Meeting master reward sets are absent', () => {
    const summaries = buildTimelineRewardSummaries({
      rewards: [],
      competitive_variants: [{
        id: 'cm-outcome', competition: 'champions_meeting', event_id: 'cm-1', master_event_id: 1,
        label: 'League 1, round 4, 0 wins, rank 1 (rate 10000, reward set 121)', source_items: [],
      }],
    });

    expect(summaries.get('cm-1')).toEqual(jasmine.objectContaining({
      mode: 'placement',
      previewLabel: 'Finals',
      variableOutcomeCount: 12,
      previewItems: [
        jasmine.objectContaining({ key: 'carats', countLabel: '500–2,500' }),
        jasmine.objectContaining({ key: 'uma-ticket', countLabel: '1–5' }),
        jasmine.objectContaining({ key: 'support-ticket', countLabel: 'up to 5' }),
      ],
      variableOutcomes: jasmine.arrayContaining([
        jasmine.objectContaining({ label: 'Graded · Group A · 1st', items: jasmine.arrayContaining([
          jasmine.objectContaining({ key: 'carats', countLabel: '2,500' }),
        ]) }),
        jasmine.objectContaining({ label: 'Open · Group B · 3rd', items: jasmine.arrayContaining([
          jasmine.objectContaining({ key: 'carats', countLabel: '500' }),
        ]) }),
      ]),
    }));
  });

  it('adds standard Champions Meeting rewards when a repeated timeline event has no planner variant', () => {
    const summaries = buildTimelineRewardSummaries({ rewards: [] }, [{
      id: 'champions-meeting-16',
      type: 'champions_meeting',
    }]);

    expect(summaries.get('champions-meeting-16')).toEqual(jasmine.objectContaining({
      mode: 'placement',
      previewLabel: 'Finals',
      variableOutcomeCount: 12,
      label: 'Rewards vary by result',
    }));
  });

  it('adds the standard Carat total for a future story event only when sourced Carats are absent', () => {
    const summaries = buildTimelineRewardSummaries({ rewards: [] }, [{
      id: 'story-event-future',
      type: 'story_event',
      title: 'Future story',
      estimatedEndDate: '2026-10-12T12:00:00Z',
    }]);

    expect(summaries.get('story-event-future')).toEqual(jasmine.objectContaining({
      carats: 2010,
      label: '2,010 Carats',
      items: [jasmine.objectContaining({ kind: 'carats', countLabel: '2,010' })],
    }));

    const sourced = buildTimelineRewardSummaries({ rewards: [{
      id: 'sourced-story-reward', event_id: 'story-event-future', label: 'Exact reward',
      currency: 'free_jewels', amount: 1800, available_at: '2026-10-12',
    }] }, [{
      id: 'story-event-future', type: 'story_event', estimatedEndDate: '2026-10-12',
    }]);
    expect(sourced.get('story-event-future')?.carats).toBe(1800);
  });

  it('adds standard Legend Race first-clear rewards from timeline participants when planner variants are absent', () => {
    const summaries = buildTimelineRewardSummaries({ rewards: [] }, [{
      id: 'legend-race-13',
      type: 'legend_race',
      pickupCardIds: [105101, 102801],
      relatedCharacters: ['Nishino Flower (Original)', 'Hishi Akebono (Original)'],
    }]);

    expect(summaries.get('legend-race-13')).toEqual(jasmine.objectContaining({
      mode: 'per_opponent',
      previewLabel: 'All clears',
      variableOutcomeCount: 2,
      previewItems: [
        jasmine.objectContaining({ key: 'carats', countLabel: '300' }),
        jasmine.objectContaining({ key: 'character-pieces', countLabel: '20' }),
        jasmine.objectContaining({ key: 'money', countLabel: '20,000' }),
      ],
    }));
    expect(summaries.get('legend-race-13')?.variableOutcomes.map(outcome => outcome.label)).toEqual([
      'First clear vs Nishino Flower (Original)',
      'First clear vs Hishi Akebono (Original)',
    ]);
  });

  it('keeps exact Legend Race first-clear rewards as separate opponent outcomes', () => {
    const summaries = buildTimelineRewardSummaries({
      rewards: [],
      competitive_variants: [{
        id: 'legend-race-opponent',
        competition: 'legend_race',
        event_id: 'legend-race-1',
        master_event_id: 2,
        label: 'First clear vs Character 101401',
        source_items: [
          { item_category: 102, item_id: 101401, amount: 10 },
          { item_category: 90, item_id: 43, amount: 150 },
          { item_category: 91, item_id: 59, amount: 10000 },
        ],
      }],
    });

    expect(summaries.get('legend-race-1')).toEqual(jasmine.objectContaining({
      mode: 'per_opponent',
      previewLabel: 'All clears',
      previewItems: [
        jasmine.objectContaining({ key: 'carats', countLabel: '150' }),
        jasmine.objectContaining({ key: 'character-pieces', countLabel: '10' }),
        jasmine.objectContaining({ key: 'money', countLabel: '10,000' }),
      ],
    }));
    expect(summaries.get('legend-race-1')?.variableOutcomes).toEqual([jasmine.objectContaining({
      label: 'First clear vs Character 101401',
      items: [
        jasmine.objectContaining({ key: 'character-pieces', countLabel: '10' }),
        jasmine.objectContaining({ key: 'carats', countLabel: '150' }),
        jasmine.objectContaining({ key: 'money', countLabel: '10,000' }),
      ],
    })]);
  });
  it('adds every Strongest Team milestone and mission reward into the attainable total', () => {
    const summaries = buildTimelineRewardSummaries({
      rewards: [],
      competitive_variants: [
        {
          id: 'team-rank-1', competition: 'strongest_team', event_id: 'team-1', master_event_id: 1,
          label: 'Team rank 1 (0-999 evaluation points)',
          source_items: [{ item_category: 90, item_id: 43, amount: 100 }],
        },
        {
          id: 'team-rank-2', competition: 'strongest_team', event_id: 'team-1', master_event_id: 1,
          label: 'Team rank 2 (1000-1999 evaluation points)',
          source_items: [{ item_category: 90, item_id: 43, amount: 200 }],
        },
        {
          id: 'team-missions', competition: 'strongest_team', event_id: 'team-1', master_event_id: 1,
          label: 'Event missions (full completion)',
          source_items: [{ item_category: 40, item_id: 41, amount: 1 }],
        },
      ],
    });

    expect(summaries.get('team-1')).toEqual(jasmine.objectContaining({
      mode: 'cumulative',
      previewLabel: 'All milestones',
      previewItems: [
        jasmine.objectContaining({ key: 'carats', countLabel: '300' }),
        jasmine.objectContaining({ key: 'uma-ticket', countLabel: '1' }),
      ],
    }));
  });
});
