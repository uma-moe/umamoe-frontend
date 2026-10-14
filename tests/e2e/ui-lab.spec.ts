import { expect, test } from './fixtures/test';

for (const width of [320,768,1280,1536]) {
  test('current component galleries fit '+width+'px in both themes', async ({page},testInfo) => {
    test.setTimeout(120_000);
    const errors:string[]=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width,height:1000});
    await page.goto('/ui');
    await expect(page.getByRole('heading',{name:'UI components',exact:true})).toBeVisible();
    for(const theme of ['Dark','Light']) {
      await page.getByRole('radio',{name:theme,exact:true}).click();
      for(const library of ['uma.moe','Hakuraku']) {
        await page.getByRole('tab',{name:library,exact:true}).click();
        const groups=await page.getByRole('navigation',{name:'Component groups'}).getByRole('button').allTextContents();
        for(let i=0;i<groups.length;i++) {
          await page.getByRole('navigation',{name:'Component groups'}).getByRole('button').nth(i).click();
          await expect(page.locator('.preview').first()).toBeVisible();
          expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
          for(const section of await page.locator('.preview').all()) {
            await section.scrollIntoViewIfNeeded();
            await expect.poll(()=>section.locator('img:visible').evaluateAll(images=>images.every(img=>(img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth>0))).toBe(true);
          }
          if(groups[i]!.startsWith('Statistics')) await page.locator('#statistics-filters').screenshot({path:testInfo.outputPath('filters-'+theme+'.png')});
        }
      }
    }
    expect(errors).toEqual([]);
  });
}

test('gallery search, library navigation and actual dialogs work', async ({page}) => {
  await page.goto('/ui');
  await page.getByRole('searchbox',{name:'Find a component'}).fill('SkillChip');
  await expect(page.locator('.preview')).toHaveCount(1);
  await expect(page.locator('#identity')).toBeVisible();
  await page.getByRole('searchbox',{name:'Find a component'}).fill('retired component');
  await expect(page.getByText('No components match')).toBeVisible();
  await page.getByRole('button',{name:/Feedback/}).click();
  const opener=page.getByRole('button',{name:'Open dialog',exact:true});
  await opener.click();
  await expect(page.getByRole('dialog',{name:'Preview dialog',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await page.getByRole('tab',{name:'Hakuraku',exact:true}).click();
  await page.getByRole('button',{name:/Statistics/}).click();
  const filters=page.locator('#statistics-filters');
  await filters.getByRole('checkbox',{name:'Class 6',exact:true}).uncheck();
  await expect(filters.getByRole('status')).toContainText('1,000,000');
  await filters.getByRole('button',{name:'Open filter dialog'}).click();
  const dialog=page.getByRole('dialog',{name:'Statistics filters'});
  await expect(dialog.getByRole('checkbox',{name:'Class 6',exact:true})).not.toBeChecked();
  await dialog.getByRole('button',{name:'Reset filters'}).click();
  await dialog.getByRole('button',{name:'Show results'}).click();
  await expect(filters.getByRole('checkbox',{name:'Class 6',exact:true})).toBeChecked();
});

test('target picker changes and clears a selected Uma', async ({page}) => {
  await page.goto('/ui#affinity-picker');
  const picker=page.locator('#affinity-picker');
  await picker.getByRole('button',{name:'Change target character',exact:true}).click();
  await page.getByRole('dialog',{name:'Select Character',exact:true}).getByRole('radio',{name:/Oguri Cap/}).click();
  await expect(picker.getByRole('button',{name:'Change target Oguri Cap',exact:true})).toBeVisible();
  await picker.getByRole('button',{name:'Clear target character',exact:true}).click();
  await expect(picker.getByRole('button',{name:'Pick target character',exact:true})).toBeVisible();
});

test('number fields share chevrons and preserve native stepping', async ({ page }) => {
  await page.goto('/ui-lab');
  const number = page.getByRole('spinbutton', { name: 'Number', exact: true });
  const increase = page.getByRole('button', { name: 'Increase Number', exact: true });
  const decrease = page.getByRole('button', { name: 'Decrease Number', exact: true });
  await number.evaluate(input => {
    for (const name of ['input', 'change']) input.addEventListener(name, () => input.setAttribute(`data-${name}-value`, (input as HTMLInputElement).value));
  });
  await increase.click();
  await expect(number).toHaveValue('0.25');
  await expect(number).toHaveAttribute('data-input-value', '0.25');
  await expect(number).toHaveAttribute('data-change-value', '0.25');
  await number.press('ArrowUp');
  await expect(number).toHaveValue('0.5');
  await number.fill('1.9');
  await increase.click();
  await expect(number).toHaveValue('2');
  await expect(increase).toBeDisabled();
  await decrease.click();
  await expect(number).toHaveValue('1.75');
  await number.fill('0');
  await expect(decrease).toBeDisabled();
  await number.fill('');
  await expect(decrease).toBeEnabled();
  await decrease.click();
  await expect(number).toHaveValue('0');
  for (const label of ['Read only number', 'Disabled number']) {
    await expect(page.getByRole('button', { name: `Increase ${label}`, exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: `Decrease ${label}`, exact: true })).toBeDisabled();
  }
  for (const theme of ['Dark', 'Light']) {
    await page.getByRole('radio', { name: theme, exact: true }).click();
    await expect(number).toHaveCSS('appearance', 'textfield');
    await expect(increase.locator('svg')).toHaveCSS('transform', 'matrix(-1, 0, 0, -1, 0, 0)');
    await expect(decrease.locator('svg')).toHaveCSS('transform', 'none');
    await page.locator('#text-field').screenshot({path:test.info().outputPath(`number-fields-${theme.toLowerCase()}.png`)});
  }
});

test('custom select and autocomplete retain keyboard behavior', async ({ page }) => {
  await page.goto('/ui-lab');

  const region = page.getByRole('combobox', { name: 'Data region', exact: true });
  await region.click();
  await expect(page.getByRole('listbox', { name: 'Data region', exact: true })).toBeVisible();
  const normalHeight=(await page.getByRole('option',{name:'Japan',exact:true}).boundingBox())!.height;
  await page.getByRole('option', { name: 'Japan' }).click();
  await expect(region).toContainText('Japan');
  const slim=page.getByRole('combobox',{name:'Data region (slim)',exact:true});
  await expect(slim).toContainText('Japan');
  await slim.click();
  expect((await page.getByRole('option',{name:'Japan',exact:true}).boundingBox())!.height).toBeLessThan(normalHeight);
  await slim.press('Home');
  await slim.press('Enter');
  await expect(slim).toContainText('Global');
  await expect(region).toContainText('Global');

  const character = page.getByRole('combobox', { name: 'Character' });
  await character.fill('Mejiro');
  await expect(page.getByRole('listbox', { name: 'Character suggestions' }).getByRole('option', { name: 'Mejiro McQueen' })).toBeVisible();
  await character.press('Enter');
  await expect(character).toHaveValue('Mejiro McQueen');
});

test('updated game previews use current cards, goals and race headers', async ({page}) => {
  await page.goto('/ui#timeline-card');
  const timelines=page.locator('#timeline-card');
  await expect(timelines.getByRole('link',{name:/Mejiro McQueen/}).first()).toHaveAttribute('href',/gametora.com/);
  expect(await timelines.locator('.timeline-previews>div').last().evaluate(el=>el.getBoundingClientRect().width)).toBeLessThanOrEqual(280);
  const goals=page.locator('#planner-goals');
  await goals.locator('summary').first().click();
  await goals.getByRole('button',{name:'Increase desired copies of Kitasan Black'}).click();
  await expect(goals.getByLabel('Copies of Kitasan Black').getByRole('status')).toHaveText('2');
  await expect(goals.locator('.selected-goal img').first()).toHaveCSS('object-fit','contain');
  await page.getByRole('button',{name:'Open race history',exact:true}).click();
  const history=page.getByRole('dialog',{name:'Race History',exact:true});
  await expect(history.locator('.dialog-panel>header').getByRole('button',{name:'Export race history'})).toBeVisible();
  await expect(history.locator('.dialog-panel>header').getByText(/Mejiro McQueen/)).toBeVisible();
  await history.getByRole('button',{name:'List view'}).click();
  await expect(history.getByRole('button',{name:'List view'})).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Open optimal races',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Optimal Races',exact:true}).locator('.dialog-panel>header').first()).toContainText('both parents');
});

test('notification backgrounds are opaque and dismiss sits beside the message', async ({page}) => {
  await page.goto('/ui#feedback');
  for(const theme of ['Dark','Light']) {
    await page.getByRole('radio',{name:theme,exact:true}).click();
    for(const banner of await page.locator('#feedback .banner').all()) {
      expect(await banner.evaluate(el=>{
        const canvas=document.createElement('canvas');
        canvas.width=canvas.height=1;
        const ctx=canvas.getContext('2d')!;
        ctx.fillStyle=getComputedStyle(el).backgroundColor;
        ctx.fillRect(0,0,1,1);
        return ctx.getImageData(0,0,1,1).data[3];
      })).toBe(255);
      const message=(await banner.locator('.banner-content').boundingBox())!;
      const dismiss=(await banner.getByRole('button',{name:'Dismiss',exact:true}).boundingBox())!;
      expect(dismiss.x).toBeGreaterThan(message.x+message.width);
      expect(dismiss.y+ dismiss.height/2).toBeLessThanOrEqual(message.y+message.height+8);
    }
  }
  const success=page.locator('#feedback .banner--success');
  await success.getByRole('button',{name:'Dismiss',exact:true}).click();
  await expect(success).toHaveCount(0);
  await page.getByRole('button',{name:'Warning toast',exact:true}).click();
  await expect(page.locator('.toast--warning')).toBeVisible();
  await page.getByRole('button',{name:'Dismiss notification'}).click();
  await expect(page.locator('.toast--warning')).toHaveCount(0);
});

test('layout preview shows centered ad placeholders and keeps its footer dismissed', async ({page}) => {
  const adRequests:string[]=[];
  page.on('request',request=>{if(/cdn.fuseplatform|quantcast|choice.consensu/.test(request.url())) adRequests.push(request.url());});
  await page.setViewportSize({width:1920,height:1080});
  await page.goto('/ui?example=page-layout');
  await expect(page.locator('.app-page')).toBeVisible();
  const rail=page.locator('[data-ad-kind="rail"]:visible');
  await expect(rail).toHaveCount(1);
  const box=(await rail.boundingBox())!;
  expect(Math.abs(box.y+box.height/2-540)).toBeLessThan(2);
  const footer=page.locator('.uma-footer-ad');
  const bounds=(await footer.boundingBox())!;
  const close=page.getByRole('button',{name:'Close footer ad'});
  const closeBounds=(await close.boundingBox())!;
  expect(closeBounds.x+closeBounds.width).toBeLessThanOrEqual(bounds.x+bounds.width);
  expect(closeBounds.y).toBeGreaterThanOrEqual(bounds.y);
  await close.click();
  await page.getByRole('tab',{name:'Details',exact:true}).click();
  await page.getByRole('radio',{name:'320 × 50'}).click();
  await expect(footer).toHaveCount(0);
  await page.getByRole('button',{name:'Preview privacy colours'}).click();
  await page.getByRole('button',{name:'Accept preview',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(adRequests).toEqual([]);
  await page.setViewportSize({width:390,height:844});
  await page.reload();
  await expect(page.getByRole('button',{name:'Close footer ad'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
