import { CaratPlan, CaratPlanCollection } from '../models/carat-planner.model';
import { CONDITIONAL_REWARD_DEFAULT_SELECTIONS } from './carat-planner-income-assumptions';
import {
  compactPlannerCollectionForCloud,
  compactPlannerPlanForCloudShare,
  expandPlannerCollectionFromCloud,
  expandPlannerPlanFromCloudShare,
} from './carat-planner-cloud-codec';

describe('Carat Planner cloud codec', () => {
  it('round-trips compact account data without derived reward ids or default settings', () => {
    const source = collection();
    const compact = compactPlannerCollectionForCloud(source);
    const json = JSON.stringify(compact);
    const restored = expandPlannerCollectionFromCloud(compact);

    expect(restored).toEqual(source);
    expect(json).not.toContain('story_event_rewards');
    expect(json).not.toContain('enabledRewardIds');
    expect(json.length).toBeLessThan(JSON.stringify(source).length * 0.7);
  });

  it('keeps legacy full collections readable', () => {
    const source = collection();
    expect(expandPlannerCollectionFromCloud(source)).toBe(source);
  });

  it('stores short shares in a compact backend-compatible envelope', () => {
    const source = collection().plans[0];
    const compact = compactPlannerPlanForCloudShare(source);
    const restored = expandPlannerPlanFromCloudShare(compact);

    expect(compact).toEqual(jasmine.objectContaining({ id: source.id, name: source.name, v: 2 }));
    expect(restored?.id).toBe(source.id);
    expect(restored?.targets[0].eventId).toBe('support-1');
  });
});

function collection(): CaratPlanCollection {
  const plan: CaratPlan = {
    id: 'plan-1',
    name: 'Small cloud plan',
    createdAt: '2026-08-19T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    projectionStartDate: '2026-08-20',
    balances: {
      freeJewels: 100,
      paidJewels: 0,
      umaTickets: 0,
      supportTickets: 2,
      rainbowCrystals: 0,
      goldCrystals: 0,
      rainbowFullCrystals: 0,
      goldFullCrystals: 0,
    },
    enabledIncomeRuleIds: ['daily-missions'],
    enabledRewardIds: [],
    disabledRewardIds: ['one-manual-exception'],
    enabledRewardEventIds: [],
    disabledEventIds: ['one-disabled-event'],
    scenarioSelections: {
      speculative_income: 'include',
      ...CONDITIONAL_REWARD_DEFAULT_SELECTIONS,
    },
    variableRewardSelections: {},
    freePullCampaignSelections: {},
    resourceDefaultsApplied: true,
    customIncome: [{
      id: 'income-1',
      label: 'One-off',
      currency: 'free_jewels',
      amount: 100,
      cadence: 'once',
      startDate: '2026-08-21',
    }],
    targets: [{
      id: 'target-1',
      eventId: 'support-1',
      title: 'Support banner',
      bannerKind: 'support',
      pullTiming: 'end',
      plannedPulls: 200,
      desiredCopies: 5,
      pickupGoals: [],
      useTickets: true,
      allowPaidJewels: false,
    }],
  };
  return { version: 1, activePlanId: plan.id, plans: [plan] };
}
