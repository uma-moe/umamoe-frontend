import { expect, test } from './fixtures/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  detailGachas,
  detailRewards,
  mockTimelineDetails,
  loadVisibleTimelineEvents
} from './fixtures/timeline-details';

test('Timeline details preserve pickups, rates, rewards, sources, predictions and planner state', async ({
  page,
  isMobile
}) => {
  await mockTimelineDetails(page);
  const gachaRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('planner_gacha_')) gachaRequests.push(request.url());
  });

  await page.goto('/timeline');
  const opener = page.getByRole('button', {
    name: 'Open details for Mejiro McQueen + 1 more',
    exact: true
  });

  await expect(opener).toBeVisible();
  expect(gachaRequests).toHaveLength(0);
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Mejiro McQueen + 1 more', exact: true });
  await expect(dialog.getByRole('heading', { name: 'Rate-up rates' })).toBeVisible();
  await expect(dialog.getByText('0.75% per pull')).toHaveCount(2);
  await expect(dialog.getByText('3★ pool 3.00%, Published banner rates')).toBeVisible();
  await expect(dialog.locator('.reward-list').getByLabel('10 free pulls')).toHaveCount(1);
  await expect(dialog.locator('.reward-list').getByLabel('900 Carats')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'News post' })).toHaveAttribute(
    'href',
    'https://umamusume.com/news/detail/fixture'
  );

  await expect(dialog.getByRole('link', { name: 'Free-pull source' })).toHaveAttribute(
    'rel',
    'noopener noreferrer'
  );

  await expect(dialog.getByRole('heading', { name: 'Alternative date fit' })).toBeVisible();
  await expect(dialog.getByText('Catch-up rate', { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      dialog
        .locator('img')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
          )
        )
    )
    .toBe(true);
  const add = dialog.getByRole('button', { name: 'Add to planner' });
  if (isMobile) {
    expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(32);
    expect(
      (await dialog.getByRole('button', { name: 'Close dialog' }).boundingBox())!.height
    ).toBeGreaterThanOrEqual(32);

    const bounds = (await dialog.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(bounds.width).toBeGreaterThanOrEqual(viewport.width - 10);
    expect(bounds.height).toBeGreaterThanOrEqual(viewport.height * 0.87);
    expect(bounds.height).toBeLessThanOrEqual(viewport.height * 0.88 + 1);
  }

  await add.click();
  await expect(dialog.getByRole('button', { name: 'Remove from planner' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(opener).toBeFocused();
  await expect(page.locator('#timeline-event-detail-banner .plan')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await page.reload();
  await opener.click();
  await expect(dialog.getByRole('button', { name: 'Remove from planner' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Remove from planner' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Timeline reward-only details retain race facts, placement ranges and selectable story rewards', async ({
  page,
  isMobile
}) => {
  await mockTimelineDetails(page);
  await page.goto('/timeline');
  await page
    .getByRole('button', {
      name: 'Open details for Champions Meeting: Mile Champions Meeting',
      exact: true
    })
    .click();

  let dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Race details' })).toBeVisible();
  await expect(dialog.locator('.facts')).toContainText('Mile, Counterclockwise');
  await expect(dialog.getByText('Final placement rewards')).toBeVisible();
  await expect(dialog.getByText('500–2,500')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Add to planner' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  if (!isMobile) await loadVisibleTimelineEvents(page);
  await page.getByRole('button', { name: 'Open details for Summer story', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Summer story', exact: true });
  await expect(dialog.getByLabel('2,010 Carats')).toBeVisible();
  await dialog.getByRole('button', { name: 'Add to planner' }).click();
  await expect(dialog.getByRole('button', { name: 'Remove from planner' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );

  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('carat-planner-plans-v1')!).plans[0].enabledRewardEventIds
    )
  ).toContain('detail-story');
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  if (!isMobile) await loadVisibleTimelineEvents(page);
  await page.getByRole('button', { name: 'Open details for Summer story', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Remove from planner' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Remove from planner' }).click();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Open details for Legend Race', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('First-clear rewards')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Characters' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Timeline detail retries retain the selected event and support banner rates', async ({
  page
}) => {
  await mockTimelineDetails(page);
  let ratesFail = true;
  let rewardsFail = true;
  await page.route('**/resources/test/planner_gacha_2026.json*', (route) =>
    route.fulfill(ratesFail ? { status: 503, body: 'Rates unavailable' } : { json: detailGachas })
  );

  await page.route('**/resources/test/planner_rewards.json*', (route) =>
    route.fulfill(
      rewardsFail ? { status: 503, body: 'Rewards unavailable' } : { json: detailRewards }
    )
  );

  await page.goto('/timeline');
  await page
    .getByRole('button', { name: 'Open details for Mejiro McQueen + 1 more', exact: true })
    .click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Retry rates' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Retry rewards' })).toBeVisible();
  ratesFail = false;
  rewardsFail = false;
  await dialog.getByRole('button', { name: 'Retry rewards' }).click();
  await expect(dialog.getByLabel('900 Carats')).toBeVisible();
  await dialog.getByRole('button', { name: 'Retry rates' }).click();
  await expect(dialog.getByText('0.75% per pull')).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page
    .getByRole('button', { name: 'Open details for Kitasan Black + 1 more', exact: true })
    .click();

  await expect(dialog.getByText('SSR pool 3.00%, Published banner rates')).toBeVisible();
  await expect(dialog.locator('.rates a').first()).toContainText('0.75% per pull');
  await expect(dialog.locator('.rates a').last()).toContainText('2.25% per pull');
  await expect(dialog.getByLabel('20 free pulls')).toBeVisible();
  const expectedIcon = createHash('sha256')
    .update(
      await readFile(new URL('../../src/assets/images/item/item_icon_00111.webp', import.meta.url))
    )
    .digest('hex');

  const actualIcon = await dialog
    .getByLabel('20 free pulls')
    .locator('img')
    .evaluate(async (image) => {
      const bytes = await (await fetch((image as HTMLImageElement).src)).arrayBuffer();
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
        byte.toString(16).padStart(2, '0')
      ).join('');
    });

  expect(actualIcon).toBe(expectedIcon);
});

test('A late banner-rate response cannot replace a different event in the desktop vertical or mobile feed', async ({
  page,
  isMobile
}) => {
  await mockTimelineDetails(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let requested = false;
  await page.route('**/resources/test/planner_gacha_2026.json*', async (route) => {
    requested = true;
    await held;
    await route.fulfill({ json: detailGachas });
  });

  try {
    await page.goto('/timeline');
    if (isMobile)
      await expect(page.getByRole('radiogroup', { name: 'Timeline direction' })).toHaveCount(0);
    else await page.getByRole('radio', { name: 'Vertical', exact: true }).click();
    await page
      .getByRole('button', { name: 'Open details for Mejiro McQueen + 1 more', exact: true })
      .click();

    await expect.poll(() => requested).toBe(true);
    await expect(
      page.getByRole('dialog').getByText('Loading rates…', { exact: true })
    ).toBeVisible();

    await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click();
    await page
      .getByRole('button', {
        name: 'Open details for Champions Meeting: Mile Champions Meeting',
        exact: true
      })
      .click();

    const response = page.waitForResponse((url) => url.url().includes('planner_gacha_2026.json'));
    release();
    await (await response).finished();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
    const dialog = page.getByRole('dialog', { name: 'Mile Champions Meeting', exact: true });
    await expect(dialog.getByRole('heading', { name: 'Race details' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Rate-up rates' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', {
        name: 'Open details for Champions Meeting: Mile Champions Meeting',
        exact: true
      })
    ).toBeFocused();
  } finally {
    release();
  }
});
