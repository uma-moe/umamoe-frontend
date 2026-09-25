import { expect, it } from 'vitest';
import { activeIncomeAssumptionCount, buildPlannerIncomeGroups, buildPlannerIncomeSections, enabledIncomeTotalLabel, incomeRuleScheduleLabel } from './planner-income-view';
import { plannerIncomeData } from '../../../tests/e2e/fixtures/planner-income-data';
import { createPlan, loadPlanCollection, projectPlan, type PlannerIncomeRule } from '@/lib/timeline/carat-planner';

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
  const groups = buildPlannerIncomeGroups(plannerIncomeData.income.rules, plannerIncomeData.rewards.competitive_variants!, [], plannerIncomeData.rewards.global_reward_comparison);
  expect(buildPlannerIncomeSections(groups).map(section => [section.id,section.groups.length])).toEqual([['account',4],['competitive',6],['event_completion',7],['stories_login',7],['estimates',2]]);
  expect(groups.find(group => group.id === 'legend_race_clears')!.options.map(option => option.amountLabel)).toEqual(Array(4).fill('Varies by event'));
  expect(groups.find(group => group.id === 'monthly_shop_tickets')!.options.map(option => [option.value,option.amountLabel])).toEqual([['friend_points','+1 Uma + 1 support / mo'],['include','+3 Uma + 3 support / mo']]);
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
