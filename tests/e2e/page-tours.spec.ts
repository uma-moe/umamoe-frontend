import { expect, test } from './fixtures/test';
import { mockDatabase, mockCharacterCatalog, mockCommunity, mockActivity, mockTimeline, mockStatistics } from './fixtures/api';
import { pageStepIds, tourSteps, type PageTourId } from '../../src/components/tours/page-tours';

const routes: Record<PageTourId, string> = { home:'/', database:'/database', clubs:'/circles', rankings:'/rankings', activity:'/activity/42', tierlist:'/tierlist', tools:'/tools', timeline:'/timeline', 'carat-planner':'/timeline?tab=carat-planner' };
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('privacy-notice-accepted','true'); localStorage.setItem('cookie-consent',JSON.stringify({necessary:true,analytics:false,advertising:false})); });
  await mockDatabase(page); await mockCharacterCatalog(page); await mockCommunity(page); await mockActivity(page); await mockTimeline(page, false); await mockStatistics(page);
});

for (const [name, route] of Object.entries(routes) as [PageTourId, string][]) {
  test(name + ' tour follows the Angular steps and leaves its controls usable', async ({ page, isMobile }) => {
    test.setTimeout(90_000);
    await page.goto(route);
    if (name === 'clubs') await page.getByRole('button', { name:'Open', exact:true }).click();
    if (name === 'database') await expect(page.locator('.inheritance-list')).toBeVisible();
    const help = page.getByRole('button', { name:'Start guided tour', exact:true });
    await help.focus(); await help.click();
    // Angular omits desktop-only direction and spacing controls on the mobile feed.
    const expected = pageStepIds[name].filter(id => !(isMobile && ['timeline-view-switch','timeline-spacing'].includes(id)));
    for (const id of expected) {
      const step = tourSteps.find(candidate => candidate.stepId === id)!;
      const dialog = page.getByRole('dialog', { name:step.title, exact:true });
      await expect(dialog, id).toBeVisible({ timeout:15_000 });
      await expect(page.locator('body')).toHaveAttribute('data-tour-step-id', id);
      const fits = await dialog.evaluate(node => { const r=node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && node.scrollWidth <= node.clientWidth + 1; });
      expect(fits, id + ' stays in viewport').toBe(true);
      if (id === 'filter-add-factor') {
        await expect(dialog.getByRole('button', {name:'Click Add Blue Factor'})).toBeDisabled();
        await page.locator('#blue-factors .add-row').click();
      } else if (id === 'filter-blue-factor-slider') {
        await page.locator('#blue-factors').getByRole('slider', { name:'Star range minimum', exact:true }).last().press('ArrowRight');
      } else if (id === 'filter-limit-break') {
        await page.locator('#support-limit-break-start').press('ArrowRight');
      } else await dialog.getByRole('button', { name:expected.at(-1) === id ? 'Done' : 'Next', exact:true }).click();
    }
    await expect(page.locator('.tour')).toHaveCount(0, { timeout:15_000 });
    await expect(page.locator('body')).not.toHaveAttribute('data-tour-step-id', { timeout:15_000 });
    await expect(help).toBeFocused();
    if (name === 'database') {
      await expect(page.locator('.filter-heading')).toHaveAttribute('aria-expanded','false');
      await page.locator('.filter-heading').click();
      await expect(page.getByRole('radio', { name:'Basic', exact:true })).toHaveAttribute('aria-checked','true');
      if (isMobile) await page.getByRole('button',{name:'Spark Filters',exact:true}).click();
      await expect(page.locator('#blue-factors').getByRole('slider',{name:'Star range minimum',exact:true})).toHaveValue('2');
    }
  });
}

test('new visitors can skip the optional introduction, replay, and exit with Escape', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.setItem('page-introduction-audience-v1','new'); localStorage.removeItem('page-introduction-seen-v1:home'); });
  await page.reload();
  const intro = page.getByRole('dialog',{ name:'Welcome to uma.moe',exact:true });
  await expect(intro).toBeVisible(); await intro.getByRole('button',{name:'Skip',exact:true}).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('page-introduction-seen-v1:home'))).toBe('true');
  await page.reload();
  await page.clock.install(); await page.clock.runFor(2200);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const help = page.getByRole('button',{name:'Start guided tour'}); await help.focus(); await help.click();
  await expect(page.locator('.tour')).toBeVisible(); await page.keyboard.press('Escape');
  await expect(page.locator('.tour')).toHaveCount(0); await expect(help).toBeFocused();
});

test('Database tour preserves the previous mode and a real picker can open above the callout', async ({ page }) => {
  await page.goto('/database');
  await page.locator('.filter-heading').click();
  await page.getByRole('radio',{ name:'Advanced',exact:true }).click();
  await expect(page.locator('.inheritance-list')).toBeVisible();
  const help = page.getByRole('button',{name:'Start guided tour'});
  await help.focus(); await help.click();
  for (const id of pageStepIds.database.slice(0,6)) {
    const title = tourSteps.find(step => step.stepId === id)!.title;
    await page.getByRole('dialog',{name:title,exact:true}).getByRole('button',{name:'Next',exact:true}).click();
  }
  await expect(page.locator('body')).toHaveAttribute('data-tour-step-id','filter-target');
  await page.getByRole('button',{name:'Pick target character',exact:true}).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('.tour')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('radio',{name:'Advanced',exact:true})).toHaveAttribute('aria-checked','true');
  await expect(page.locator('.filter-heading')).toHaveAttribute('aria-expanded','true');
  await expect(help).toBeFocused();
});

test('introduction waits for an existing dialog and Start runs the current page tour', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('page-introduction-audience-v1','new'));
  await page.goto('/database');
  await page.locator('.inheritance-database .page-heading').getByRole('button',{name:'Add Trainer ID',exact:true}).click();
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  // Deliberately outlast the source's 1800ms introduction delay while the real modal is open.
  await page.waitForTimeout(2200);
  const intro = page.getByRole('dialog',{name:'Tour the Database?',exact:true});
  await expect(intro).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(intro).toBeVisible();
  await intro.getByRole('button',{name:'Start',exact:true}).click();
  await expect(page.locator('.tour')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-tour-step-id','database-page');
  await page.keyboard.press('Escape');
});

test('pages without a tour explain the help button and can return focus', async ({ page }) => {
  await page.goto('/privacy-policy');
  const help = page.getByRole('button',{name:'Start guided tour'}); await help.focus(); await help.click();
  const dialog = page.getByRole('dialog',{name:'Come Back Anytime'});
  await dialog.getByRole('button',{name:'Done',exact:true}).click();
  await expect(dialog).toHaveCount(0); await expect(help).toBeFocused();
});

test('failed tour download leaves the page usable and recovers after reloading', async ({ page }) => {
  const tourModule = /\/PageTour(?:-[^/]+\.js|\.svelte)(?:\?.*)?$/;
  let interrupted = 0;
  await page.route(tourModule, route => { interrupted++; return route.abort(); });
  await page.goto('/tools');
  const help = page.getByRole('button',{name:'Start guided tour'});
  await help.click();
  await expect.poll(() => interrupted).toBeGreaterThan(0);
  const failure = page.getByRole('dialog',{name:'Tour unavailable',exact:true});
  await expect(failure).toBeVisible();
  await page.unroute(tourModule);
  await Promise.all([page.waitForEvent('domcontentloaded'), failure.getByRole('button',{name:'Reload page',exact:true}).click()]);
  await expect(page).toHaveURL(/\/tools$/);
  await help.click();
  await expect(page.locator('.tour')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toBeFocused();
});
