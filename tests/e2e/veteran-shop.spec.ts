import {expect,test,setSliderValue} from './fixtures/test';
import {mockVeteranProfile,mockCharacterCatalog,veteran} from './fixtures/api';

test('shop sidebar and mobile sheet filter the same collection',async({page},testInfo)=>{
  const mobile=page.viewportSize()!.width < 1024;
  await mockVeteranProfile(page);
  await page.route('**/api/v4/user/profile/123456789012',route=>route.fulfill({json:{trainer:{account_id:'123456789012',name:'Shop trainer'},veterans:[
    veteran,
    {...veteran,id:2,trained_chara_id:2,card_id:100601,distance_type:2,speed:900},
    {...veteran,id:3,trained_chara_id:3,card_id:106701,distance_type:1,speed:1300}
  ]}}));
  await page.goto('/veterans/123456789012');
  const cards=page.locator('.veteran-card');
  const trigger=page.getByRole('button',{name:'Filters',exact:true});
  const filters=page.getByRole(mobile ? 'dialog' : 'complementary',{name:'Filter veterans',exact:true});
  await expect(cards).toHaveCount(3);
  if(mobile) await expect(filters).not.toBeVisible();
  else {
    await expect(filters).toBeVisible();
    await expect(trigger).toHaveCount(0);
    expect((await filters.boundingBox())!.x+(await filters.boundingBox())!.width).toBeLessThan((await cards.first().boundingBox())!.x);
  }
  if(mobile) { await trigger.focus(); await trigger.press('Enter'); }
  await filters.getByRole('group',{name:'Distance',exact:true}).getByRole('button',{name:'Clear distances',exact:true}).click();
  await filters.getByRole('group',{name:'Distance',exact:true}).getByRole('button',{name:'Mile',exact:true}).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first().locator('[data-stat="speed"] dd')).toHaveText('900');
  await filters.getByRole('button',{name:'Stats & SP',exact:true}).click();
  await setSliderValue(filters.getByRole('slider',{name:'SP total minimum',exact:true}),250);
  await expect(cards).toHaveCount(0);
  if(mobile) await expect(filters.getByRole('button',{name:'Show 0 veterans',exact:true})).toBeVisible();
  await filters.getByRole('button',{name:'Stats & SP',exact:true}).click();
  await expect(filters.getByRole('slider',{name:'SP total minimum',exact:true})).toHaveCount(0);
  const distance=filters.getByRole('group',{name:'Distance',exact:true});
  await expect(distance.getByRole('button',{name:'Mile',exact:true})).toHaveAttribute('aria-pressed','true');
  await filters.getByRole('button',{name:'Clear Stats & SP',exact:true}).click();
  await distance.getByRole('button',{name:'Sprint',exact:true}).click();
  await expect(cards).toHaveCount(2);
  await distance.getByRole('button',{name:'Mile',exact:true}).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first().locator('[data-stat="speed"] dd')).toHaveText('1,300');
  await distance.getByRole('button',{name:'Select all distances',exact:true}).click();
  const style=filters.getByRole('group',{name:'Running style',exact:true});
  await style.getByRole('button',{name:'Pace',exact:true}).click();
  await expect(cards).toHaveCount(0);
  await style.getByRole('button',{name:'Select all running styles',exact:true}).click();
  await expect(cards).toHaveCount(3);
  await expect(distance.locator('.filter-choices [aria-pressed="true"]')).toHaveCount(5);
  await expect(style.locator('.filter-choices [aria-pressed="true"]')).toHaveCount(4);
  await expect(filters.getByRole('button',{name:'Any',exact:true})).toHaveCount(0);
  await distance.getByRole('button',{name:'Clear distances',exact:true}).click();
  await expect(cards).toHaveCount(0);
  await distance.getByRole('button',{name:'Long',exact:true}).click();
  await expect(cards).toHaveCount(1);
  await filters.getByRole('button',{name:'Reset all',exact:true}).click();
  await expect(distance.locator('.filter-choices [aria-pressed="true"]')).toHaveCount(5);
  await expect(cards).toHaveCount(3);
  if(mobile) {
    await filters.getByRole('button',{name:'Show 3 veterans',exact:true}).click();
    await expect(filters).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await page.getByRole('button',{name:'Sort veterans',exact:true}).click();
    const sort=page.getByRole('dialog',{name:'Sort veterans',exact:true});
    await sort.getByRole('combobox',{name:'Order',exact:true}).click();
    await sort.getByRole('option',{name:'Lowest first',exact:true}).click();
    await sort.getByRole('button',{name:'Speed',exact:true}).click();
    await sort.getByRole('button',{name:'Show 3 veterans',exact:true}).click();
    await expect(cards.first().locator('[data-stat="speed"] dd')).toHaveText('900');
    await page.evaluate(()=>window.scrollBy(0,400));
    await expect.poll(async()=>Math.round((await page.locator('.results-toolbar').boundingBox())!.y)).toBe(60);
    await expect(trigger).toBeInViewport();
    await trigger.focus(); await trigger.press('Enter');
  } else {
    await page.getByRole('combobox',{name:'Sort',exact:true}).click();
    await page.getByRole('option',{name:'Speed',exact:true}).click();
    await page.getByRole('button',{name:'Sort ascending',exact:true}).click();
    await expect(cards.first().locator('[data-stat="speed"] dd')).toHaveText('900');
  }
  await filters.getByRole('button',{name:'Blue stats',exact:true}).click();
  await filters.getByRole('button',{name:'Add Speed spark',exact:true}).click();
  await expect(cards).toHaveCount(3);
  expect(await filters.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({path:testInfo.outputPath('shop-filters.png')});
  if(mobile) {
    await filters.getByRole('button',{name:'Close dialog',exact:true}).focus();
    await page.keyboard.press('Escape');
    await expect(filters).not.toBeVisible();
    await expect(trigger).toBeFocused();
    // Opening an applied chip must show its controls even if this section was already expanded.
    await page.getByRole('button',{name:'Speed · Total 1★+ · Any generation',exact:true}).click();
    await expect(filters.getByRole('slider',{name:'Stars minimum',exact:true})).toBeVisible();
    await filters.getByRole('button',{name:'Show 3 veterans',exact:true}).click();
  } else {
    // Resizing keeps applied filters while switching between the permanent sidebar and sheet.
    await page.setViewportSize({width:390,height:844});
    await expect(filters).toHaveCount(0);
    await expect(page.locator('.active-filter-chips')).toContainText('Speed');
    await trigger.click();
    const sheet=page.getByRole('dialog',{name:'Filter veterans',exact:true});
    await expect(sheet.locator('.rule-name')).toContainText('Speed');
    await page.setViewportSize({width:1536,height:960});
    await expect(sheet).toHaveCount(0);
    await expect(filters).toBeVisible();
    await expect(cards).toHaveCount(3);
  }
  await page.getByRole('button',{name:'Remove Speed · Total 1★+ · Any generation',exact:true}).click();
  await expect(page.locator('.active-filter-chips')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('compact stat sliders, aptitude grades and section resets work together',async({page},testInfo)=>{
  await mockVeteranProfile(page);
  await mockCharacterCatalog(page);
  await page.route('**/api/v4/user/profile/123456789012',route=>route.fulfill({json:{trainer:{account_id:'123456789012',name:'Filter trainer'},veterans:[veteran,{...veteran,id:2,trained_chara_id:2,card_id:100601,speed:1000,proper_ground_turf:8},{...veteran,id:3,trained_chara_id:3,card_id:106701,speed:900,proper_ground_turf:6}]}}));
  await page.goto('/veterans/123456789012');
  const cards=page.locator('.veteran-card');await expect(cards).toHaveCount(3);
  await expect(cards.first().locator('.card-aptitudes img')).toHaveCount(10);
  await cards.first().screenshot({path:testInfo.outputPath('card-aptitudes.png')});
  if(page.viewportSize()!.width<1024)await page.getByRole('button',{name:'Filters',exact:true}).click();
  await page.getByRole('button',{name:'Stats & SP',exact:true}).click();
  const min=page.getByRole('slider',{name:'Speed minimum',exact:true}),max=page.getByRole('slider',{name:'Speed maximum',exact:true});
  await min.press('Home');await min.press('ArrowRight');await expect(min).toHaveValue('950');
  await max.press('End');await max.press('ArrowLeft');await expect(max).toHaveValue('1200');
  await page.getByRole('button',{name:'Clear Stats & SP',exact:true}).click();
  for(const field of await page.locator('.stat-limit').all()) {
    const labels=field.locator('.value-labels span'),knobs=field.locator('.visual-knob');
    if(await labels.count()!==2)continue;
    for(let i=0;i<2;i++)await expect.poll(async()=>{const label=(await labels.nth(i).boundingBox())!,knob=(await knobs.nth(i).boundingBox())!;return Math.abs(label.x+label.width/2-knob.x-knob.width/2);}).toBeLessThan(1);
  }
  await page.locator('#facet-stats').screenshot({path:testInfo.outputPath('aligned-stat-sliders.png'),animations:'disabled'});
  await setSliderValue(min,1100);await expect(cards).toHaveCount(1);
  await expect(page.getByRole('slider',{name:'Speed minimum',exact:true})).toHaveValue('1100');
  await page.getByRole('slider',{name:'Speed minimum',exact:true}).press('Home');await expect(min).toHaveValue('900');await expect(cards).toHaveCount(3);
  await setSliderValue(max,1050);await expect(cards).toHaveCount(2);
  await expect(page.getByRole('slider',{name:'Speed maximum',exact:true})).toHaveValue('1050');
  await setSliderValue(min,1200);await expect(min).toHaveValue('1050');await expect(cards).toHaveCount(0);
  await page.getByRole('button',{name:'Clear Stats & SP',exact:true}).click();await expect(cards).toHaveCount(3);
  const spMin=page.getByRole('slider',{name:'SP total minimum',exact:true}),spMax=page.getByRole('slider',{name:'SP total maximum',exact:true});
  await setSliderValue(spMax,150);await expect(cards).toHaveCount(0);
  await spMax.press('ArrowRight');await expect(cards).toHaveCount(3);
  await setSliderValue(spMin,200);await expect(cards).toHaveCount(3);
  await expect(page.getByRole('group',{name:'SP total',exact:true}).locator('.value-labels')).toHaveText('200');
  await page.screenshot({path:testInfo.outputPath('compact-stat-sliders.png')});
  await page.getByRole('button',{name:'Clear Stats & SP',exact:true}).click();
  await expect(spMin).toHaveValue('0');await expect(spMax).toHaveValue('1000');
  await page.getByRole('button',{name:'Aptitudes',exact:true}).click();
  await page.getByRole('combobox',{name:'Turf minimum grade',exact:true}).click();
  const grades=page.getByRole('listbox',{name:'Turf minimum grade',exact:true});
  await expect.poll(()=>grades.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);
  await grades.screenshot({path:testInfo.outputPath('aptitude-grade-picker.png')});
  await page.getByRole('option',{name:'A+',exact:true}).click();await expect(cards).toHaveCount(2);
  await page.getByRole('button',{name:'Stats & SP',exact:true}).click();await setSliderValue(min,1100);await expect(cards).toHaveCount(1);
  await page.getByRole('button',{name:'Clear Stats & SP',exact:true}).click();await expect(cards).toHaveCount(2);
  await page.getByRole('button',{name:'Aptitudes',exact:true}).click();await expect(page.getByRole('combobox',{name:'Turf minimum grade',exact:true})).toContainText('A+');
  await expect(page.getByRole('combobox',{name:'Turf minimum grade',exact:true}).locator('img')).toHaveAttribute('src','/game-assets/textures/uma_ranks/utx_ico_statusrank_12.webp');
  await expect(page.getByRole('combobox',{name:'Dirt minimum grade',exact:true})).toContainText('Any');
  await page.screenshot({path:testInfo.outputPath('compact-aptitude-filters.png')});
  await page.getByRole('button',{name:'Clear Aptitudes',exact:true}).click();await expect(cards).toHaveCount(3);
  await page.getByRole('button',{name:'Include / Exclude Umas',exact:true}).click();
  for(const generation of ['This veteran','Parents','Grandparents'])await expect(page.getByRole('button',{name:'Add included characters to '+generation,exact:true})).toBeVisible();
  expect((await page.locator('.uma-rules').boundingBox())!.height).toBeLessThan(260);
  const includeBounds=(await page.getByRole('button',{name:'Add included characters to This veteran',exact:true}).boundingBox())!;
  const excludeBounds=(await page.getByRole('button',{name:'Add excluded characters to This veteran',exact:true}).boundingBox())!;
  expect(includeBounds.y).toBe(excludeBounds.y);
  expect(excludeBounds.x).toBeGreaterThan(includeBounds.x+includeBounds.width);
  await page.locator('#facet-parents').screenshot({path:testInfo.outputPath('compact-uma-rules-empty.png')});
  await page.getByRole('button',{name:'Add included characters to This veteran',exact:true}).click();
  const include=page.getByRole('dialog',{name:'Include Characters',exact:true});
  await include.getByRole('searchbox',{name:'Search characters',exact:true}).fill('Grass Wonder');
  await include.getByRole('button',{name:'Grass Wonder',exact:true}).click();
  await include.getByRole('button',{name:'Add 1 Character',exact:true}).click();await expect(cards).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Remove Grass Wonder from This veteran include',exact:true})).toBeVisible();
  await page.locator('#facet-parents').screenshot({path:testInfo.outputPath('uma-rules.png')});
  await page.getByRole('button',{name:'Add excluded characters to This veteran',exact:true}).click();
  const exclude=page.getByRole('dialog',{name:'Exclude Characters',exact:true});
  await exclude.getByRole('searchbox',{name:'Search characters',exact:true}).fill('Grass Wonder');
  await exclude.getByRole('button',{name:'Grass Wonder',exact:true}).click();
  await exclude.getByRole('button',{name:'Add 1 Character',exact:true}).click();await expect(cards).toHaveCount(2);
  await expect(page.getByRole('button',{name:'Remove Grass Wonder from This veteran include',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Remove Grass Wonder from This veteran exclude',exact:true}).click();await expect(cards).toHaveCount(3);
  await page.getByRole('button',{name:'Add included characters to Parents',exact:true}).click();
  await include.getByRole('searchbox',{name:'Search characters',exact:true}).fill('Satono Diamond');
  await include.getByRole('button',{name:'Satono Diamond',exact:true}).click();
  await include.getByRole('button',{name:'Add 1 Character',exact:true}).click();await expect(cards).toHaveCount(3);
  await expect(page.getByRole('button',{name:'Remove Satono Diamond from Parents include',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Clear Include / Exclude Umas',exact:true}).click();await expect(cards).toHaveCount(3);
  await page.getByRole('button',{name:'Learned skills',exact:true}).click();
  const skills=page.getByRole('combobox',{name:'Find a learned skill',exact:true});await skills.fill('Shooting Star');await skills.press('Enter');
  await expect(page.getByRole('button',{name:'Clear Learned skills',exact:true})).toBeVisible();await expect(cards).toHaveCount(3);
  const selectedSkills=page.locator('#facet-skills .selected-skills .skill-chip');
  const selectedSkill=selectedSkills.filter({hasText:'Shooting Star'});
  await expect(selectedSkill).toHaveClass(/rarity-unique-main/);
  await expect.poll(()=>selectedSkill.locator('img').evaluate((image:HTMLImageElement)=>image.complete && image.naturalWidth>0)).toBe(true);
  await skills.fill('Right-Handed');await page.getByRole('option',{name:'Right-Handed ◎',exact:true}).click();
  await skills.fill('Left-Handed');await page.getByRole('option',{name:'Left-Handed ○',exact:true}).click();
  await expect(selectedSkills).toHaveCount(3);
  const searchBounds=(await skills.boundingBox())!;
  for(const selection of await selectedSkills.all()) {
    const row=(await selection.boundingBox())!;
    expect(row.y).toBeGreaterThanOrEqual(searchBounds.y+searchBounds.height);
    expect(row.width).toBeCloseTo(searchBounds.width,0);
    const remove=(await selection.getByRole('button').boundingBox())!;
    expect(remove.x+remove.width).toBeLessThanOrEqual(row.x+row.width);
  }
  await page.locator('#facet-skills').screenshot({path:testInfo.outputPath('selected-skill-display.png')});
  await selectedSkill.getByRole('button',{name:'Remove Shooting Star',exact:true}).click();
  await expect(selectedSkill).toHaveCount(0);
  await selectedSkills.getByRole('button',{name:'Remove Left-Handed ○',exact:true}).click();
  await selectedSkills.getByRole('button',{name:'Remove Right-Handed ◎',exact:true}).click();
  await expect(cards).toHaveCount(3);
  await skills.fill('Shooting Star');await skills.press('Enter');
  await page.getByRole('button',{name:'Clear Learned skills',exact:true}).click();
  expect(await page.locator('.filter-facets').evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
});
