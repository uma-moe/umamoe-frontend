import type { Page } from '@playwright/test';
import type { CaratPlan, PlannerTarget } from '../../../src/lib/carat-planner/carat-planner';
import { mockTimeline } from './api.ts';

const target = (id: string, title: string, start: string, end: string, extra: Partial<PlannerTarget> = {}): PlannerTarget => ({
  id, eventId: id, title, bannerKind: 'character', bannerStart: start, bannerEnd: end, plannedPulls: 10, desiredCopies: 1, pullTiming: 'end', useTickets: true, allowPaidJewels: false, ...extra
});
export function plannerControlsPlan() {
  const plan: CaratPlan = {
    id: 'planner-controls', name: 'Controls plan', createdAt: '2026-08-29T12:00:00Z', updatedAt: '2026-08-29T12:00:00Z', projectionStartDate: '2026-09-01',
    balances: { freeJewels: 15000, paidJewels: 0, umaTickets: 0, supportTickets: 0, rainbowCrystals: 0, goldCrystals: 0, rainbowFullCrystals: 0, goldFullCrystals: 0 },
    enabledIncomeRuleIds: [], enabledRewardIds: [], disabledRewardIds: [], enabledRewardEventIds: [], disabledEventIds: [], scenarioSelections: {}, variableRewardSelections: {}, freePullCampaignSelections: {}, resourceDefaultsApplied: true, customIncome: [], targets: []
  };
  plan.targets = [
    target('later', 'Later banner', '2026-09-27', '2026-09-30'),
    target('past-old', 'Older banner', '2026-08-01', '2026-08-10'),
    target('custom', 'Custom banner', '2026-09-01', '2026-09-04', { pullTiming: 'custom', customPullDate: '2026-09-16', allowPaidJewels: true }),
    target('first', 'First banner', '2026-09-07', '2026-09-10'),
    target('past-new', 'Recent past banner', '2026-08-20', '2026-08-30'),
    target('hidden', 'Disabled banner', '2026-09-01', '2026-09-10', { plannedPulls: 777, pullTiming: 'custom', customPullDate: '2026-10-01' })
  ];
  plan.disabledEventIds = ['hidden'];
  return plan;
}
export const plannerControlsTimeline = { events: [
  ...plannerControlsPlan().targets.map(item => ({ id: item.eventId, type: 'character_banner', title: item.title, global_release_date: `${item.bannerStart}T00:00:00Z`, jp_release_date: `${item.bannerStart}T00:00:00Z`, estimated_end_date: `${item.bannerEnd}T00:00:00Z`, is_confirmed: true, planner_data_available: true })),
  { id: 'half', type: 'campaign', title: 'Half-Anniversary', global_release_date: '2026-09-05T00:00:00Z', jp_release_date: '2026-09-05T00:00:00Z', is_confirmed: true },
  { id: 'half-part2', type: 'campaign', title: '0.5-Year Anniversary', global_release_date: '2026-09-06T00:00:00Z', jp_release_date: '2026-09-06T00:00:00Z', is_confirmed: true },
  { id: 'year', type: 'campaign', title: '1st Anniversary', global_release_date: '2026-09-20T00:00:00Z', jp_release_date: '2026-09-20T00:00:00Z', is_confirmed: true }
] };
export async function mockPlannerControls(page: Page): Promise<void> {
  await mockTimeline(page);
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: plannerControlsTimeline }));
  await page.addInitScript(plan => {
    if (!localStorage.getItem('carat-planner-plans-v1')) localStorage.setItem('carat-planner-plans-v1', JSON.stringify({ version: 1, activePlanId: plan.id, plans: [plan] }));
  }, plannerControlsPlan());
}
