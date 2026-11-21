import { expect, test } from './fixtures/test';
import { mockAffinity } from './fixtures/api';

test('blocked advertising does not prevent editing and saving a lineage', async ({ page }) => {
  await mockAffinity(page);
  let adRequests = 0;
  await page.route('https://cdn.fuseplatform.net/**/fuse.js', (route) => {
    adRequests++;
    return route.abort('blockedbyclient');
  });

  await page.goto('/tools/lineage-planner?cards=100101,101301,0,0,0');
  await expect(page.locator('#publift-fuse-js')).toHaveAttribute('data-state', 'error');
  await expect(
    page.getByRole('button', { name: 'Change Target: Special Week', exact: true })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Clear Parent 1', exact: true }).click();
  await page.getByRole('button', { name: 'Save / Load', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Lineage Trees', exact: true });
  await dialog.getByRole('textbox', { name: 'Tree name' }).fill('Blocked ads');
  await dialog.getByRole('textbox', { name: 'Tree name' }).press('Enter');
  await expect(dialog).not.toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('lineage-planner-saves-v1') ?? '{}')
  );

  expect(saved['Blocked ads']).toMatchObject([{ position: 'target', characterId: 100101 }]);
  expect(adRequests).toBe(1);
});
