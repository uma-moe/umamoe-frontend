import type { Page } from '@playwright/test';
import { plannerControlsPlan } from './planner-controls.ts';
import { detailGachas, detailTimeline, mockTimelineDetails } from './timeline-details.ts';

export function plannerGoalsPlan() {
  const plan = plannerControlsPlan();
  plan.id = 'planner-goals'; plan.name = 'Pickup goals'; plan.disabledEventIds = [];
  plan.balances.freeJewels = 60000; plan.balances.rainbowFullCrystals = 3;
  plan.targets = [{ ...plan.targets[0]!, id: 'support-goals', eventId: 'detail-support', gachaId: 9002, title: 'Kitasan Black Support', bannerKind: 'support', bannerStart: '2026-09-10', bannerEnd: '2026-09-20', plannedPulls: 200, desiredCopies: 3, pickupId: 30028, pickupGoals: [{ pickupId: 30028, desiredCopies: 3 }, { pickupId: 30001, desiredCopies: 2 }], rainbowCrystalsPlanned: 2 }];
  return plan;
}

export async function mockPlannerGoals(page: Page, unavailable = false): Promise<void> {
  await mockTimelineDetails(page);
  const ids = [30028, 30001, 30002];
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: { events: detailTimeline.events.map(event => event.id === 'detail-support' ? { ...event, pickup_card_ids: ids, related_support_cards: ['Kitasan Black', 'Special Week', 'Silence Suzuka'] } : event) } }));
  await page.route('**/resources/test/planner_income.json*', route => route.fulfill({ json: { rules: [] } }));
  await page.route('**/resources/test/planner_rewards.json*', route => route.fulfill({ json: { rewards: [] } }));
  await page.route('**/resources/test/planner_gacha_2026.json*', route => route.fulfill({ json: { gachas: [detailGachas.gachas[0], { ...detailGachas.gachas[1], gacha_type: unavailable ? 77 : 3, free_pulls: 0, spark_pulls: 200, pickups: ids.map((id, index) => ({ pickup_id: id, rate: unavailable && index === 1 ? -1 : .0075 })), rarity_rates: [{ rarity: 3, rate: .03 }] }] } }));
  await page.addInitScript(plan => {
    if (!localStorage.getItem('carat-planner-plans-v1')) localStorage.setItem('carat-planner-plans-v1', JSON.stringify({ version: 1, activePlanId: plan.id, plans: [plan] }));
  }, plannerGoalsPlan());
}
