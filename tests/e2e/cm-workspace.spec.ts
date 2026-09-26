import {test,expect} from './fixtures/test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {matchesTeam} from '../../src/pages/competitive/hakuraku-query';
import type {Performer,Requirement} from '../../src/pages/competitive/hakuraku-types';
const fixture=JSON.parse(gunzipSync(readFileSync('tests/e2e/fixtures/hakuraku-cm.json.gz')).toString());

test.beforeEach(async({page})=>{
  await page.route('https://hakuraku.moe/api/simdata/**',async route=>{
    const url=new URL(route.request().url());let payload:unknown;
    const id=url.pathname.split('/snapshots/')[1]?.split('/')[0]??fixture.summary.snapshotId;
    if(url.pathname.endsWith('/manifest'))payload={snapshots:[...fixture.manifest.snapshots,{...fixture.manifest.snapshots[0],snapshotId:'without-skills',label:'Meeting without timing data',skillAnalysis:undefined}]};
    else if(url.pathname.endsWith('/summary'))payload={...fixture.summary,snapshotId:id};
    else if(url.pathname.includes('/characters/'))payload=fixture.context;
    else if(url.pathname.endsWith('/team-distribution'))payload={...fixture.distribution,snapshotId:id};
    else if(url.pathname.endsWith('/skills/overview'))payload=fixture.skills;
    else if(url.pathname.includes('/skills/details/'))payload={...fixture.skillDetail,skillId:Number(url.pathname.split('/').at(-1))};
    else if(url.pathname.endsWith('/teams')){
      const slots=JSON.parse(url.searchParams.get('slots')??'[]') as Requirement[];
      const matching=(fixture.teams.teams as Performer[]).filter(team=>matchesTeam(team.members,slots));
      const unique=[...new Map(matching.map(team=>[team.owner.id,team])).values()];
      const offset=Number(url.searchParams.get('offset'));
      payload={snapshotId:id,teams:unique.slice(offset,offset+Number(url.searchParams.get('limit'))),totalOwners:unique.length,totalTeams:matching.length};
    }else if(url.pathname.includes('/teams/'))payload={snapshotId:id,team:fixture.teams.teams.find((team:Performer)=>team.id===url.pathname.split('/').at(-1)),skills:{}};
    else throw new Error('Unexpected CM request '+url);
    await route.fulfill({json:payload,headers:{'access-control-allow-origin':'*'}});
  });
});

test('skill details expand in their virtual row and comparison stays independent',async({page},info)=>{
  let fail=true;
  await page.route('**/skills/details/*',async route=>{
    if(fail)await route.fulfill({status:503,json:{error:'Temporary failure'},headers:{'access-control-allow-origin':'*'}});
    else await route.fallback();
  });
  await page.goto('/competitive/cm-data?tab=skills');
  const navigation=page.getByRole('tablist',{name:'Champions Meeting views',exact:true});
  await expect(navigation.getByRole('tab')).toHaveCount(6);
  for(const name of ['Introduction','Strategy Analysis','Uma Analysis','Skill Analysis','Archetype Analysis','Lobby Builder'])await expect(navigation.getByRole('tab',{name,exact:true})).toHaveCount(1);
  const selectedBounds=await navigation.getByRole('tab',{name:'Skill Analysis',exact:true}).boundingBox();
  expect(selectedBounds!.x).toBeGreaterThanOrEqual(0);
  expect(selectedBounds!.x+selectedBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(page.getByRole('tab',{name:'Proc distributions',exact:true})).toHaveCount(0);
  await expect(page.locator('.lane')).toHaveCount(0);
  const table=page.getByRole('table',{name:'CM Skill Analysis',exact:true});
  await expect(table.locator('thead th').last()).toHaveText('Compare');
  const count=new Set(fixture.skills.rows.map((r:number[])=>r[0])).size;
  await expect(table).toHaveAttribute('aria-rowcount',String(count+1));
  expect(await table.locator('tbody tr[data-virtual-index]').count()).toBeLessThan(count);
  await table.getByRole('button',{name:'Players',exact:true}).click();
  await expect(table.getByRole('columnheader',{name:'Players',exact:true})).toHaveAttribute('aria-sort','ascending');
  const first=Object.entries(fixture.skills.allPlayerCounts as Record<string,number>).sort((a,b)=>a[1]-b[1])[0]![1];
  await expect.poll(async()=>Number((await table.locator('tbody tr[data-virtual-index]').first().locator('td[data-label="Players"]').innerText()).replaceAll(',',''))).toBe(first);
  await table.getByRole('button',{name:'Players',exact:true}).click();
  await expect(table.getByRole('columnheader',{name:'Players',exact:true})).toHaveAttribute('aria-sort','descending');
  await expect.poll(async()=>Number((await table.locator('tbody tr[data-virtual-index]').first().locator('td[data-label="Players"]').innerText()).replaceAll(',',''))).toBe(Math.max(...Object.values(fixture.skills.allPlayerCounts as Record<string,number>)));
  const scroll=page.getByRole('region',{name:'CM Skill Analysis scroll area'});
  await scroll.evaluate(e=>e.scrollTop=e.scrollHeight);
  await expect.poll(async()=>Number(await table.locator('tbody tr[data-virtual-index]').last().getAttribute('data-virtual-index'))).toBe(count-1);
  expect(await table.locator('tbody tr[data-virtual-index]').count()).toBeLessThan(count/2);
  const search=page.getByRole('searchbox',{name:'Search skills',exact:true});
  await search.fill('10071');
  const inspect=table.getByRole('button',{name:'Inspect Skill 10071',exact:true});
  await expect(inspect).toContainText('[Id 10071]');
  await table.locator('tbody tr').filter({has:page.getByRole('button',{name:'Inspect Skill 10071',exact:true})}).locator('td[data-label="Players"]').click();
  await expect(inspect).toHaveAttribute('aria-expanded','true');
  await inspect.focus();await page.keyboard.press('Enter');
  await expect(inspect).toHaveAttribute('aria-expanded','false');
  await page.keyboard.press('Space');
  await expect(inspect).toHaveAttribute('aria-expanded','true');
  await expect(table.locator('.detail-row')).toHaveCount(1);
  await expect(table).toHaveAttribute('aria-rowcount',String(new Set<number>(fixture.skills.rows.map((r:number[])=>r[0]).filter((id:number)=>String(id).includes('10071'))).size+2));
  expect(await table.locator('.detail-row').evaluate(el=>el.previousElementSibling?.getAttribute('data-virtual-index')===el.getAttribute('data-virtual-index'))).toBe(true);
  await expect(page.getByRole('button',{name:'Retry activation data',exact:true})).toBeVisible();
  fail=false;
  await page.getByRole('button',{name:'Retry activation data',exact:true}).click();
  await expect(table.locator('.lane svg[role="slider"]')).toHaveCount(1);
  const total=Object.values(fixture.skillDetail.styles as Record<string,number[][]>).flat().reduce((sum,row)=>sum+row[1]!,0);
  await expect(table.locator('.lane')).toContainText(total.toLocaleString('en-US')+' activation events');
  await table.getByRole('button',{name:'Players',exact:true}).click();
  await expect(table.locator('.detail-row').locator('svg')).toHaveAttribute('aria-label','Skill 10071 activation distribution');
  await expect(inspect).toHaveAttribute('aria-expanded','true');
  await expect(table.getByRole('button',{name:'Add Skill 10071 to comparison',exact:true})).toHaveText('Compare');
  await table.getByRole('button',{name:'Add Skill 10071 to comparison',exact:true}).click();
  await expect(inspect).toHaveAttribute('aria-expanded','true');
  const comparison=page.getByRole('region',{name:'Skill comparison',exact:true});
  await expect(comparison.locator('.lane svg[role="slider"]')).toHaveCount(1);
  await inspect.click();
  await expect(table.locator('.detail-row')).toHaveCount(0);
  await expect(comparison.locator('.lane')).toHaveCount(1);
  const ids=[...new Set<number>(fixture.skills.rows.map((r:number[])=>r[0]))].filter(id=>id!==10071).slice(0,4);
  for(const id of ids.slice(0,3)){
    await search.fill(String(id));
    await table.getByRole('button',{name:'Add Skill '+id+' to comparison',exact:true}).click();
  }
  await expect(comparison.locator('.lane svg[role="slider"]')).toHaveCount(4);
  const add=comparison.getByRole('combobox',{name:'Add a skill to comparison',exact:true});
  await add.fill(String(ids[3]));
  await page.getByRole('option',{name:'Skill '+ids[3]+' [Id '+ids[3]+']',exact:true}).click();
  await expect(add).toHaveValue('');
  await expect(comparison.locator('.lane svg[role="slider"]')).toHaveCount(5);
  const charts=comparison.locator('.lane svg[role="slider"]');
  // A burst of pointer events uses the latest position, with one layout read per frame.
  expect(await charts.first().evaluate(async chart=>{
    const bounds=chart.getBoundingClientRect(),read=chart.getBoundingClientRect.bind(chart);
    let reads=0;chart.getBoundingClientRect=()=>{reads++;return read();};
    for(const position of [.1,.4,.985])chart.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:bounds.left+bounds.width*position}));
    await new Promise(requestAnimationFrame);delete (chart as Partial<SVGElement>).getBoundingClientRect;
    return reads;
  })).toBe(1);
  for(const chart of await charts.all())await expect(chart.locator('.cursor')).toHaveAttribute('x1','985');
  await expect(comparison.locator('input[type="range"]')).toHaveCount(0);
  expect(await comparison.locator('.lane').nth(4).evaluate(el=>getComputedStyle(el).getPropertyValue('--lane-color').trim())).not.toBe('');
  await add.fill('10071');
  await expect(page.getByRole('option',{name:'Skill 10071 [Id 10071]',exact:true})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await search.fill('10071');
  await inspect.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('combobox',{name:'Running style',exact:true}).click();
  await page.getByRole('option',{name:'Pace Chaser',exact:true}).click();
  const pace=fixture.skillDetail.styles.Senko.reduce((sum:number,row:number[])=>sum+row[1]!,0);
  await expect(table.locator('.lane')).toContainText(pace.toLocaleString('en-US')+' activation events');
  const inlineChart=table.getByRole('slider',{name:'Skill 10071 activation distribution',exact:true});
  await expect(table.locator('input[type="range"]')).toHaveCount(0);
  await expect(inlineChart).toHaveAttribute('aria-valuenow','50');
  await expect(table.locator('.lane')).toContainText('10,989 events');
  await inlineChart.press('ArrowRight');
  await expect(inlineChart).toHaveAttribute('aria-valuenow','51');
  await inlineChart.press('ArrowLeft');
  await expect(inlineChart).toHaveAttribute('aria-valuetext',/10,989 events/);
  await inlineChart.press('Home');await inlineChart.press('ArrowLeft');
  await expect(inlineChart).toHaveAttribute('aria-valuenow','0');
  await inlineChart.press('End');await inlineChart.press('ArrowRight');
  await expect(inlineChart).toHaveAttribute('aria-valuenow','99');
  // Touch users inspect the same bins directly on the plot.
  await inlineChart.evaluate(chart=>{
    const bounds=chart.getBoundingClientRect();
    chart.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',clientX:bounds.left+bounds.width*.505}));
  });
  await expect(inlineChart).toHaveAttribute('aria-valuenow','50');
  await expect(table.locator('.lane')).toContainText('10,989 events');
  const width=await table.locator('.row-detail').evaluate(el=>el.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(await scroll.evaluate(el=>el.clientWidth)+1);
  await comparison.locator('.lane').first().getByRole('button',{name:/Remove/}).click();
  await expect(comparison.locator('.lane')).toHaveCount(4);
  await expect(table.locator('.lane')).toHaveCount(1);
  await navigation.getByRole('tab',{name:'Uma Analysis',exact:true}).click();
  await navigation.getByRole('tab',{name:'Skill Analysis',exact:true}).click();
  await expect(search).toHaveValue('10071');
  await expect(inspect).toHaveAttribute('aria-expanded','true');
  await expect(comparison.locator('.lane')).toHaveCount(4);
  await page.screenshot({path:info.outputPath('cm-inline-skills.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('Uma running-style table replaces the separate explorer and keeps captured builds reachable',async({page},info)=>{
  await page.goto('/competitive/cm-data?tab=explore&view=umas');
  await expect(page.getByRole('tab',{name:'Uma Analysis',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.getByRole('tab',{name:'Running-style table',exact:true})).toHaveAttribute('aria-selected','true');
  const map=page.getByRole('table',{name:'Uma role performance map'});
  await expect(map).toBeVisible();
  await map.getByRole('button',{name:/^Front Runner/}).click();
  await expect(map.getByRole('columnheader',{name:/Front Runner/})).toHaveAttribute('aria-sort','descending');
  await page.getByRole('combobox',{name:'Running style',exact:true}).click();
  await page.getByRole('option',{name:'Front Runner',exact:true}).click();
  await expect(map.locator('thead th')).toHaveCount(2);
  await map.locator('tbody').getByRole('button').first().click();
  await expect(page.getByRole('complementary',{name:'Selected Uma insight'})).toBeVisible();
  await page.getByRole('button',{name:'Find captured builds →',exact:true}).click();
  await expect(page.getByRole('tab',{name:'Archetype Analysis',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('.team-row')).not.toHaveCount(0);
  await page.locator('.team-row .member').first().click();
  await expect(page.getByRole('dialog',{name:'Team details',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog').locator('.builds article')).toHaveCount(3);
  await page.getByRole('dialog').getByRole('button',{name:'Add to lobby',exact:true}).click();
  await page.keyboard.press('Escape');
  await page.getByRole('tab',{name:'Lobby Builder (1/3)',exact:true}).click();
  await expect(page.getByRole('button',{name:'Run race',exact:true})).toBeDisabled();
  await page.getByRole('tab',{name:'Uma Analysis',exact:true}).click();
  await page.getByRole('tab',{name:'Performance ranges',exact:true}).click();
  await expect(page.locator('.ranking')).not.toHaveCount(0);
  await page.screenshot({path:info.outputPath('cm-uma-ranges.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('captured teams fetch the next batch on scroll and reset on server sorting',async({page})=>{
  const calls:number[]=[];
  const teams=Array.from({length:90},(_,i)=>({...fixture.teams.teams[i%fixture.teams.teams.length],id:'virtual-team-'+i}));
  await page.route('**/snapshots/*/teams?*',async route=>{
    const url=new URL(route.request().url()),offset=Number(url.searchParams.get('offset'));
    calls.push(offset);
    await route.fulfill({json:{snapshotId:fixture.summary.snapshotId,teams:teams.slice(offset,offset+Number(url.searchParams.get('limit'))),totalTeams:90,totalOwners:90},headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto('/competitive/cm-data?tab=archetypes');
  await expect(page.locator('.team-row')).not.toHaveCount(0);
  await expect(page.getByRole('navigation',{name:'Pagination'})).toHaveCount(0);
  for(let i=0;i<4&&!calls.includes(30);i++){await page.locator('.loaded-count').scrollIntoViewIfNeeded();await page.waitForTimeout(200);}
  await expect.poll(()=>calls).toContain(30);
  expect(await page.locator('.team-row').count()).toBeLessThan(60);
  await page.getByRole('button',{name:'Sort teams by win rate',exact:true}).click();
  await expect.poll(()=>calls.at(-1)).toBe(0);
  await expect(page.getByRole('combobox',{name:'Rank teams by',exact:true})).toContainText('Observed win rate');
});

test('strategy keeps the familiar chart layout with sortable room data',async({page},info)=>{
  await page.goto('/competitive/cm-data?tab=strategy');
  await expect(page.getByRole('tab',{name:'Team',exact:true})).toHaveAttribute('aria-selected','true');
  const insight=[...fixture.summary.styles].filter((row:{owners:number;pop:number})=>row.owners>=30&&row.pop>0).sort((a:{winShare:number;pop:number},b:{winShare:number;pop:number})=>(b.winShare-b.pop)-(a.winShare-a.pop))[0];
  await expect(page.locator('.field-insight')).toContainText(((insight.winShare-insight.pop)*100).toFixed(1)+' percentage points');
  await page.getByRole('combobox',{name:'Inspect room count',exact:true}).click();
  await page.getByRole('option',{name:'2 in room',exact:true}).click();
  const frontBucket=fixture.summary.saturation[1].find((bucket:{x:number})=>bucket.x===2);
  await expect(page.locator('.readout-values>div').filter({hasText:'Front Runner'})).toContainText((frontBucket.rate*100).toFixed(1)+'%');
  const rooms=page.getByRole('table',{name:'Room compositions',exact:true});
  await rooms.getByRole('button',{name:'Frequency',exact:true}).click();
  await expect(rooms.getByRole('columnheader',{name:'Frequency',exact:true})).toHaveAttribute('aria-sort','ascending');
  const expected=Math.min(...fixture.summary.rooms.rows.map((r:{frequency:number})=>r.frequency));
  await expect(rooms.locator('tbody tr[data-virtual-index]').first()).toContainText((expected*100).toFixed(1)+'%');
  const compositions=page.getByRole('table',{name:'Team composition performance',exact:true});
  const supported=fixture.summary.archetypes.filter((r:{owners:number})=>r.owners>=Math.ceil(fixture.summary.meta.populationOwners*.01));
  await expect(compositions).toHaveAttribute('aria-rowcount',String(supported.length+1));
  await compositions.getByRole('button',{name:'Players',exact:true}).click();
  await expect(compositions.getByRole('columnheader',{name:'Players',exact:true})).toHaveAttribute('aria-sort','descending');
  await expect(compositions.locator('tbody tr[data-virtual-index]').first()).toContainText(Math.max(...supported.map((r:{owners:number})=>r.owners)).toLocaleString('en-US'));
  await page.getByRole('combobox',{name:'Running style',exact:true}).click();
  await page.getByRole('option',{name:'Front Runner',exact:true}).click();
  await expect(page.locator('.style-row')).toHaveCount(1);
  await expect(page.getByRole('heading',{name:'Front Runner · style overview'})).toBeVisible();
  await page.screenshot({path:info.outputPath('cm-strategy-sorted.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});
test('CM cards align, room rows stay compact, and standard tabs support keyboard navigation',async({page})=>{
  await page.goto('/competitive/cm-data');
  const nav=page.getByRole('tablist',{name:'Champions Meeting views',exact:true});
  const intro=nav.getByRole('tab',{name:'Introduction',exact:true});
  await expect(intro).toHaveAttribute('aria-selected','true');
  const totals=page.locator('.dataset .stats-container');
  await expect(totals).toContainText(fixture.summary.meta.populationRaces.toLocaleString('en-US'));
  expect((await totals.boundingBox())!.width).toBeGreaterThan(250);
  await expect(nav).toHaveClass(/navigation/);
  await intro.focus();
  await page.keyboard.press('ArrowRight');
  await expect(nav.getByRole('tab',{name:'Strategy Analysis',exact:true})).toHaveAttribute('aria-selected','true');
  const rooms=page.getByRole('table',{name:'Room compositions',exact:true});
  await rooms.scrollIntoViewIfNeeded();
  const heights=await rooms.locator('tbody tr[data-virtual-index]').evaluateAll(rows=>rows.map(row=>row.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);
  expect(Math.max(...heights)).toBeLessThanOrEqual(34);
  if(page.viewportSize()!.width>1000){
    for(const selector of ['.top-panels','.composition-panels']){
      const heights=await page.locator(selector+'>section>.chart-frame').evaluateAll(cards=>cards.map(card=>card.getBoundingClientRect().height));
      expect(heights).toHaveLength(2);
      expect(Math.abs(heights[0]!-heights[1]!)).toBeLessThan(2);
      if(selector==='.composition-panels')expect(Math.max(...heights)).toBeLessThanOrEqual(660);
    }
  }
  const saturation=page.locator('.saturation');
  const front=saturation.getByRole('button',{name:'Front Runner',exact:true});
  await front.click();
  await expect(front).toHaveAttribute('aria-pressed','false');
  await expect(saturation.locator('.readout-values>div').filter({hasText:'Front Runner'})).toHaveCount(0);
  await front.click();
  await expect(saturation.locator('.readout-values>div').filter({hasText:'Front Runner'})).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});
