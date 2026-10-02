import { test, expect } from './fixtures/test';
import { mockPlannerControls, plannerControlsPlan, plannerControlsTimeline } from './fixtures/planner-controls';
import { mockTimeline } from './fixtures/api';
import { compactPlannerCollectionForCloud, expandPlannerCollectionFromCloud } from '../../src/lib/timeline/planner-cloud-codec';

for (const mode of ['restored', 'reselected', 'reselected while loading']) test(`${mode} daily pack selection credits daily free Carats and paid renewals through the last pull`, async ({ page }) => {
  await mockTimeline(page);
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: { events: plannerControlsTimeline.events.filter(event => event.id === 'first') } }));
  await page.route('**/resources/test/planner_rewards.json*', route => route.fulfill({ json: { rewards: [] } }));
  await page.route('**/resources/test/planner_income.json*', route => route.fulfill({ json: { rules: [{
    id: 'daily-jewel-pack-16', label: 'Daily Jewel Pack (continuous)',
    currency: 'free_jewels', amount: 50, cadence: 'daily',
    start_date: '2017-01-01T12:00:00+00:00', end_date: '2030-01-10T00:00:00+00:00',
  }] } }));
  const plan = plannerControlsPlan();
  plan.projectionStartDate = '2026-10-01';
  plan.balances = { ...plan.balances, freeJewels: 0, paidJewels: 0, umaTickets: 0, supportTickets: 0 };
  plan.enabledIncomeRuleIds = ['daily-jewel-pack-16'];
  plan.scenarioSelections = {};
  plan.targets = [{ ...plan.targets.find(target => target.id === 'first')!, plannedPulls: 0, pullTiming: 'custom', customPullDate: '2026-12-19' }];
  await page.addInitScript(plan => {
    if (!localStorage.getItem('carat-planner-plans-v1')) localStorage.setItem('carat-planner-plans-v1', JSON.stringify({ version: 1, activePlanId: plan.id, plans: [plan] }));
    localStorage.setItem('auth_token', 'test-token');
    localStorage.setItem('carat-planner-cloud-meta-v1', JSON.stringify({ userId: 'pack-restore', revision: 7, updatedAt: null }));
  }, plan);
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'pack-restore', display_name: 'Planner Tester', created_at: '2026-01-01T00:00:00Z' } }));
  await page.route('**/api/auth/accounts', route => route.fulfill({ json: [] }));
  let remote = compactPlannerCollectionForCloud({ version: 1, activePlanId: plan.id, plans: [plan] });
  let revision = 7;
  let finishRestore!: () => void;
  const restore = new Promise<void>(resolve => finishRestore = resolve);
  await page.route('**/api/carat-planner/state', async route => {
    if (mode === 'reselected while loading' && route.request().method() === 'GET') await restore;
    if (route.request().method() === 'PUT') { remote = route.request().postDataJSON().collection; revision++; }
    return route.fulfill({ json: { revision, collection: remote, updated_at: plan.updatedAt } });
  });
  await page.goto('/timeline?tab=carat-planner');
  await expect(page.getByRole('status', { name: mode === 'reselected while loading' ? 'Loading account plans' : 'Saved to your account', exact: true })).toBeVisible();
  const balance = page.locator('.target .carat-balance');
  await page.getByRole('button', { name: /Plan assumptions/ }).click();
  await page.getByRole('tab', { name: 'Income', exact: true }).click();
  const toggle = page.getByRole('button', { name: /Daily Carat Pack/ });
  if (mode !== 'restored') {
    if (await toggle.getAttribute('aria-pressed') === 'true') await toggle.click();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(balance).toHaveAttribute('title', /4,000 free, 1,500 paid/);
  }
  finishRestore();
  await expect(page.getByRole('status', { name: 'Saved to your account', exact: true })).toBeVisible();
  await expect(balance).toHaveAttribute('title', /4,000 free, 1,500 paid/);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(balance).toHaveAttribute('title', /0 free, 0 paid/);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(balance).toHaveAttribute('title', /4,000 free, 1,500 paid/);
  await expect.poll(() => expandPlannerCollectionFromCloud(remote)?.plans[0]!.enabledIncomeRuleIds).toEqual(['daily-jewel-pack']);
  await expect(page.getByRole('status', { name: 'Saved to your account', exact: true })).toBeVisible();
  await page.reload();
  await expect(balance).toHaveAttribute('title', /4,000 free, 1,500 paid/);
  await page.getByRole('button', { name: /Plan assumptions/ }).click();
  await page.getByRole('tab', { name: 'Income', exact: true }).click();
  await toggle.click();
  await expect(balance).toHaveAttribute('title', /0 free, 0 paid/);
});

test('Carats at pull shows actual spending after tickets and respects the paid Carat setting', async ({ page }) => {
  await mockPlannerControls(page);
  for (const resource of ['planner_income', 'planner_rewards']) await page.route(`**/resources/test/${resource}.json*`, route => route.fulfill({ json: { rules: [], rewards: [] } }));
  const plan = plannerControlsPlan();
  plan.targets = plan.targets.filter(target => target.id === 'first');
  plan.targets[0]!.plannedPulls = 15;
  plan.balances = { ...plan.balances, freeJewels: 1500, paidJewels: 300, umaTickets: 5 };
  await page.addInitScript(plan => localStorage.setItem('carat-planner-plans-v1', JSON.stringify({ version: 1, activePlanId: plan.id, plans: [plan] })), plan);
  await page.goto('/timeline?tab=carat-planner');
  const row = page.locator('[data-target-id="first"]');
  const balance = row.locator('.carat-balance');
  await expect(balance).toHaveText('1,800→ 300');
  await expect(balance).toHaveAttribute('title', /1,500 spent.*paid Carats are reserved/);
  await row.getByRole('spinbutton', { name: 'Planned pulls', exact: true }).fill('5');
  await expect(balance).toHaveText('1,800→ 1,800');
  await row.getByRole('spinbutton', { name: 'Planned pulls', exact: true }).fill('20');
  await row.getByRole('button', { name: 'Target options', exact: true }).click();
  await row.getByRole('checkbox', { name: 'Allow paid Carats', exact: true }).check();
  await expect(balance).toHaveText('1,800→ 0');
  await expect(balance).toHaveAttribute('title', /1,800 spent/);
});
