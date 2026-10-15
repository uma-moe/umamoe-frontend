import { expect, it } from 'vitest';
import { createPlan, projectPlan, type PlannerDataBundle } from '../carat-planner';
import { compactPlannerCollectionResourceState as compact } from './planner-resource-state';

it('compacts every plan to Angular manual exceptions without changing projections, timestamps or future target choices', () => {
  const plan = createPlan();
  plan.projectionStartDate = '2026-01-01';
  plan.scenarioSelections = {
    story_event_rewards: 'include',
    masters_challenge_rewards: 'none',
    rank: 'A'
  };

  const reward = {
    label: 'Reward',
    currency: 'free_jewels' as const,
    amount: 100,
    available_at: '2026-01-02'
  };

  const data: PlannerDataBundle = {
    core: {},
    income: {
      rules: [
        {
          id: 'daily',
          label: 'Daily',
          currency: 'free_jewels',
          amount: 10,
          cadence: 'daily',
          start_date: '2026-01-01'
        },
        {
          id: 'scenario',
          label: 'Rank',
          currency: 'free_jewels',
          amount: 20,
          cadence: 'daily',
          start_date: '2026-01-01',
          scenario_group: 'rank',
          scenario_option: 'A'
        }
      ]
    },
    rewards: {
      rewards: [
        { ...reward, id: 'auto', default_enabled: true },
        { ...reward, id: 'opt', default_enabled: false },
        { ...reward, id: 'opt-disabled', default_enabled: false },
        { ...reward, id: 'conditional', assumption: 'full_completion' },
        { ...reward, id: 'conditional-off', assumption: 'all_first_clears_high_difficulty' },
        { ...reward, id: 'blocked', event_id: 'blocked-event' },
        { ...reward, id: 'keep-disabled' }
      ],
      event_benefits: ['trainee_selector', 'support_selector', 'free_pulls'].map((kind, index) => ({
        id: kind,
        kind,
        event_id: `benefit-${index}`,
        label: kind,
        available_at: '2026-01-02',
        planner_effect: 'linked_inventory_benefit'
      })),
      competitive_variants: [
        {
          id: 'cm',
          competition: 'champions_meeting',
          event_id: 'cm',
          label: 'CM',
          source_items: []
        }
      ]
    }
  };

  plan.targets = [
    {
      id: 'target',
      eventId: 'future-import',
      title: 'Imported banner',
      bannerKind: 'character',
      bannerEnd: '2026-01-03',
      pullTiming: 'end',
      plannedPulls: 0,
      desiredCopies: 1,
      useTickets: false,
      allowPaidJewels: false
    }
  ];

  plan.targets.push({ ...plan.targets[0]!, id: 'active-target', eventId: 'active-banner' });
  plan.enabledIncomeRuleIds = ['scenario', 'gone', 'daily', 'daily'];
  plan.enabledRewardIds = ['auto', 'conditional', 'conditional-off', 'opt', 'opt-disabled', 'gone'];
  plan.disabledRewardIds = ['conditional-off', 'opt-disabled', 'blocked', 'keep-disabled', 'gone'];
  plan.enabledRewardEventIds = ['auto-event', 'benefit-1', 'gone'];
  plan.disabledEventIds = [
    'unknown-until-timeline',
    'blocked-event',
    'benefit-1',
    'cm',
    'future-import',
    'known-timeline'
  ];
  const collection = {
    version: 1 as const,
    activePlanId: plan.id,
    plans: [plan, { ...plan, id: 'other' }]
  };

  const before = structuredClone(collection);
  expect(compact(collection, data).plans[0]!.disabledEventIds).toContain('unknown-until-timeline');
  const events = [{ id: 'known-timeline' }];
  const next = compact(collection, data, events);
  expect(projectPlan(plan, data).targets[0]!.rewardCaratsGained).toBeGreaterThan(0);
  for (const item of next.plans) {
    expect(item).toMatchObject({
      enabledIncomeRuleIds: ['daily'],
      enabledRewardIds: ['opt'],
      disabledRewardIds: ['keep-disabled'],
      enabledRewardEventIds: ['benefit-0'],
      disabledEventIds: ['benefit-1', 'blocked-event', 'cm', 'future-import', 'known-timeline'],
      targets: plan.targets,
      scenarioSelections: plan.scenarioSelections,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt
    });

    expect(projectPlan(item, data)).toEqual(projectPlan(plan, data));
  }

  expect(compact(next, data, events)).toEqual(next);
  expect(collection).toEqual(before);
});
