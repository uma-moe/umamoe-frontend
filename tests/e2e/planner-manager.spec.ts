import { expect, test } from './fixtures/test';
import { mockPlannerControls, plannerControlsPlan } from './fixtures/planner-controls';
import { decodeCompactPlannerShare } from '../../src/lib/timeline/planner-share-codec';

test('Planner menus retain source actions, keyboard navigation, selected plans and delete confirmation', async ({ page }) => {
  await mockPlannerControls(page); await page.goto('/timeline?tab=carat-planner');
  const picker=page.getByRole('button',{name:'Selected plan',exact:true}),more=page.getByRole('button',{name:'More plan actions',exact:true});
  if(page.viewportSize()!.width>768){const selectBox=await picker.boundingBox(),nameBox=await page.getByRole('textbox',{name:'Plan name',exact:true}).boundingBox();expect(selectBox!.y).toBeCloseTo(nameBox!.y,1);expect(selectBox!.height).toBe(nameBox!.height);}
  await more.click();const menu=page.getByRole('menu',{name:'Plan actions',exact:true});
  await expect(menu.getByRole('menuitem')).toHaveText(['Share plan','Duplicate plan','Export plan','Import plan','Delete plan']);
  await expect(menu.getByRole('menuitem',{name:'Delete plan'})).toBeDisabled();
  await page.keyboard.press('End');await expect(menu.getByRole('menuitem',{name:'Import plan'})).toBeFocused();
  await page.keyboard.press('ArrowDown');await expect(menu.getByRole('menuitem',{name:'Share plan'})).toBeFocused();
  await page.keyboard.press('Escape');await expect(more).toBeFocused();await expect(menu).not.toBeVisible();
  await picker.focus();await picker.press('ArrowDown');
  const plans=page.getByRole('menu',{name:'Select a plan',exact:true});
  await expect(plans.getByRole('menuitemradio',{name:'Controls plan'})).toHaveAttribute('aria-checked','true');
  await page.keyboard.press('End');await page.keyboard.press('Enter');
  await expect(picker).toHaveText('New plan');await expect(picker).toBeFocused();
  await page.getByRole('textbox',{name:'Plan name',exact:true}).fill('My second plan');
  await more.click();await menu.getByRole('menuitem',{name:'Duplicate plan'}).click();
  await expect(picker).toHaveText('My second plan copy');
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('carat-planner-plans-v1')!));
  await expect.poll(async()=>(await saved()).plans.length).toBe(3);
  const before=await saved();
  await more.click();page.once('dialog',dialog=>{expect(dialog.message()).toBe('Delete "My second plan copy"?');void dialog.dismiss();});
  await menu.getByRole('menuitem',{name:'Delete plan'}).click();expect(await saved()).toEqual(before);
  await more.click();page.once('dialog',dialog=>void dialog.accept());await menu.getByRole('menuitem',{name:'Delete plan'}).click();
  await expect.poll(async()=>(await saved()).plans.length).toBe(2);await expect(picker).toHaveText('Controls plan');
  if(page.viewportSize()!.width<600)await page.setViewportSize({width:320,height:844});
  await more.click();const bounds=await menu.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  if(page.viewportSize()!.width<600){
    expect((await more.boundingBox())!.height).toBeGreaterThanOrEqual(32);
    const heights=await menu.getByRole('menuitem').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));expect(heights.every(height=>height>=32)).toBe(true);
  }
  await page.getByRole('textbox',{name:'Plan name',exact:true}).click();await expect(menu).not.toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
});

test('Planner overview includes craftable crystals, shard progress and the source mobile stat order', async ({ page }) => {
  await mockPlannerControls(page);const plan=plannerControlsPlan();plan.targets=[];plan.disabledEventIds=[];
  Object.assign(plan.balances,{rainbowFullCrystals:2,rainbowCrystals:49,goldFullCrystals:1,goldCrystals:25});
  await page.addInitScript(plan=>localStorage.setItem('carat-planner-plans-v1',JSON.stringify({version:1,activePlanId:plan.id,plans:[plan]})),plan);
  await page.goto('/timeline?tab=carat-planner');const summary=page.getByRole('group',{name:'Projection summary'}),crystals=summary.locator('.crystals');
  await expect(crystals).toContainText('SSR 4 (9/20)');await expect(crystals).toContainText('SR 2 (5/20)');
  await expect.poll(()=>crystals.locator('img').evaluateAll(images=>images.length===2&&images.every(image=>image.complete&&image.naturalWidth>0))).toBe(true);
  await page.getByRole('button',{name:/Plan assumptions/}).click();
  await page.getByRole('group',{name:'Crystal shards',exact:true}).getByRole('spinbutton',{name:'Rainbow',exact:true}).fill('20');
  await expect(crystals).toContainText('SSR 3 (0/20)');
  if(page.viewportSize()!.width<600){
    const boxes=await summary.locator(':scope>div').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};}));
    expect(boxes[0]!.width).toBeGreaterThan(boxes[1]!.width*1.9);expect(boxes[1]!.y).toBe(boxes[2]!.y);expect(boxes[3]!.y).toBe(boxes[4]!.y);expect(boxes[3]!.x).toBe(boxes[1]!.x);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
});

test('Planner share notice exposes separate open and copy actions and preserves a link when copying is denied', async ({ page, context }) => {
  await mockPlannerControls(page);
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(value:string)=>{if(sessionStorage.getItem('clipboard-denied')==='yes')throw new Error('denied');sessionStorage.setItem('copied-link',value);}}});
    document.execCommand=()=>false;
  });
  await page.goto('/timeline?tab=carat-planner');await page.getByRole('button',{name:'More plan actions',exact:true}).click();await page.getByRole('menuitem',{name:'Share plan',exact:true}).click();
  const notice=page.locator('.share-notice'),link=notice.getByRole('link',{name:'Open link',exact:true});
  await expect(notice).toContainText('Self-contained plan link copied.');const href=(await link.getAttribute('href'))!;
  expect((await decodeCompactPlannerShare(new URLSearchParams(new URL(href).hash.slice(1)).get('p')!)).plan.name).toBe('Controls plan');
  await page.evaluate(()=>sessionStorage.setItem('clipboard-denied','yes'));await notice.getByRole('button',{name:'Copy link',exact:true}).click();
  await expect(notice).toContainText('Copy the share link below.');await expect(link).toHaveAttribute('href',href);
  await page.evaluate(()=>sessionStorage.removeItem('clipboard-denied'));await notice.getByRole('button',{name:'Copy link',exact:true}).click();await expect(notice).toContainText('Share link copied.');
  expect(await page.evaluate(()=>sessionStorage.getItem('copied-link'))).toBe(href);
  // Destination data/import is covered by share-reopening workflows; this checks the new-window control.
  await context.route('**/timeline?tab=carat-planner',route=>route.fulfill({contentType:'text/html',body:'<title>Shared plan destination</title>'}));
  const opening=page.waitForEvent('popup');await link.click();const popup=await opening;await expect(popup).toHaveURL(href);await popup.close();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
});
