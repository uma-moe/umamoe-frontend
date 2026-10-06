import { expect, test } from './fixtures/test';
import { mockAffinity } from './fixtures/api';

test('Lineage opens an empty tree and responds immediately at mobile widths', async ({ page }) => {
  await mockAffinity(page);
  for (const width of [320, 390, 768, 1152, 1536]) {
    await page.setViewportSize({ width, height:844 });
    await page.goto('/tools/lineage-planner');
    await expect(page.getByRole('button', { name:'Choose Target', exact:true })).toBeVisible();
    for (const branch of await page.locator('.parent-branch').all()) {
      await branch.scrollIntoViewIfNeeded();
      await branch.locator('.grandparents').scrollIntoViewIfNeeded();
      await expect(branch.locator('.gp-branch .node')).toHaveCount(2);
    }
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(15000);
  }
  await page.getByRole('button', { name:'Choose Target', exact:true }).click();
  const dialog = page.getByRole('dialog', { name:'Select Character', exact:true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name:'Oguri Cap', exact:true }).click();
  await expect(page.getByRole('button', { name:'Change Target: Oguri Cap', exact:true })).toBeVisible();
});
