import {
  CaratPlan,
  CaratPlanCollection,
  CaratPlannerDataBundle,
} from '../models/carat-planner.model';
import { compactPlannerCollectionResourceState } from './carat-planner-resource-state';

describe('compactPlannerCollectionResourceState', () => {
  it('keeps only sparse user choices for every plan in the collection', () => {
    const data: CaratPlannerDataBundle = {
      core: {},
      income: {
        rules: [
          {
            id: 'daily',
            label: 'Daily',
            currency: 'free_jewels',
            amount: 50,
            cadence: 'daily',
            start_date: '2026-08-20',
          },
          {
            id: 'class-6',
            label: 'Class 6',
            currency: 'free_jewels',
            amount: 250,
            cadence: 'weekly',
            start_date: '2026-08-20',
            scenario_group: 'team_trials',
            scenario_option: 'class_6',
          },
        ],
      },
      rewards: {
        rewards: [
          {
            id: 'automatic',
            event_id: 'ordinary-event',
            label: 'Automatic reward',
            currency: 'free_jewels',
            amount: 100,
            available_at: '2026-08-20',
          },
          {
            id: 'manual',
            event_id: 'manual-event',
            label: 'Manual reward',
            currency: 'free_jewels',
            amount: 100,
            available_at: '2026-08-20',
            default_enabled: false,
          },
          {
            id: 'excluded',
            event_id: 'excluded-event',
            label: 'Excluded reward',
            currency: 'free_jewels',
            amount: 100,
            available_at: '2026-08-20',
          },
        ],
        event_benefits: [{
          id: 'selector-benefit',
          event_id: 'selector-event',
          kind: 'support_selector',
          label: 'Selector',
          available_at: '2026-08-20',
          planner_effect: 'inventory',
        }],
      },
    };
    const first = plan('first');
    first.enabledIncomeRuleIds = ['class-6', 'daily', 'class-6', 'missing'];
    first.enabledRewardIds = ['automatic', 'manual', 'missing'];
    first.disabledRewardIds = ['excluded', 'manual', 'missing'];
    first.enabledRewardEventIds = ['ordinary-event', 'selector-event', 'missing'];
    first.disabledEventIds = ['excluded-event', 'target-event', 'missing'];
    first.targets[0].eventId = 'target-event';
    const second = plan('second');
    second.enabledIncomeRuleIds = ['class-6'];
    second.enabledRewardIds = ['automatic'];
    second.enabledRewardEventIds = ['ordinary-event'];

    const collection: CaratPlanCollection = {
      version: 1,
      activePlanId: first.id,
      plans: [first, second],
    };
    const compacted = compactPlannerCollectionResourceState(collection, data, [{
      id: 'target-event',
      title: 'Target',
      type: 'support',
    }]);

    expect(compacted.plans[0].enabledIncomeRuleIds).toEqual(['daily']);
    expect(compacted.plans[0].enabledRewardIds).toEqual([]);
    expect(compacted.plans[0].disabledRewardIds).toEqual([]);
    expect(compacted.plans[0].enabledRewardEventIds).toEqual(['selector-event']);
    expect(compacted.plans[0].disabledEventIds).toEqual(['excluded-event', 'target-event']);
    expect(compacted.plans[1].enabledIncomeRuleIds).toEqual([]);
    expect(compacted.plans[1].enabledRewardIds).toEqual([]);
    expect(compacted.plans[1].enabledRewardEventIds).toEqual(['selector-event']);
  });
});

function plan(id: string): CaratPlan {
  return {
    id,
    name: id,
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    projectionStartDate: '2026-08-20',
    balances: {
      freeJewels: 0,
      paidJewels: 0,
      umaTickets: 0,
      supportTickets: 0,
      rainbowCrystals: 0,
      goldCrystals: 0,
      rainbowFullCrystals: 0,
      goldFullCrystals: 0,
    },
    enabledIncomeRuleIds: [],
    enabledRewardIds: [],
    disabledRewardIds: [],
    enabledRewardEventIds: [],
    disabledEventIds: [],
    scenarioSelections: { team_trials: 'class_6' },
    customIncome: [],
    targets: [{
      id: `target-${id}`,
      eventId: `event-${id}`,
      title: 'Target',
      bannerKind: 'support',
      bannerStart: '2026-08-20',
      bannerEnd: '2026-08-20',
      pullTiming: 'end',
      plannedPulls: 200,
      desiredCopies: 1,
      pickupGoals: [],
      useTickets: true,
      allowPaidJewels: false,
    }],
  };
}
