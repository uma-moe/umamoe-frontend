import { CaratPlan, CaratPlanCollection } from '../models/carat-planner.model';
import { CONDITIONAL_REWARD_DEFAULT_SELECTIONS } from './carat-planner-income-assumptions';
import {
  compactPlannerCollectionForCloud,
  compactPlannerPlanForCloudShare,
  expandPlannerCollectionFromCloud,
  expandPlannerPlanFromCloudShare,
  isCompactPlannerCollectionForCloud,
} from './carat-planner-cloud-codec';
import { compactPlannerPlanData } from './carat-planner-share-codec';

describe('Carat Planner cloud codec', () => {
  it('stores only irreducible account choices in the sparse v3 format', () => {
    const source = collection();
    const compact = compactPlannerCollectionForCloud(source);
    const json = JSON.stringify(compact);
    const restored = expandPlannerCollectionFromCloud(compact);

    expect(isCompactPlannerCollectionForCloud(compact)).toBeTrue();
    expect((compact as { version: number }).version).toBe(3);
    expect(restored?.plans[0]).toEqual(jasmine.objectContaining({
      id: source.plans[0].id,
      name: source.plans[0].name,
      createdAt: source.plans[0].createdAt,
      updatedAt: source.plans[0].updatedAt,
      projectionStartDate: source.plans[0].projectionStartDate,
      balances: source.plans[0].balances,
      enabledIncomeRuleIds: source.plans[0].enabledIncomeRuleIds,
      enabledRewardIds: source.plans[0].enabledRewardIds,
      disabledRewardIds: source.plans[0].disabledRewardIds,
      scenarioSelections: source.plans[0].scenarioSelections,
      incomePresetId: 'active',
      incomePresetEdited: true,
    }));
    expect(restored?.plans[0].targets[0]).toEqual(jasmine.objectContaining({
      eventId: 'support-1',
      gachaId: 30123,
      title: 'support-1',
      bannerKind: 'support',
      plannedPulls: 200,
      pickupGoals: [{ pickupId: 30123, desiredCopies: 5 }],
      useTickets: true,
      allowPaidJewels: false,
    }));
    expect(restored?.plans[0].targets[0].imagePath).toBeUndefined();
    expect(restored?.plans[0].targets[0].id).not.toBe(source.plans[0].targets[0].id);
    expect(restored?.plans[0].disabledEventIds).toEqual(jasmine.arrayWithExactContents([
      'support-1', 'one-disabled-event',
    ]));
    expect(restored?.plans[0].enabledRewardEventIds).toEqual([]);
    expect(json).not.toContain('story_event_rewards');
    expect(json).not.toContain('Support banner');
    expect(json).not.toContain('support-banner.webp');
    expect(json).not.toContain('selector-event');
    expect(json.length).toBeLessThan(JSON.stringify(source).length * 0.4);
  });

  it('keeps existing tuple v2 collections readable and marks them for migration', () => {
    const source = collection();
    const plan = source.plans[0];
    const v2 = {
      version: 2,
      activePlanId: plan.id,
      plans: [[
        plan.id,
        plan.createdAt,
        plan.updatedAt,
        plan.customIncome.map(item => item.id),
        plan.targets.map(target => target.id),
        compactPlannerPlanData(plan),
      ]],
    };

    const restored = expandPlannerCollectionFromCloud(v2);
    expect(restored).toEqual(source);
    expect(isCompactPlannerCollectionForCloud(v2)).toBeFalse();
  });

  it('ignores append-only v3 fields added by future clients', () => {
    const compact = compactPlannerCollectionForCloud(collection()) as { plans: unknown[][] };
    compact.plans[0].push({ futureOption: true });

    expect(expandPlannerCollectionFromCloud(compact)?.plans[0].id).toBe('plan-1');
  });

  it('round-trips every non-default target decision without storing presentation data', () => {
    const source = collection();
    source.plans[0].disabledEventIds = [];
    source.plans[0].targets[0] = {
      ...source.plans[0].targets[0],
      gachaIds: [30123, 30124],
      pullTiming: 'custom',
      customPullDate: '2026-08-25',
      plannedPulls: 0,
      desiredCopies: 2,
      pickupId: 30123,
      pickupGoals: [
        { pickupId: 30123, desiredCopies: 2 },
        { pickupId: 30124, desiredCopies: 4 },
      ],
      useTickets: false,
      ticketLimit: 7,
      allowPaidJewels: true,
      rainbowCrystalsPlanned: 4,
      goldCrystalsPlanned: 3,
    };

    const compact = compactPlannerCollectionForCloud(source);
    const restored = expandPlannerCollectionFromCloud(compact)?.plans[0].targets[0];

    expect(restored).toEqual(jasmine.objectContaining({
      eventId: 'support-1',
      gachaId: 30123,
      gachaIds: [30123, 30124],
      pullTiming: 'custom',
      customPullDate: '2026-08-25',
      plannedPulls: 0,
      desiredCopies: 2,
      pickupId: 30123,
      pickupGoals: [
        { pickupId: 30123, desiredCopies: 2 },
        { pickupId: 30124, desiredCopies: 4 },
      ],
      useTickets: false,
      ticketLimit: 7,
      allowPaidJewels: true,
      rainbowCrystalsPlanned: 4,
      goldCrystalsPlanned: 3,
    }));
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
    enabledRewardEventIds: ['selector-event'],
    disabledEventIds: ['support-1', 'one-disabled-event'],
    scenarioSelections: {
      speculative_income: 'include',
      ...CONDITIONAL_REWARD_DEFAULT_SELECTIONS,
    },
    variableRewardSelections: {},
    freePullCampaignSelections: {},
    resourceDefaultsApplied: true,
    incomePresetId: 'active',
    incomePresetEdited: true,
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
      gachaId: 30123,
      title: 'Support banner',
      bannerKind: 'support',
      imagePath: 'assets/support-banner.webp',
      pullTiming: 'end',
      plannedPulls: 200,
      desiredCopies: 5,
      pickupId: 30123,
      pickupGoals: [{ pickupId: 30123, desiredCopies: 5 }],
      useTickets: true,
      allowPaidJewels: false,
    }],
  };
  return { version: 1, activePlanId: plan.id, plans: [plan] };
}
