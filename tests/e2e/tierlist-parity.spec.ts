import { expect, test } from './fixtures/test';

test('Tierlist retains Angular controls, percentile rows, and card interaction', async ({ page, isMobile }) => {
  await page.goto('/tierlist');
  await expect(page.getByRole('heading', { name: /Support Card Tierlist/ })).toBeVisible();
  await expect(page.getByText(/no longer maintained/i)).toBeVisible();
  await expect(page.locator('.card-chart')).toBeVisible();
  await expect(page.locator('.grid-line span').first()).toHaveText(/[\d,.]+/);
  await page.locator('.tierlist').scrollIntoViewIfNeeded();
  await expect(page.locator('.card-lb').first()).toHaveText('LB4');
  await expect(page.locator('.tierlist article').first()).toContainText(/99–100%/);
  await page.getByRole('combobox', { name: 'Limit Break Level' }).click();
  await page.getByRole('option', { name: /LB3/ }).click();
  await expect(page.getByRole('combobox', { name: 'Limit Break Level' })).toContainText('LB3');
  if (!isMobile) {
    await page.locator('.tierlist button').first().hover();
    await expect(page.getByRole('tooltip').getByText('Limit Break Progression')).toBeVisible();
  }
  await page.locator('.tierlist button').first().click();
  const dialog = page.getByRole('dialog', { name: 'Support Card Details' });
  await expect(dialog.getByText('Tier Progression by LB')).toBeVisible();
  await expect(dialog.locator('.tier-progression>div')).toHaveCount(5);
  await expect(dialog.getByText('Total Growth:')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  const tabs = page.getByRole('tablist', { name: 'Support card type' });
  await tabs.getByRole('tab', { name: 'Speed', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Stamina', exact: true })).toBeFocused();
  await expect(tabs.getByRole('tab', { name: 'Stamina', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(tabs.getByRole('tab', { name: 'Intelligence' })).toBeFocused();
});

test('Tierlist preserves the dense Angular mobile grid without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tierlist');
  await expect(page.locator('.tierlist article')).toHaveCount(5); // Populated tiers in the small hosted-data fixture.
  await page.locator('.tierlist').scrollIntoViewIfNeeded();
  const card = page.locator('.tierlist button').first();
  await card.click();
  await expect(page.getByRole('dialog').getByText('Limit Break Progression')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  for (let reopen = 0; reopen < 3; reopen++) {
    await card.focus();
    await card.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(card).toBeFocused();
  }
  const geometry = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport);
});
