import { CaratPlan, CaratPlanCollection } from '../models/carat-planner.model';
import { CONDITIONAL_REWARD_DEFAULT_SELECTIONS } from '../utils/carat-planner-income-assumptions';
import {
  mergeInitialPlannerCollections,
  mergePlannerCollections,
} from './carat-planner-cloud.service';

describe('CaratPlannerCloudService merge', () => {
  it('keeps the newest copy of each plan and preserves changes to different plans', () => {
    const remotePlan = plan('shared-id', 'Remote', '2026-08-18T10:00:00.000Z');
    const localPlan = plan('shared-id', 'Local', '2026-08-19T10:00:00.000Z');
    const remoteOnly = plan('remote-only', 'Remote only', '2026-08-18T11:00:00.000Z');

    const merged = mergePlannerCollections(
      collection(localPlan),
      { version: 1, activePlanId: remoteOnly.id, plans: [remotePlan, remoteOnly] },
      '2026-08-18T12:00:00.000Z',
      false,
    );

    expect(merged.plans.map(item => item.id).sort()).toEqual(['remote-only', 'shared-id']);
    expect(merged.plans.find(item => item.id === 'shared-id')?.name).toBe('Local');
    expect(merged.activePlanId).toBe('shared-id');
  });

  it('does not resurrect a locally cached plan deleted by a newer remote collection', () => {
    const staleLocal = plan('deleted-plan', 'Deleted', '2026-08-17T10:00:00.000Z');
    const remotePlan = plan('remote-plan', 'Current', '2026-08-18T10:00:00.000Z');

    const merged = mergePlannerCollections(
      collection(staleLocal),
      collection(remotePlan),
      '2026-08-19T10:00:00.000Z',
      false,
    );

    expect(merged.plans.map(item => item.id)).toEqual(['remote-plan']);
    expect(merged.activePlanId).toBe('remote-plan');
  });

  it('keeps meaningful anonymous plans during the first account merge', () => {
    const anonymous = plan('anonymous-plan', 'Before login', '2026-08-17T10:00:00.000Z');
    const remote = plan('remote-plan', 'On account', '2026-08-19T10:00:00.000Z');

    const merged = mergePlannerCollections(
      collection(anonymous),
      collection(remote),
      '2026-08-19T11:00:00.000Z',
      true,
    );

    expect(merged.plans.map(item => item.id)).toEqual(['anonymous-plan', 'remote-plan']);
  });

  it('ignores a fresh empty device plan when account plans already exist', () => {
    const emptyLocal = plan('fresh-local', 'My plan', '2026-08-19T12:00:00.000Z');
    emptyLocal.scenarioSelections = {
      speculative_income: 'include',
      ...CONDITIONAL_REWARD_DEFAULT_SELECTIONS,
    };
    const remote = plan('remote-plan', 'My synced plan', '2026-08-18T10:00:00.000Z');

    const merged = mergeInitialPlannerCollections(
      collection(emptyLocal),
      collection(emptyLocal),
      collection(remote),
      '2026-08-18T11:00:00.000Z',
      false,
    );

    expect(merged.plans.map(item => item.id)).toEqual(['remote-plan']);
    expect(merged.activePlanId).toBe('remote-plan');
  });
});

function collection(value: CaratPlan): CaratPlanCollection {
  return { version: 1, activePlanId: value.id, plans: [value] };
}

function plan(id: string, name: string, updatedAt: string): CaratPlan {
  return {
    id,
    name,
    createdAt: updatedAt,
    updatedAt,
    projectionStartDate: '2026-08-19',
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
    enabledRewardEventIds: [],
    scenarioSelections: {},
    customIncome: [],
    targets: [],
  };
}
