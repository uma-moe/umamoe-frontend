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
});
