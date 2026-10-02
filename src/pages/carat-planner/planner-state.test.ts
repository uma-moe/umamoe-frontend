import { expect, it } from 'vitest';
import { get } from 'svelte/store';
import { plannerCollection, savePlannerCollection } from './planner-state';
import { buildPlannerLedger, type PlannerDataBundle } from '@/lib/timeline/carat-planner';
import { compactPlannerCollectionResourceState } from '@/lib/timeline/planner-resource-state';

it('migrates restored daily pack selections before resource cleanup can discard them', () => {
  const original = structuredClone(get(plannerCollection));
  const data: PlannerDataBundle = { core: {}, rewards: { rewards: [] }, income: { rules: [{
    id: 'daily-jewel-pack', label: 'Daily Carat Pack', currency: 'free_jewels',
    amount: 50, cadence: 'daily', start_date: '2017-01-01', end_date: '2030-01-10',
  }] } };
  try {
    for (const ids of [['daily-jewel-pack-16'], ['daily-jewel-pack'], ['daily-jewel-pack-16', 'daily-jewel-pack']]) {
      const restored = structuredClone(original);
      const plan = restored.plans[0]!;
      plan.projectionStartDate = '2026-10-01';
      plan.enabledIncomeRuleIds = ids;
      plan.scenarioSelections = {};
      plan.customIncome = [];
      savePlannerCollection(restored, false);
      const visible = get(plannerCollection);
      expect(visible.plans[0]!.enabledIncomeRuleIds).toEqual(['daily-jewel-pack']);
      const compacted = compactPlannerCollectionResourceState(visible, data);
      const ledger = buildPlannerLedger(compacted.plans[0]!, data, '2026-12-19');
      expect(ledger.filter(entry => entry.currency === 'free_jewels').reduce((sum, entry) => sum + entry.amount, 0)).toBe(4_000);
      expect(ledger.filter(entry => entry.currency === 'paid_jewels').map(entry => [entry.date, entry.amount]))
        .toEqual([['2026-10-01', 500], ['2026-10-31', 500], ['2026-11-30', 500]]);
      expect(JSON.parse(localStorage.getItem('carat-planner-plans-v1')!).plans[0].enabledIncomeRuleIds).toEqual(['daily-jewel-pack']);
    }
  } finally { savePlannerCollection(original, false); }
});

it('a synchronous subscriber migration remains the latest persisted and visible plan', () => {
  const original = structuredClone(get(plannerCollection));
  const next = structuredClone(original); next.plans[0]!.name = 'Before migration';
  const stop = plannerCollection.subscribe(value => {
    if (value.plans[0]?.name === 'Before migration') {
      const migrated = structuredClone(value); migrated.plans[0]!.name = 'Migrated';
      savePlannerCollection(migrated, false);
    }
  });
  try {
    savePlannerCollection(next, false);
    expect(get(plannerCollection).plans[0]!.name).toBe('Migrated');
    expect(JSON.parse(localStorage.getItem('carat-planner-plans-v1')!).plans[0].name).toBe('Migrated');
  } finally { stop(); savePlannerCollection(original, false); }
});
