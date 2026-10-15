import type { Page } from '@playwright/test';
import { mockTimeline } from './api.ts';
import { plannerRewardsData, plannerRewardsPlan, rewardEvents } from './planner-rewards-data.ts';
export {
  plannerRewardsData,
  plannerRewardsPlan,
  normalizedRewardEvents,
  rewardEvents
} from './planner-rewards-data.ts';
export async function mockPlannerRewards(page: Page): Promise<void> {
  await mockTimeline(page);
  await page.route('**/resources/test/banner_timeline.json*', (route) =>
    route.fulfill({ json: { events: rewardEvents } })
  );

  await page.route('**/resources/test/planner_income.json*', (route) =>
    route.fulfill({ json: { rules: [] } })
  );

  await page.route('**/resources/test/planner_rewards.json*', (route) =>
    route.fulfill({ json: plannerRewardsData })
  );

  await page.addInitScript((plan) => {
    if (!localStorage.getItem('carat-planner-plans-v1'))
      localStorage.setItem(
        'carat-planner-plans-v1',
        JSON.stringify({ version: 1, activePlanId: plan.id, plans: [plan] })
      );
  }, plannerRewardsPlan());
}
