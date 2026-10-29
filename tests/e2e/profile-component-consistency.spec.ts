import { expect, test, type Locator } from './fixtures/test';
import { accountId, mockOwnerProfile, mockVeteranProfile, mockDatabase } from './fixtures/api';

async function appearance(element: Locator) {
  return element.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      background: style.backgroundColor,
      border: style.borderColor,
      radius: style.borderRadius,
      font: style.fontFamily
    };
  });
}

test('Profile reuses browser veteran cards and shared table styling in both themes', async ({
  page
}, testInfo) => {
  await mockOwnerProfile(page, []);
  await mockVeteranProfile(page);
  for (const theme of ['Dark', 'Light']) {
    await page.goto('/ui-lab#table');
    const labTable = page.locator('#table .table-wrap').first();
    await expect(labTable).toBeVisible();
    if ((await page.locator('html').getAttribute('data-theme')) !== theme.toLowerCase()) {
      const toggle = page.getByRole('button', { name: 'Toggle theme', exact: true });
      if (await toggle.isVisible()) await toggle.click();
      else await page.getByRole('radio', { name: theme, exact: true }).click();
    }

    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase());
    const expectedTable = await appearance(labTable);
    await page.goto('/veterans/' + accountId);
    const browserCard = page.locator('.veteran-card').first();
    await expect(browserCard).toBeVisible();
    const expected = await appearance(browserCard);

    await browserCard.screenshot({
      path: testInfo.outputPath('browser-veteran-' + theme + '.png')
    });

    await page.goto('/profile/' + accountId);
    const collection = page.locator('.profile-collection');
    const summary = collection.locator('.veteran-card').first();
    await expect(summary).toBeVisible();
    expect(await appearance(summary)).toEqual(expected);
    await expect(summary.locator('.stats > div')).toHaveCount(5);
    await expect(summary.locator('.aptitude')).toHaveCount(10);
    await expect(summary.locator('.skill-chip')).toHaveCount(2);
    await expect(summary.locator('.rarity-unique-main')).toHaveCSS(
      'color',
      theme === 'Light' ? 'rgb(113, 63, 18)' : 'rgb(255, 232, 166)'
    );
    await expect(summary.locator('.affinity-parent')).toHaveCount(2);
    await expect(summary.getByLabel('Main affinity: 83', { exact: true })).toBeVisible();
    await expect(summary.getByText('Main total', { exact: true })).toBeVisible();
    await expect(summary.getByText('5★ rarity', { exact: true })).toHaveCount(0);
    await expect(summary.getByLabel('Affinity: NaN', { exact: true })).toHaveCount(0);
    await collection.screenshot({
      path: testInfo.outputPath('profile-collection-' + theme + '.png')
    });

    await page.unroute('**/api/v4/user/profile/123456789012');
    await mockOwnerProfile(page, []);
    await page.reload();
    await page.getByRole('button', { name: 'Fan History', exact: true }).click();
    const history = page.getByRole('table', { name: 'Fan History', exact: true }).locator('..');
    expect(await history.evaluate((el) => el.closest('.card'))).toBeNull();
    expect(await appearance(history)).toEqual(expectedTable);
    await page.getByRole('button', { name: 'Fan History', exact: true }).click();
    await expect(
      page.getByRole('figure', { name: 'Fan activity' }).getByRole('button', { name: 'Public' })
    ).toHaveClass(/ui-button/);

    const panelSelectors = [
      '.trainer-summary',
      '.chart-frame',
      '.rolling-stack .stat',
      '.all-time-grid .stat',
      '.inheritance-card',
      '.circle-card',
      '.stadium-member .veteran-card'
    ];

    const panelColors = await page.evaluate(
      (selectors) =>
        selectors.map((selector) => {
          const element = document.querySelector(selector)!;
          return getComputedStyle(
            selector === '.trainer-summary' ? element.parentElement! : element
          ).backgroundColor;
        }),
      panelSelectors
    );

    expect(new Set(panelColors).size).toBe(1);
    const controlColor = await page
      .getByRole('figure', { name: 'Fan activity' })
      .getByRole('button', { name: 'Public' })
      .evaluate((el) => getComputedStyle(el).backgroundColor);

    const controlSurface = page.viewportSize()!.width <= 767 ? '.record-actions' : '.plan-action';
    await expect(page.locator('.inheritance-card ' + controlSurface)).toHaveCSS(
      'background-color',
      controlColor
    );
    const densePadding = await page
      .locator('.all-time-grid .stat')
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).paddingTop));

    expect(densePadding).toBeLessThanOrEqual(4);
    await page.getByRole('tab', { name: 'Long', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
      page.viewportSize()!.width
    );
    await page.screenshot({
      path: testInfo.outputPath('profile-' + theme + '.png'),
      fullPage: true
    });

    await mockVeteranProfile(page);
  }
});

test('Profile and Database share inheritance card styling in both themes', async ({ page }) => {
  await mockOwnerProfile(page, []);
  await mockDatabase(page);
  for (const theme of ['dark', 'light']) {
    await page.addInitScript((value) => localStorage.setItem('uma-color-mode', value), theme);
    await page.goto('/database?trainer_id=' + accountId);
    const database = page.locator('.inheritance-card').first();
    await expect(database).toBeVisible();
    await database.scrollIntoViewIfNeeded();
    await expect(database.locator('.spark').first()).toBeVisible();
    const expected = await Promise.all(
      ['.record-stats', '.spark', '.trainer-copy', '.plan-action'].map((selector) =>
        appearance(database.locator(selector).first())
      )
    );

    await page.goto('/profile/' + accountId);
    const borrow = page.locator('.inheritance-card');
    await expect(borrow).toBeVisible();
    await borrow.scrollIntoViewIfNeeded();
    await expect(borrow.locator('.spark').first()).toBeVisible();
    for (const [index, selector] of [
      '.record-stats',
      '.spark',
      '.trainer-copy',
      '.plan-action'
    ].entries()) {
      expect(await appearance(borrow.locator(selector).first())).toEqual(expected[index]);
    }
  }
});
