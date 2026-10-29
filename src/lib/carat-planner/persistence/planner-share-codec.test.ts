import { describe, expect, it } from 'vitest';
import { createPlan } from '../carat-planner';
import {
  decodeCompactPlannerShare,
  encodeCompactPlannerShare,
  expandCompactPlannerPlanData,
  compactPlannerPlanData
} from './planner-share-codec';

describe('Angular-compatible planner share codec', () => {
  it('round trips balances, assumptions, variable rewards, custom income, and pickup goals', async () => {
    const plan = createPlan('Shared plan');
    plan.balances.freeJewels = 12_345;
    plan.scenarioSelections.champions_meeting_result = 'second';
    plan.variableRewardSelections.cm = {
      optionId: 'second',
      label: 'Second',
      availableAt: '2026-01-02',
      amounts: { free_jewels: 1_800 }
    };

    plan.customIncome.push({
      id: 'custom',
      label: 'Gift',
      currency: 'free_jewels',
      amount: 50,
      cadence: 'once',
      startDate: '2026-01-01'
    });

    plan.targets.push({
      id: 'target',
      eventId: 'banner',
      title: 'Banner',
      bannerKind: 'support',
      pullTiming: 'end',
      plannedPulls: 200,
      desiredCopies: 2,
      pickupId: 30001,
      pickupGoals: [{ pickupId: 30001, desiredCopies: 2 }],
      useTickets: true,
      allowPaidJewels: false
    });

    const decoded = await decodeCompactPlannerShare(await encodeCompactPlannerShare(plan));
    expect(decoded.fingerprint).toMatch(/^[a-f0-9]{8,16}$/);
    expect(decoded.plan).toMatchObject({
      name: 'Shared plan',
      balances: { freeJewels: 12_345 },
      scenarioSelections: { champions_meeting_result: 'second' },
      targets: [{ pickupGoals: [{ pickupId: 30001, desiredCopies: 2 }] }]
    });
  });

  it('uses the Angular v2 tuple representation for cloud and short-link interoperability', () => {
    const expanded = expandCompactPlannerPlanData(compactPlannerPlanData(createPlan('Tuple')));
    expect(expanded?.name).toBe('Tuple');
    expect(expanded?.scenarioSelections.speculative_income).toBe('include');
  });
});
