import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { plannerLedgerCases } from '../../../tests/e2e/fixtures/planner-ledger-data';
import reference from './planner-ledger.reference.json';
import { activePlan, buildPlannerLedger, createPlan, loadPlanCollection, projectPlan, sanitizePlan, savePlanCollection, type PlannerDataBundle, type PlannerLedgerEntry } from './carat-planner';
import { compactPlannerCollectionForCloud, expandPlannerCollectionFromCloud } from './planner-cloud-codec';
import { decodeCompactPlannerShare, encodeCompactPlannerShare } from './planner-share-codec';

function ledgerSummary(ledger: PlannerLedgerEntry[]) {
  return { count: ledger.length, digest: createHash('sha256').update(JSON.stringify(ledger.map(item => [item.id, item.label, item.date, item.currency, item.amount, item.source]))).digest('hex'), first: ledger[0] ?? null, last: ledger.at(-1) ?? null };
}

it('matches the complete ordered ledger and each pull balance captured from Angular', () => {
  // Each digest includes every dated entry, not just its total. Capture: the reference ledger.
  for (const item of plannerLedgerCases(createPlan())) {
    const projection = projectPlan(item.plan, item.data);
    const dates = projection.targets.map(target => target.pullDate);
    const prepared = buildPlannerLedger(item.plan, item.data, dates.at(-1) ?? item.plan.projectionStartDate, dates);
    expect(projectPlan(item.plan, item.data, prepared), `${item.name}: prepared ledger`).toEqual(projection);
    const changedPulls = structuredClone(item.plan);
    for (const target of changedPulls.targets) target.plannedPulls += 10;
    expect(projectPlan(changedPulls, item.data, prepared), `${item.name}: changed pulls`).toEqual(projectPlan(changedPulls, item.data));
    expect({ ledger: ledgerSummary(buildPlannerLedger(item.plan, item.data, item.through)), projection: {
      balances: projection.balances, unallocated: ledgerSummary(projection.unallocatedIncome),
      targets: projection.targets.map(target => ({ id: target.targetId, date: target.pullDate, balanceBefore: target.balanceBefore, fundedPulls: target.fundedPulls, rewardCaratsGained: target.rewardCaratsGained, income: ledgerSummary(target.income) }))
    } }, item.name).toEqual(reference[item.name as keyof typeof reference]);
  }
});

it('credits daily pack purchases immediately and every 30 days alongside the daily free Carats', () => {
  const plan = createPlan();
  plan.projectionStartDate = '2026-01-31';
  plan.enabledIncomeRuleIds = ['daily-jewel-pack-16'];
  plan.targets = [{ id: 'target', eventId: 'target', title: 'Target', bannerKind: 'character', bannerEnd: '2026-03-02', pullTiming: 'end', plannedPulls: 0, desiredCopies: 1, useTickets: false, allowPaidJewels: false }];
  const data: PlannerDataBundle = {
    core: {}, rewards: { rewards: [] },
    income: { rules: [{
      id: 'daily-jewel-pack-16', label: 'Daily Jewel Pack (continuous)',
      currency: 'free_jewels', amount: 50, cadence: 'daily',
      start_date: '2017-01-01T12:00:00+00:00', end_date: '2026-03-31',
    }] },
  };
  const purchases = (through: string) => buildPlannerLedger(plan, data, through).filter(entry => entry.currency === 'paid_jewels');

  expect(purchases('2026-01-31')).toMatchObject([{ date: '2026-01-31', amount: 500 }]);
  expect(purchases('2026-03-01')).toHaveLength(1);
  const target = projectPlan(plan, data).targets[0]!;
  expect(target.balanceBefore).toMatchObject({ freeJewels: 31 * 50, paidJewels: 1_000 });
  expect(target.income.filter(entry => entry.currency === 'paid_jewels').map(entry => entry.date))
    .toEqual(['2026-01-31', '2026-03-02']);
  // The next renewal is April 1, after this pack rule ends.
  expect(purchases('2026-04-02')).toHaveLength(2);

  plan.enabledIncomeRuleIds = [];
  expect(buildPlannerLedger(plan, data, '2026-04-02')).toEqual([]);
});

it('waits for daily pack availability before starting purchases and renewals', () => {
  const plan = createPlan();
  plan.projectionStartDate = '2026-01-01';
  plan.enabledIncomeRuleIds = ['daily-jewel-pack'];
  const data: PlannerDataBundle = {
    core: {}, rewards: { rewards: [] },
    income: { rules: [{
      id: 'daily-jewel-pack', label: 'Daily Jewel Pack (continuous)',
      currency: 'free_jewels', amount: 50, cadence: 'daily', start_date: '2026-01-15',
    }] },
  };

  expect(buildPlannerLedger(plan, data, '2026-01-14')).toEqual([]);
  const ledger = buildPlannerLedger(plan, data, '2026-02-14');
  expect(ledger.filter(entry => entry.currency === 'paid_jewels').map(entry => entry.date))
    .toEqual(['2026-01-15', '2026-02-14']);
  expect(ledger.filter(entry => entry.currency === 'free_jewels').reduce((sum, entry) => sum + entry.amount, 0)).toBe(31 * 50);
});

it('validates custom income dates and preserves signed amounts through storage and both share codecs', async () => {
  const income = { id: 'income', label: ' Deduction ', currency: 'free_jewels', amount: -200.9, cadence: 'monthly', startDate: '2026-09-01' };
  const plan = sanitizePlan({ ...createPlan(), customIncome: [income, { ...income, id: 'interval', every: 400, endDate: '2026-02-31' }, { ...income, label: '' }, { ...income, startDate: '2026-02-31' }, { ...income, startDate: '' }, []] })!;
  expect(plan.customIncome).toEqual([
    { ...income, label: 'Deduction', amount: -200, every: 1, endDate: undefined },
    { ...income, id: 'interval', label: 'Deduction', amount: -200, every: 400, endDate: undefined }
  ]);
  expect(sanitizePlan({ ...plan, customIncome: [{ ...income, amount: Number.POSITIVE_INFINITY }] })!.customIncome[0]!.amount).toBe(0);
  const invalidDate = sanitizePlan({ ...plan, projectionStartDate: '2026-02-31' })!;
  expect(invalidDate.projectionStartDate).toBe(new Date().toISOString().slice(0, 10));
  const collection = { version: 1 as const, activePlanId: plan.id, plans: [plan] };
  let stored = '';
  savePlanCollection(collection, { setItem: (_, value) => stored = value });
  const restored = activePlan(loadPlanCollection({ getItem: () => stored }));
  expect(restored.customIncome).toEqual(plan.customIncome);
  const cloud = activePlan(expandPlannerCollectionFromCloud(compactPlannerCollectionForCloud(collection))!);
  const shared = sanitizePlan((await decodeCompactPlannerShare(await encodeCompactPlannerShare(plan))).plan)!;
  // Sparse share formats intentionally regenerate row IDs; amounts, dates and cadence must survive.
  const contents = (value: typeof plan) => value.customIncome.map(({ id, ...item }) => item);
  expect(contents(cloud)).toEqual(contents(plan));
  expect(contents(shared)).toEqual(contents(plan));
});
