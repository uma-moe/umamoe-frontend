import { expect, test } from './fixtures/test';
import { mockAffinity } from './fixtures/api';

// Exercise the real startup path with the APIs missing in Chromium 109.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Array.prototype, 'toSorted');
    for (const key of ['popover', 'showPopover', 'hidePopover', 'togglePopover']) {
      Reflect.deleteProperty(HTMLElement.prototype, key);
    }
    for (const prototype of [HTMLButtonElement.prototype, HTMLInputElement.prototype]) {
      Reflect.deleteProperty(prototype, 'popoverTargetElement');
      Reflect.deleteProperty(prototype, 'popoverTargetAction');
    }
  });
});

test('legacy startup renders the planner and keeps mobile navigation working', async ({ page }) => {
  await mockAffinity(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tools/lineage-planner');
  // Removing JS APIs cannot remove a modern browser's native hidden-popover CSS.
  await page.addStyleTag({ content: '[popover].\\:popover-open { display: block; }' });
  await expect(page.getByRole('button', { name: 'Choose Target', exact: true })).toBeVisible();
  expect(await page.evaluate(() => {
    const source = Object.freeze([3, 1, 2]);
    return { source, sorted: source.toSorted((a, b) => a - b), sparse: Object.keys([, 1].toSorted()) };
  })).toEqual({ source: [3, 1, 2], sorted: [1, 2, 3], sparse: ['0', '1'] });

  const trigger = page.getByRole('button', { name: 'Open navigation', exact: true });
  const navigation = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
  await expect(navigation).toBeHidden();
  await trigger.click();
  await expect(navigation).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(navigation).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');

  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await trigger.click();
  await expect(navigation).toBeInViewport();
  await navigation.getByRole('link', { name: 'Tools', exact: true }).click();
  await expect(page).toHaveURL(/\/tools$/);
  await expect(page.locator('[data-route-id="tools"]')).toBeVisible();
  await expect(navigation).toBeHidden();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Choose Target', exact: true })).toBeVisible();
  // The reported hidePopover crash also fires on window resize.
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator('#app-error')).toBeHidden();
});

test('polyfilled account menus retain layout, keyboard focus and light dismissal', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('auth_token', 'compatibility-test'));
  await page.route('**/api/auth/me', route => route.fulfill({ json: { id: 'owner', display_name: 'Test User' } }));
  await page.route('**/api/auth/accounts', route => route.fulfill({ json: [] }));
  await page.goto('/tools');
  const trigger = page.getByRole('button', { name: 'Account menu for Test User', exact: true });
  const menu = page.getByRole('menu', { name: 'Your account', exact: true });
  await expect(menu).toBeHidden();
  await trigger.press('ArrowDown');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveCSS('display', 'grid');
  await expect(menu.getByRole('menuitem', { name: 'Link game account' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: 'Settings', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(menu).toBeVisible();
  // The account menu covers the heading's center on phones; click its exposed edge.
  await page.getByRole('heading', { name: 'Tools & Calculators', exact: true }).click({ position: { x: 4, y: 4 } });
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#app-error')).toBeHidden();
});

test('polyfilled inspection popovers mount their contents and stay in view', async ({ page }) => {
  await page.goto('/tools');
  await page.addStyleTag({ content: '[popover].\\:popover-open { display: block; }' });
  const trigger = page.getByRole('button', { name: 'Service status', exact: true });
  await trigger.focus();
  await trigger.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Service status', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('link', { name: /Open status page/ })).toBeVisible();
  const box = (await panel.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await panel.getByRole('button', { name: 'Close Service status', exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator('#app-error')).toBeHidden();
});
