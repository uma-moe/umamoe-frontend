import { expect, it } from 'vitest';
import { activePlan, createPlan, importPlanCollection, loadPlanCollection, projectPlan, sanitizePlan, savePlanCollection, type PlannerDataBundle } from './carat-planner';
import { compactPlannerCollectionForCloud, compactPlannerPlanForCloudShare, expandPlannerCollectionFromCloud, expandPlannerPlanFromCloudShare } from './planner-cloud-codec';
import { compactPlannerPlanData, decodeCompactPlannerShare, encodeCompactPlannerShare, expandCompactPlannerPlanData } from './planner-share-codec';
import { plannerCollectionHash } from './planner-cloud-state';

function fixture() {
  const plan = createPlan();
  plan.projectionStartDate = '2026-01-01';
  plan.balances.freeJewels = 60_000;
  plan.targets = ['2026-01-10', '2026-02-10'].map((date, index) => ({
    id: `target-${index}`, eventId: `banner-${index}`, title: 'Banner', bannerKind: 'support',
    pullTiming: 'custom', customPullDate: date, plannedPulls: 200, desiredCopies: 3,
    pickupGoals: [{ pickupId: 30028, desiredCopies: 3 }], useTickets: true, allowPaidJewels: false,
  }));
  return plan;
}

it('keeps plans intact while actual spending changes later balances, including zero, overruns and clearing', () => {
  const plan = fixture(), first = plan.targets[0]!;
  expect(projectPlan(plan).balances.freeJewels).toBe(0);
  first.actualPulls = 50;
  first.actualCopies = { '30028': 4 };
  expect(projectPlan(plan)).toMatchObject({ plannedPulls: 400, balances: { freeJewels: 22_500 }, targets: [
    { plannedPulls: 200, actualPulls: 50, fundedPulls: 50, pickupGoals: [{ desiredCopies: 3 }] },
    { balanceBefore: { freeJewels: 52_500 }, fundedPulls: 200 },
  ] });
  expect(plan.targets.map(target => target.plannedPulls)).toEqual([200, 200]);
  first.actualPulls = 0;
  expect(projectPlan(plan).balances.freeJewels).toBe(30_000);
  first.actualPulls = 250;
  expect(projectPlan(plan).targets[1]!.shortfallJewels).toBe(7_500);
  delete first.actualPulls;
  expect(projectPlan(plan).balances.freeJewels).toBe(0);
  first.actualPulls = 50;
  plan.projectionStartDate = '2026-01-11';
  expect(projectPlan(plan).targets).toMatchObject([{ targetId: 'target-1', balanceBefore: { freeJewels: 60_000 } }]);
});

it('uses the existing free-pull, ticket and paid-Carat rules for actual spending, including discounted steps', () => {
  const plan = fixture(); plan.targets.length = 1;
  const target = plan.targets[0]!;
  target.actualPulls = 50; target.ticketLimit = 20; target.allowPaidJewels = true;
  Object.assign(plan.balances, { freeJewels: 1500, paidJewels: 6000, supportTickets: 30 });
  const bundle: PlannerDataBundle = { core: {}, income: { rules: [] }, rewards: { rewards: [] }, gachas: [{
    event_id: target.eventId, gacha_id: 1, banner_kind: 'support', start_date: '2026-01-01', end_date: '2026-01-10', free_pulls: 10,
  }] };
  expect(projectPlan(plan, bundle).targets[0]).toMatchObject({ freePullsUsed: 10, ticketPulls: 20, freeJewelPulls: 10, paidJewelPulls: 10, paidJewelsAfter: 4500, shortfallJewels: 0 });
  bundle.gachas![0]!.step_up = { rounds: 1, steps: [500, 700, 1000, 1300, 1500].map((cost, index) => ({ gacha_id: index + 1, pulls: 10, cost, guaranteed_rarity: 3, selectable: index === 4 })) };
  target.plannedPulls = 50; target.actualPulls = 20;
  expect(projectPlan(plan, bundle).targets[0]).toMatchObject({ plannedPulls: 50, actualPulls: 20, fundedPulls: 20, paidJewelsAfter: 4800, freeJewelPulls: 0, ticketPulls: 0, freePullsUsed: 0 });
});

it('preserves actual results in local storage, JSON imports, cloud sync, and both share formats', async () => {
  const plan = fixture();
  const collection = { version: 1 as const, activePlanId: plan.id, plans: [plan] };
  const initialHash = plannerCollectionHash(collection);
  for (const actualPulls of [undefined, 0, 50]) {
    plan.targets[0]!.actualPulls = actualPulls;
    plan.targets[0]!.actualCopies = { '30028': 4, '30001': 0, chosen: 2 };
    plan.targets[0]!.notes = actualPulls === undefined ? undefined : 'Saved pulls for the next banner';
    let stored = '';
    savePlanCollection(collection, { setItem: (_, value) => stored = value });
    const restored = [
      activePlan(loadPlanCollection({ getItem: () => stored })),
      activePlan(importPlanCollection(stored, { ...collection, plans: [] })),
      expandPlannerCollectionFromCloud(JSON.parse(JSON.stringify(compactPlannerCollectionForCloud(collection))))!.plans[0]!,
      expandPlannerPlanFromCloudShare(compactPlannerPlanForCloudShare(plan))!,
      sanitizePlan((await decodeCompactPlannerShare(await encodeCompactPlannerShare(plan))).plan)!,
    ];
    for (const copy of restored) {
      expect(copy.targets[0]!.actualPulls).toBe(actualPulls);
      expect(copy.targets[0]!.actualCopies).toEqual(plan.targets[0]!.actualCopies);
      expect(copy.targets[0]!.notes).toBe(plan.targets[0]!.notes);
      expect(copy.targets[0]!.plannedPulls).toBe(200);
      expect(copy.targets[0]!.pickupGoals).toEqual([{ pickupId: 30028, desiredCopies: 3 }]);
    }
    expect(plannerCollectionHash(collection)).not.toBe(initialHash);
    expect(plannerCollectionHash({ ...collection, plans: [restored[2]!] })).toBe(plannerCollectionHash(collection));
  }
  const oldShare = compactPlannerPlanData(plan) as unknown[][];
  (oldShare[14]![0] as unknown[]).length = 18;
  expect(expandCompactPlannerPlanData(oldShare)!.targets[0]!.notes).toBe(plan.targets[0]!.notes);
  expect(expandCompactPlannerPlanData(oldShare)!.targets[0]!.actualPulls).toBeUndefined();
  (oldShare[14]![0] as unknown[]).length = 17;
  expect(expandCompactPlannerPlanData(oldShare)!.targets[0]!.actualPulls).toBeUndefined();
  expect(expandCompactPlannerPlanData(oldShare)!.targets[0]!.actualCopies).toBeUndefined();
});

it('validates optional result counts without turning blanks or invalid imports into zero', () => {
  const plan = fixture();
  for (const [input, expected] of [[null, undefined], ['', undefined], [' ', undefined], [false, undefined], [-1, undefined], ['bad', undefined], [Infinity, undefined], [0, 0], ['50', 50], [4.9, 4], [6000, 5000]] as const) {
    const result = sanitizePlan({ ...plan, targets: [{ ...plan.targets[0], actualPulls: input, actualCopies: { '30028': input, invalid: 4, '__proto__': 2 } }] })!.targets[0]!;
    expect(result.actualPulls).toBe(expected);
    expect(result.actualCopies).toEqual(expected === undefined ? undefined : { '30028': expected });
    expect(result.plannedPulls).toBe(200);
  }
});
