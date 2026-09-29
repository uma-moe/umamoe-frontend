import { expect, it } from 'vitest';
import { activeIncomeAssumptionCount, buildPlannerIncomeGroups, buildPlannerIncomeSections, enabledIncomeTotalLabel, incomeRuleScheduleLabel, summarizePlannerIncome } from './planner-income-view';
import { plannerIncomeData } from '../../../tests/e2e/fixtures/planner-income-data';
import { buildPlannerLedger, createPlan, loadPlanCollection, projectPlan, type PlannerIncomeRule, type PlannerDataBundle } from '@/lib/timeline/carat-planner';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
import { normalizePlannerIncomeRules } from '@/lib/timeline/planner-income-assumptions';

it('summarizes scheduled income across currencies, competitive rewards and deductions within the projection dates', () => {
  const plan = createPlan();
  plan.projectionStartDate = '2026-09-01';
  plan.enabledIncomeRuleIds = ['daily', 'alternating', 'future'];
  plan.scenarioSelections = { champions_meeting_result: 'group_b_second', champions_meeting_round_income: 'competitive' };
  plan.customIncome = [{ id: 'adjustment', label: 'Adjustment', currency: 'paid_jewels', amount: -100, cadence: 'once', startDate: '2026-09-08' }];
  const data: PlannerDataBundle = { core: {}, income: { rules: [
    { id: 'daily', label: 'Daily login', currency: 'free_jewels', amount: 75, cadence: 'daily', start_date: '2026-09-01' },
    { id: 'alternating', label: 'Fortnightly tickets', currency: 'uma_ticket', amount: 2, cadence: 'weekly', every: 2, start_date: '2026-09-01' },
    { id: 'future', label: 'Future income', currency: 'free_jewels', amount: 9999, cadence: 'once', start_date: '2026-10-01' },
  ] }, rewards: { rewards: [{ id: 'gift', label: 'Event gift', currency: 'free_jewels', amount: 1000, default_enabled: true, available_at: '2026-09-20', source_items: [
    { item_category: 40, item_id: 111, amount: 3 }, { item_category: 164, item_id: 149, amount: 2 }, { item_category: 164, item_id: 150, amount: 1 },
    { item_category: 164, item_id: 144, amount: 1 }, { item_category: 164, item_id: 145, amount: 2 },
  ] }] }, timelineEvents: [{ id: 'cm', eventType: 'champions_meeting', date: new Date('2026-09-20T00:00:00Z') } as TimelineRecord] };
  const summary = summarizePlannerIncome(buildPlannerLedger(plan, data, '2026-09-30'));
  expect(Object.fromEntries(summary.resources.map(item => [item.currency, item.amount]))).toEqual({
    free_jewels: 2250 + 1000 + 1540, paid_jewels: -100, uma_ticket: 8, support_ticket: 5,
    rainbow_crystal: 2, gold_crystal: 1, rainbow_full_crystal: 1, gold_full_crystal: 2,
  });
  expect(summary.totalLabel).toBe('+4,690 Carats · +13 tickets · +3 shards · +3 Uncap Crystals');
  expect(summary.sources.find(source => source.label === 'Daily login')?.amountLabel).toBe('+2,250 Free Carats');
  expect(summary.sources.find(source => source.label === 'Adjustment')?.amountLabel).toBe('-100 Paid Carats');
  expect(summary.sources.some(source => source.label === 'Future income')).toBe(false);
  plan.disabledEventIds = ['cm'];
  plan.disabledRewardIds = ['gift'];
  expect(summarizePlannerIncome(buildPlannerLedger(plan, data, '2026-09-10')).totalLabel).toBe('+650 Carats · +2 tickets');
  expect(summarizePlannerIncome([])).toEqual({ resources: [], sources: [], totalLabel: '0 projected income' });
});

it('offers half classes with alternating repeat rewards and exact weekly averages', () => {
  const base: PlannerIncomeRule[] = [35, 75, 150, 225, 375].map((amount, index) => ({
    id: `trials-${index + 2}`, label: 'Team Trials', currency: 'free_jewels', amount, cadence: 'weekly',
    start_date: '2026-01-01', scenario_group: 'team_trials_class', scenario_option: `class_${index + 2}`,
  }));
  const rules = normalizePlannerIncomeRules(base);
  expect(normalizePlannerIncomeRules(rules)).toEqual(rules);
  const group = buildPlannerIncomeGroups(rules, [], []).find(group => group.id === 'team_trials_class')!;
  expect(group.options.map(option => option.label)).toEqual(['Class 2', 'Class 3', 'Class 3.5', 'Class 4', 'Class 4.5', 'Class 5', 'Class 5.5', 'Class 6']);
  const plan = createPlan(); plan.projectionStartDate = '2026-01-01';
  const data = { core: {}, income: { rules }, rewards: { rewards: [] } };
  for (const [rank, promotion, demotion] of [[3.5, 150, 75], [4.5, 225, 150], [5.5, 300, 225]]) {
    plan.scenarioSelections = { team_trials_class: `class_${rank}` };
    const average = (promotion! + demotion!) / 2;
    expect(group.options.find(option => option.value === `class_${rank}`)?.amountLabel).toBe(`+${average}/wk avg`);
    expect(enabledIncomeTotalLabel(plan, rules, [])).toBe(`+${average} / week`);
    expect(buildPlannerLedger(plan, data, '2026-01-28').map(entry => [entry.date, entry.amount])).toEqual([
      ['2026-01-01', promotion], ['2026-01-08', demotion], ['2026-01-15', promotion], ['2026-01-22', demotion],
    ]);
  }
  plan.projectionStartDate = '2026-01-08';
  expect(buildPlannerLedger(plan, data, '2026-01-28').map(entry => entry.amount)).toEqual([225, 300, 225]);
  for (const [index, rule] of base.entries()) {
    plan.scenarioSelections = { team_trials_class: `class_${index + 2}` };
    expect(buildPlannerLedger(plan, data, '2026-01-28').map(entry => entry.amount)).toEqual([rule.amount, rule.amount, rule.amount]);
  }
});

it('includes the paid purchase grant in the daily pack toggle and income summary', () => {
  const plan = createPlan();
  plan.projectionStartDate = '2026-01-01';
  plan.scenarioSelections = {};
  plan.enabledIncomeRuleIds = ['daily-jewel-pack-16'];
  const rule: PlannerIncomeRule = {
    id: 'daily-jewel-pack-16', label: 'Daily Jewel Pack (continuous)',
    currency: 'free_jewels', amount: 50, cadence: 'daily', start_date: '2017-01-01',
  };

  expect(activeIncomeAssumptionCount(plan, [rule])).toBe(1);
  expect(enabledIncomeTotalLabel(plan, [rule], [])).toBe('+50 / day · +500 paid / 30 days');
  expect(incomeRuleScheduleLabel(rule)).toBe('Every day · +500 paid at projection start, then every 30 days');

  plan.enabledIncomeRuleIds = [];
  expect(enabledIncomeTotalLabel(plan, [rule], [])).toBe('');
});

it('matches the populated Angular income grouping, per-event amounts, monthly shop choices and totals', () => {
  const groups = buildPlannerIncomeGroups(normalizePlannerIncomeRules(plannerIncomeData.income.rules), plannerIncomeData.rewards.competitive_variants!, [], plannerIncomeData.rewards.global_reward_comparison);
  expect(buildPlannerIncomeSections(groups).map(section => [section.id,section.groups.length])).toEqual([['account',8],['competitive',6],['event_completion',7],['stories_login',7],['estimates',2]]);
  expect(groups.find(group => group.id === 'legend_race_clears')!.options.map(option => option.amountLabel)).toEqual(Array(4).fill('Varies by event'));
  const shops = groups.filter(group => group.id.startsWith('monthly_shop_'));
  expect(shops.map(shop => shop.options.map(option => [option.value, option.amountLabel]))).toEqual([
    [['include', '+1 Uma + 1 support / mo']], ...Array(4).fill([['include', '+2 Uma + 2 support / mo']]),
  ]);
  expect(shops[1]!.helpText).toContain('800 Clovers per month');
  expect(shops[2]!.helpText).toContain('Excludes SR+ Make Debut tickets');
  expect(groups.find(group => group.id === 'strongest_team_reward_tier')!.options.map(option => [option.value,option.amountLabel])).toEqual([['all','+900 / event'],['points_300','+900 / event'],['points_200','+600 / event'],['points_100','+300 / event']]);
  expect(buildPlannerIncomeGroups([], [], []).filter(group => group.options.length === 1)).toHaveLength(12);
  const plan = createPlan(); plan.projectionStartDate = '2026-09-01'; plan.balances.freeJewels = 0;
  plan.scenarioSelections = { team_trials_class:'class_5',club_rank:'rank_7',training_pass:'free',speculative_income:'include' };
  plan.enabledIncomeRuleIds = ['daily-login','premium-training-pass'];
  expect(activeIncomeAssumptionCount(plan, plannerIncomeData.income.rules)).toBe(5);
  expect(enabledIncomeTotalLabel(plan, plannerIncomeData.income.rules, [], plannerIncomeData.rewards.global_reward_comparison)).toBe('+100 / day · +500 / week · +2,500 / month');
  plan.scenarioSelections = {}; plan.targets = [{ id:'target',eventId:'target',title:'Target',bannerKind:'character',bannerStart:'2026-09-01',bannerEnd:'2026-09-01',pullTiming:'end',plannedPulls:0,desiredCopies:1,useTickets:false,allowPaidJewels:false }];
  expect(projectPlan(plan, plannerIncomeData).balances.freeJewels).toBe(100);
  plan.customIncome = [{id:'custom',label:'x'.repeat(120),startDate:'2026-09-01',cadence:'once',amount:1,currency:'free_jewels'}];
  const saved = JSON.stringify({version:1,activePlanId:plan.id,plans:[plan]});
  expect(loadPlanCollection({getItem:()=>saved}).plans[0]!.customIncome[0]!.label).toBe('x'.repeat(100));
});
