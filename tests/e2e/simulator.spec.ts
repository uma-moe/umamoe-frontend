import { expect, test } from './fixtures/test';
import type { Page } from '@playwright/test';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { mockDatabase, mockAffinity, mockVeteranProfile, veteran } from './fixtures/api';
const resources=JSON.parse(gunzipSync(readFileSync('tests/e2e/fixtures/replay-courses.json.gz')).toString());
const cm=JSON.parse(gunzipSync(readFileSync('tests/e2e/fixtures/hakuraku-cm.json.gz')).toString());
async function expandField(page:Page){await expect(page.getByRole('region',{name:'Race field',exact:true})).toBeVisible();}
async function useTwoRunners(page:Page){await expandField(page);const field=page.getByRole('region',{name:'Race field',exact:true});while(await field.locator('.runner').count()>2){await field.getByRole('button',{name:/^Delete /}).last().click();}}
test.beforeEach(async({page})=>{
  await mockDatabase(page);await mockAffinity(page);await mockVeteranProfile(page);
  // Exercise beta's verification path without a deployed Turnstile site key.
  await page.route('**/app/index-*.js', async route => {
    const response = await route.fetch();
    await route.fulfill({response,body:(await response.text()).replace('siteKey:""','siteKey:"test-browser-verification"')});
  });
  await page.addInitScript(()=>localStorage.setItem('uma-browser-proof-v1',JSON.stringify({token:'test-browser-proof',expiresAt:Date.now()+300_000})));
  for(const [name,json] of Object.entries(resources))await page.route('**/resources/*/'+name+'.json*',route=>route.fulfill({json}));
  await page.route('**/resources/*/room_match_races.json*',route=>route.fulfill({json:{races:[{race_instance_id:800023,course_set_id:10506}]}}));
});

test('Course setup preserves every searchable resource option and its breakdown',async({page})=>{
  const courses=resources.simulator_courses.courses.map((course:{race_track_id:number})=>course.race_track_id===10009?{...course,race_track_id:10006}:course);
  await page.route('**/resources/*/simulator_courses.json*',route=>route.fulfill({json:{courses}}));
  await page.goto('/simulator/race');
  const controls=page.getByRole('region',{name:'Run simulation',exact:true});await expect(controls.getByRole('combobox',{name:'Race format',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Race settings',exact:true})).toHaveCount(0);
  expect(await controls.evaluate(node=>node.getBoundingClientRect().bottom)).toBeLessThan(await page.locator('.course-overview').evaluate(node=>node.getBoundingClientRect().top));
  await controls.getByLabel('Sampled races',{exact:true}).fill('250');await expect(controls.getByRole('button',{name:'Run 250 races',exact:true})).toBeEnabled();await controls.getByLabel('Sampled races',{exact:true}).fill('100');
  const heights=await controls.locator('#race-samples,#race-seed,.run-buttons>button').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));expect(new Set(heights).size).toBe(1);
  const track=page.getByRole('combobox',{name:'Track',exact:true});await track.click();
  await expect(page.getByRole('option')).toHaveCount(new Set(courses.map((course:{race_track_id:number})=>course.race_track_id)).size);
  await track.fill('Tokyo');await page.getByRole('option',{name:/Tokyo/}).click();
  const course=page.getByRole('combobox',{name:'Course',exact:true});await course.click();await expect(page.getByRole('option')).toHaveCount(2);await course.fill('2200');await page.getByRole('option').click();
  await expect(course).toHaveValue('Turf 2,200 m (Right)');
  const profile=page.getByRole('region',{name:'Course profile',exact:true});
  await expect(profile.getByRole('heading',{name:'Tokyo',exact:true})).toBeVisible();await expect(profile.locator('svg polyline.track')).toHaveCount(1);await expect(profile.locator('[data-band=slopes] .flat').first()).toBeVisible();await profile.locator('[data-band=slopes] .flat').first().focus();await expect(profile.locator('.section-detail')).toContainText('Flat');await expect(profile.locator('.outline .highlight')).toHaveCount(1);await expect(profile.locator('.outline svg')).toHaveAttribute('aria-label',/Flat:.*highlighted/);const late=profile.getByRole('button',{name:/Race phase: Late race/});await late.hover();await expect(profile.locator('.outline .highlight')).toHaveAttribute('data-end','2200');await expect(profile.locator('.outline .highlight')).toHaveAttribute('data-start',String(2200*2/3));expect(await profile.locator('.highlight-section').getAttribute('points')).not.toEqual(await profile.locator('.track').getAttribute('points'));await late.focus();await expect(late).toHaveAttribute('aria-pressed','true');
  await course.click();await course.press('Escape');await expect(course).toHaveValue('Turf 2,200 m (Right)');
  await expect(profile.locator('.outline .range-boundary')).toHaveCount(2);await expect(profile.locator('.section-detail')).toContainText('Late race');await expect(profile.locator('[data-band=sections] .segment').filter({hasText:'Corner 1'})).toHaveCount(1);
  await expect(profile.locator('.travel-arrow')).toHaveCount(2);await expect(profile.locator('[data-band=race-sections] button')).toHaveCount(24);
  await profile.getByRole('button',{name:/^24 sections: Section 12,/}).focus();await expect(profile.locator('.section-detail')).toContainText('Section 12');await expect(profile.locator('.outline .highlight')).toHaveAttribute('data-start',String(2200*11/24));await expect(profile.locator('.outline .highlight')).toHaveAttribute('data-end','1100');
});

test('Setup rows preserve cancelled edits and enforce the field capacity',async({page})=>{
  await page.goto('/simulator/race');await useTwoRunners(page);
  const field=page.getByRole('region',{name:'Race field',exact:true}),editor=page.getByRole('dialog',{name:'Edit Uma',exact:true});
  await page.getByLabel('Sampled races',{exact:true}).fill('250');await expect(page.getByRole('button',{name:'Run 250 races',exact:true})).toBeEnabled();await page.getByLabel('Sampled races',{exact:true}).fill('0');await expect(page.getByRole('button',{name:'Run samples',exact:true})).toBeDisabled();await page.getByLabel('Sampled races',{exact:true}).fill('250');
  await expect(field.getByRole('button',{name:/^Delete /}).first()).toBeDisabled();
  const firstName=await field.locator('.summary h3').first().innerText();await field.locator('.summary').first().click();
  const speed=await editor.getByLabel('Speed raw').inputValue();await editor.getByLabel('Speed raw').fill('1400');await editor.getByRole('button',{name:'Cancel',exact:true}).click();
  await field.getByRole('button',{name:'Edit '+firstName,exact:true}).click();await expect(editor.getByLabel('Speed raw')).toHaveValue(speed);await editor.getByLabel('Speed raw').fill('1400');await editor.getByRole('button',{name:'Save Uma',exact:true}).click();
  await expect(field.getByRole('definition').filter({hasText:'1400'})).toHaveCount(1);
  for(let index=0;index<16;index++){await field.getByRole('button',{name:/^Copy /}).first().click();}
  await expect(field.locator('.runner')).toHaveCount(18);await expect(field.getByRole('button',{name:'Add Uma',exact:true})).toBeDisabled();await expect(field.getByRole('button',{name:/^Copy /}).first()).toBeDisabled();await expect(field.getByRole('button',{name:'Choose from Veterans',exact:true})).toBeDisabled();
  await field.locator('.summary').last().click();await expect(editor).toBeVisible();await editor.getByRole('button',{name:'Cancel',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('Single-race report uses the selected conditions and retains its editable setup',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));let sent=false;
  await page.route('**/api/sim/monte-carlo',route=>{
    const body=route.request().postDataJSON();expect(body.seeds).toEqual([12345]);expect(body.output_mode).toBe('report');expect(route.request().headers()['x-api-key']).toBeUndefined();
    expect(body.input.setup).toMatchObject({ground_condition:4,weather:3,season:4,start_time_type:4});sent=true;
    const motion={distance:0,lane_units:100,speed_units:2100,hp_units:2000,temptation:0,block_front_index:-1};
    return route.fulfill({json:{schema_version:5,engine_build:'fixture',runs:1,seeds:[12345],finish_order:[[0,1]],finish_times:[[150,151]],final_hp:[[150,100]],last_spurt_decisions:[[2,2]],skills:[],first_replay:{schema_version:3,seed:12345,course_id:body.input.course_id,runner_source_indices:[0,1],frames:[{time:0,runners:[motion,motion]},{time:160,runners:[{...motion,distance:2600},{...motion,distance:2550}]}],events:[]}}});
  });
  await page.goto('/simulator/race');await useTwoRunners(page);await page.getByLabel('Seed',{exact:true}).fill('12345');
  const conditions=page.getByRole('region',{name:'Race conditions',exact:true});
  await conditions.getByRole('combobox',{name:'Ground',exact:true}).click();await page.getByRole('option',{name:'Heavy',exact:true}).click();
  await conditions.getByRole('radiogroup',{name:'Weather',exact:true}).getByRole('radio',{name:'Rainy',exact:true}).click();await conditions.getByRole('radiogroup',{name:'Season',exact:true}).getByRole('radio',{name:'Winter',exact:true}).click();await conditions.getByRole('combobox',{name:'Time of day',exact:true}).click();await page.getByRole('option',{name:'Night',exact:true}).click();
  await page.getByRole('button',{name:'Run one race',exact:true}).click();await expect(page.getByRole('heading',{name:'Simulation results',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Race field',exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Build comparison',exact:true})).toBeVisible();await page.getByRole('button',{name:'Median race',exact:true}).first().click();await expect(page.locator('#simulation-samples .replay')).toBeVisible();
  await page.getByRole('button',{name:'Edit setup',exact:true}).click();await expect(page.getByLabel('Seed',{exact:true})).toHaveValue('12345');await expect(page.locator('.field .runner')).toHaveCount(2);expect(sent).toBe(true);expect(errors).toEqual([]);
});

for(const count of [2,9,18])test('Simulation report compares '+count+' runners without fetching per-seed replays',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));let replayRequests=0,submitted:unknown;
  await page.route('**/api/sim/monte-carlo',route=>{
    const body=route.request().postDataJSON();const sample=Boolean(body.seeds);if(sample)replayRequests++;else {submitted=body.input;expect(body.output_mode).toBe('report');expect(body.output_format).toBe('msgpack');}
    const seeds:number[]=body.seeds??Array.from({length:100},(_,i)=>i),runs=seeds.length,sources=Array.from({length:count},(_,i)=>i);
    const band=(value:number)=>[value,value-.1,value,value+.1,runs];
    const diagnostic=(source:number)=>({start_delay_seconds:.05,gate:source+1,start_dash_end_seconds:2,mid_place:source+1,late_place:source+1,blocked_seconds:1,rushed_seconds:0,downhill_seconds:1,spot_struggle_seconds:0,duel_seconds:0,mode_seconds_by_phase:Array.from({length:4},()=>[0,0,0,0,0]),spurt_start_m:1700,spurt_target_speed_mps:22,spurt_acceleration_seconds:1,exhausted_at:null,hp_applications:[],rng_cursor:42});
    const report={version:count===2?1:2,clock:'simulation_elapsed',units:['s','m/s','m/s','m/s²','HP','m'],samples:runs,distance_m:[0,1250,2500],elapsed_seconds:Array.from({length:111},(_,i)=>i),runners:sources.map(source=>({source_input_index:source,distance:[0,50,100].map(t=>[band(t+source),band(21),band(22),band(.1),band(100-t),band(source)]),elapsed:Array.from({length:111},(_,i)=>[band(i*25),band(source),band(21),band(100-i)]),diagnostics:seeds.map(()=>diagnostic(source)),representative_runs:[0,0,runs-1]})),crossing_times:seeds.map(()=>sources.map(source=>[0,50+source,100+source*2])),spatial_coverage:2,spatial:[0,1].map(run_index=>({run_index,trajectories:sources.map(source=>Array.from({length:111},(_,i)=>[i*25,source,21,100-i]))}))};
    if(count!==2){
      const columns:number[][]=[[],[],[],[]],offsets=[0],finish_seconds:number[]=[],finish_values:number[][]=[];
      for(const source of sources)for(const seed of seeds){
        const finish=100+source*.5+seed*.002;
        for(let second=0;second<Math.ceil(finish);second++){columns[0]!.push(second/finish*2500);columns[1]!.push(source*.25);columns[2]!.push(23);columns[3]!.push(100-second*.8);}
        offsets.push(columns[0]!.length);finish_seconds.push(finish);finish_values.push([2500,source*.25,23,14]);
      }
      Object.assign(report,{telemetry:{interval_seconds:1,columns,offsets,finish_seconds,finish_values},spatial:[],spatial_coverage:0});
    }
    const motion={distance:0,lane_units:100,speed_units:2100,hp_units:2000,temptation:0,block_front_index:-1};
    return route.fulfill({json:{schema_version:5,engine_build:'fixture',runs,seeds,max_hp:seeds.map(()=>sources.map(()=>100)),finish_order:seeds.map(seed=>seed<70?sources:[1,0,...sources.slice(2)]),finish_times:seeds.map(seed=>sources.map(source=>source>1?102+source:seed<70?100+source*2:102-source*2)),final_hp:seeds.map(()=>sources.map(source=>100-source)),last_spurt_decisions:seeds.map(()=>sources.map(()=>2)),skill_procs:seeds.map(()=>({activations:sources.map(source=>[source,body.input.runners[source].skills[0].skill_id,0,0,10+source*2,200+source*40,4+source*2,1,0,0]),effects:[]})),...(sample?{first_replay:{schema_version:3,seed:seeds[0],course_id:body.input.course_id,runner_source_indices:sources,frames:[{time:0,runners:sources.map(()=>motion)},{time:50,runners:sources.map(source=>({...motion,distance:1250-source*50}))},{time:110,runners:sources.map(()=>({...motion,distance:2600}))}],events:[]}}:{report})}});
  });
  await page.route('**/api/sim/comparison',route=>{const body=route.request().postDataJSON(),sources=Array.from({length:count},(_,i)=>i);return route.fulfill({json:{version:1,source_input_index:body.source_input_index,alternatives:body.alternatives.map((a:{name:string})=>[a.name,{schema_version:5,engine_build:'fixture',runs:body.seeds.length,seeds:body.seeds,finish_order:body.seeds.map(()=>sources),finish_times:body.seeds.map(()=>sources.map(source=>100+source*2)),last_spurt_decisions:body.seeds.map(()=>sources.map(()=>2))}])}});});
  await page.goto('/simulator/race');if(count===2)await useTwoRunners(page);if(count===18)for(let i=0;i<9;i++)await page.getByRole('region',{name:'Race field',exact:true}).getByRole('button',{name:/^Copy /}).first().click();await page.getByRole('button',{name:'Run 100 races',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Simulation results',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Race field',exact:true})).toHaveCount(0);
  const outcomes=page.getByRole('region',{name:'Build comparison',exact:true});await expect(outcomes.locator('.outcome-row')).toHaveCount(count);await expect(outcomes).toContainText('70.0%');
  expect(await page.locator('.report-card[id]').evaluateAll(nodes=>nodes.map(n=>n.id))).toEqual(['simulation-outcome','simulation-progression','simulation-stamina','simulation-skills','simulation-samples']);
  const progression=page.getByRole('region',{name:'Race progression',exact:true});await progression.scrollIntoViewIfNeeded();await expect(progression.locator('.chart-host svg')).toHaveCount(count===2?2:1);expect(replayRequests).toBe(0);
  if(count!==2){await progression.getByRole('button',{name:/Show every sampled run/}).click();await expect(progression.locator('.telemetry-key')).toContainText('100 runs');await expect(progression.locator('.telemetry-plot canvas')).toBeVisible();await progression.getByRole('button',{name:'Compare mean curves'}).click();}
  await progression.getByText('Spatial distributions on the track and course',{exact:true}).click();await expect(progression.locator('canvas')).toHaveCount(4);const canvas=progression.locator('canvas').first(),initial=await canvas.evaluate((c:HTMLCanvasElement)=>c.toDataURL());await progression.getByRole('slider',{name:'Distribution elapsed time'}).fill('50');await expect.poll(()=>canvas.evaluate((c:HTMLCanvasElement,previous)=>c.toDataURL()!==previous,initial)).toBe(true);await expect(progression.locator('.spatial')).toContainText('Mean path');expect(replayRequests).toBe(0);
  await page.getByLabel('Shared runner comparison',{exact:true}).locator('button').last().click();await expect(progression.locator('canvas')).toHaveCount(2);
  const skills=page.getByRole('region',{name:'Skill analysis',exact:true});await expect(skills.locator('.runner-skills')).toHaveCount(count);
  if(count===9&&page.viewportSize()!.width>1100)expect(await skills.evaluate(n=>n.getBoundingClientRect().height)).toBeLessThan(900);
  const rows=skills.locator('.runner-summary');expect(await rows.first().evaluate(n=>n.getBoundingClientRect().height)).toBeLessThan(150);
  await skills.locator('.skill-pick').first().click();await expect(skills.locator('.runner-skills').first().getByRole('region',{name:'Shared skill comparison'})).toBeVisible();
  for(const plot of await skills.locator('.distribution-plots .lazy-surface').all()){await plot.scrollIntoViewIfNeeded();await expect(plot.locator('.chart-host svg')).toHaveCount(1);}
  await skills.getByRole('button',{name:'Close detail',exact:true}).click();const allSkills=skills.getByRole('button',{name:/All skills for/}).first();await allSkills.click();await expect(allSkills).toHaveAttribute('aria-expanded','true');await expect(skills.locator('.runner-detail')).toHaveCount(1);await expect(skills.locator('.runner-detail .skill-row')).toHaveCount(21);await skills.getByRole('button',{name:'Close list',exact:true}).click();await expect(allSkills).toHaveAttribute('aria-expanded','false');
  if(count>4){for(const index of [2,3,4])await outcomes.locator('.runner-pick').nth(index).click();const name=await skills.locator('.runner-pick .runner-name strong').nth(5).innerText();await skills.locator('.runner-skills').nth(5).locator('.skill-pick').first().click();const comparison=page.getByLabel('Shared runner comparison',{exact:true});await expect(comparison.locator('.comparison-runner')).toHaveCount(4);await expect(comparison.locator('.comparison-runner').last()).toContainText(name);await expect(skills.locator('.runner-skills').nth(5).getByRole('region',{name:'Shared skill comparison'})).toBeVisible();await skills.getByRole('button',{name:'Close detail',exact:true}).click();}
  await skills.locator('.build-comparisons>summary').click();const builds=skills.getByRole('region',{name:'Alternative build comparisons'});await builds.getByRole('button',{name:'Add alternative',exact:true}).click();const editor=page.getByRole('dialog',{name:'Edit Uma',exact:true});await editor.getByLabel('Name',{exact:true}).fill('Test alternative');await editor.getByRole('button',{name:'Save Uma',exact:true}).click();await builds.getByRole('button',{name:'Compare builds',exact:true}).click();await expect(builds.locator('.build-row')).toContainText('100 paired races');await builds.getByRole('button',{name:'Remove Test alternative',exact:true}).click();await expect(builds.locator('.build-row')).toHaveCount(0);await skills.locator('.build-comparisons>summary').click();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download data',exact:true}).click();const exported=JSON.parse(readFileSync((await(await downloadPromise).path())!,'utf8'));expect(exported.input).toEqual(submitted);expect(exported.result.report.samples).toBe(100);
  await page.getByRole('region',{name:'Sampled races and reproducibility',exact:true}).getByRole('button',{name:'Median race',exact:true}).first().click();await expect(page.locator('.sample-heading')).toContainText('seed 0');await expect.poll(()=>replayRequests).toBe(1);
  await page.getByRole('button',{name:'Edit setup',exact:true}).click();await page.getByRole('button',{name:'2 Simulation results',exact:true}).click();expect(replayRequests).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

test('Default comparison uses complete CM builds and Veterans is a collection picker',async({page})=>{
  await page.goto('/simulator/race');await expect(page.locator('.field .runner')).toHaveCount(9);await expect(page.locator('.field .team-indicator')).toHaveText(['Blue team','Blue team','Blue team','Purple team','Purple team','Purple team','Amber team','Amber team','Amber team']);await expect(page.locator('.field .skill-preview').first().locator('.skill-chip')).toHaveCount(21);
  const first=page.locator('.field .runner').first();await first.getByRole('button',{name:'Skills for Silence Suzuka',exact:true}).click();const skillList=page.getByRole('dialog',{name:'Skills for Silence Suzuka',exact:true});await expect(skillList.locator('.all-skills li')).toHaveCount(21);await page.keyboard.press('Escape');await first.getByRole('button',{name:'Assign team for Silence Suzuka',exact:true}).click();const colors=page.getByRole('dialog',{name:'Assign team for Silence Suzuka',exact:true});await expect(colors.locator('.swatch')).toHaveCount(5);await colors.getByRole('button',{name:'Purple team',exact:true}).click();await expect(first.locator('.team-indicator')).toHaveText('Purple team');
  await page.locator('.field .summary').first().click();const editor=page.getByRole('dialog',{name:'Edit Uma',exact:true});await expect.poll(async()=>Number(await editor.locator('.skills .count').innerText())).toBeGreaterThanOrEqual(17);await editor.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Choose from Veterans',exact:true}).click();const picker=page.getByRole('dialog',{name:'Import a veteran',exact:true});await expect(picker).toBeVisible();await expect(picker.locator('input[type=file]')).toHaveCount(0);await expect(picker.getByRole('link',{name:'Manage veterans',exact:true})).toHaveAttribute('href','/veterans');
});

test('CM Data opens a Veteran search with common benchmark opponents, seeds and conditions',async({page})=>{
  const imports=[100101,100102,100201,100301].map((card,index)=>({...veteran,id:100+index,member_id:null,trained_chara_id:90001+index,card_id:card,skill_array:[],skills:[]}));
  await page.goto('/veterans');
  await page.locator('.collection-controls input[type=file]').setInputFiles({name:'veterans.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({veterans:imports}))});
  await expect(page.locator('.feedback')).toContainText('4');
  await page.route('https://hakuraku.moe/api/simdata/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/teams'))expect(JSON.parse(new URL(route.request().url()).searchParams.get('slots')!)).toEqual([{},{},{}]);
    const team=cm.teams.teams.find((team:{id:string})=>team.id===decodeURIComponent(path.split('/').at(-1)!));
    return route.fulfill({json:path.endsWith('/manifest')?cm.manifest:path.endsWith('/summary')?cm.summary:path.endsWith('/teams')?cm.teams:{snapshotId:cm.summary.snapshotId,team,skills:{}}});
  });
  let called=false;
  await page.route('**/api/sim/batch',route=>{
    const body=route.request().postDataJSON();called=true;expect(body.races).toHaveLength(8);
    for(const race of body.races){
      expect(race.course_id).toBe(10506);expect(race.setup).toMatchObject({race_instance_id:800023,season:4,weather:2,ground_condition:1,start_time_type:1});
      expect(race.runners.map((runner:{team_id:number})=>runner.team_id)).toEqual([1,1,1,2,2,2,3,3,3]);
      expect(race.runners.every((runner:{motivation:number})=>runner.motivation===5)).toBe(true);
    }
    for(let index=0;index<4;index++){
      expect(body.races[index].seed).toBe(body.races[index+4].seed);
      expect(body.races[index].runners.slice(3)).toEqual(body.races[index+4].runners.slice(3));
      expect(body.races[index].runners.map((runner:{frame_order:number})=>runner.frame_order)).toEqual(body.races[index+4].runners.map((runner:{frame_order:number})=>runner.frame_order));
    }
    expect(body.races[0].runners.slice(3).map((runner:{stats:unknown})=>runner.stats)).not.toEqual(body.races[1].runners.slice(3).map((runner:{stats:unknown})=>runner.stats));
    return route.fulfill({json:{schema_version:3,engine_builds:{fixture:'same'},results:body.races.map((race:{seed:number},index:number)=>({seed:race.seed,finish_order:(index<4?index<3:index===4)?[0,1,2,3,4,5,6,7,8]:[3,0,1,2,4,5,6,7,8]}))}});
  });
  await page.goto('/competitive/cm-data');
  await page.getByRole('link',{name:'Find my best team',exact:true}).click();
  const search=page.getByRole('dialog',{name:'Find my best team',exact:true});
  await expect(search.getByText(/Rotates through pairs of/)).toBeVisible();
  await search.getByRole('button',{name:'Choose collection',exact:true}).click();
  await page.getByRole('dialog',{name:'Import a veteran',exact:true}).getByRole('button',{name:'Use entire collection (4)',exact:true}).click();
  await search.getByLabel('Races per team',{exact:true}).fill('4');
  await search.getByRole('button',{name:'Compare teams',exact:true}).click();
  await expect(search.getByText('8 / 8 races (complete)',{exact:true})).toBeVisible();
  await expect(search.getByText('75.0%',{exact:true})).toBeVisible();
  await expect(search.getByRole('cell',{name:'1.25',exact:true})).toBeVisible();
  await search.getByRole('button',{name:'Use team',exact:true}).first().click();
  await expect(page.locator('.field .runner')).toHaveCount(9);
  await expandField(page);await expect(page.getByRole('combobox',{name:'Course',exact:true})).toHaveValue('Turf 2,500 m (Right)');
  expect(called).toBe(true);
});

test('Veteran collection search evaluates every legal team and imports the selected pairing',async({page})=>{
  const imports=[100101,100102,100201,100301].map((card,index)=>({...veteran,id:100+index,member_id:null,trained_chara_id:90001+index,card_id:card,skill_array:[],skills:[]}));
  await page.goto('/veterans');
  await page.locator('.collection-controls input[type=file]').setInputFiles({name:'veterans.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({veterans:imports}))});
  await expect(page.locator('.feedback')).toContainText('4');
  await page.goto('/simulator/race');
  await useTwoRunners(page);
  for(let index=0;index<4;index++){await page.getByRole('button',{name:'Add Uma',exact:true}).click();await page.getByRole('dialog',{name:'Edit Uma',exact:true}).getByRole('button',{name:'Save Uma',exact:true}).click();}
  const calls:unknown[]=[];
  await page.route('**/api/sim/batch',route=>{
    const body=route.request().postDataJSON();calls.push(body);
    expect(body.races).toHaveLength(4);
    for(const race of body.races)expect(race.runners.map((runner:{team_id:number})=>runner.team_id)).toEqual([1,1,1,2,2,2,3,3,3]);
    return route.fulfill({json:{schema_version:3,engine_builds:{fixture:'same-resources'},results:body.races.map((race:{seed:number})=>({seed:race.seed,finish_order:[0,1,2,3,4,5,6,7,8]}))}});
  });
  
  await page.getByRole('button',{name:'Find my best team',exact:true}).click();
  const search=page.getByRole('dialog',{name:'Find my best team',exact:true});
  await search.getByRole('button',{name:'Choose collection',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Import a veteran',exact:true});
  await picker.getByRole('button',{name:'Use entire collection (4)',exact:true}).click();
  await search.getByLabel('Races per team',{exact:true}).fill('2');
  await expect(search.getByText('2 valid teams.',{exact:false})).toBeVisible();
  await search.getByRole('button',{name:'Compare teams',exact:true}).click();
  await expect(search.getByText('4 / 4 races (complete)',{exact:true})).toBeVisible();
  await search.getByRole('button',{name:'Use team',exact:true}).first().click();
  await expect(page.locator('.field .runner')).toHaveCount(9);
  expect(calls).toHaveLength(1);
});
test('captured CM builds transfer to the simulator with the exact course and skill levels',async({page})=>{
  await page.route('https://hakuraku.moe/api/simdata/**',route=>{
    const path=new URL(route.request().url()).pathname;
    const team=cm.teams.teams.find((team:{id:string})=>team.id===decodeURIComponent(path.split('/').at(-1)!));
    const payload=path.endsWith('/manifest')?cm.manifest:path.endsWith('/summary')?cm.summary:path.endsWith('/team-distribution')?cm.distribution:path.endsWith('/teams')?cm.teams:{snapshotId:cm.summary.snapshotId,team,skills:{}};
    return route.fulfill({json:payload});
  });
  await page.goto('/competitive/cm-data?tab=archetypes');
  await page.getByRole('button',{name:'Details',exact:true}).first().click();
  const dialog=page.getByRole('dialog',{name:'Team details',exact:true});
  await dialog.getByRole('button',{name:'Simulate team',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Race simulator',exact:true})).toBeVisible();
  await expect(page.locator('.field .runner')).toHaveCount(3);
  
  await page.route('**/api/sim/monte-carlo',route=>{
    const body=route.request().postDataJSON(),count=body.input.runners.length;
    return route.fulfill({json:{schema_version:5,engine_build:'fixture',runs:1,seeds:body.seeds,finish_order:[Array.from({length:count},(_,index)=>index)],finish_times:[Array.from({length:count},(_,index)=>150+index)],final_hp:[Array.from({length:count},()=>100)],last_spurt_decisions:[Array.from({length:count},()=>2)],skill_procs:[{activations:[[0,body.input.runners[0].skills[0].skill_id,0,20,30,600,4,1,0,0]],effects:[]}],skills:[{source_input_index:0,skill_id:body.input.runners[0].skills[0].skill_id,runs_triggered:1,trigger_probability:1,total_activations:1,mean_activation_distance_m:600}]}});
  });
  await page.getByRole('button',{name:'Run one race',exact:true}).click();
  await expect(page.getByRole('region',{name:'Skill analysis',exact:true}).getByText('1/1 · 100.0%',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Full race analysis',exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Sampled races and reproducibility',exact:true}).getByRole('button',{name:'Median race',exact:true})).toHaveCount(2);
});

test('CM builds from the captured teams page can be assigned to teams',async({page})=>{
  const ids=[...new Set<number>(cm.teams.teams.flatMap((team:{members:{skills:[number,number][]}[]})=>team.members.flatMap(member=>member.skills.map(([id])=>id))))];
  await page.route('**/resources/*/skills.json*',route=>route.fulfill({json:ids.map(id=>({skill_id:id,name:'Learned skill '+id,rarity:1,icon:'',base_cost:125}))}));
  await page.route('https://hakuraku.moe/api/simdata/**',route=>{
    const path=new URL(route.request().url()).pathname;
    const team=cm.teams.teams.find((team:{id:string})=>team.id===decodeURIComponent(path.split('/').at(-1)!));
    return route.fulfill({json:path.endsWith('/manifest')?cm.manifest:path.endsWith('/summary')?cm.summary:path.endsWith('/team-distribution')?cm.distribution:path.endsWith('/teams')?cm.teams:{snapshotId:cm.summary.snapshotId,team,skills:{}}});
  });
  await page.goto('/competitive/cm-data?tab=archetypes');
  await page.getByRole('button',{name:'Details',exact:true}).first().click();
  await page.getByRole('dialog',{name:'Team details',exact:true}).getByRole('button',{name:'Simulate team',exact:true}).click();
  await expandField(page);
  await expect(page.locator('.field .runner')).toHaveCount(3);
  await expect(page.getByRole('combobox',{name:'Course',exact:true})).toHaveValue('Turf 2,500 m (Right)');
  const first=page.locator('.field .runner').first();
  const sp = new Set(cm.teams.teams[0].members[0].skills.map(([id]:[number,number])=>id)).size*125;
  await first.locator('.summary').click();
  const editor=page.getByRole('dialog',{name:'Edit Uma',exact:true});
  await expect.poll(async()=>Number((await editor.locator('.sp').innerText()).replace(/[^0-9]/g,''))).toBe(sp);
  await editor.getByText('Gate, team and fans',{exact:true}).click();
  await editor.getByRole('button',{name:'Team color',exact:true}).click();await page.getByRole('dialog',{name:'Team color',exact:true}).getByRole('button',{name:'Purple team',exact:true}).click();
  await editor.getByRole('button',{name:'Save Uma',exact:true}).click();
  await expect(first.locator('.team-indicator')).toHaveText('Purple team');
  
  await page.route('**/api/sim/monte-carlo',route=>{
    const body=route.request().postDataJSON();
    expect(body.input.course_id).toBe(10506);expect(body.input.setup.race_instance_id).toBe(800023);
    expect(body.input.runners.map((runner:{team_id:number})=>runner.team_id)).toEqual([2,1,1]);
    expect(body.input.runners[0].stats.speed).toBe(cm.teams.teams[0].members[0].stats[0]);
    expect(body.input.runners[0].skills[0]).toEqual({skill_id:cm.teams.teams[0].members[0].skills[0][0],level:cm.teams.teams[0].members[0].skills[0][1]});
    return route.fulfill({json:{schema_version:5,engine_build:'fixture',runs:1,seeds:body.seeds,finish_order:[[0,1,2]],finish_times:[[100,101,102]]}});
  });
  await page.getByRole('button',{name:'Run one race',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Build comparison',exact:true})).toBeVisible();
});


test('Color teams support custom colors, direct row actions and independent runners',async({page})=>{
  await page.goto('/simulator/race');const field=page.getByRole('region',{name:'Race field',exact:true}),first=field.locator('.runner').first();
  await first.getByRole('button',{name:'Assign team for Silence Suzuka',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Assign team for Silence Suzuka',exact:true});await expect(picker.locator('.swatch')).toHaveCount(5);
  await picker.getByLabel('Add team color',{exact:true}).evaluate(node=>{const input=node as HTMLInputElement;input.value='#123abc';input.dispatchEvent(new Event('change',{bubbles:true}));});
  await expect(picker).not.toBeVisible();await expect(first.locator('.team-indicator')).toHaveText('#123ABC team');await expect(first.locator('.team-indicator>i')).toHaveCSS('background-color','rgb(18, 58, 188)');
  const second=field.locator('.runner').nth(1);await second.getByRole('button',{name:'Assign team for Agnes Tachyon',exact:true}).click();
  const other=page.getByRole('dialog',{name:'Assign team for Agnes Tachyon',exact:true});await expect(other.locator('.swatch')).toHaveCount(6);await other.getByRole('button',{name:'#123ABC team',exact:true}).click();
  await first.getByRole('button',{name:'Copy Silence Suzuka',exact:true}).click();await expect(field.locator('.runner')).toHaveCount(10);const copy=field.locator('.runner').last();await expect(copy.locator('.team-indicator')).toHaveText('#123ABC team');await copy.getByRole('button',{name:'Delete Silence Suzuka copy',exact:true}).click();await expect(field.locator('.runner')).toHaveCount(9);
  await first.getByRole('button',{name:'Edit build for Silence Suzuka',exact:true}).click();const editor=page.getByRole('dialog',{name:'Edit Uma',exact:true});await editor.getByText('Gate, team and fans',{exact:true}).click();await editor.getByRole('button',{name:'Team color',exact:true}).click();await page.getByRole('dialog',{name:'Team color',exact:true}).getByRole('button',{name:'Blue team',exact:true}).click();await editor.getByRole('button',{name:'Cancel',exact:true}).click();await expect(first.locator('.team-indicator')).toHaveText('#123ABC team');
  await second.getByRole('button',{name:'Assign team for Agnes Tachyon',exact:true}).click();await other.getByRole('button',{name:'Independent runner',exact:true}).click();await expect(second.locator('.team-indicator')).toHaveText('Independent');
  let sent=false;await page.route('**/api/sim/monte-carlo',route=>{const body=route.request().postDataJSON();sent=true;expect(body.input.runners.map((runner:{team_id:number})=>runner.team_id)).toEqual([6,0,1,2,2,2,3,3,3]);expect(body.input.runners[0].team_color).toBeUndefined();return route.fulfill({json:{schema_version:5,engine_build:'fixture',runs:1,seeds:body.seeds,finish_order:[[0,1,2,3,4,5,6,7,8]],finish_times:[[100,101,102,103,104,105,106,107,108]]}});});
  await page.getByRole('button',{name:'Run one race',exact:true}).click();await expect(page.getByRole('heading',{name:'Simulation results',exact:true})).toBeVisible();expect(sent).toBe(true);await page.getByRole('button',{name:'Edit setup',exact:true}).click();await expect(first.locator('.team-indicator')).toHaveText('#123ABC team');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('Setup pins the owned unique with its level, shows six stats and fits skills with an accurate More count',async({page})=>{
  const ordinarySkills=[200132,200142,200431,200532,200691,200831,200841,200851,200861,200871,200891,200911,200921,200941,201152,201601,201621,201641,202051];
  await page.route('**/resources/*/skills.json*',route=>route.fulfill({json:[...JSON.parse(readFileSync('tests/fixtures/resources/skills.json','utf8')),...ordinarySkills.map((skill_id,index)=>({skill_id,name:'Learned skill '+skill_id,rarity:1,base_cost:100+index*10})),{skill_id:110071,name:'564 Escapades',rarity:4,unique:true}]}));
  await page.route('**/resources/*/character.json*',route=>route.fulfill({json:[{id:'100201',name:'Silence Suzuka',subtitle:'Original',isReleased_en:true}]}));
  await page.setViewportSize({width:1920,height:1080});await page.goto('/simulator/race');
  const first=page.locator('.field .runner').first(),preview=first.locator('.preview-skills'),more=first.getByRole('button',{name:'Skills for Silence Suzuka',exact:true});
  await expect(preview.locator('.skill-item').first()).toHaveAttribute('data-owned-unique','true');await expect(preview.locator('.skill-item').first()).toHaveAttribute('data-sp','0');await expect(preview.locator('.skill-level').first()).toHaveText('Lv 5');
  await expect(first.locator('.summary')).toContainText('Original');await expect(first.locator('.build-stats [data-stat=sp] dd')).toHaveText(/3[.,]810/);await expect(more).not.toContainText('SP');
  const portrait=await first.locator('.art').boundingBox();expect(portrait!.width).toBeGreaterThanOrEqual(52);expect(portrait!.height).toBeGreaterThanOrEqual(48);expect(await first.locator('.row-buttons').innerText()).toBe('');
  await expect(preview.locator('.skill-item[aria-hidden=false]').first()).toBeVisible();
  const statRows=await first.locator('.build-stats [data-stat]').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().y));
  expect(statRows).toHaveLength(6);expect(statRows.slice(0,3)).toEqual([statRows[0],statRows[0],statRows[0]]);expect(statRows[3]).toBeGreaterThan(statRows[0]!);expect(statRows.slice(3)).toEqual([statRows[3],statRows[3],statRows[3]]);
  const costs=await preview.locator('.skill-item[data-owned-unique=false]').evaluateAll(nodes=>nodes.map(node=>Number(node.getAttribute('data-sp'))));expect(costs).toEqual([...costs].sort((a,b)=>b-a));
  const checkMore=async()=>{
    await expect.poll(async()=>Number((await more.innerText()).match(/^\+(\d+) more/)?.[1])+await preview.locator('.skill-item[aria-hidden=false]').count()).toBe(21);
    const visible=await preview.locator('.skill-item[aria-hidden=false]').count();expect(visible).toBeGreaterThan(0);
    expect(await preview.locator('.skill-item').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-hidden')))).toEqual([...Array(visible).fill('false'),...Array(21-visible).fill('true')]);
    return visible;
  };
  const initial=await checkMore();expect(initial).toBeGreaterThan(3);
  expect(await more.evaluate(node=>node.getBoundingClientRect().right)).toBeLessThan(await first.locator('.team-indicator').evaluate(node=>node.getBoundingClientRect().left));
  await page.setViewportSize({width:2560,height:1080});expect(await checkMore()).toBeGreaterThanOrEqual(initial);
  await page.setViewportSize({width:390,height:844});await checkMore();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await more.click();const list=page.getByRole('dialog',{name:'Skills for Silence Suzuka',exact:true});await expect(list.locator('.all-skills li')).toHaveCount(21);await expect(list).toContainText('Own unique first');await expect(list.locator('.skill-level').first()).toHaveText('Lv 5');await expect(list.locator('.skill-cost').nth(1)).toContainText('SP');
  await page.keyboard.press('Escape');await expect(more).toBeFocused();
});

