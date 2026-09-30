import { expect, test, replaceQuery } from './fixtures/test';
import { mockResources, mockAdvertising, mockAffinity, mockDatabase, mockVeteranProfile } from './fixtures/api';
import factors from '../fixtures/resources/factors.json' with { type: 'json' };
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startInteractionAudit, throttleAuditPage } from './fixtures/interaction-audit';

const liveFactor = {id:'990002',text:'Live Recovery',type:3};
const liveFactors = [...factors,liveFactor];

test('failed factor loads show retryable controls and readable error details in both themes, then recover', async ({page}) => {
  await mockDatabase(page); await mockAffinity(page);
  let failed=true;
  await page.route('**/resources/*/factors.json*',route=>route.fulfill(failed?{status:503,body:'Unavailable'}:{json:liveFactors}));
  await page.goto('/database');await page.getByRole('button',{name:/Filters/}).click();
  const error=page.locator('.property-filters .resource-error');
  await expect(error).toContainText('Resource fetch failed');
  for(const theme of ['dark','light']) {
    if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:'Toggle theme',exact:true}).click();
    const style=await error.locator('code').evaluate(element=>{const css=getComputedStyle(element);return {background:css.backgroundColor,color:css.color};});
    expect(style).toEqual({background:'rgb(16, 20, 24)',color:'rgba(255, 255, 255, 0.7)'});
    await error.screenshot({path:test.info().outputPath(`factor-error-${theme}.png`)});
  }
  failed=false;await expect(error).toHaveCount(0,{timeout:10000});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('late catalog refresh updates an open manual editor and Veteran factor filters without losing the draft', async ({page}) => {
  await mockDatabase(page); await mockAffinity(page);
  let release!:()=>void, requests=0;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/resources/*/factors.json*',async route=>{requests++;await pending;await route.fulfill({json:liveFactors});});
  await page.goto('/database');
  await page.getByRole('button',{name:/Filters/}).click();
  await page.getByRole('radio',{name:'Advanced',exact:true}).click();
  await page.getByRole('button',{name:'Pick your legacy',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Select Parent',exact:true});
  await dialog.getByRole('tab',{name:/Manual/}).click();
  await dialog.getByRole('button',{name:'Add',exact:true}).click();
  await dialog.getByRole('textbox',{name:'Entry name (optional)'}).fill('Live factor draft');
  await dialog.getByRole('button',{name:'Choose Parent 1',exact:true}).click();
  await page.getByRole('dialog',{name:'Select Character',exact:true}).getByRole('radio').first().click();
  const main=dialog.getByRole('region',{name:'Parent 1',exact:true});
  await main.getByRole('button',{name:'Add Spark',exact:true}).click();
  const input=main.getByRole('combobox',{name:'Add spark to Parent 1',exact:true});
  await main.getByRole('radio',{name:'2★',exact:true}).click();
  await input.fill('Live Recovery');
  await expect(main.getByText('Still fetching resources...', {exact:true})).toBeVisible();
  await main.screenshot({path:test.info().outputPath('factor-pending.png')});
  release();
  await expect(main.getByRole('option',{name:'Live Recovery',exact:true})).toBeVisible();
  await expect(input).toHaveValue('Live Recovery');
  await main.getByRole('option',{name:'Live Recovery',exact:true}).click();
  await expect(main.locator('.spark')).toHaveCount(1);
  await dialog.getByRole('button',{name:'Save Entry',exact:true}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vpd_manual_entries')!)[0].ownSparkIds)).toEqual([9900022]);
  await dialog.getByRole('button',{name:'Add Spark',exact:true}).click();
  const filter=page.getByRole('dialog',{name:'Add spark filter',exact:true});
  await filter.getByRole('button',{name:'Skill / race',exact:true}).click();
  await filter.getByRole('searchbox',{name:'Search skills and races',exact:true}).fill('Live Recovery');
  await filter.getByRole('button',{name:/Live Recovery/}).click();
  await filter.getByRole('button',{name:'Add filter',exact:true}).click();
  await expect(dialog.locator('.parent-row')).toHaveCount(1);
  expect(requests).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('database basic and UQL controls resolve live factors, including a query entered before the catalog arrives', async ({page,isMobile}) => {
  await mockDatabase(page); await mockAffinity(page);
  let release!:()=>void;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/resources/*/factors.json*',async route=>{await pending;await route.fulfill({json:liveFactors});});
  const requests:URLSearchParams[]=[];
  page.on('request',request=>{if(request.url().includes('/search/query?'))requests.push(new URL(request.url()).searchParams);});
  await page.goto('/database');await page.getByRole('button',{name:/Filters/}).click();
  await page.getByRole('radio',{name:'UQL',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'UQL query',exact:true});
  await expect(editor).toBeVisible();await replaceQuery(editor,'Main has Live Recovery');
  release();
  await expect.poll(()=>requests.at(-1)?.get('uql')).toBe('overlaps(main_white_factors, (9900021, 9900022, 9900023))');
  await expect(page.locator('.uql-status')).toHaveText('Valid');
  await page.getByRole('radio',{name:'Basic',exact:true}).click();
  if(isMobile)await page.getByRole('button',{name:'Spark Filters',exact:true}).click();
  await page.getByRole('button',{name:'Add Blue Factor',exact:true}).click();
  await page.locator('#blue-factors-factor-0').click();await page.getByRole('option',{name:'Speed',exact:true}).click();
  await expect(page.locator('#blue-factors-factor-0')).toContainText('Speed');
  await page.getByRole('button',{name:'Add White Factor',exact:true}).click();
  await page.locator('#white-factors-factor-0').fill('Live Recovery');
  await page.getByRole('option',{name:'Live Recovery',exact:true}).click();
  await expect(page.locator('#white-factors-factor-0')).toHaveValue('Live Recovery');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('cached factors remain usable through failed refreshes and replace live in Lineage and profile controls', async ({playwright,browserName,baseURL}) => {
  test.setTimeout(60_000);
  // As with the support-cache workflow, WebKit needs a persistent profile across navigations.
  const {viewport,isMobile,hasTouch,userAgent}=test.info().project.use;
  const profile=await mkdtemp(join(tmpdir(),'moe-factor-'));
  const context=await playwright[browserName].launchPersistentContext(profile,{baseURL,viewport,isMobile,hasTouch,userAgent});
  const finishAudit=await startInteractionAudit(context,test.info());
  // Use Playwright's HTTP client for bundles to avoid serial WebKit/Windows socket delays.
  await context.route('**/app/**', async route => route.fulfill({response:await route.fetch({maxRetries:2})}));
  await mockAdvertising(context);
  await mockResources(context);
  await context.addInitScript(()=>{ localStorage.setItem('page-introduction-audience-v1','existing'); localStorage.setItem('lastSeenUpdateVersion','18'); });
  const page=await context.newPage(),errors:string[]=[];
  await throttleAuditPage(page);
  page.on('pageerror',error=>errors.push(error.message));
  try {
  await mockAffinity(page); await mockVeteranProfile(page);
  await page.goto('/privacy');
  await page.evaluate(async data=>{
    const url='/resources/legacy/factors.json',cacheName='umamoe-resource-data-legacy';
    await (await caches.open(cacheName)).put(url,new Response(JSON.stringify(data)));
    localStorage.setItem('umamoe_resource_meta_v1:factors',JSON.stringify({url,cacheName,version:'legacy',cachedAt:1}));
  },[...factors,{id:'990001',text:'Cached Recovery',type:3}]);
  let release!:()=>void, fail=true, requests=0;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/resources/*/factors.json*',async route=>{
    requests++;if(fail){await route.fulfill({status:503,body:'Unavailable'});return;}
    await pending; await route.fulfill({json:liveFactors});
  });
  await page.goto('/tools/lineage-planner?cards=100101,101301,0,0,0');
  const node=page.getByRole('region',{name:'Sparks for Parent 1',exact:true});
  await node.getByRole('button',{name:'Add Spark',exact:true}).click();
  await node.getByRole('combobox').fill('Cached Recovery');
  await node.getByRole('option',{name:'Cached Recovery',exact:true}).click();
  await expect(node.locator('.spark')).toHaveAttribute('aria-label',/^3 star Cached Recovery,/);
  await node.getByRole('button',{name:'Add Spark',exact:true}).click();
  await node.getByRole('combobox').fill('Live Recovery');
   fail=false;
   await page.evaluate(() => {
     const href=new URL(location.href); href.searchParams.set('cache-check','1');
     const link=document.createElement('a'); link.href=href.href; document.body.append(link); link.click(); link.remove();
   });
   await expect.poll(()=>requests).toBeGreaterThan(1);
   await expect(node.locator('.spark')).toHaveAttribute('aria-label',/^3 star Cached Recovery,/);
  await node.screenshot({path:test.info().outputPath('factor-cached-refresh.png')});
   release();
   await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('umamoe_resource_meta_v1:factors')!).cacheName)).toBe('umamoe-resource-data-test');
   await node.getByRole('combobox').click();
   await node.getByRole('option',{name:'Live Recovery',exact:true}).click();
  await expect(node.locator('.spark')).toHaveCount(2);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('umamoe_resource_meta_v1:factors')!).cacheName)).toBe('umamoe-resource-data-test');
  await page.goto('/profile/123456789012/veterans');
  if(isMobile) await page.getByRole('button',{name:'Filters',exact:true}).click();
  await page.getByRole('button',{name:'Skill / race',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search skills and races',exact:true}).fill('Live Recovery');
  await expect(page.getByRole('button',{name:/Live Recovery/})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  } finally { try { await finishAudit(); } finally { await context.close(); } }
});
