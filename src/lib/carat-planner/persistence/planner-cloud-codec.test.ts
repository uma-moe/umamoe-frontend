import { describe, expect, it } from 'vitest';
import { createPlan, type CaratPlanCollection } from '../carat-planner';
import {
  compactPlannerCollectionForCloud,
  compactPlannerPlanForCloudShare,
  expandPlannerCollectionFromCloud,
  expandPlannerPlanFromCloudShare,
  isCompactPlannerCollectionForCloud
} from './planner-cloud-codec';
import { plannerCollectionHash, reconcileInitialPlannerCollections } from './planner-cloud-state';

function fixture(): CaratPlanCollection {
  const plan = createPlan('Global plan');
  Object.assign(plan, {
    id: 'plan-a',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    projectionStartDate: '2026-02-02'
  });

  plan.balances.freeJewels = 12_345;
  plan.enabledIncomeRuleIds = ['daily-missions'];
  plan.scenarioSelections.training_pass = 'premium';
  plan.freePullCampaignSelections.anniversary = '__excluded__';
  plan.targets = [
    {
      id: 'local-target',
      eventId: 'banner-1',
      gachaId: 2201,
      gachaIds: [2201, 2202],
      title: 'Anniversary',
      bannerKind: 'support',
      pullTiming: 'custom',
      customPullDate: '2026-03-03',
      plannedPulls: 300,
      desiredCopies: 2,
      pickupId: 301,
      pickupGoals: [{ pickupId: 301, desiredCopies: 2 }],
      useTickets: false,
      ticketLimit: 10,
      allowPaidJewels: true,
      rainbowCrystalsPlanned: 1
    }
  ];

  plan.disabledEventIds = ['banner-1'];
  return { version: 1, activePlanId: plan.id, plans: [plan] };
}

describe('Angular-compatible planner cloud format', () => {
  it('round-trips sparse v3 collections without changing semantic state', () => {
    const collection = fixture();
    const compact = compactPlannerCollectionForCloud(collection);
    expect(isCompactPlannerCollectionForCloud(compact)).toBe(true);
    const expanded = expandPlannerCollectionFromCloud(compact);
    expect(expanded).not.toBeNull();
    expect(plannerCollectionHash(expanded!)).toBe(plannerCollectionHash(collection));
    expect(expanded!.plans[0]!.targets[0]).toMatchObject({
      eventId: 'banner-1',
      gachaId: 2201,
      gachaIds: [2201, 2202],
      plannedPulls: 300,
      pullTiming: 'custom',
      ticketLimit: 10,
      allowPaidJewels: true
    });

    expect(expanded!.plans[0]!.disabledEventIds).toContain('banner-1');
  });

  it('reads legacy v1 collections and v2 short shares', () => {
    const collection = fixture();
    expect(expandPlannerCollectionFromCloud(collection)).toBe(collection);
    const share = compactPlannerPlanForCloudShare(collection.plans[0]!);
    expect(expandPlannerPlanFromCloudShare(share)).toMatchObject({
      id: 'plan-a',
      name: 'Global plan',
      targets: [{ eventId: 'banner-1' }]
    });
  });

  it('never merges a stale known-account cache over newer remote state', () => {
    const remote = fixture();
    const stale = fixture();
    stale.plans[0]!.balances.freeJewels = 1;
    const editedWhileLoading = structuredClone(stale);
    editedWhileLoading.plans[0]!.balances.freeJewels = 2;
    expect(
      reconcileInitialPlannerCollections(
        stale,
        editedWhileLoading,
        remote,
        '2026-02-02T00:00:00.000Z',
        true
      )
    ).toBe(remote);
  });
});
