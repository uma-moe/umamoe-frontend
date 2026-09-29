import { expect, test } from './fixtures/test';
import { mockPlannerIncome } from './fixtures/planner-income';
import { mockTimeline } from './fixtures/api';
import { plannerControlsPlan, plannerControlsTimeline } from './fixtures/planner-controls';

test('Team Trials half classes show average rewards and survive reload', async ({ page }) => {
  await mockPlannerIncome(page);
  const openIncome = async () => {
    await page.getByRole('button', { name: /Plan assumptions/ }).click();
    await page.getByRole('tablist', { name: 'Planner assumptions' }).getByRole('tab', { name: 'Income', exact: true }).click();
    await page.getByRole('button', { name: /^Account & recurring/ }).click();
  };
  await page.goto('/timeline?tab=carat-planner');
  await openIncome();
  const trials = page.getByRole('combobox', { name: 'Team Trials class', exact: true });
  await trials.click();
  await expect(page.getByRole('option', { name: /^Class [345]\.5/ })).toHaveCount(3);
  await page.getByRole('option', { name: /^Class 5\.5/ }).click();
  await expect(trials).toContainText('Class 5.5');
  await expect(trials).toContainText('+262.5/wk avg');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!).plans[0].scenarioSelections.team_trials_class)).toBe('class_5.5');
  await page.reload();
  await openIncome();
  await expect(trials).toContainText('Class 5.5');
  await expect(trials).toContainText('+262.5/wk avg');
});

test('Daily Jewel Pack appears once and retains its saved selection after reload', async ({ page }) => {
  await mockTimeline(page);
  const pack = { label: 'Daily Jewel Pack (continuous)', currency: 'free_jewels', amount: 50, cadence: 'daily', start_date: '2017-01-01', end_date: '2030-01-10' };
  await page.route('**/resources/test/planner_income.json*', route => route.fulfill({ json: { rules: ['daily-jewel-pack', 'daily-jewel-pack-16'].map(id => ({ ...pack, id })) } }));
  const plan = plannerControlsPlan(); plan.targets = []; plan.enabledIncomeRuleIds = ['daily-jewel-pack-16'];
  await page.addInitScript(plan => {
    if (!localStorage.getItem('carat-planner-plans-v1')) localStorage.setItem('carat-planner-plans-v1', JSON.stringify({ version: 1, activePlanId: plan.id, plans: [plan] }));
  }, plan);
  const openIncome = async () => {
    await page.getByRole('button', { name: /Plan assumptions/ }).click();
    await page.getByRole('tablist', { name: 'Planner assumptions' }).getByRole('tab', { name: 'Income', exact: true }).click();
  };
  await page.goto('/timeline?tab=carat-planner');
  await openIncome();
  const toggle = page.getByRole('button', { name: /Daily Jewel Pack/ });
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await openIncome();
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!).plans[0].enabledIncomeRuleIds)).toEqual(['daily-jewel-pack']);
});

test('Monthly shops are independently tickable and survive reload', async ({ page }) => {
  await mockPlannerIncome(page);
  const openIncome = async () => {
    await page.getByRole('button', { name: /Plan assumptions/ }).click();
    await page.getByRole('tablist', { name: 'Planner assumptions' }).getByRole('tab', { name: 'Income', exact: true }).click();
    await page.getByRole('button', { name: /^Account & recurring/ }).click();
  };
  await page.goto('/timeline?tab=carat-planner');
  await openIncome();
  const friends = page.getByRole('checkbox', { name: /^(Include|Exclude) Monthly shop: Friend Points$/ });
  const clovers = page.getByRole('checkbox', { name: /^(Include|Exclude) Monthly shop: Clovers$/ });
  const silver = page.getByRole('checkbox', { name: /^(Include|Exclude) Monthly shop: Silver Cleats/ });
  const gold = page.getByRole('checkbox', { name: /^(Include|Exclude) Monthly shop: Gold Cleats/ });
  const rainbow = page.getByRole('checkbox', { name: /^(Include|Exclude) Monthly shop: Rainbow Cleats/ });
  await expect(friends).toBeChecked();
  for (const shop of [clovers, silver, gold, rainbow]) await expect(shop).not.toBeChecked();
  await friends.uncheck();
  for (const shop of [clovers, silver, gold, rainbow]) await shop.check();
  await gold.uncheck();
  await expect.poll(() => page.evaluate(() => {
    const selections = JSON.parse(localStorage.getItem('carat-planner-plans-v1')!).plans[0].scenarioSelections;
    return Object.entries(selections).filter(([id]) => id.startsWith('monthly_shop_')).sort();
  })).toEqual([
    ['monthly_shop_clovers', 'include'], ['monthly_shop_rainbow_cleats', 'include'], ['monthly_shop_silver_cleats', 'include'],
  ]);
  await page.reload();
  await openIncome();
  for (const shop of [clovers, silver, rainbow]) await expect(shop).toBeChecked();
  for (const shop of [friends, gold]) await expect(shop).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
});

test('Planner keeps dated deductions when editing and reopening income, and updates funded pulls in order', async ({ page }) => {
  await mockTimeline(page);
  await page.route('**/resources/test/banner_timeline.json*', route => route.fulfill({ json: plannerControlsTimeline }));
  await page.route('**/resources/test/planner_income.json*', route => route.fulfill({ json: { rules: [] } }));
  await page.route('**/resources/test/planner_rewards.json*', route => route.fulfill({ json: { rewards: [] } }));
  const plan = plannerControlsPlan();
  plan.balances.freeJewels = 100;
  plan.targets = [{ ...plan.targets.find(item => item.id === 'first')!, plannedPulls: 1 }];
  plan.customIncome = [
    { id: 'deduction', label: 'Spent earlier', currency: 'free_jewels', amount: -200, cadence: 'once', startDate: '2026-09-01', every: 1 },
    { id: 'gift', label: 'Later gift', currency: 'free_jewels', amount: 100, cadence: 'once', startDate: '2026-09-02', every: 1 }
  ];
  await page.addInitScript(value => {
    if (!localStorage.getItem('carat-planner-plans-v1')) localStorage.setItem('carat-planner-plans-v1', JSON.stringify({ version: 1, activePlanId: value.id, plans: [value] }));
  }, plan);
  await page.goto('/timeline?tab=carat-planner');
  const funding = page.locator('[data-target-id="first"] .funding');
  await expect(funding.locator('small').first()).toHaveText('150 Carats short · 0 from resources');
  await expect(funding.locator('strong')).toHaveText(/0\s*\/\s*1 funded/);
  const incomeTab = page.getByRole('tablist', { name: 'Planner assumptions' }).getByRole('tab', { name: 'Income', exact: true });
  await page.getByRole('button', { name: /Plan assumptions/ }).click(); await incomeTab.click();
  const amounts = page.locator('.income-panel').getByRole('spinbutton', { name: 'Amount', exact: true });
  await expect(amounts.first()).toHaveValue('-200');
  await amounts.first().fill('-50');
  await expect(funding).toContainText('1 funded');
  await amounts.first().fill('-300');
  await expect(funding.locator('small').first()).toHaveText('150 Carats short · 0 from resources');
  await page.reload();
  await expect(funding.locator('small').first()).toHaveText('150 Carats short · 0 from resources');
  await page.getByRole('button', { name: /Plan assumptions/ }).click(); await incomeTab.click();
  await expect(amounts.first()).toHaveValue('-300');
  await amounts.nth(1).fill('300');
  await expect(funding).toContainText('1 funded');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!).plans[0].customIncome.map((item: { amount: number }) => item.amount))).toEqual([-300, 300]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
});

test('Planner income matches Angular sections, preset outcomes, grouped selection memory, and custom income', async ({ page }) => {
  test.setTimeout(60000);
  await mockPlannerIncome(page);
  await page.goto('/timeline?tab=carat-planner');
  await page.getByRole('button', { name: /Plan assumptions/ }).click();
  const incomeTab = page.getByRole('tablist', { name: 'Planner assumptions' }).getByRole('tab', { name: 'Income', exact: true });
  await incomeTab.click();
  const panel = page.locator('.income-panel');
  await expect(panel.locator('.income-section')).toHaveCount(5);
  await expect(panel.locator('.scenario')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: /Daily login/ })).toBeVisible();
  await expect(panel.getByText('Retired Training Pass')).toHaveCount(0);
  const account = page.getByRole('region', { name: 'Account & recurring', exact: true });
  await account.getByRole('button').click();
  const trials = page.getByRole('combobox', { name: 'Team Trials class', exact: true });
  await expect(trials).toContainText('Class 5');
  const club = page.getByRole('combobox', { name: 'Club rank', exact: true });
  await expect.poll(() => club.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await account.getByRole('checkbox', { name: 'Select all for Account & recurring', exact: true }).click();
  await account.getByRole('checkbox', { name: 'Clear all for Account & recurring', exact: true }).click();
  await expect(trials).toContainText('Not included');
  await account.getByRole('checkbox', { name: 'Select all for Account & recurring', exact: true }).click();
  await expect(trials).toContainText('Class 5'); await expect(club).toContainText('A');
  await trials.click(); await trials.press('Home'); await trials.press('Enter');
  await expect(account.getByRole('checkbox', { name: /all for Account & recurring/ })).toHaveJSProperty('indeterminate', true);
  await account.getByRole('checkbox', { name: /all for Account & recurring/ }).click(); await expect(trials).toContainText('Class 5');
  for (const [preset,rank] of [['Conservative','Class 3'],['Casual','Class 4'],['Active','Class 5'],['Completionist','Class 6']]) {
    const radio = page.getByRole('radio', { name: new RegExp('^' + preset + ':') });
    await radio.check(); await expect(radio).toBeChecked(); await expect(trials).toContainText(rank!);
    const selections = await page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!).plans[0].scenarioSelections);
    expect(selections.limited_mission_rewards).toBe('include'); expect(selections.limited_login_rewards).toBe('include');
  }
  await trials.click(); await trials.press('Home'); await trials.press('ArrowDown'); await trials.press('Enter');
  await expect(trials).toContainText('Class 1'); await expect(panel.getByText(/Highest results.*\(edited\)/)).toBeVisible();
  const help = page.getByRole('button', { name: 'How Monthly shop: Clovers is calculated', exact: true });
  await help.click();
  await expect(page.getByRole('dialog', { name: 'How Monthly shop: Clovers is calculated', exact: true })).toContainText('800 Clovers per month');
  await page.keyboard.press('Escape'); await expect(help).toBeFocused();
  for (const button of await panel.locator('.disclosure').all()) if (await button.getAttribute('aria-expanded') === 'false') await button.click();
  await expect(panel.locator('.scenario')).toHaveCount(30);
  const legend = page.getByRole('combobox', { name: 'Legend Races', exact: true });
  await expect(legend).toContainText('Varies by event');
  const story = page.getByRole('checkbox', { name: /^(Include|Exclude) Story event rewards$/ });
  await story.uncheck(); await expect(story).not.toBeChecked();
  await page.getByRole('tablist', { name: 'Planner assumptions' }).getByRole('tab', { name: 'Balance', exact: true }).click();
  await incomeTab.click(); await expect(panel.locator('.scenario')).toHaveCount(30);
  await panel.getByRole('button', { name: 'Add income', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Income name', exact: true }).fill('Monthly test income');
  await panel.getByRole('spinbutton', { name: 'Amount', exact: true }).fill('500');
  await page.getByRole('combobox', { name: 'Frequency', exact: true }).click(); await page.getByRole('option', { name: 'Monthly', exact: true }).click();
  await page.getByRole('combobox', { name: 'Resource', exact: true }).click();
  await expect(page.getByRole('option')).toHaveCount(7);
  await page.getByRole('option', { name: 'Carats', exact: true }).click();
  await panel.getByLabel('Starts', { exact: true }).fill('2026-09-02');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!).plans[0]);
  expect(saved.customIncome[0]).toMatchObject({ label:'Monthly test income', amount:500, cadence:'monthly', currency:'free_jewels', startDate:'2026-09-02', every:1 });
  expect(saved.scenarioSelections).toMatchObject({ story_event_rewards:'none',team_trials_class:'class_1' });
  await page.reload();
  await page.getByRole('button', { name: /Plan assumptions/ }).click(); await incomeTab.click();
  await page.getByRole('button', { name: /^Account & recurring/ }).click(); await expect(trials).toContainText('Class 1');
  await expect(panel.getByRole('textbox', { name:'Income name',exact:true })).toHaveValue('Monthly test income');
  await panel.getByRole('button', { name:'Remove custom income Monthly test income',exact:true }).click();
  await expect(panel.getByRole('textbox', { name:'Income name',exact:true })).toHaveCount(0);
  for (const width of [page.viewportSize()!.width, 768, 320]) {
    await page.setViewportSize({ width, height:900 });
    for (const button of await panel.locator('.disclosure').all()) if (await button.getAttribute('aria-expanded') === 'false') await button.click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    if (width <= 768) {
      const shortTargets = await panel.locator('button, input[type="checkbox"], a, label.preset').evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().width && (node.getBoundingClientRect().height < 31.9 || node.getBoundingClientRect().width < 31.9)).map(node => node.outerHTML.slice(0,160)));
      expect(shortTargets).toEqual([]);
    }
  }
});
