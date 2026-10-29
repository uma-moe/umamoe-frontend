import type {
  PlannerDataBundle,
  PlannerIncomeRule
} from '../../../src/lib/carat-planner/carat-planner';

const rule = (
  id: string,
  amount: number,
  extra: Partial<PlannerIncomeRule> = {}
): PlannerIncomeRule => ({
  id,
  label: id,
  currency: 'free_jewels',
  amount,
  cadence: 'monthly',
  start_date: '2026-01-01',
  ...extra
});

export const plannerIncomeData: PlannerDataBundle = {
  core: {},
  income: {
    rules: [
      rule('daily-login', 100, { label: 'Daily login', cadence: 'daily', default_enabled: true }),
      rule('premium-training-pass', 9999, {
        label: 'Retired Training Pass',
        default_enabled: true
      }),
      ...[1, 2, 3, 4, 5, 6].map((rank) =>
        rule(`trials-${rank}`, rank * 100, {
          cadence: 'weekly',
          scenario_group: 'team_trials_class',
          scenario_option: `class_${rank}`
        })
      ),
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((rank) =>
        rule(`club-${rank}`, rank * 200, {
          scenario_group: 'club_rank',
          scenario_option: `rank_${rank}`
        })
      ),
      ...(['uma_ticket', 'support_ticket'] as const).flatMap((currency) => [
        rule(`friend-${currency}`, 1, {
          currency,
          scenario_group: 'monthly_shop_tickets',
          scenario_option: 'friend_points'
        }),
        rule(`clovers-${currency}`, 2, {
          currency,
          scenario_group: 'monthly_shop_tickets',
          scenario_option: 'clovers'
        })
      ])
    ]
  },
  rewards: {
    rewards: [],
    competitive_variants: [
      ...['legend-a', 'legend-b'].flatMap((event, index) =>
        [1, 2, 3].map((count) => ({
          id: `${event}-${count}`,
          event_id: event,
          competition: 'legend_race',
          label: `Opponent ${count}`,
          source_items: [{ item_category: 90, item_id: 43, amount: 100 + index * 50 }]
        }))
      ),
      {
        id: 'legend-mission',
        event_id: 'legend-a',
        competition: 'legend_race',
        label: 'Event missions',
        source_items: [{ item_category: 90, item_id: 43, amount: 200 }]
      },
      ...[100, 200, 300].map((points) => ({
        id: `team-${points}`,
        event_id: 'team',
        competition: 'strongest_team',
        label: `${points}+ evaluation points`,
        source_items: [{ item_category: 90, item_id: 43, amount: 300 }]
      }))
    ],
    global_reward_comparison: {
      speculative_method: 'mean_last_6_complete_calendar_months_global_only_gifts',
      observation_end: '2026-08-28',
      ...{ observed_months: 6 },
      speculative_monthly_carats: 600,
      speculative_recent_median_monthly_carats: 400
    }
  }
};
