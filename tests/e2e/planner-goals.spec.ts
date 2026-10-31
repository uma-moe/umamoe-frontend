import { expect, test } from './fixtures/test';
import { mockPlannerGoals } from './fixtures/planner-goals';
import { detailGachas, detailTimeline } from './fixtures/timeline-details';

test('Large pickup lists stay bounded, searchable and selectable without hiding the header', async ({
  page
}, info) => {
  await mockPlannerGoals(page);
  const ids = [30028, 30001, 30002, ...Array.from({ length: 25 }, (_, i) => 31001 + i)];
  await page.route('**/resources/test/banner_timeline.json*', (route) =>
    route.fulfill({
      json: {
        events: detailTimeline.events.map((event) =>
          event.id === 'detail-support'
            ? {
                ...event,
                pickup_card_ids: ids,
                related_support_cards: [
                  'Kitasan Black',
                  'Special Week',
                  'Silence Suzuka',
                  ...ids.slice(3).map((_, i) => `Featured option ${i + 1}`)
                ]
              }
            : event
        )
      }
    })
  );

  await page.route('**/resources/test/planner_gacha_2026.json*', (route) =>
    route.fulfill({
      json: {
        gachas: [
          {
            ...detailGachas.gachas[1],
            pickups: ids.map((pickup_id) => ({ pickup_id, rate: 0.001 }))
          }
        ]
      }
    })
  );

  await page.goto('/timeline?tab=carat-planner');
  const target = page.locator('[data-target-id="support-goals"]');
  await target.locator('.pickup-summary').click();
  await target.getByRole('button', { name: 'Choose rate-ups', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose rate-ups', exact: true });
  expect((await picker.boundingBox())!.height).toBeLessThanOrEqual(542);
  await expect(picker.getByRole('status')).toHaveText('2 selected, 28 available');
  await picker.locator('.pickup-options').evaluate((node) => (node.scrollTop = node.scrollHeight));
  await expect(picker.getByText('Featured on this banner', { exact: true })).toBeInViewport();
  await picker.getByRole('searchbox').fill('Featured option 25');
  await expect(picker.locator('.pickup-options button')).toHaveCount(1);
  await picker.getByRole('button', { name: 'Select Featured option 25', exact: true }).click();
  await expect(picker.getByRole('status')).toHaveText('3 selected, 28 available');
  await picker.getByRole('searchbox').fill('no such pickup');
  await expect(picker.getByText('No pickups match your search.')).toBeVisible();
  await page.keyboard.press('Escape');
  await target.getByRole('button', { name: 'Choose rate-ups', exact: true }).click();
  await expect(picker.getByRole('searchbox')).toHaveValue('');
  await picker.screenshot({ path: info.outputPath('large-pickup-picker.png') });
});

test('Planner rate-up goals preserve copies, crystal details and shared odds across picker changes and reload', async ({
  page,
  isMobile
}, testInfo) => {
  await mockPlannerGoals(page);
  await page.goto('/timeline?tab=carat-planner');
  const target = page.locator('[data-target-id="support-goals"]');
  await expect(target.locator('.goal-preview').first()).toContainText(
    '1 copy required + 2 Rainbow Uncap'
  );
  await target.locator('.pickup-summary').click();
  const selected = target.locator('.selected-goal');
  await expect(selected).toHaveCount(2);
  expect(
    await target.locator('.pickup-art img').evaluateAll((images) =>
      images.every((image) => {
        const box = image.getBoundingClientRect(),
          frame = image.parentElement!.getBoundingClientRect();

        return (
          box.width <= frame.width &&
          box.height <= frame.height &&
          getComputedStyle(image).objectFit === 'contain'
        );
      })
    )
  ).toBe(true);

  const first = selected.filter({ has: page.locator('[aria-label="3 desired copies"]') });
  await expect(first).toContainText('Kitasan Black');
  const kitasan = target.locator('.selected-goal[data-pickup-id="30028"]');
  const increase = kitasan.getByRole('button', {
    name: 'Increase desired copies of Kitasan Black',
    exact: true
  });

  await increase.click();
  await increase.click();
  await expect(kitasan.getByRole('status')).toHaveText('5');
  await expect(increase).toBeDisabled();
  if (isMobile)
    for (const button of await kitasan.getByRole('button').all())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(32);
  await kitasan
    .getByRole('button', { name: 'Remove Kitasan Black from rate-up goals', exact: true })
    .click();

  await target.getByRole('button', { name: 'Choose rate-ups', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose rate-ups', exact: true });
  await expect(
    picker.getByRole('button', { name: 'Select Kitasan Black', exact: true })
  ).toHaveAttribute('aria-pressed', 'false');

  await picker.getByRole('button', { name: 'Select Kitasan Black', exact: true }).click();
  await expect(
    picker.getByRole('button', { name: 'Remove Kitasan Black', exact: true })
  ).toHaveAttribute('aria-pressed', 'true');

  await picker.screenshot({ path: testInfo.outputPath('rate-up-picker.png') });
  await page.keyboard.press('Escape');
  await expect(target.getByRole('button', { name: 'Choose rate-ups', exact: true })).toBeFocused();
  await expect(kitasan.getByRole('status')).toHaveText('5');
  const detailed = target.locator('.advanced-odds');
  if (isMobile) {
    await expect(detailed).not.toHaveAttribute('open');
    await detailed.locator('summary').click();
  }

  await expect(target.getByRole('region', { name: 'Full SSR pool odds' })).toBeVisible();
  const pool = target.locator('.pool-stack');
  expect(
    await pool
      .locator('span')
      .evaluateAll((items) =>
        items.reduce((sum, item) => sum + parseFloat((item as HTMLElement).style.width), 0)
      )
  ).toBeCloseTo(100);
  await expect(target.getByText('Avg selected copies', { exact: true })).toBeVisible();
  await expect(target.locator('.individual-chance').first()).toHaveAttribute(
    'aria-label',
    /chance of at least .*cop(?:y|ies) of Special Week/
  );
  await expect
    .poll(() =>
      selected
        .locator('img')
        .evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))
    )
    .toBe(true);
  await target.screenshot({ path: testInfo.outputPath('planner-goals.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width
  );
  await page.reload();
  await target.locator('.pickup-summary').click();
  await expect(kitasan.getByRole('status')).toHaveText('5');
  await target.getByRole('button', { name: 'Choose rate-ups', exact: true }).click();
  await picker.getByRole('button', { name: 'Remove Kitasan Black', exact: true }).click();
  await picker.getByRole('button', { name: 'Remove Special Week', exact: true }).click();
  await picker.getByRole('button', { name: 'Close Choose rate-ups', exact: true }).click();
  await expect(selected).toHaveCount(0);
  await expect(target.locator('.goal-chance')).toHaveText('Choose pickups');
  await expect(detailed).toHaveCount(0);
  await page.reload();
  await target.locator('.pickup-summary').click();
  await expect(selected).toHaveCount(0);
});

test('Planner unavailable rates stay editable and detailed odds fit a narrow mobile viewport', async ({
  page
}, testInfo) => {
  await mockPlannerGoals(page, true);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/timeline?tab=carat-planner');
  const target = page.locator('[data-target-id="support-goals"]');
  await expect(target.locator('.goal-chance')).toContainText('Rates unavailable');
  await target.locator('.pickup-summary').click();
  await target.locator('.advanced-odds>summary').click();
  await expect(
    target.getByText('Published pickup rates are unavailable for the selected goals.')
  ).toBeVisible();
  await target.getByRole('button', { name: 'Choose rate-ups', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose rate-ups', exact: true });
  await expect(
    picker.getByRole('button', { name: 'Remove Special Week', exact: true })
  ).toBeVisible();

  const box = (await picker.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await picker.getByRole('button', { name: 'Close Choose rate-ups', exact: true }).click();
  await target.screenshot({ path: testInfo.outputPath('unavailable-goals-320.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await target
    .locator('.selected-goal[data-pickup-id="30001"]')
    .getByRole('button', { name: 'Remove Special Week from rate-up goals', exact: true })
    .click();

  await expect(target.locator('.goal-chance')).not.toContainText('unavailable');
});
