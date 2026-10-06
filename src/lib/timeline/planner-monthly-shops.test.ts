import { expect, it } from 'vitest';
import { buildPlannerLedger, createPlan, loadPlanCollection, sanitizePlan, savePlanCollection } from './carat-planner';
import { MONTHLY_SHOP_EXCHANGES, normalizePlannerIncomeRules } from './planner-income-assumptions';
import { compactPlannerCollectionForCloud, expandPlannerCollectionFromCloud } from './planner-cloud-codec';
import { compactPlannerPlanData, expandCompactPlannerPlanData } from './planner-share-codec';
import { plannerIncomeData } from '../../../tests/e2e/fixtures/planner-income-data';

it('counts all 32 independent shop combinations once per month and preserves legacy totals', () => {
  const rules = normalizePlannerIncomeRules(plannerIncomeData.income.rules.filter(rule => rule.scenario_group === 'monthly_shop_tickets'));
  const data = { core: {}, income: { rules }, rewards: { rewards: [] } };
  expect(rules).toHaveLength(10);
  expect(normalizePlannerIncomeRules(rules)).toEqual(rules);
  const plan = createPlan();
  plan.projectionStartDate = '2026-02-01';
  for (let mask = 0; mask < 32; mask++) {
    const selected = MONTHLY_SHOP_EXCHANGES.filter((_, index) => mask & (1 << index));
    plan.scenarioSelections = Object.fromEntries(selected.map(shop => [shop.id, 'include']));
    const ledger = buildPlannerLedger(plan, data, '2026-03-31');
    const monthlyTickets = (mask & 1 ? 1 : 0) + 2 * selected.filter(shop => shop.id !== 'monthly_shop_friend_points').length;
    for (const date of ['2026-02-01', '2026-03-01']) {
      for (const currency of ['uma_ticket', 'support_ticket']) {
        expect(ledger.filter(entry => entry.date === date && entry.currency === currency)
          .reduce((total, entry) => total + entry.amount, 0), `${mask}: ${date} ${currency}`).toBe(monthlyTickets);
      }
    }
    expect(ledger).toHaveLength(selected.length * 4);
  }
  for (const [legacy, expected] of [['', 0], ['none', 0], ['friend_points', 1], ['include', 3]] as const) {
    plan.scenarioSelections = { monthly_shop_tickets: legacy };
    const migrated = sanitizePlan(plan)!;
    expect(migrated.scenarioSelections.monthly_shop_tickets).toBeUndefined();
    const ledger = buildPlannerLedger(migrated, data, '2026-02-28');
    expect(ledger.filter(entry => entry.currency === 'uma_ticket').reduce((sum, entry) => sum + entry.amount, 0)).toBe(expected);
    expect(buildPlannerLedger(plan, data, '2026-02-28')).toEqual(ledger);
    expect(MONTHLY_SHOP_EXCHANGES.slice(2).every(shop => !migrated.scenarioSelections[shop.id])).toBe(true);
  }
});

it('keeps individual shop choices through saving, cloud sync, sharing and legacy migration', () => {
  const plan = sanitizePlan({ ...createPlan(), scenarioSelections: {
    monthly_shop_tickets: 'include', monthly_shop_friend_points: 'none', monthly_shop_silver_cleats: 'include',
  } })!;
  const selections = plan.scenarioSelections;
  expect(selections).toMatchObject({ monthly_shop_friend_points: 'none', monthly_shop_clovers: 'include', monthly_shop_silver_cleats: 'include' });
  let stored = '';
  const collection = { version: 1 as const, activePlanId: plan.id, plans: [plan] };
  savePlanCollection(collection, { setItem: (_, value) => { stored = value; } });
  expect(loadPlanCollection({ getItem: () => stored }).plans[0]!.scenarioSelections).toEqual(selections);
  expect(expandPlannerCollectionFromCloud(compactPlannerCollectionForCloud(collection))!.plans[0]!.scenarioSelections).toEqual(selections);
  expect(expandCompactPlannerPlanData(compactPlannerPlanData(plan))!.scenarioSelections).toEqual(selections);
});
