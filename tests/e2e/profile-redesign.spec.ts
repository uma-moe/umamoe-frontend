import { expect, test } from './fixtures/test';
import {
  accountId,
  mockOwnerProfile,
  mockAffinity,
  profile,
  veteran,
  fullTeamStadium
} from './fixtures/api';
import factorLoadingState from '../fixtures/resources/factors.json' with { type: 'json' };

test('Profile keeps light filters and complete veteran information, with a standalone browser', async ({
  page
}, testInfo) => {
  await mockOwnerProfile(page, []);
  await mockAffinity(page);
  const denseFactors = factorLoadingState
    .filter((factor) => factor.type === 3)
    .slice(0, 24)
    .map((factor) => Number(factor.id) * 10 + 3);

  const veterans = Array.from({ length: 6 }, (_, index) => ({
    ...veteran,
    id: index + 1,
    card_id: [101101, 101301, 100601, 106701, 108801, 100701][index],
    trained_chara_id: 900 + index,
    factors: [103, 1203, 10010103, 2000102],
    skills: index === 1 ? [] : veteran.skills,
    speed: veteran.speed - index * 10
  }));

  await page.route(`**/api/v4/user/profile/${accountId}`, (route) =>
    route.fulfill({
      json: {
        ...profile,
        veterans,
        support_card: { ...profile.support_card, support_card_id: 30028 },
        inheritance: {
          ...profile.inheritance,
          main_green_factors: 10010103,
          left_green_factors: 10010102,
          right_green_factors: 10010103,
          main_white_factors: denseFactors,
          left_white_factors: [2000102],
          right_white_factors: [2000102]
        },
        fan_history: {
          ...profile.fan_history,
          monthly: Array.from({ length: 8 }, (_, index) => ({
            ...profile.fan_history.monthly[0],
            month: 8 - index,
            total_fans: 42000000 - index * 4200000 + (index % 2) * 600000
          }))
        }
      }
    })
  );

  await page.goto(`/profile/${accountId}`);
  await expect(page.getByRole('heading', { name: 'Current borrow', exact: true })).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Daily total fan progression' })).toBeVisible();
  const chartText = page.locator('.chart-host svg');
  await expect(chartText).toContainText('Day');
  await expect(chartText).toContainText('Fans');
  await expect(chartText).toContainText('Jan 01');
  await expect(chartText).toContainText('Sep 01');
  await expect(chartText).not.toContainText('Dec 31');
  await expect(chartText).toContainText('40M');
  const overview = await page.locator('.content-container').boundingBox();
  const borrow = await page.locator('.inheritance-card').boundingBox();
  const activity = await page.locator('.activity-row').boundingBox();
  expect(borrow!.width).toBeCloseTo(overview!.width, 0);
  expect(borrow!.y).toBeGreaterThanOrEqual(activity!.y + activity!.height);
  await page.locator('.stadium-section').scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Previous distance', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next distance', exact: true })).toBeDisabled();
  expect(
    await page
      .locator('.content-container')
      .evaluate((el) =>
        [...el.children]
          .filter((section) => !section.matches('.ad-region'))
          .map((section) => section.querySelector('h2,h3')?.textContent)
      )
  ).toEqual([
    'Fan activity',
    'All-Time Stats',
    'Current borrow',
    'Current Circle',
    'Circle History',
    'Team Stadium',
    'Veterans'
  ]);
  const activityBounds = await page.locator('.activity-row').boundingBox();
  const chartBounds = await page.getByRole('figure', { name: 'Fan activity' }).boundingBox();
  const rollingBounds = await page.getByRole('region', { name: 'Rolling Gains' }).boundingBox();
  const gains = await page.locator('.rolling-stack > .stat').evaluateAll((items) =>
    items.map((item) => ({
      x: item.getBoundingClientRect().x,
      y: item.getBoundingClientRect().y
    }))
  );

  expect(gains[1]!.x).toBeCloseTo(gains[0]!.x, 0);
  expect(gains[1]!.y).toBeGreaterThan(gains[0]!.y);
  expect(gains[2]!.y).toBeGreaterThan(gains[1]!.y);
  if (page.viewportSize()!.width > 700) {
    expect(rollingBounds!.width).toBeLessThanOrEqual(240);
    expect(rollingBounds!.y).toBeCloseTo(chartBounds!.y, 0);
    expect(rollingBounds!.x).toBeGreaterThanOrEqual(chartBounds!.x + chartBounds!.width);
    expect(rollingBounds!.x + rollingBounds!.width).toBeCloseTo(
      activityBounds!.x + activityBounds!.width,
      0
    );
  }

  await expect(page.getByRole('heading', { name: 'Circle Membership' })).toHaveCount(0);
  await expect(page.getByRole('table', { name: 'Fan History' })).toBeHidden();
  const historyButton = page.getByRole('button', { name: 'Fan History', exact: true });
  await historyButton.focus();
  await historyButton.press('Enter');
  await expect(historyButton).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('dialog', { name: 'Fan History', exact: true })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Chart legend' })).toContainText('Total fans');
  await expect(
    page.getByRole('table', { name: 'Fan History', exact: true }).getByRole('columnheader')
  ).toHaveCount(7);

  expect(
    await page
      .getByRole('table', { name: 'Fan History', exact: true })
      .evaluate((el) => el.closest('.card'))
  ).toBeNull();

  const historyBounds = await page
    .getByRole('table', { name: 'Fan History', exact: true })
    .locator('..')
    .boundingBox();

  const expandedActivityBounds = await page.locator('.activity-row').boundingBox();
  expect(historyBounds!.y).toBeGreaterThanOrEqual(
    expandedActivityBounds!.y + expandedActivityBounds!.height
  );
  expect(historyBounds!.width).toBeCloseTo(activityBounds!.width, 0);
  await historyButton.press('Enter');
  await expect(historyButton).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('table', { name: 'Fan History', exact: true })).toBeHidden();
  await expect(historyButton).toBeFocused();
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => sessionStorage.setItem('header-copy', text) }
    })
  );

  await page.getByRole('button', { name: `Copy trainer ID ${accountId}`, exact: true }).click();
  await expect(page.getByText(`Trainer ID copied: ${accountId}`, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('header-copy'))).toBe(accountId);
  const tabs = page.getByRole('navigation', { name: 'Trainer profile sections' });
  await expect(tabs.getByRole('link')).toHaveCount(4);
  await expect(tabs.getByRole('link', { name: 'Veterans' })).toHaveCount(0);
  const collection = page.locator('.profile-collection');
  await collection.scrollIntoViewIfNeeded();
  await expect(collection.locator('.veteran-card')).toHaveCount(3);
  const card = collection.locator('.veteran-card').first();
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('.stats>div')).toHaveCount(5);
  await expect(card.locator('.skill-chip')).toHaveCount(2);
  await expect(card.getByRole('region', { name: 'Veteran sparks', exact: true })).toBeVisible();
  await expect(card.locator('.affinity-parent')).toHaveCount(2);
  const cards = await collection.locator('.veteran-card').evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect(),
        footer = node.querySelector('footer')!.getBoundingClientRect();

      return { top: box.top, height: box.height, bottom: box.bottom, footer: footer.bottom };
    })
  );

  for (const row of cards) {
    for (const peer of cards.filter((peer) => Math.abs(peer.top - row.top) < 1))
      expect(peer.height).toBeCloseTo(row.height, 0);
    expect(row.bottom - row.footer).toBeLessThanOrEqual(1);
  }

  await expect(collection.getByRole('button', { name: /Filters/ })).toHaveCount(0);
  await expect(collection.getByLabel('Search veterans')).toBeVisible();
  await collection.screenshot({ path: testInfo.outputPath('svelte-profile-collection.png') });
  const pagination = collection.getByRole('navigation', { name: 'Veterans preview pages' });
  await expect(pagination.getByRole('button', { name: 'Page 2', exact: true })).toBeVisible();
  await expect(pagination).not.toContainText('…');
  const browserAction = await collection.getByRole('link', { name: 'Open browser' }).boundingBox();
  const collectionBounds = await collection.boundingBox();
  expect(browserAction!.x + browserAction!.width).toBeCloseTo(
    collectionBounds!.x + collectionBounds!.width,
    0
  );
  const firstName = await card.locator('h3').textContent();
  await pagination.getByRole('button', { name: 'Next page' }).click();
  await expect(card.locator('h3')).not.toHaveText(firstName!);
  await expect(collection.locator('.veteran-card')).toHaveCount(3);
  await collection.getByLabel('Search veterans').fill('no matching runner');
  await expect(collection.getByText('No veterans match your filters.')).toBeVisible();
  await collection.getByRole('button', { name: 'Clear all filters' }).click();
  await expect(collection.getByRole('button', { name: /Show .* more/ })).toHaveCount(0);
  await expect(collection.locator('.veteran-card')).toHaveCount(3);
  await expect(pagination.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  expect(
    await collection.evaluate((el) => el.previousElementSibling?.querySelector('h2')?.textContent)
  ).toBe('Team Stadium');

  const detailName = await card.locator('h3').textContent();
  await card.getByRole('button', { name: 'View ' + detailName + ' details', exact: true }).click();
  await expect(page.getByRole('dialog', { name: detailName!, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('svelte-profile-dark.png'), fullPage: true });
  await page.screenshot({ path: testInfo.outputPath('svelte-profile-desktop.png') });
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('svelte-profile-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await collection.getByRole('link', { name: 'Open browser' }).click();
  await expect(page).toHaveURL(new RegExp('/veterans/' + accountId + '$'));
  await expect(page.getByRole('heading', { name: 'Veterans', exact: true })).toBeVisible();
  if (page.viewportSize()!.width < 1024)
    await expect(page.getByRole('button', { name: /Filters/ })).toBeVisible();
  else await expect(page.getByText('Refine collection', { exact: true })).toBeVisible();
  await expect(page.locator('[data-profile-tabs]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('svelte-veterans-dark.png'), fullPage: true });
});

test('Team Stadium cycles complete distance squads with three desktop columns and a mobile stack', async ({
  page
}, testInfo) => {
  await mockOwnerProfile(page, []);
  await page.route(`**/api/v4/user/profile/${accountId}`, (route) =>
    route.fulfill({ json: { ...profile, team_stadium: fullTeamStadium } })
  );

  await page.goto(`/profile/${accountId}`);
  const stadium = page.getByRole('region', { name: 'Team Stadium', exact: true });
  await stadium.scrollIntoViewIfNeeded();
  const panel = stadium.getByRole('tabpanel');
  const navigation = stadium.locator('.stadium-navigation');
  const tablist = stadium.getByRole('tablist', { name: 'Team Stadium distance' });
  expect((await tablist.boundingBox())!.width).toBeCloseTo(
    (await navigation.boundingBox())!.width,
    0
  );
  const tabWidths = await tablist
    .getByRole('tab')
    .evaluateAll((tabs) => tabs.map((tab) => tab.getBoundingClientRect().width));

  expect(Math.max(...tabWidths) - Math.min(...tabWidths)).toBeLessThan(1);
  await expect(panel).toHaveAccessibleName('Sprint');
  await expect(panel.locator('.stadium-member')).toHaveCount(3);
  await expect(panel.locator('.stats > div')).toHaveCount(15);
  await expect(panel.locator('.skill-chip')).toHaveCount(3);
  await expect(panel.locator('.skill-name').first()).toHaveText('Right-Handed ◎');
  await panel
    .locator('.stadium-member')
    .first()
    .getByRole('button', { name: 'Details', exact: true })
    .click();

  const details = page.getByRole('dialog', { name: 'Grass Wonder', exact: true });
  await expect(details).toBeVisible();
  await expect(details.locator('.stats > div')).toHaveCount(5);
  await expect(details.locator('[data-stat="speed"]')).toContainText('1,542');
  await expect(details.locator('.aptitude-item')).toHaveCount(10);
  await expect(details.locator('.skill-name')).toHaveText('Right-Handed ◎');
  await expect(details.getByRole('region', { name: 'Training support cards' })).toContainText(
    'No support cards recorded.'
  );

  await details.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(details).toBeHidden();
  await stadium.scrollIntoViewIfNeeded();
  const cards = await panel.locator('.stadium-member').evaluateAll((nodes) =>
    nodes.map((node) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    })
  );

  for (let index = 1; index < cards.length; index++) {
    if (page.viewportSize()!.width <= 900) {
      expect(cards[index]!.x).toBeCloseTo(cards[0]!.x, 0);
      expect(cards[index]!.y).toBeGreaterThanOrEqual(
        cards[index - 1]!.y + cards[index - 1]!.height
      );
    } else {
      expect(cards[index]!.y).toBeCloseTo(cards[0]!.y, 0);
      expect(cards[index]!.x).toBeGreaterThanOrEqual(cards[index - 1]!.x + cards[index - 1]!.width);
    }
  }

  const previous = await stadium.getByRole('button', { name: 'Previous distance' }).boundingBox();
  const next = await stadium.getByRole('button', { name: 'Next distance' }).boundingBox();
  const panelBounds = await panel.boundingBox();
  expect(previous!.x).toBeLessThan(next!.x);
  if (page.viewportSize()!.width > 900) {
    expect(previous!.x + previous!.width).toBeLessThanOrEqual(panelBounds!.x);
    expect(next!.x).toBeGreaterThanOrEqual(panelBounds!.x + panelBounds!.width);
  } else {
    expect(previous!.y).toBeCloseTo(next!.y, 0);
    expect(panelBounds!.y).toBeGreaterThanOrEqual(previous!.y + previous!.height);
  }

  await stadium.screenshot({ path: testInfo.outputPath('stadium-carousel.png') });
  await stadium.getByRole('button', { name: 'Previous distance' }).click();
  await expect(panel).toHaveAccessibleName('Dirt');
  await stadium.getByRole('button', { name: 'Next distance' }).click();
  for (const distance of ['Sprint', 'Mile', 'Medium', 'Long', 'Dirt']) {
    await expect(panel).toHaveAccessibleName(distance);
    await expect(panel.locator('.stadium-member')).toHaveCount(3);
    await stadium.getByRole('button', { name: 'Next distance' }).click();
  }

  await expect(panel).toHaveAccessibleName('Sprint');
  await stadium.getByRole('tab', { name: 'Long', exact: true }).click();
  await expect(panel).toHaveAccessibleName('Long');
  await stadium.getByRole('tab', { name: 'Long', exact: true }).press('Home');
  await expect(panel).toHaveAccessibleName('Sprint');
  await stadium.getByRole('tab', { name: 'Sprint', exact: true }).press('End');
  await expect(panel).toHaveAccessibleName('Dirt');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width
  );
});

test('Veterans navigation opens a trainer collection and validates its ID', async ({
  page,
  isMobile
}) => {
  await mockOwnerProfile(page, []);
  await page.goto('/tools');
  const headerLink = page
    .getByRole('navigation', { name: 'Quick navigation' })
    .getByRole('link', { name: 'Veterans', exact: true });

  await expect(headerLink).toBeVisible();
  await headerLink.click();
  await expect(page).toHaveURL(/\/veterans$/);
  await expect(headerLink).toHaveAttribute('aria-current', 'page');
  if (isMobile) await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  const navigation = page.getByRole('navigation', {
    name: isMobile ? 'Mobile navigation' : 'Main navigation',
    exact: true
  });

  await navigation.getByRole('link', { name: 'Veterans', exact: true }).click();
  await page.getByLabel('Trainer ID', { exact: true }).fill('invalid');
  await page.getByRole('button', { name: 'Browse', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a valid trainer ID.');
  await page.getByLabel('Trainer ID', { exact: true }).fill(accountId);
  await page.getByRole('button', { name: 'Browse', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/veterans/' + accountId + '$'));
  await expect(page.getByRole('heading', { name: 'Veterans', exact: true })).toBeVisible();
  await page.goto('/profile/' + accountId + '/veterans');
  await expect(page).toHaveURL(new RegExp('/veterans/' + accountId + '$'));
});
