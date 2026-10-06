import { expect, test, type Page } from './fixtures/test';

function installConsent(removeOnClose = false) {
  const mount = () => {
    const container = document.createElement('div');
    container.id = 'qc-cmp2-container';
    const prompt = document.createElement('div');
    prompt.id = 'qc-cmp2-ui';
    prompt.style.cssText = 'position:fixed;inset:auto 0 0;z-index:2147483647;background:white;padding:24px';
    const button = document.createElement('button');
    button.textContent = 'Save privacy choices';
    button.onclick = () => {
      document.removeEventListener('focusin', trap);
      if (removeOnClose) container.remove();
      else container.hidden = true;
    };
    prompt.append(button);
    container.append(prompt);
    document.body.append(container);
    function trap(event: FocusEvent) { if (!prompt.contains(event.target as Node)) button.focus(); }
    document.addEventListener('focusin', trap);
  };
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
}
const requestUpdates = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('uma:show-updates')));

test('a privacy change does not reopen a dialog removed from the document', async ({ page }) => {
  await page.goto('/tools');
  await requestUpdates(page);
  const updates = page.getByRole('dialog', { name: 'What’s new', exact: true });
  await expect(updates).toBeVisible();
  await page.evaluate(installConsent, false);
  await expect(updates).toBeHidden();
  await page.locator('dialog').filter({ has: page.locator('.release-content') }).evaluate(node => node.remove());
  await page.getByRole('button', { name: 'Save privacy choices', exact: true }).click();
  await expect(page.locator('#qc-cmp2-ui')).toBeHidden();
  await expect(page.locator('#app-error')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Tools & Calculators', exact: true })).toBeVisible();
});

for (const timing of ['before', 'after', 'automatically'] as const) {
  test(`privacy controls remain usable when the update dialog opens ${timing}`, async ({ page }) => {
    if (timing === 'automatically') {
      await page.addInitScript(() => localStorage.setItem('lastSeenUpdateVersion', '16'));
      await page.addInitScript(installConsent, true);
    }
    await page.goto('/tools', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Tools & Calculators', exact: true })).toBeVisible();
    const updates = page.getByRole('dialog', { name: 'What’s new', exact: true });
    if (timing === 'before') {
      const trigger = page.getByRole('button', { name: 'What’s new', exact: true });
      await trigger.focus();
      await trigger.press('Enter');
      await expect(updates).toBeVisible();
      await updates.getByRole('button', { name: 'Previous updates', exact: true }).click();
    }
    if (timing !== 'automatically') await page.evaluate(installConsent, false);
    if (timing === 'after') await requestUpdates(page);
    // Wait until the announcement is actually requested, including its automatic timer.
    await expect(page.locator('dialog').filter({ has: page.locator('.release-content') })).toBeAttached();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    if (timing === 'automatically') expect(await page.evaluate(() => localStorage.getItem('lastSeenUpdateVersion'))).toBe('16');
    const save = page.getByRole('button', { name: 'Save privacy choices', exact: true });
    if (timing === 'after') {
      await save.focus();
      await expect(save).toBeFocused();
      await save.press('Enter');
    } else await save.click();
    await expect(updates).toBeVisible();
    if (timing === 'before') await expect(updates.getByRole('heading', { name: 'Previous updates', exact: true })).toBeVisible();
    await updates.getByRole('button', { name: 'Got it', exact: true }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('lastSeenUpdateVersion'))).toBe('18');
    if (timing === 'before') await expect(page.getByRole('button', { name: 'What’s new', exact: true })).toBeFocused();
    await page.getByRole('link', { name: 'Privacy', exact: true }).click();
    await expect(page).toHaveURL(/\/privacy-policy$/);
  });
}
