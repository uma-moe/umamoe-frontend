import { expect, it } from 'vitest';
import { activePlan, createPlan, plannerTargetEvents, projectPlan, setTimelineEvent, type PlannerDataBundle } from './carat-planner';

it('plans every selected step using only paid Carats and reports the additional currency required', () => {
  const original = createPlan();
  original.projectionStartDate = '2026-01-01';
  original.balances = { ...original.balances, freeJewels: 90000, paidJewels: 2199, umaTickets: 100, supportTickets: 100 };
  const plan = activePlan(setTimelineEvent({ version: 1, activePlanId: original.id, plans: [original] }, {
    id: 'step-up', title: 'SSR Select Step-Up', eventType: 'paid_banner', gachaType: 14,
    gachaId: 50078, date: new Date('2026-09-01'), estimatedEndDate: new Date('2026-09-30'),
  }, true));
  expect(plan.targets[0]).toMatchObject({ bannerKind: 'paid', plannedPulls: 50, useTickets: false, allowPaidJewels: true });
  expect(plannerTargetEvents(plan, [])).toHaveLength(1);
  const bundle: PlannerDataBundle = {
    core: {}, income: { rules: [] }, rewards: { rewards: [] },
    gachas: [{ event_id: 'step-up', gacha_id: 50078, gacha_type: 14, banner_kind: 'support', start_date: '2026-09-01', end_date: '2026-09-30',
      step_up: { rounds: 2, steps: [500, 700, 1000, 1300, 1500].map((cost, i) => ({ gacha_id: 50078 + i, pulls: 10, cost, guaranteed_rarity: i < 2 ? 2 : 3, selectable: i === 4 })) } }],
  };
  // Imported or global settings must never let free resources fund a paid step-up.
  plan.targets[0]!.useTickets = true; plan.targets[0]!.allowPaidJewels = false;
  let result = projectPlan(plan, bundle);
  expect(result.targets[0]).toMatchObject({ fundedPulls: 50, paidJewelPulls: 50, paidJewelsAfter: 0, shortfallJewels: 2801, ticketPulls: 0, freeJewelPulls: 0, sparkCopies: 0, pickupProbability: undefined });
  expect(result.requiredPaidJewels).toBe(2801);
  expect(result.balances).toMatchObject({ freeJewels: 90000, umaTickets: 100, supportTickets: 100 });
  plan.balances.paidJewels = 10000; plan.targets[0]!.plannedPulls = 5000;
  result = projectPlan(plan, bundle);
  expect(result.targets[0]).toMatchObject({ plannedPulls: 100, fundedPulls: 100, paidJewelsAfter: 0, shortfallJewels: 0 });
  expect(projectPlan(plan).targets[0]).toMatchObject({ fundedPulls: 0, freeJewelPulls: 0, ticketPulls: 0, paidJewelPulls: 0 });

  const schedule = bundle.gachas![0]!.step_up!;
  schedule.selection_pool_size = 10; schedule.selection_pickup_rate = .003;
  plan.targets[0]!.plannedPulls = 50;
  expect(projectPlan(plan, bundle).targets[0]!.pickupProbability).toBeCloseTo(1, 12);
  plan.targets[0]!.desiredCopies = 2;
  // 47 ordinary draws, two random guaranteed SSRs and the final chosen copy.
  expect(projectPlan(plan, bundle).targets[0]!.pickupProbability).toBeCloseTo(1 - .997 ** 47 * .9 ** 2, 12);
  plan.balances.paidJewels = 1200; plan.targets[0]!.desiredCopies = 1;
  expect(projectPlan(plan, bundle).targets[0]!.pickupProbability).toBeCloseTo(1, 12);
  plan.targets[0]!.plannedPulls = 20;
  expect(projectPlan(plan, bundle).targets[0]!.pickupProbability).toBeCloseTo(1 - .997 ** 20, 12);
  plan.balances.paidJewels = 10000; plan.targets[0]!.plannedPulls = 100; plan.targets[0]!.desiredCopies = 2;
  expect(projectPlan(plan, bundle).targets[0]!.pickupProbability).toBeCloseTo(1, 12);
});

it('plans ordinary premium draws regardless of paid balance without using free currency or tickets', () => {
  const original = createPlan(); original.projectionStartDate = '2026-01-01';
  original.balances = { ...original.balances, freeJewels: 90000, paidJewels: 1499, supportTickets: 100 };
  const plan = activePlan(setTimelineEvent({ version: 1, activePlanId: original.id, plans: [original] }, {
    id: 'premium', title: 'SSR Guaranteed', eventType: 'paid_banner', gachaType: 5,
    gachaId: 50002, date: new Date('2026-09-01'), estimatedEndDate: new Date('2026-09-30'), pickupCardIds: [30001],
  }, true));
  expect(plan.targets[0]).toMatchObject({ bannerKind: 'paid', plannedPulls: 10, useTickets: false, allowPaidJewels: true });
  const bundle: PlannerDataBundle = { core: {}, income: { rules: [] }, rewards: { rewards: [] }, gachas: [{
    event_id: 'premium', gacha_id: 50002, gacha_type: 5, banner_kind: 'support', start_date: '2026-09-01', end_date: '2026-09-30',
    jewel_cost_per_pull: 150, free_pulls: 100, paid_draw: { limit: 1, guaranteed_rarity: 3, guaranteed_count: 1 },
    pickups: [{ pickup_id: 30001, rate: .015, exchangeable: false }, { pickup_id: 30002, rate: .015, exchangeable: false }], rarity_rates: [{ rarity: 3, rate: .03 }],
  }] };
  plan.targets[0]!.useTickets = true; plan.targets[0]!.allowPaidJewels = false;
  expect(projectPlan(plan, bundle).targets[0]).toMatchObject({ fundedPulls: 10, paidJewelsAfter: 0, shortfallJewels: 1, freePullsUsed: 0, freeJewelPulls: 0, ticketPulls: 0 });
  plan.balances.paidJewels = 0;
  const unfunded = projectPlan(plan, bundle);
  expect(unfunded).toMatchObject({ requiredPaidJewels: 1500, totalShortfallJewels: 1500, balances: { paidJewels: 0 }, targets: [{ fundedPulls: 10 }] });
  expect(unfunded.targets[0]!.pickupProbability).toBeCloseTo(1 - .985 ** 9 * .5, 12);
  plan.balances.paidJewels = 3000; plan.targets[0]!.plannedPulls = 5000;
  const result = projectPlan(plan, bundle);
  expect(result.targets[0]).toMatchObject({ plannedPulls: 10, fundedPulls: 10, paidJewelsAfter: 1500, shortfallJewels: 0, sparkCopies: 0 });
  expect(result.balances).toMatchObject({ freeJewels: 90000, supportTickets: 100 });
  expect(result.targets[0]!.pickupProbability).toBeCloseTo(1 - .985 ** 9 * .5, 12);
  plan.targets[0]!.pickupGoals = [{ pickupId: 30001, desiredCopies: 1 }, { pickupId: 30002, desiredCopies: 1 }];
  expect(projectPlan(plan, bundle).targets[0]!.pickupProbability).toBeCloseTo(1 - .985 ** 9, 12);
});

it('totals paid requirements by pull date without spending the same balance twice or borrowing later income', () => {
  const plan = createPlan(); plan.projectionStartDate = '2026-01-01'; plan.balances.paidJewels = 700;
  plan.targets = ['2026-01-02', '2026-01-04'].map((date, i) => ({ id: `paid-${i}`, eventId: 'premium', gachaId: 5, title: 'Paid', bannerKind: 'paid', pullTiming: 'custom', customPullDate: date, plannedPulls: 10, desiredCopies: 1, useTickets: true, allowPaidJewels: false }));
  plan.targets.push({ ...plan.targets[0]!, id: 'regular', eventId: 'regular', gachaId: 6, bannerKind: 'character', plannedPulls: 1, customPullDate: '2026-01-05', allowPaidJewels: true });
  plan.customIncome = [{ id: 'later-paid', label: 'Later paid Carats', currency: 'paid_jewels', amount: 500, cadence: 'once', startDate: '2026-01-03' }];
  const data: PlannerDataBundle = { core: {}, income: { rules: [] }, rewards: { rewards: [] }, gachas: [{ event_id: 'premium', gacha_id: 5, banner_kind: 'character', start_date: '2026-01-01', end_date: '2026-01-05', jewel_cost_per_pull: 150, paid_draw: { limit: 1, guaranteed_rarity: 3, guaranteed_count: 1 } }] };
  const result = projectPlan(plan, data);
  expect(result.targets.map(target => [target.fundedPulls, target.shortfallJewels, target.paidJewelsAfter])).toEqual([[10, 800, 0], [10, 1000, 0], [0, 150, 0]]);
  expect(result).toMatchObject({ requiredPaidJewels: 1800, totalShortfallJewels: 1950, balances: { paidJewels: 0 } });
});
