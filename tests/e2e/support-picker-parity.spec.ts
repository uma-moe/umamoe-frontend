import { expect, test, type Page } from './fixtures/test';
import { mockResources, mockAdvertising, mockAffinity, mockDatabase, supportCards } from './fixtures/api';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { startInteractionAudit, throttleAuditPage } from './fixtures/interaction-audit';

async function openPicker(page: Page, navigate = true) {
  if (navigate) await page.goto('/database', { waitUntil:'domcontentloaded' });
  await page.getByRole('button', {name:/Filters/}).click();
  await page.getByRole('radio', {name:'Advanced',exact:true}).click();
  if (page.viewportSize()!.width <= 900) await page.locator('[data-filter-group="support"] .group-title').click();
  await page.getByRole('button', {name:'Borrow support card',exact:true}).focus(); await page.keyboard.press('Enter');
  return page.getByRole('dialog', {name:'Select Support Card',exact:true});
}

test('Live support cards preserve released choices, titles, search, sorting and backend IDs', async ({page}) => {
  await mockDatabase(page); await mockAffinity(page);
  const requests:string[]=[];
  page.on('request',request => requests.push(request.url()));
  await page.goto('/database');
  await expect(page.getByRole('heading',{name:'Results',exact:true})).toBeVisible();
  await expect.poll(() => requests.some(url => /\/resources\/.*support-cards-db\.json/.test(url))).toBe(true);
  const dialog=await openPicker(page);
  await expect(dialog.getByRole('radio')).toHaveCount(5);
  await expect(dialog.locator('.card-name')).toHaveText(['Kitasan Black','Fine Motion','Tokai Teio','Daiwa Scarlet','Kitasan Black']);
  await expect(dialog.locator('.card-title')).toHaveText(['Fire at My Heels','Wave of Gratitude','Dreams Do Come True']);
  await expect(dialog).not.toContainText('Unreleased Support');
  const search=dialog.getByRole('searchbox',{name:'Search support cards'});
  await search.fill('BLACK, FIRE'); await expect(dialog.getByRole('radio')).toHaveCount(1);
  await expect(dialog.locator('.art img')).toHaveAttribute('src','/assets/images/support_card/half/support_card_s_30028.webp');
  await search.fill('30189'); await expect(dialog.getByRole('radio')).toHaveCount(1);
  await expect(dialog.getByRole('radio')).toContainText('Fine Motion');
  await dialog.getByRole('radio').click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => requests.filter(url => url.includes('/search/query?')).map(url => new URL(url).searchParams.get('support_card_id')).at(-1)).toBe('30189');
  await expect(page.getByRole('button',{name:'Change support card [Wave of Gratitude]',exact:true})).toBeFocused();
});

test('Support failures stay in the dialog, retry preserves filters and cannot turn into an empty result', async ({page}) => {
  await mockDatabase(page); await mockAffinity(page);
  let failed=true, release!:()=>void;
  const pending=new Promise<void>(resolve=>release=resolve);
  await page.route('**/resources/*/support-cards-db.json*',async route=>{await pending;await route.fulfill(failed?{status:503,json:{error:'Offline'}}:{json:supportCards});});
  const dialog=await openPicker(page);
  await expect(dialog.getByText('Still fetching resources...', {exact:true})).toBeVisible();
  const search=dialog.getByRole('searchbox',{name:'Search support cards'}); await search.fill('Black Fire');
  release(); await expect(dialog.getByText('Resource fetch failed',{exact:true})).toBeVisible();
  await expect(dialog.getByRole('link',{name:'Report on Discord'})).toBeVisible();
  await expect(dialog.getByText('No support cards match these filters.',{exact:true})).not.toBeVisible();
  failed=false; await dialog.getByRole('button',{name:'Retry support data'}).click();
  await expect(dialog.getByRole('radio')).toHaveCount(1); await expect(search).toHaveValue('Black Fire');
  await expect(dialog.getByText('Resource fetch failed',{exact:true})).not.toBeVisible();
});

test('persistent resources render before the manifest, survive navigation, and refresh only changed hashes', async ({playwright,browserName,baseURL}) => {
  test.setTimeout(60_000);
  // WebKit's ephemeral contexts discard CacheStorage entries across document navigations.
  // Use a real profile for the reload/persistence workflow in every browser.
  const {viewport,isMobile,hasTouch,userAgent}=test.info().project.use;
  // A short directory also avoids Windows CacheStorage's nested-path limit.
  const profile=await mkdtemp(join(tmpdir(),'moe-cache-'));
  const context=await playwright[browserName].launchPersistentContext(profile,{baseURL,viewport,isMobile,hasTouch,userAgent});
  const finishAudit=await startInteractionAudit(context,test.info());
  // Use Playwright's HTTP client for bundles to avoid serial WebKit/Windows socket delays.
  await context.route('**/app/**', async route => route.fulfill({response:await route.fetch({maxRetries:2})}));
  await mockAdvertising(context);
  await mockResources(context);
  await context.addInitScript(() => { localStorage.setItem('page-introduction-audience-v1', 'existing'); localStorage.setItem('lastSeenUpdateVersion', '18'); });
  const page=await context.newPage(),errors:string[]=[];
  await throttleAuditPage(page);
  page.on('pageerror',error=>errors.push(error.message));
  try {
  await mockDatabase(page); await mockAffinity(page); await page.goto('/tools');
   const initialHash = createHash('sha256').update(JSON.stringify(supportCards.slice(0,2))).digest('hex');
   const freshHash = createHash('sha256').update(JSON.stringify(supportCards)).digest('hex');
   await page.evaluate(async ({cards,hash})=>{
    const url=location.origin+'/resources/legacy/support-cards-db.json';
    await (await caches.open('umamoe-resource-data-legacy')).put(url,new Response(JSON.stringify(cards),{headers:{'Content-Type':'application/json'}}));
     localStorage.setItem('umamoe_resource_meta_v1:support-cards-db',JSON.stringify({url,version:'legacy',cacheName:'umamoe-resource-data-legacy',fingerprint:hash,cachedAt:1}));
   },{cards:supportCards.slice(0,2),hash:initialHash});
    let releaseManifest!:()=>void, releaseResource!:()=>void, hash=initialHash, failed=true, downloads=0, manifests=0;
   const pendingRequests=new Set<string>();
   page.on('request',request=>{if(request.url().includes('/resources/'))pendingRequests.add(request.url());});
   page.on('requestfinished',request=>pendingRequests.delete(request.url()));
   page.on('requestfailed',request=>pendingRequests.delete(request.url()));
   const resourcesReady=()=>expect.poll(()=>pendingRequests.size).toBe(0);
   const pendingManifest=new Promise<void>(resolve=>releaseManifest=resolve);
   const pendingResource=new Promise<void>(resolve=>releaseResource=resolve);
   await page.route('**/resources/manifest.json*',async route=>{
     manifests++; await pendingManifest;
      await route.fulfill({json:{version:'test',files:{affinity:'/resources/test/affinity.json','support-cards-db':{path:'/resources/test/support-cards-db.json',sha256:hash}}}});
   });
   await page.route('**/resources/*/support-cards-db.json*',async route=>{
     downloads++;
     if(failed) { await route.fulfill({status:500,json:{error:'Offline'}}); return; }
     await pendingResource; await route.fulfill({json:supportCards});
   });
   const dialog=await openPicker(page);
   await expect(dialog.getByRole('radio')).toHaveCount(2);
   expect(downloads).toBe(0);
   releaseManifest(); await resourcesReady();
   expect(downloads).toBe(0); expect(manifests).toBe(1);
   const follow = async (href:string) => {
     await page.evaluate(href => { const link=document.createElement('a'); link.href=href; document.body.append(link); link.click(); link.remove(); },href);
     await expect(page).toHaveURL(new URL(href,page.url()).href);
     await expect(page.getByRole('heading',{name:href === '/database' ? 'Database' : 'Privacy Policy',exact:true})).toBeVisible();
   };
   await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();
   await follow('/privacy-policy'); await follow('/database');
   await expect(page.getByRole('heading',{name:'Results',exact:true})).toBeVisible();
   await resourcesReady();
   expect(downloads).toBe(0); expect(manifests).toBe(1);
   await page.reload(); await expect.poll(()=>manifests).toBe(2); await resourcesReady();
   expect(downloads).toBe(0); expect(manifests).toBe(2);
    hash=freshHash;
   await page.reload(); await expect.poll(()=>downloads).toBe(1); await resourcesReady();
   expect(downloads).toBe(1);
   failed=false;
   await follow('/privacy-policy'); await follow('/database');
   await openPicker(page,false);
   await expect(dialog.getByRole('radio')).toHaveCount(2);
   releaseResource();
   await expect(dialog.getByRole('radio')).toHaveCount(5);
    await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('umamoe_resource_meta_v1:support-cards-db')!).fingerprint)).toBe(freshHash);
    const beforeCorruption = downloads;
    // Damage valid JSON without touching the matching manifest metadata.
    await page.evaluate(async cards => {
      const meta = JSON.parse(localStorage.getItem('umamoe_resource_meta_v1:support-cards-db')!);
      await (await caches.open(meta.cacheName)).put(meta.url, new Response(JSON.stringify(cards)));
    }, supportCards.slice(0,2));
    await page.reload();
    await openPicker(page,false);
    await expect(dialog.getByRole('radio')).toHaveCount(5);
    await expect.poll(() => downloads).toBe(beforeCorruption + 1);
    await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('umamoe_resource_meta_v1:support-cards-db')!).checksum)).toBe(freshHash);
  expect(await page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('svelte-')))).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
  expect(errors).toEqual([]);
  } finally { try { await finishAudit(); } finally { await context.close(); } }
});
