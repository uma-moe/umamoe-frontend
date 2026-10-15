import { expect, test } from './fixtures/test';
import { mockTimeline } from './fixtures/api';
import { plannerControlsPlan } from './fixtures/planner-controls';
import { encodeCompactPlannerShare } from '../../src/lib/carat-planner/planner-share-codec';
import { expandPlannerCollectionFromCloud } from '../../src/lib/carat-planner/planner-cloud-codec';
import type { CaratPlanCollection, PlannerDataBundle } from '../../src/lib/carat-planner/carat-planner';
import { readFile } from 'node:fs/promises';

test('Planner keeps unsaved edits usable, exports them, and retries storage after a quota failure', async ({ page }) => {
  await mockTimeline(page);
  const plan = plannerControlsPlan(); plan.targets = []; plan.disabledEventIds = [];
  await page.addInitScript(plan => {
    localStorage.setItem('carat-planner-plans-v1', JSON.stringify({ version: 1, activePlanId: plan.id, plans: [plan] }));
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'carat-planner-plans-v1' && sessionStorage.getItem('block-planner-save') === 'yes') throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
  }, plan);
  await page.goto('/timeline?tab=carat-planner');
  const name = page.getByRole('textbox', { name: 'Plan name', exact: true });
  await expect(name).toHaveValue(plan.name);
  await expect(page.getByText('Loading rates, rewards, and income data…')).toHaveCount(0);
  await page.evaluate(() => sessionStorage.setItem('block-planner-save', 'yes'));
  const before = await page.evaluate(() => localStorage.getItem('carat-planner-plans-v1'));
  await name.fill('Unsaved but recoverable');
  await name.blur();
  await expect(page.getByText('Plan changes are not saved on this device', { exact: true })).toBeVisible();
  await expect(page.locator('.sync')).toHaveText('Not saved on this device');
  expect(await page.evaluate(() => localStorage.getItem('carat-planner-plans-v1'))).toBe(before);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'More plan actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Export plan', exact: true }).click();
  const download = await downloading;
  expect(JSON.parse(await readFile((await download.path())!, 'utf8')).plan.name).toBe('Unsaved but recoverable');
  await page.getByRole('navigation', { name: 'Timeline tools' }).getByRole('link', { name: 'Timeline', exact: true }).click();
  await expect(page.getByText('Plan changes are not saved on this device', { exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Timeline tools' }).getByRole('link', { name: /^Carat Planner/ }).click();
  await expect(name).toHaveValue('Unsaved but recoverable');
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await expect(page.locator('.sync')).toHaveText('Not saved on this device');
  await page.evaluate(() => sessionStorage.removeItem('block-planner-save'));
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await expect(page.getByText('Plan changes are not saved on this device', { exact: true })).toHaveCount(0);
  await expect(page.locator('.sync')).toHaveText('Saved on this device');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!).plans[0].name)).toBe('Unsaved but recoverable');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
});

test('Planner excluded assumptions survive reload and duplicated plans have independent income and dates', async ({ page }) => {
  await mockTimeline(page);
  const plan = plannerControlsPlan(); plan.targets = []; plan.disabledEventIds = [];
  plan.createdAt = plan.updatedAt = '2020-01-01T00:00:00.000Z';
  plan.scenarioSelections = { seasonal_gift_rewards: 'none', valentines_gift_rewards: 'include' };
  plan.customIncome = [{ id: 'original-income', label: 'Monthly income', amount: 300, currency: 'free_jewels', cadence: 'monthly', startDate: '2026-09-01', every: 1 }];
  await page.addInitScript(plan => { if (!localStorage.getItem('carat-planner-plans-v1')) localStorage.setItem('carat-planner-plans-v1', JSON.stringify({ version: 1, activePlanId: plan.id, plans: [plan] })); }, plan);
  await page.route('**/resources/test/planner_rewards.json*', route => route.fulfill({ json: { rewards: [{ id: 'story', label: 'Story event rewards', assumption: 'full_completion', currency: 'free_jewels', amount: 1500, available_at: '2026-09-01' }] } }));
  await page.goto('/timeline?tab=carat-planner');
  await page.getByRole('button', { name: /Plan assumptions/ }).click();
  await page.getByRole('tablist', { name: 'Planner assumptions' }).getByRole('tab', { name: 'Income', exact: true }).click();
  await page.getByRole('button', { name: /^Event completion/ }).click();
  await page.getByRole('button', { name: /^Estimated income/ }).click();
  const story = page.getByRole('checkbox', { name: /^(Include|Exclude) Story event rewards$/ });
  const speculative = page.getByRole('combobox', { name: 'Speculative income', exact: true });
  await expect(story).toBeChecked(); await expect(speculative).toContainText('Rolling mean');
  await story.uncheck();
  await speculative.click(); await page.getByRole('option', { name: /^Not included/ }).click(); await expect(speculative).toContainText('Not included');
  await page.reload();
  await page.getByRole('button', { name: /Plan assumptions/ }).click();
  await page.getByRole('tablist', { name: 'Planner assumptions' }).getByRole('tab', { name: 'Income', exact: true }).click();
  await page.getByRole('button', { name: /^Event completion/ }).click();
  await page.getByRole('button', { name: /^Estimated income/ }).click();
  await expect(story).not.toBeChecked(); await expect(speculative).toContainText('Not included');
  await page.getByRole('button', { name: 'More plan actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Duplicate plan', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Plan name', exact: true })).toHaveValue('Controls plan copy');
  await page.getByRole('textbox', { name: 'Income name', exact: true }).fill('Copy income');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!));
  expect(stored.plans).toHaveLength(2);
  const original = stored.plans[0]; const copy = stored.plans[1];
  expect(original.createdAt).toBe(plan.createdAt); expect(copy.createdAt).toBe('2026-08-29T12:00:00.000Z');
  expect(copy.updatedAt).toBe(copy.createdAt); expect(copy.id).not.toBe(original.id);
  expect(original.customIncome[0]).toEqual(plan.customIncome[0]);
  expect(copy.customIncome[0].id).not.toBe('original-income'); expect(copy.customIncome[0].label).toBe('Copy income');
  expect(copy.scenarioSelections).toMatchObject({ speculative_income: 'none', story_event_rewards: 'none', valentines_gift_rewards: 'include', white_day_gift_rewards: 'none', christmas_gift_rewards: 'none' });
  expect(copy.scenarioSelections.seasonal_gift_rewards).toBeUndefined();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
});

test('Planner preserves a name being edited when delayed banner resources arrive', async ({ page }) => {
  await mockTimeline(page);
  const plan = plannerControlsPlan();
  plan.targets = [{ ...plan.targets[0]!, eventId: 'character-1', gachaId: 7001 }];
  plan.disabledEventIds = [];
  await page.addInitScript(plan => { if (!localStorage.getItem('carat-planner-plans-v1')) localStorage.setItem('carat-planner-plans-v1', JSON.stringify({ version: 1, activePlanId: plan.id, plans: [plan] })); }, plan);
  let release = () => {}; let requested = false;
  const gate = new Promise<void>(resolve => release = resolve);
  await page.route('**/resources/test/planner_gacha_2026.json*', async route => { requested = true; await gate; await route.fallback(); });
  try {
    await page.goto('/timeline?tab=carat-planner');
    await expect.poll(() => requested).toBe(true);
    const name = page.getByRole('textbox', { name: 'Plan name', exact: true });
    await name.fill('My edited copy');
    release();
    await expect(page.locator('.target .date')).toHaveText('Sep 1, 2026 – Sep 10, 2026');
    await expect(name).toHaveValue('My edited copy');
    await name.blur();
    await expect(page.getByRole('button', { name: 'Selected plan', exact: true })).toHaveText('My edited copy');
    await page.reload();
    await expect(name).toHaveValue('My edited copy');
  } finally { release(); }
});

for (const format of ['compact', 'cloud'] as const) {
  test(`Planner ${format} share reopening selects the edited local copy without replacing it`, async ({ page }) => {
    await mockTimeline(page);
    const original = plannerControlsPlan();
    original.targets = [{ ...original.targets[0]!, eventId: 'character-1', gachaId: 7001 }];
    original.disabledEventIds = [];
    const local = { ...original, id: 'local', name: 'Controls plan (shared)', targets: [] };
    await page.addInitScript(plan => { if (!localStorage.getItem('carat-planner-plans-v1')) localStorage.setItem('carat-planner-plans-v1', JSON.stringify({ version: 1, activePlanId: plan.id, plans: [plan] })); }, local);
    const shareId = '0012345678901234';
    const url = format === 'compact' ? `/timeline?tab=carat-planner#p=${await encodeCompactPlannerShare(original)}` : `/timeline?tab=carat-planner&share=${shareId}`;
    await page.route(`**/api/carat-planner/shared/${shareId}`, route => route.fulfill({ json: { share_id: shareId, plan_id: original.id, plan_name: original.name, plan: original, updated_at: original.updatedAt } }));
    await page.goto(url);
    await expect(page.getByText(/Opened Controls plan \(shared\) 2/)).toBeVisible();
    await expect(page.locator('.target .date')).toHaveText('Sep 1, 2026 – Sep 10, 2026');
    const name = page.getByRole('textbox', { name: 'Plan name', exact: true });
    const pulls = page.getByRole('spinbutton', { name: 'Planned pulls', exact: true });
    await name.fill('My edited copy'); await pulls.fill('333'); await pulls.blur();
    const edited = await page.evaluate(() => { const value = JSON.parse(localStorage.getItem('carat-planner-plans-v1')!); return value.plans.find((plan: { id: string }) => plan.id === value.activePlanId); });
    if (format === 'cloud') expect(edited.id).toBe(`shared-${shareId}`);
    original.name = 'Updated publisher snapshot'; original.targets[0]!.plannedPulls = 1;
    const selected = page.getByRole('button', { name: 'Selected plan', exact: true });
    await selected.click(); await page.getByRole('menuitemradio', { name: local.name, exact: true }).click();
    await expect(name).toHaveValue(local.name);
    await page.goto('/timeline');
    await expect(page.locator('#timeline-event-character-1')).toBeVisible();
    await page.goto(url);
    await expect(page.getByText(/Opened My edited copy/)).toBeVisible();
    await expect(page.locator('.target .date')).toHaveText('Sep 1, 2026 – Sep 10, 2026');
    await expect(name).toHaveValue('My edited copy'); await expect(pulls).toHaveValue('333');
    const reopened = await page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!));
    expect(reopened.plans).toHaveLength(2); expect(reopened.activePlanId).toBe(edited.id);
    expect(reopened.plans.find((plan: { id: string }) => plan.id === edited.id)).toEqual(edited);
    expect(reopened.plans[0].name).toBe(local.name);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
    await page.goto(format === 'compact' ? '/timeline?tab=carat-planner#p=invalid' : '/timeline?tab=carat-planner&share=bad');
    await expect(page.getByText(/This .*plan link is invalid/)).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!))).toEqual(reopened);
  });
}

test('Planner ignores a shared response after leaving the planner tab', async ({ page }) => {
  await mockTimeline(page);
  let release!: () => void; let requested = false; let delivered = false;
  const gate = new Promise<void>(resolve => release = resolve);
  const plan = plannerControlsPlan(); plan.targets = []; plan.disabledEventIds = [];
  await page.route('**/api/carat-planner/shared/ABCD1234', async route => {
    requested = true; await gate;
    await route.fulfill({ json: { share_id: 'ABCD1234', plan_id: plan.id, plan_name: plan.name, plan, updated_at: plan.updatedAt } });
    delivered = true;
  });
  try {
    await page.goto('/timeline?tab=carat-planner&share=ABCD1234');
    await expect.poll(() => requested).toBe(true);
    await expect(page.getByText('Loading rates, rewards, and income data…')).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Timeline tools' }).getByRole('link', { name: 'Timeline', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Planner controls and projection' })).toHaveCount(0);
    const before = await page.evaluate(() => localStorage.getItem('carat-planner-plans-v1'));
    release(); await expect.poll(() => delivered).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('carat-planner-plans-v1'))).toBe(before);
  } finally { release(); }
});

test('Planner waits for complete resources before compacting all plans and syncing manual exceptions', async ({ page }) => {
  await mockTimeline(page);
  const plan = plannerControlsPlan(); plan.targets = []; plan.disabledEventIds = ['unknown', 'character-1'];
  plan.createdAt = plan.updatedAt = new Date(plan.updatedAt).toISOString();
  plan.enabledIncomeRuleIds = ['retired', 'scenario', 'daily'];
  plan.enabledRewardIds = ['auto', 'manual', 'retired'];
  plan.disabledRewardIds = ['auto', 'blocked', 'retired'];
  plan.enabledRewardEventIds = ['ordinary', 'retired'];
  plan.scenarioSelections = { custom_scenario: 'chosen' };
  const collection: CaratPlanCollection = { version: 1, activePlanId: plan.id, plans: [plan, { ...plan, id: 'inactive', name: 'Inactive plan' }] };
  await page.addInitScript(value => { if (!localStorage.getItem('carat-planner-plans-v1')) localStorage.setItem('carat-planner-plans-v1', JSON.stringify(value)); }, collection);
  const data: PlannerDataBundle = { core: {}, income: { rules: [
    { id: 'daily', label: 'Daily', currency: 'free_jewels', amount: 10, cadence: 'daily', start_date: '2026-01-01' },
    { id: 'scenario', label: 'Scenario', currency: 'free_jewels', amount: 20, cadence: 'daily', start_date: '2026-01-01', scenario_group: 'custom_scenario', scenario_option: 'chosen' },
  ] }, rewards: { rewards: [
    { id: 'auto', label: 'Auto', currency: 'free_jewels', amount: 100, available_at: '2026-01-01', default_enabled: true },
    { id: 'manual', label: 'Manual', currency: 'free_jewels', amount: 100, available_at: '2026-01-01', default_enabled: false },
    { id: 'blocked', label: 'Blocked', event_id: 'character-1', currency: 'free_jewels', amount: 100, available_at: '2026-01-01' },
  ], event_benefits: [{ id: 'selector', event_id: 'support-1', kind: 'support_selector', label: 'Selector', available_at: '2026-01-01', planner_effect: 'linked_inventory_benefit' }] } };
  let release!: () => void; let requested = false;
  const gate = new Promise<void>(resolve => release = resolve);
  await page.route('**/resources/test/planner_income.json*', async route => { requested = true; await gate; await route.fulfill({ json: data.income }); });
  await page.route('**/resources/test/planner_rewards.json*', route => route.fulfill({ json: data.rewards }));
  try {
    await page.goto('/timeline?tab=carat-planner');
    await expect.poll(() => requested).toBe(true);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!))).toEqual(collection);
    release();
    const expected = { enabledIncomeRuleIds: ['daily'], enabledRewardIds: ['manual'], disabledRewardIds: ['auto'], disabledEventIds: ['character-1'], enabledRewardEventIds: ['support-1'], updatedAt: plan.updatedAt };
    await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!))).plans[0].enabledIncomeRuleIds).toEqual(['daily']);
    const compacted = await page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!));
    for (const item of compacted.plans) expect(item).toMatchObject(expected);
    let remote: unknown = collection; let revision = 1; const saves: CaratPlanCollection[] = [];
    await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'compact-user', display_name: 'Planner Tester', created_at: '2026-01-01T00:00:00Z' } }));
    await page.route('**/api/auth/accounts', route => route.fulfill({ json: [] }));
    await page.route('**/api/carat-planner/state', route => {
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON(); expect(body.base_revision).toBe(revision); revision++;
        remote = body.collection; saves.push(expandPlannerCollectionFromCloud(remote)!);
      }
      return route.fulfill({ json: { revision, collection: remote, updated_at: plan.updatedAt } });
    });
    await page.evaluate(() => localStorage.setItem('auth_token', 'test-token'));
    await page.reload();
    await expect(page.getByRole('status', { name:'Saved to your account', exact:true })).toBeVisible();
    await expect.poll(() => saves.length).toBeGreaterThan(0);
    for (const item of saves.at(-1)!.plans) {
      // Sparse v3 intentionally omits resource-derived selector events; the UI restores them.
      const { enabledRewardEventIds, ...manual } = expected;
      expect(item).toMatchObject(manual);
    }
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!));
    for (const item of persisted.plans) expect(item).toMatchObject(expected);
    await page.reload();
    await expect(page.getByRole('status', { name:'Saved to your account', exact:true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
  } finally { release(); }
});
