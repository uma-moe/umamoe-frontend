import { expect, test } from './fixtures/test';
import { mockPlannerControls, plannerControlsPlan } from './fixtures/planner-controls';

test('Planner empty layout stays compact and its tab counts selected banners, not automatic rewards', async ({
  page
}) => {
  await mockPlannerControls(page);
  const plan = plannerControlsPlan();
  plan.targets = [];
  plan.disabledEventIds = [];
  await page.addInitScript(
    (plan) =>
      localStorage.setItem(
        'carat-planner-plans-v1',
        JSON.stringify({ version: 1, activePlanId: plan.id, plans: [plan] })
      ),
    plan
  );

  await page.goto('/timeline?tab=carat-planner');
  await expect(page.getByRole('button', { name: /Plan assumptions/ })).toContainText(
    'rewards counted'
  );

  const plannerTab = page
    .getByRole('navigation', { name: 'Timeline tools' })
    .getByRole('link', { name: /^Carat Planner/ });

  await expect(plannerTab).toHaveText('Carat Planner');
  const empty = page.locator('.empty-targets');
  await expect(empty).toHaveText(
    'Your plan is ready for its first bannerSearch above to add one. We will start with 200 pulls at banner end and select the first featured rate-up for you.'
  );
  const dimensions = await empty.evaluate((element) => {
    const panel = element.getBoundingClientRect(),
      icon = element.firstElementChild!.getBoundingClientRect(),
      copy = element.lastElementChild!.getBoundingClientRect();

    return { height: panel.height, iconRight: icon.right, copyLeft: copy.left };
  });

  expect(dimensions.height).toBeLessThan(180);
  expect(dimensions.copyLeft).toBeGreaterThan(dimensions.iconRight);
  if (page.viewportSize()!.width < 640)
    await expect(page.locator('.targets header p')).not.toBeVisible();
  await page
    .getByRole('navigation', { name: 'Timeline tools' })
    .getByRole('link', { name: 'Timeline', exact: true })
    .click();

  await page
    .locator('#timeline-event-first')
    .getByRole('button', { name: /to Carat Planner$/ })
    .click();

  await expect(plannerTab).toHaveAccessibleName('Carat Planner 1');
  await plannerTab.click();
  await expect(empty).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width
  );
});
