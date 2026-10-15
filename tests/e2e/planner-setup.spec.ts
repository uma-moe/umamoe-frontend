import { expect, test } from './fixtures/test';
import { mockPlannerRewards } from './fixtures/planner-rewards';
import { mockPlannerIncome } from './fixtures/planner-income';

test('Planner assumption summaries follow balances, daily income, default rewards and ready campaigns', async ({
  page
}) => {
  await mockPlannerRewards(page);
  await page.goto('/timeline?tab=carat-planner');
  const setup = page.getByRole('region', { name: 'Plan assumptions', exact: true });
  const bar = setup.getByRole('button', { name: /Plan assumptions/ });
  await expect(bar).toContainText('7 rewards counted'); // Includes the initialized source's fallback rewards.
  await bar.click();
  const tabs = setup.getByRole('tablist', { name: 'Planner assumptions' }),
    rewards = tabs.getByRole('tab', { name: 'Rewards', exact: true });

  await expect(rewards).toHaveAccessibleDescription(
    '7 counted automatically · 2,555 Carats · 3 tickets'
  );
  const free = setup
    .getByRole('group', { name: 'Carats', exact: true })
    .getByRole('spinbutton', { name: 'Free', exact: true });

  await free.fill('1234');
  await expect(bar).toContainText('1,234 starting Carats');
  await expect(tabs.getByRole('tab', { name: 'Balance' })).toHaveAccessibleDescription(
    'Sep 1, 2026 · 1,234 Carats'
  );

  await rewards.click();
  await setup
    .getByRole('button', { name: 'Add 100 free-pull campaign to plan', exact: true })
    .click();

  await expect(bar).toContainText('8 rewards counted');
  await expect(rewards).toHaveAccessibleDescription(
    '8 counted automatically · 2,555 Carats · 3 tickets'
  );
  await setup
    .getByRole('button', { name: 'Exclude Autumn Story Event rewards', exact: true })
    .click();

  await expect(bar).toContainText('7 rewards counted');
  await expect(rewards).toHaveAccessibleDescription(
    '7 counted automatically · 1,955 Carats · 1 ticket'
  );
  await page.reload();
  await expect(page.getByRole('button', { name: /Plan assumptions/ })).toContainText(
    '7 rewards counted'
  );

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width
  );
});

test('Planner setup reuses accessible tabs and retains Rewards filters across tab changes and collapsing', async ({
  page
}) => {
  await mockPlannerRewards(page);
  await page.goto('/timeline?tab=carat-planner');
  const setup = page.getByRole('region', { name: 'Plan assumptions', exact: true }),
    bar = setup.getByRole('button', { name: /Plan assumptions/ });

  await bar.click();
  const tabs = setup.getByRole('tablist', { name: 'Planner assumptions' }),
    balance = tabs.getByRole('tab', { name: 'Balance', exact: true }),
    income = tabs.getByRole('tab', { name: 'Income', exact: true }),
    rewards = tabs.getByRole('tab', { name: 'Rewards', exact: true });

  await expect(tabs.getByRole('tab')).toHaveCount(3);
  await expect(balance).toHaveAttribute('aria-selected', 'true');
  await balance.focus();
  await balance.press('ArrowRight');
  await expect(income).toBeFocused();
  await expect(setup.getByRole('tabpanel', { name: 'Income' })).toBeVisible();
  await income.press('End');
  await expect(rewards).toBeFocused();
  await expect(setup.getByRole('tabpanel', { name: 'Rewards' })).toBeVisible();
  await expect(rewards).toHaveAttribute('aria-controls', 'planner-setup-workspace');
  const panel = setup.locator('.rewards-panel'),
    search = panel.getByRole('searchbox', { name: 'Find a reward' });

  await panel.getByRole('button', { name: /^Past/ }).click();
  await search.fill('Previous celebration');
  await balance.click();
  await rewards.click();
  await expect(search).toHaveValue('Previous celebration');
  await expect(panel.getByRole('button', { name: /^Past/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  await expect(panel.locator('article')).toHaveCount(1);
  await bar.click();
  await expect(tabs).toHaveCount(0);
  await bar.click();
  await expect(balance).toHaveAttribute('aria-selected', 'true');
  await balance.press('ArrowLeft');
  await expect(rewards).toBeFocused();
  await expect(search).toHaveValue('Previous celebration');
  await rewards.press('Home');
  await expect(balance).toBeFocused();
  if (page.viewportSize()!.width < 600) {
    await page.setViewportSize({ width: 320, height: 844 });
    const boxes = await tabs.getByRole('tab').evaluateAll((elements) =>
      elements.map((element) => {
        const r = element.getBoundingClientRect();
        return { height: r.height, width: r.width, y: r.y };
      })
    );

    expect(boxes.every((box) => box.height >= 30 && box.width >= 32)).toBe(true);
    expect(new Set(boxes.map((box) => box.y)).size).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  }
});

test('Planner Income tab uses the same cadence totals and source count as the source controls', async ({
  page
}) => {
  await mockPlannerIncome(page);
  await page.goto('/timeline?tab=carat-planner');
  await page.getByRole('button', { name: /Plan assumptions/ }).click();
  const tab = page
    .getByRole('tablist', { name: 'Planner assumptions' })
    .getByRole('tab', { name: 'Income', exact: true });

  await expect(tab).toHaveAccessibleDescription(
    '20 sources · +100 / day · +500 / week · +2,500 / month'
  );
  await tab.click();
  await page
    .locator('.income-panel')
    .getByRole('button', { name: /Daily login/ })
    .click();

  await expect(tab).toHaveAccessibleDescription(/\+500 \/ week · \+2,500 \/ month/);
  await expect(tab).not.toHaveAccessibleDescription(/\/ day/);
  await page.getByRole('button', { name: 'Add income', exact: true }).click();
  await page.locator('.custom').getByRole('spinbutton', { name: 'Amount', exact: true }).fill('75');
  await expect(tab).toHaveAccessibleDescription(/\+75 one-time/);
  await page.getByRole('tab', { name: 'Balance', exact: true }).click();
  await tab.click();
  await expect(tab).toHaveAccessibleDescription(/\+75 one-time/);
});
