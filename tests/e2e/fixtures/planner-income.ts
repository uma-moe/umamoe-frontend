import type { Page } from '@playwright/test';
import { mockTimeline } from './api.ts';
import { plannerControlsPlan } from './planner-controls.ts';

import { plannerIncomeData } from './planner-income-data.ts';
export { plannerIncomeData } from './planner-income-data.ts';

export async function mockPlannerIncome(page: Page): Promise<void> {
  await mockTimeline(page);
  await page.route('**/resources/test/planner_income.json*', (route) =>
    route.fulfill({ json: plannerIncomeData.income })
  );

  await page.route('**/resources/test/planner_rewards.json*', (route) =>
    route.fulfill({ json: plannerIncomeData.rewards })
  );

  const plan = plannerControlsPlan();
  plan.targets = [];
  plan.disabledEventIds = [];
  plan.enabledIncomeRuleIds = ['daily-login', 'premium-training-pass'];
  plan.scenarioSelections = {
    team_trials_class: 'class_5',
    club_rank: 'rank_7',
    monthly_shop_tickets: 'friend_points',
    training_pass: 'free'
  };

  await page.addInitScript((plan) => {
    if (!localStorage.getItem('carat-planner-plans-v1'))
      localStorage.setItem(
        'carat-planner-plans-v1',
        JSON.stringify({ version: 1, activePlanId: plan.id, plans: [plan] })
      );
  }, plan);
}
