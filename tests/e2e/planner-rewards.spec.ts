import { expect, test } from './fixtures/test';
import { mockPlannerRewards, plannerRewardsData } from './fixtures/planner-rewards';

test('Planner Rewards adds campaign banners, switches allocation, preserves targets, and restores choices', async ({
  page
}) => {
  await mockPlannerRewards(page);
  await page.goto('/timeline?tab=carat-planner');
  await page.getByRole('button', { name: /Plan assumptions/ }).click();
  await page.getByRole('tab', { name: 'Rewards', exact: true }).click();
  const panel = page.locator('.rewards-panel'),
    campaign = panel.locator('[data-campaign-id="anniversary"]');

  await campaign
    .getByRole('button', { name: 'Add 100 free-pull campaign to plan', exact: true })
    .click();

  const stored = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('carat-planner-plans-v1')!).plans[0]);

  await expect
    .poll(async () => (await stored()).targets.map((t: { eventId: string }) => t.eventId).sort())
    .toEqual(['first', 'second']);
  await expect
    .poll(async () => (await stored()).freePullCampaignSelections.anniversary)
    .toBe('__default_schedule__');
  const ids = (await stored()).targets.map((t: { id: string }) => t.id);
  await campaign
    .getByRole('button', { name: 'Switch free-pull allocation for 100 free-pull campaign' })
    .click();

  await expect
    .poll(async () => (await stored()).freePullCampaignSelections.anniversary)
    .toBe('second');
  await expect(campaign.locator('[title="100 pulls on Second banner"]')).toBeVisible();
  await campaign.getByRole('button', { name: 'Remove 100 free-pull campaign from plan' }).click();
  await expect
    .poll(async () => (await stored()).freePullCampaignSelections.anniversary)
    .toBe('__excluded__');
  expect((await stored()).targets.map((t: { id: string }) => t.id)).toEqual(ids);
  await campaign.getByRole('button', { name: 'Add 100 free-pull campaign to plan' }).click();
  expect((await stored()).targets.map((t: { id: string }) => t.id)).toEqual(ids);
  await expect(
    panel.locator('[data-campaign-id="unavailable"]').getByRole('button', { name: /Add.*to plan/ })
  ).toBeDisabled();

  await page.reload();
  await page.getByRole('button', { name: /Plan assumptions/ }).click();
  await page.getByRole('tab', { name: 'Rewards', exact: true }).click();
  await expect(
    campaign.getByRole('button', { name: 'Remove 100 free-pull campaign from plan' })
  ).toHaveAttribute('aria-pressed', 'true');

  await expect
    .poll(() =>
      campaign
        .locator('img')
        .evaluateAll(
          (images) =>
            images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0)
        )
    )
    .toBe(true);
  if (page.viewportSize()!.width < 600) {
    const undersized = await panel
      .locator('button,input,a')
      .evaluateAll((elements) =>
        elements
          .filter(
            (element) =>
              element.getClientRects().length &&
              element.getBoundingClientRect().height <
                (element.classList.contains('ui-button--sm') ? 27.9 : 31.9)
          )
          .map((element) => element.getAttribute('aria-label') || element.textContent)
      );

    expect(undersized).toEqual([]);
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width
  );
});

test('Planner Rewards result stepper, search, breakdown, history and banner actions work on desktop and mobile', async ({
  page
}) => {
  await mockPlannerRewards(page);
  await page.goto('/timeline?tab=carat-planner');
  await page.getByRole('button', { name: /Plan assumptions/ }).click();
  await page.getByRole('tab', { name: 'Rewards', exact: true }).click();
  const panel = page.locator('.rewards-panel'),
    search = panel.getByRole('searchbox', { name: 'Find a reward' });

  const cm = panel.locator('[data-reward-id="event:champions-meeting-101"]');
  await expect(cm).toContainText('Result not counted');
  await cm
    .getByRole('button', { name: 'Next result for Mile Champions Meeting', exact: true })
    .click();

  await expect(cm).toContainText('Champion');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('carat-planner-plans-v1')!).plans[0]
            .variableRewardSelections['champions-meeting-101'].availableAt
      )
    )
    .toBe('2026-09-09');
  await cm
    .getByRole('button', { name: 'Lower expected result for Mile Champions Meeting', exact: true })
    .click();

  await expect(cm).toContainText('Result not counted');
  await cm
    .getByRole('button', { name: 'Previous result for Mile Champions Meeting', exact: true })
    .click();

  await expect(cm).toContainText('Result not counted');
  const login = panel.locator('[data-reward-id="event:campaign-501"]');
  await expect(login).toContainText('10 days × 150 Carats = 1,500 Carats');
  await expect(login.getByRole('link', { name: 'News post' })).toBeVisible();
  const help = login.getByRole('button', { name: 'Show reward breakdown for Celebration Login' });
  await help.click();
  await expect(
    page.getByRole('dialog', { name: 'Show reward breakdown for Celebration Login' })
  ).toContainText('Celebration login Carats: 1,500 Carats');

  await page.keyboard.press('Escape');
  await expect(help).toBeFocused();
  await login.getByRole('button', { name: 'Exclude Celebration Login rewards' }).click();
  await expect(
    login.getByRole('button', { name: 'Include Celebration Login rewards' })
  ).toHaveAttribute('aria-pressed', 'false');

  await search.fill('claimed login rewards');
  await expect(panel.locator('article')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Clear reward search' }).click();
  await expect(search).toHaveValue('');
  const banner = panel.locator('[data-reward-id="event:second"]');
  await banner.getByRole('button', { name: 'Add Second banner banner', exact: true }).click();
  await expect(
    banner.getByRole('button', { name: 'Remove Second banner banner', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');

  await panel.getByRole('button', { name: /^Past/ }).click();
  const past = panel.locator('[data-reward-id="event:past"]');
  await expect(past).toContainText('Previous celebration');
  await expect(past.getByRole('button')).toHaveCount(1); // Read-only reward breakdown only; no plan mutation controls.
  await expect(
    panel.getByRole('button', { name: /^(Add|Remove|Include|Exclude|Next result|Previous result)/ })
  ).toHaveCount(0);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width
  );
});

test('Planner Rewards loads dense lists automatically and searches later official news without page overflow', async ({
  page
}) => {
  await mockPlannerRewards(page);
  const extra = Array.from({ length: 85 }, (_, index) => ({
    id: 'batch-' + index,
    label: 'Batch reward ' + index,
    currency: 'free_jewels',
    amount: 10,
    available_at: '2026-11-' + String(Math.floor(index / 4) + 1).padStart(2, '0'),
    default_enabled: true,
    ...(index === 45
      ? { provenance: 'global_news', source_url: 'https://umamusume.com/news/batch' }
      : {})
  }));

  await page.route('**/resources/test/planner_rewards.json*', (route) =>
    route.fulfill({
      json: { ...plannerRewardsData, rewards: [...plannerRewardsData.rewards, ...extra] }
    })
  );

  await page.goto('/timeline?tab=carat-planner');
  await page.getByRole('button', { name: /Plan assumptions/ }).click();
  await page.getByRole('tab', { name: 'Rewards', exact: true }).click();
  const panel = page.locator('.rewards-panel');
  await expect(panel.locator('article').first()).toBeVisible();
  const viewport = panel.locator('.reward-viewport');
  expect(await panel.locator('article').count()).toBeLessThan(40);
  await viewport.evaluate((node) => (node.scrollTop = node.scrollHeight));
  await expect(panel.getByText('Batch reward 84', { exact: true })).toBeAttached();
  expect(await panel.locator('article').count()).toBeLessThan(40);
  await page.getByRole('tab', { name: 'Balance', exact: true }).click();
  await page.getByRole('tab', { name: 'Rewards', exact: true }).click();
  await expect(panel.locator('article').first()).toBeAttached();
  await panel.getByRole('searchbox').fill('nothing matches this');
  await expect(panel.locator('article')).toHaveCount(0);
  await expect(panel).toContainText('No upcoming rewards match this search.');
  await expect(panel.getByRole('button', { name: 'Upcoming 0', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Clear reward search' }).click();
  await expect(panel.locator('article').first()).toBeVisible();
  expect(await panel.locator('article').count()).toBeLessThan(40);
  await panel.getByRole('searchbox').fill('Batch reward 45');
  await expect(panel.getByText('Batch reward 45', { exact: true })).toHaveCount(1);
  await expect(panel.locator('article')).toHaveCount(1);
  if (page.viewportSize()!.width < 600) {
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  }
});
