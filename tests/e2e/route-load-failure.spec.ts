import { expect, test } from './fixtures/test';
import { mockDatabase } from './fixtures/api';

test.use({ allowPageLoadFailure: true });

for (const [path, moduleName, heading] of [['/database','DatabasePage','Database'], ['/privacy-policy','PrivacyPage','Privacy Policy']]) {
  test(`${path} recovers a failed page module without losing URL or saved data`, async ({page,isMobile}) => {
    if (path === '/database') await mockDatabase(page);
    await page.addInitScript(() => localStorage.setItem('lineage-planner-saves-v1', '{"Untouched":[]}'));
    let failing = true, blocked = 0;
    await page.route(new RegExp(`/${moduleName}(?:-[\\w-]+\\.js|\\.svelte)(?:\\?.*)?$`), route => {
      if (failing) { blocked++; return route.abort('failed'); }
      return route.continue();
    });
    const destination = `${path}?recover=keep#section`;
    await page.goto(destination);
    await expect(page.getByText('This page could not be loaded',{exact:true})).toBeVisible();
    expect(blocked).toBeGreaterThan(0);
    await expect(page.getByRole('link',{name:'Report on Discord',exact:true})).toBeVisible();
    expect(new URL(page.url()).pathname + new URL(page.url()).search + new URL(page.url()).hash).toBe(destination);
    expect(await page.evaluate(()=>localStorage.getItem('lineage-planner-saves-v1'))).toBe('{"Untouched":[]}');
    const reload=page.getByRole('button',{name:'Reload page',exact:true});
    if(isMobile) expect((await reload.boundingBox())!.height).toBeGreaterThanOrEqual(32);
    await page.screenshot({path:test.info().outputPath(`${moduleName}-failure.png`)});
    failing=false;
    const navigation=page.waitForRequest(request=>request.isNavigationRequest()&&request.resourceType()==='document');
    await reload.click();
    expect(new URL((await navigation).url()).search).toBe('?recover=keep');
    await expect(page.getByText('This page could not be loaded',{exact:true})).toHaveCount(0);
    await expect(page.getByRole('heading',{name:heading,exact:true}).first()).toBeVisible();
    expect(await page.evaluate(()=>localStorage.getItem('lineage-planner-saves-v1'))).toBe('{"Untouched":[]}');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
  });
}

test('consecutive failed routes update the fallback title and width and still permit healthy navigation', async ({page}) => {
  await page.route(/\/(DatabasePage|PrivacyPage)(?:-[\w-]+\.js|\.svelte)(?:\?.*)?$/,route=>route.abort('failed'));
  await page.goto('/database');
  await expect(page.getByText('This page could not be loaded',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{level:1,name:'Database',exact:true})).toBeVisible();
  await expect(page.locator('[data-page-width]')).toHaveAttribute('data-page-width','wide');
  await page.getByRole('contentinfo').getByRole('link',{name:'Privacy',exact:true}).click();
  await expect(page).toHaveURL(/\/privacy-policy$/);
  await expect(page.getByRole('heading',{level:1,name:'Privacy',exact:true})).toBeVisible();
  await expect(page.locator('[data-page-width]')).toHaveAttribute('data-page-width','normal');
  await page.locator('a[href="/"]:visible').first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('This page could not be loaded',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{level:1})).toBeVisible();
});
