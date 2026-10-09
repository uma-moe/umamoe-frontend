import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { createHash, webcrypto } from 'node:crypto';
const http = vi.hoisted(() => vi.fn());
vi.mock('../../services/http/app-http', () => ({ appHttp: { request: http } }));
vi.mock('../../lib/catalog/support-card-catalog', () => ({ loadSupportCardRarities: async () => new Map() }));
import { plannerResourceRepository as repository, plannerUsingCache } from './planner-resource-repository';
import { buildPlannerLedger, createPlan, loadPlanCollection, type PlannerIncomeRule } from '@/lib/timeline/carat-planner';
import { activeIncomeAssumptionCount, enabledIncomeTotalLabel } from './planner-income-view';
const saved = new Map<string, Response>();
beforeEach(() => { repository.invalidate(); http.mockReset(); saved.clear(); vi.stubGlobal('caches', { open: async (name: string) => { expect(name).toBe('umamoe-carat-planner-v2'); return { match: async (url: string) => saved.get(url)?.clone(), put: async (url: string, response: Response) => { saved.set(url, response); } }; } }); });
afterEach(() => { repository.invalidate(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it.each([false, true])('keeps the continuing daily pack over an expired duplicate (reversed: %s) without double income', async reversed => {
  const rule: PlannerIncomeRule = { id: 'daily-jewel-pack', label: 'Daily Jewel Pack (continuous)', description: 'Receive 50 jewels daily.', currency: 'free_jewels', amount: 50, cadence: 'daily', start_date: '2017-01-01T12:00:00+00:00', end_date: '2030-01-10T00:00:00+00:00' };
  const rules = [{ ...rule, id: 'daily-jewel-pack-16' }, { ...rule, id: 'daily-jewel-pack-49', start_date: '2022-10-06T00:30:00+00:00', end_date: '2022-10-06T00:30:00+00:00' }];
  if (reversed) rules.reverse();
  http.mockImplementation(async url => Response.json(url.includes('manifest') ? { files: {
    'planner_core.json': 'planner_core.json', 'planner_income.json': 'planner_income.json', 'planner_rewards.json': 'planner_rewards.json',
  } } : url.includes('planner_income.json') ? { rules } : {}));
  const data = await repository.initial();
  expect(data.income.rules.filter(item => item.id === rule.id)).toEqual([{ ...rule, label: 'Daily Carat Pack (continuous)', description: 'Receive 50 Carats daily.' }]);
  for (const ids of [[], ['daily-jewel-pack'], ['daily-jewel-pack-16'], ['daily-jewel-pack-49'], rules.map(item => item.id)]) {
    const saved = { ...createPlan(), projectionStartDate: '2026-10-01', scenarioSelections: {}, enabledIncomeRuleIds: ids };
    const plan = loadPlanCollection({ getItem: () => JSON.stringify({ version: 1, activePlanId: saved.id, plans: [saved] }) }).plans[0]!;
    plan.scenarioSelections = {};
    expect(plan.enabledIncomeRuleIds).toEqual(ids.length ? ['daily-jewel-pack'] : []);
    expect(activeIncomeAssumptionCount(plan, data.income.rules)).toBe(ids.length ? 1 : 0);
    expect(enabledIncomeTotalLabel(plan, data.income.rules, [])).toBe(ids.length ? '+50 / day · +500 paid / 30 days' : '');
    const ledger = buildPlannerLedger(plan, data, '2026-12-19');
    expect(ledger.filter(item => item.currency === 'free_jewels').reduce((sum, item) => sum + item.amount, 0)).toBe(ids.length ? 4_000 : 0);
    expect(ledger.filter(item => item.currency === 'paid_jewels').map(item => [item.date, item.amount])).toEqual(ids.length ? [['2026-10-01', 500], ['2026-10-31', 500], ['2026-11-30', 500]] : []);
  }
});
it('adds missing Cleat scout tickets without duplicating published shop rules', async () => {
  http.mockImplementation(async url => Response.json(url.includes('manifest') ? { files: {
    'planner_core.json': 'planner_core.json', 'planner_income.json': 'planner_income.json', 'planner_rewards.json': 'planner_rewards.json',
  } } : url.includes('planner_income.json') ? { rules: [{
    id: 'monthly-shop-silver-cleats-uma_ticket', label: 'Silver Cleat Exchange tickets',
    currency: 'uma_ticket', amount: 2, cadence: 'monthly', start_date: '2025-06-26',
    scenario_group: 'monthly_shop_tickets', scenario_option: 'include',
  }] } : {}));
  const { income } = await repository.initial();
  expect(income.rules).toHaveLength(6);
  expect(income.rules.filter(rule => rule.scenario_group === 'monthly_shop_silver_cleats')).toHaveLength(2);
  expect(income.rules.every(rule => rule.amount === 2 && rule.scenario_option === 'include')).toBe(true);
});
it('resolves relative protected artifacts, caches parsed successes, and recovers Angular offline data', async () => {
  http.mockImplementation(async url => Response.json(url.includes('manifest') ? { files: { 'planner_core.json': 'v2/planner_core.json' } } : { jewel_cost_per_pull: 150 }));
  expect(await repository.core()).toEqual({ jewel_cost_per_pull: 150 });
  expect(http).toHaveBeenCalledWith('/resources/planner/v2/planner_core.json', expect.objectContaining({ browserProof: true }));
  repository.invalidate(); http.mockRejectedValue(new Error('offline'));
  expect(await repository.core()).toEqual({ jewel_cost_per_pull: 150 }); expect(get(plannerUsingCache)).toBe(true);
  repository.invalidate(); http.mockImplementation(async url => Response.json(url.includes('manifest') ? { files: { 'planner_core.json': 'planner/v3/planner_core.json' } } : { jewel_cost_per_pull: 160 }));
  expect(await repository.core()).toEqual({ jewel_cost_per_pull: 160 }); expect(get(plannerUsingCache)).toBe(false);
});
it('refreshes rewards when their manifest hash changes without replacing saved choices', async () => {
  vi.useFakeTimers(); let version = 'one';
  http.mockImplementation(async url => Response.json(url.includes('manifest') ? { files: { 'planner_rewards.json': { path: 'planner_rewards.json', sha256: version } } } : { rewards: [{ id: version, amount: 100 }] }));
  const first = await repository.rewards();
  expect(await repository.rewards()).toBe(first);
  const listener = vi.fn(); const stop = repository.watchRewards(listener);
  try {
    version = 'two'; await vi.advanceTimersByTimeAsync(60_000);
    expect(listener).toHaveBeenCalledOnce(); expect(listener.mock.calls[0]![0].rewards[0].id).toBe('two');
    expect(listener.mock.calls[0]![0]).not.toBe(first);
    expect(http).toHaveBeenCalledWith('/resources/planner/planner_rewards.json?v=two', expect.anything());
    stop(); const count = http.mock.calls.length; await vi.advanceTimersByTimeAsync(60_000); expect(http).toHaveBeenCalledTimes(count);
  } finally { stop(); }
});

it('reuses persisted protected artifacts when the manifest hash is unchanged', async () => {
  let hash = 'one';
  http.mockImplementation(async url => Response.json(url.includes('manifest')
    ? { files: { 'planner_core.json': { path: 'planner_core.json', sha256: hash } } }
    : { jewel_cost_per_pull: hash === 'one' ? 150 : 160 }));
  expect(await repository.core()).toEqual({ jewel_cost_per_pull: 150 });
  repository.invalidate(); http.mockClear();
  expect(await repository.core()).toEqual({ jewel_cost_per_pull: 150 });
  expect(await repository.core(true)).toEqual({ jewel_cost_per_pull: 150 });
  expect(http.mock.calls.every(([url]) => url === '/resources/planner/manifest.json')).toBe(true);
  hash = 'two';
  expect(await repository.core(true)).toEqual({ jewel_cost_per_pull: 160 });
  expect(http).toHaveBeenLastCalledWith('/resources/planner/planner_core.json?v=two', expect.anything());
});

it('repairs a corrupt protected artifact even when its manifest hash has not changed', async () => {
  vi.stubGlobal('crypto', webcrypto);
  const body = '{"jewel_cost_per_pull":150}';
  const hash = createHash('sha256').update(body).digest('hex');
  const path = `/resources/planner/planner_core.json?v=${hash}`;
  saved.set(path, Response.json({jewel_cost_per_pull:999}));
  http.mockImplementation(async url => url.includes('manifest')
    ? Response.json({files:{'planner_core.json':{path:'planner_core.json',sha256:hash}}}) : new Response(body));
  expect(await repository.core()).toEqual({jewel_cost_per_pull:150});
  expect(http).toHaveBeenLastCalledWith(path, expect.objectContaining({cache:'reload'}));
  repository.invalidate(); http.mockClear();
  expect(await repository.core()).toEqual({jewel_cost_per_pull:150});
  expect(http.mock.calls.map(([url]) => url)).toEqual(['/resources/planner/manifest.json']);
});
