import { expect, test } from './fixtures/test';
import type { Page } from '@playwright/test';
import { gunzipSync, gzipSync } from 'node:zlib';
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
  // The setup reads top to bottom: the race, its course, then the field; running stays in the bar under them.
  const race=page.getByRole('region',{name:'Race',exact:true}),controls=page.getByRole('region',{name:'Run simulation',exact:true});
  await expect(race.getByRole('combobox',{name:'Race format',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Race settings',exact:true})).toHaveCount(0);
  expect(await race.evaluate(node=>node.getBoundingClientRect().bottom)).toBeLessThanOrEqual(await page.getByRole('region',{name:'Course',exact:true}).evaluate(node=>node.getBoundingClientRect().top));
  await race.getByLabel('Sampled races',{exact:true}).fill('250');await expect(controls.getByRole('button',{name:'Run 250 races',exact:true})).toBeEnabled();await race.getByLabel('Sampled races',{exact:true}).fill('100');
  const heights=await race.locator('#race-samples,#race-seed').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));expect(new Set(heights).size).toBe(1);
  const track=page.getByRole('combobox',{name:'Track',exact:true});await track.click();
  await expect(page.getByRole('option')).toHaveCount(new Set(courses.map((course:{race_track_id:number})=>course.race_track_id)).size);
  await track.fill('Tokyo');await page.getByRole('option',{name:/Tokyo/}).click();
  const course=page.getByRole('combobox',{name:'Course',exact:true});await course.click();await expect(page.getByRole('option')).toHaveCount(2);await course.fill('2200');await page.getByRole('option').click();
  await expect(course).toHaveValue('Turf 2,200 m (Right)');
  const profile=page.getByRole('region',{name:'Course profile',exact:true});
  await expect(track).toHaveValue('Tokyo');await expect(profile.locator('svg polyline.track')).toHaveCount(1);await expect(profile.locator('[data-band=slopes] .flat').first()).toBeVisible();await profile.locator('[data-band=slopes] .flat').first().focus();await expect(profile.locator('.section-detail')).toContainText('Flat');await expect(profile.locator('.outline .highlight')).toHaveCount(1);await expect(profile.locator('.outline svg')).toHaveAttribute('aria-label',/Flat:.*highlighted/);const late=profile.getByRole('button',{name:/Race phase: Late race/});await late.hover();await expect(profile.locator('.outline .highlight')).toHaveAttribute('data-end','2200');await expect(profile.locator('.outline .highlight')).toHaveAttribute('data-start',String(2200*2/3));expect(await profile.locator('.highlight-section').getAttribute('points')).not.toEqual(await profile.locator('.track').getAttribute('points'));await late.focus();await expect(late).toHaveAttribute('aria-pressed','true');
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
  await page.getByRole('button',{name:'Run one race',exact:true}).click();await expect(page.getByRole('button',{name:'Edit setup',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Race field',exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'At a glance',exact:true})).toBeVisible();await page.getByRole('navigation',{name:'Simulation results sections'}).getByRole('link',{name:'Replays',exact:true}).click();await page.getByRole('region',{name:'Sampled races and reproducibility',exact:true}).getByRole('button',{name:/^Typical race for /}).first().click();await expect(page.locator('#simulation-samples .replay')).toBeVisible();
  await page.getByRole('button',{name:'Edit setup',exact:true}).click();await expect(page.getByLabel('Seed',{exact:true})).toHaveValue('12345');await expect(page.locator('.field .runner')).toHaveCount(2);expect(sent).toBe(true);expect(errors).toEqual([]);
});

for(const count of [2,9,18])test('Simulation report compares '+count+' runners without fetching per-seed replays',async({page})=>{
  test.setTimeout(120_000);
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
  await expect(page.getByRole('button',{name:'Edit setup',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Race field',exact:true})).toHaveCount(0);
  // One long page: the section bar jumps to each section.
  const tab=(name:string)=>page.getByRole('navigation',{name:'Simulation results sections'}).getByRole('link',{name,exact:true}).click();
  await expect(page.getByRole('navigation',{name:'Simulation results sections'}).getByRole('link')).toHaveText(['Overview','Stamina & race','Skills','Full field','Replays']);
  // The overview opens with the race replay itself in mean mode (built from the report, no extra requests) and the skills on the course.
  const glance=page.getByRole('region',{name:'At a glance',exact:true}),meanReplay=glance.getByRole('region',{name:'Mean race replay',exact:true});
  await expect(meanReplay).toBeVisible();expect(await glance.locator('figure h3').first().innerText()).toMatch(/^Mean race/);
  if(count===2)await expect(meanReplay).toContainText('Race telemetry unavailable');
  else{
    await meanReplay.scrollIntoViewIfNeeded();await expect(meanReplay.locator('.spread-row')).toHaveCount(count);
    // The mean race keeps only Play, the metrics and the speed: no Progress, step, restart, finish or expand buttons.
    const controls=meanReplay.getByRole('toolbar',{name:'Playback and telemetry controls'});await expect(controls.getByRole('button',{name:'Play',exact:true})).toBeVisible();
    for(const name of ['Restart','−1s','+1s','Finish','Expand Race telemetry'])await expect(controls.getByRole('button',{name,exact:true})).toHaveCount(0);
    await expect(meanReplay.getByRole('radiogroup',{name:'Telemetry metric'}).getByRole('radio')).toHaveText(['Combined','Speed','HP','Gap']);
    await meanReplay.locator('.telemetry-track').scrollIntoViewIfNeeded();await expect(meanReplay.locator('.telemetry-track .chart-host svg')).toHaveCount(1);
    // Skills sit on the replay's own clock and follow the runner picked in the field spread.
    const skills=meanReplay.getByRole('region',{name:'Skills over the race',exact:true});const skillRow=skills.getByRole('button',{name:/fires in \d+% of races/}).first();await expect(skillRow).toBeVisible();await expect(skillRow.locator('.heat')).toBeAttached();await skillRow.hover();await expect(page.getByRole('tooltip').filter({hasText:'fires in'})).toBeVisible();
    const names=await meanReplay.locator('.spread-row .identity strong').allInnerTexts();await meanReplay.locator('.spread-row').nth(1).click();await expect(skills.locator('.who')).toHaveText(names[1]!);
    const clock=meanReplay.locator('.playback-clock strong'),before=await clock.innerText();await skillRow.click();await expect(clock).not.toHaveText(before);
    await meanReplay.locator('.spread-row').nth(0).click();
  }
  const runnerChoices=async(expected:number)=>{const picker=page.getByRole('radiogroup',{name:'Runner',exact:true});await picker.scrollIntoViewIfNeeded();await expect(picker.getByRole('radio')).toHaveCount(expected);};
  // The field panel carries each runner's outcome; the finish card says who beats the baseline.
  const fieldPanel=page.getByRole('region',{name:'Field overview',exact:true}),baselineRow=fieldPanel.locator('tbody tr').first();if(count>10){await expect(fieldPanel.locator('tbody tr')).toHaveCount(6);await fieldPanel.getByRole('button',{name:'Show all '+count+' runners',exact:true}).click();}await expect(fieldPanel.locator('tbody tr')).toHaveCount(count);await expect(baselineRow.locator('td.rate').first()).toHaveAttribute('title','Spurt often reduced');await expect(baselineRow.locator('td.rate').nth(1)).toHaveAttribute('title',/^Stamina OK/);
  const finish=page.getByRole('region',{name:'Finish comparison',exact:true});await expect(finish.locator('.row .heading .error')).toHaveCount(1);
  const baselines=fieldPanel.getByRole('radio');await baselines.nth(1).check();await expect(finish.locator('.row .heading .clean')).toHaveCount(1);await baselines.nth(0).check();await expect(finish.locator('.row .heading .error')).toHaveCount(1);
  // A picked runner gets the full matchup: worst, best, mean and median margins, how often she is ahead, and every race in the histogram.
  const matchup=finish.locator('.row');await expect(matchup.locator('.tile')).toHaveText([/^Worst/,/^Best/,/^Mean/,/^Median/,/^Ahead in/]);await expect(matchup.locator('.tile').last()).toContainText('30.0%');await expect(matchup.locator('.bin').first()).toBeAttached();await finish.getByRole('radio',{name:'Finishing position',exact:true}).click();await expect(finish.locator('.row')).toHaveCount(2);await expect(finish.locator('.row').first().locator('.tile')).toHaveText([/^Wins/,/^Top 3/,/^Average/,/^Median/,/^Worst/]);
  const scope=page.getByRole('radiogroup',{name:'Comparison scope',exact:true});await scope.getByRole('radio',{name:/^All \d+$/}).click();await runnerChoices(count);await finish.scrollIntoViewIfNeeded();await expect(finish.locator('.line:not(.head):not(.foot)')).toHaveCount(count);await scope.getByRole('radio',{name:/ picked$/}).click();await runnerChoices(2);
  // Full field: every runner against every other, strongest first; runner 0 finishes ahead of runner 1 in 70 races.
  await tab('Full field');const headToHead=page.getByRole('region',{name:'Full field',exact:true}).getByRole('figure',{name:'Head-to-head'});await expect(headToHead.locator('tbody tr')).toHaveCount(count);await expect(headToHead.locator('td.self')).toHaveCount(count);await expect(headToHead.locator('td[title*=" in 70 of 100 races"]')).toHaveCount(1);
  await tab('Stamina & race');const stamina=page.getByRole('region',{name:'Stamina and race details',exact:true});await expect(stamina.getByRole('heading',{name:'Stamina & last spurt',exact:true})).toBeInViewport();
  // Every picked runner gets a stamina row; with telemetry, the HP budget and the HP-by-distance chart follow.
  await expect(stamina.getByRole('figure',{name:'Stamina & last spurt'}).locator('tbody tr')).toHaveCount(2);
  if(count!==2){await expect(stamina.locator('.budget:not(.head)')).toHaveCount(2);const hpChart=stamina.getByRole('figure',{name:'HP over the race'});await hpChart.scrollIntoViewIfNeeded();await expect(hpChart.locator('.chart-host svg')).toHaveCount(1);}
  // Along the course: the gap to the baseline and one movement value at a time, straight from the report.
  const course=page.getByRole('region',{name:'Along the course',exact:true});await course.scrollIntoViewIfNeeded();await expect(course.locator('.chart-host svg')).toHaveCount(2,{timeout:30_000});await course.getByRole('radio').filter({hasText:'Lane'}).click();await expect(course.locator('.chart-host svg')).toHaveCount(2);expect(replayRequests).toBe(0);
  // Race behaviour leaves out race states none of the runners shown gets into.
  const behaviour=page.getByRole('region',{name:'Race behaviour',exact:true});await expect(behaviour.locator('tbody tr')).toHaveCount(2);await expect(behaviour.locator('thead th')).toHaveText(['Runner','Start',/^Position/,/^Blocked/,/^Rushed/,'Downhill']);await expect(behaviour.locator('tbody tr').first()).toContainText('100%');
  const overview=page.getByRole('region',{name:'Field overview',exact:true});await page.getByRole('button',{name:'Choose runners',exact:true}).click();await expect(overview).toBeInViewport();await overview.getByRole('checkbox').nth(1).uncheck();await expect(behaviour.locator('tbody tr')).toHaveCount(1);await expect(course).toContainText('Pick a second runner');
  await overview.getByRole('checkbox').nth(1).check();
  await tab('Skills');const impact=page.getByRole('region',{name:'Skill impact',exact:true});await impact.getByRole('button',{name:/^Measure \d+ skills/}).click();await expect(impact.getByRole('button',{name:'All skills measured',exact:true})).toBeDisabled({timeout:20_000});await expect(impact.getByRole('button',{name:'Measure',exact:true})).toHaveCount(0);await expect(impact.getByRole('table',{name:/^Skill impact for /}).locator('.value').first()).toContainText(' L');
  // Skill activation: one row per learned skill, one column per runner shown, least reliable first.
  const activation=page.getByRole('region',{name:'Skill activation',exact:true}),activationRows=activation.locator('.line:not(.head)');await expect(activation.locator('.line.head').first().locator('.runner')).toHaveCount(2);await expect(activation.locator('.rate').filter({hasText:'100%'}).first()).toHaveAttribute('title',/activates in 100 of 100 races/);await expect(activation.locator('.rate.never').first()).toHaveText('Never');await expect(activationRows.first().locator('.rate.never, .rate.none')).not.toHaveCount(0);
  const allRows=await activationRows.count();await activation.getByRole('radio').filter({hasText:'Not always'}).click();await expect(activationRows).not.toHaveCount(allRows);await expect(activation.locator('.rate.never')).not.toHaveCount(0);await activation.getByRole('radio').filter({hasText:/^All/}).click();await expect(activationRows).toHaveCount(allRows);
  if(count>4){for(const index of [1,2,3])await overview.getByRole('checkbox').nth(index).check();await expect(overview.getByRole('checkbox').nth(4)).toBeDisabled();await expect(activation.locator('.line.head').first().locator('.runner')).toHaveCount(4);await expect(page.getByRole('button',{name:'Choose runners',exact:true})).toHaveAttribute('title',/^Comparing [^,]+, [^,]+ and [^,]+ with baseline /);}
  const builds=page.getByRole('region',{name:'Alternative builds',exact:true});await builds.getByRole('button',{name:'Add alternative',exact:true}).click();const editor=page.getByRole('dialog',{name:'Edit Uma',exact:true});await editor.getByLabel('Name',{exact:true}).fill('Test alternative');await editor.getByRole('button',{name:'Save Uma',exact:true}).click();await builds.getByRole('button',{name:'Compare 1 build',exact:true}).click();await expect(builds.locator('.build-row')).toContainText('Time gained');await builds.getByRole('button',{name:'Remove Test alternative',exact:true}).click();await expect(builds.locator('.build-row')).toHaveCount(0);
  await tab('Replays');const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download data',exact:true}).click();const exported=JSON.parse(readFileSync((await(await downloadPromise).path())!,'utf8'));expect(exported.input).toEqual(submitted);expect(exported.result.report.samples).toBe(100);
  await page.getByRole('region',{name:'Sampled races and reproducibility',exact:true}).getByRole('button',{name:/^Typical race for /}).first().click();await expect(page.locator('.sample-heading')).toContainText('seed 0');await expect.poll(()=>replayRequests).toBe(1);
  await page.getByRole('button',{name:'Edit setup',exact:true}).click();await page.getByRole('button',{name:'Last results',exact:true}).click();expect(replayRequests).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

test('Default comparison uses complete CM builds and Veterans is a collection picker',async({page})=>{
  await page.goto('/simulator/race');await expect(page.locator('.field .runner')).toHaveCount(9);await expect(page.locator('.field .team-indicator')).toHaveText(['Blue team','Blue team','Blue team','Purple team','Purple team','Purple team','Amber team','Amber team','Amber team']);await expect(page.locator('.field .skill-preview').first().locator('.skill-chip')).toHaveCount(21);
  const first=page.locator('.field .runner').first();await first.getByRole('button',{name:'Skills for Silence Suzuka',exact:true}).click();const skillList=page.getByRole('dialog',{name:'Skills for Silence Suzuka',exact:true});await expect(skillList.locator('.all-skills li')).toHaveCount(21);await page.keyboard.press('Escape');await first.getByRole('button',{name:'Assign team for Silence Suzuka',exact:true}).click();const colors=page.getByRole('dialog',{name:'Assign team for Silence Suzuka',exact:true});await expect(colors.locator('.swatch')).toHaveCount(5);await colors.getByRole('button',{name:'Purple team',exact:true}).click();await expect(first.locator('.team-indicator')).toHaveText('Purple team');
  await page.locator('.field .summary').first().click();const editor=page.getByRole('dialog',{name:'Edit Uma',exact:true});await expect.poll(async()=>Number(await editor.locator('.skills .count').innerText())).toBeGreaterThanOrEqual(17);await editor.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Choose from Veterans',exact:true}).click();const picker=page.getByRole('dialog',{name:'Choose from Veterans',exact:true});await expect(picker).toBeVisible();await expect(picker.locator('input[type=file]')).toHaveCount(0);await expect(picker.getByRole('link',{name:'Manage veterans',exact:true})).toHaveAttribute('href','/veterans');
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
  await expect(search.getByText(/races two of these \d+ leading teams/)).toBeVisible();
  // Every Veteran with stats is picked to start with: four builds of three characters make two teams.
  await expect(search.getByRole('region',{name:'Your Veterans'})).toContainText('4 picked · 2 teams');
  await search.getByLabel('Races per team',{exact:true}).fill('4');
  await search.getByRole('button',{name:'Find the best team',exact:true}).click();
  await expect(search.getByText('8 of 8 races · done',{exact:true})).toBeVisible();
  const best=search.getByRole('region',{name:'Best teams'});
  await expect(best).toContainText('75.0%');await expect(best).toContainText('places 1.25 on average');
  await search.getByRole('button',{name:'Race this team',exact:true}).click();
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
  const pool=search.getByRole('region',{name:'Your Veterans'});
  await expect(pool).toContainText('4 picked · 2 teams');
  // Unticking one Special Week build leaves one team; Tick all brings both back.
  await pool.getByRole('checkbox',{name:'Special Week'}).first().uncheck();await expect(pool).toContainText('3 picked · 1 team');
  await pool.getByRole('button',{name:'Tick all',exact:true}).click();await expect(pool).toContainText('4 picked · 2 teams');
  await search.getByLabel('Races per team',{exact:true}).fill('2');
  await search.getByRole('button',{name:'Find the best team',exact:true}).click();
  await expect(search.getByText('4 of 4 races · done',{exact:true})).toBeVisible();
  await search.getByRole('button',{name:'Race this team',exact:true}).click();
  await expect(page.locator('.field .runner')).toHaveCount(9);
  expect(calls).toHaveLength(1);
  // Veterans are ticked and added to the field together.
  await page.getByRole('button',{name:'Choose from Veterans',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Choose from Veterans',exact:true});
  await picker.getByRole('checkbox').nth(0).check();await picker.getByRole('checkbox').nth(1).check();
  await picker.getByRole('button',{name:'Add 2 to the field',exact:true}).click();
  await expect(page.locator('.field .runner')).toHaveCount(11);
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
  const tabs=page.getByRole('navigation',{name:'Simulation results sections'});await tabs.getByRole('link',{name:'Skills',exact:true}).click();
  await expect(page.getByRole('region',{name:'Skill activation',exact:true}).locator('.rate').filter({hasText:'100%'}).first()).toHaveAttribute('title',/activates in 1 of 1 races/);
  await expect(page.getByRole('button',{name:'Full race analysis',exact:true})).toHaveCount(0);
  await tabs.getByRole('link',{name:'Replays',exact:true}).click();await expect(page.getByRole('region',{name:'Sampled races and reproducibility',exact:true}).getByRole('button',{name:/^Typical race for /})).toHaveCount(2);
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
  await expect(page.getByRole('heading',{name:'The race at a glance',exact:true})).toBeVisible();
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
  await page.getByRole('button',{name:'Run one race',exact:true}).click();await expect(page.getByRole('button',{name:'Edit setup',exact:true})).toBeVisible();expect(sent).toBe(true);await page.getByRole('button',{name:'Edit setup',exact:true}).click();await expect(first.locator('.team-indicator')).toHaveText('#123ABC team');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
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


test('HP calculator races her many times and answers with how often her HP lasts a full last spurt',async({page})=>{
  type Sent={samples:number;seed:number;uma:{stats:{stamina:number}};effects:{count:number;hp_percent:number;start_distance_m:number;end_distance_m?:number}[];states:{rushed?:boolean;chance?:number;start_spread_m?:number;duration_seconds:number;target_speed_add_mps?:number}[]};
  let sent:Sent|undefined,fail:false|'old'|'down'=false,requests=0,spares=[141,141,141,141,141,141,141,141,141,141];
  // Ten sampled races: spare HP at the spurt decision per race; the fifth is the median one the result carries.
  const reply=()=>{
    const n=spares.length,finish=spares.map(spare=>Math.max(0,5+spare));
    const distribution={seeds:spares.map((_,i)=>1+i),check_hp:spares.map(spare=>771+spare),full_spurt_need_hp:spares.map(()=>771),check_distance_m:spares.map(()=>1668),first_spurt_result:spares.map(spare=>spare>=0?1:8),last_spurt_decision:spares.map(spare=>spare>=0?1:spare>-60?2:8),remaining_hp:finish,hp_deficit:spares.map(()=>0),exhausted_distance_m:spares.map(()=>null),finish_time_seconds:spares.map(()=>149.284),recovered_hp:spares.map(()=>443),debuff_hp_loss:spares.map(()=>0),wasted_recovery_hp:spares.map(()=>0),consumed_before_check_hp:spares.map(spare=>2614+443-771-spare),recovered_before_check_hp:spares.map(()=>443),debuff_before_check_hp:spares.map(()=>0),effect_rate_before_check:spares.map(()=>0.055),effect_rate:spares.map(()=>0.055),rushed:spares.map((_,i)=>i===3),hp_band:{distance_m:[0,1250,2500],p10:[2614,1500,100],p50:[2614,1600,146],p90:[2614,1700,200]},median:4};
    return {model:'fixture',course_id:10506,seed:5,survived:true,full_spurt:false,max_hp:2614,remaining_hp:finish[4],hp_deficit:0,minimum_hp:finish[4],consumed_hp:2911,recovered_hp:443,debuff_hp_loss:0,wasted_recovery_hp:0,effects_applied:1,exhausted_at:null,finish_time_seconds:149.284,last_spurt_start_distance_m:1668,last_spurt_decision:distribution.last_spurt_decision[4],spurt_calculation_times:[97.2],spurt_calculation_distances:[1668],check_hp:[771+spares[4]!],full_spurt_need_hp:[771],spurt_calculation_results:[1],distribution,n};
  };
  await page.route('**/api/sim/stamina',route=>{requests++;sent=route.request().postDataJSON();
    if(fail==='old')return route.fulfill({status:422,contentType:'text/plain',body:'Failed to deserialize the JSON body into the target type: unknown field `samples`'});
    if(fail)return route.fulfill({status:500,json:{error:'simulator offline'}});
    return route.fulfill({json:reply()});});
  await page.goto('/simulator');
  // A full build counts its skills into the quick counts: Swinging Maestro is a gold recovery, Right-Handed ○ a green for this right-handed course.
  const greens=page.getByRole('group',{name:'Green skills',exact:true});await expect(greens).toHaveCount(0);
  await page.getByRole('button',{name:'Full build & skills',exact:true}).click();const editor=page.getByRole('dialog',{name:'Edit Uma',exact:true});
  for(const [typed,option] of [['Swinging',/Swinging Maestro/],['Right-Handed',/Right-Handed ○/]] as const){await editor.getByRole('combobox',{name:'Add a skill'}).fill(typed);await page.getByRole('option',{name:option}).first().click();}
  await editor.getByRole('button',{name:'Save Uma',exact:true}).click();
  const gold=page.getByRole('spinbutton',{name:'Gold recovery skills',exact:true});await expect(gold).toHaveValue('1');
  await expect(page.getByText(/Counted from .*2 skills/)).toBeVisible();
  // The green raises the stat it is for; it comes off again, and counting her skills brings it back.
  await expect(greens).toContainText('Speed ○ +40');
  await greens.getByRole('button',{name:'Remove a Speed ○ green skill',exact:true}).click();await expect(greens).toHaveCount(0);
  await page.getByRole('button',{name:/Count her 2 skills/}).click();await expect(greens).toContainText('Speed ○ +40');
  await page.getByRole('button',{name:'More white speed skills',exact:true}).click();
  // Situations show their usual length as a value until one is typed; she gets rushed by her wit's chance.
  const rushed=page.getByRole('group',{name:'Rushed',exact:true});await rushed.getByRole('button').click();await expect(rushed.getByLabel('Rushed seconds')).toHaveValue('5.2');
  await expect(rushed).toContainText(/in \d+% of races, by her wit/);
  // The plan is on the course before calculating: where recovery can land.
  const lanes=page.getByRole('group',{name:'Where it happens on the course'});await expect(lanes.getByRole('img',{name:/Recovery: 1 gold, in mid race/})).toHaveCount(1);
  // The race is one row on the runner's five columns: track, course, ground, race format and the last spurt.
  const lefts=(ids:string)=>page.locator(ids).evaluateAll(nodes=>nodes.map(node=>Math.round(node.getBoundingClientRect().left)));
  expect(await lefts('#sim-track,#sim-course,#hp-ground,#hp-race-type,#hp-spurt')).toEqual(await lefts('#hp-speed,#hp-stamina,#hp-power,#hp-guts,#hp-wisdom'));
  const row=await page.locator('#sim-track,#sim-course,#hp-ground,#hp-race-type,#hp-spurt').evaluateAll(nodes=>nodes.map(node=>[Math.round(node.getBoundingClientRect().top),Math.round(node.getBoundingClientRect().height)]));
  expect(new Set(row.map(([top])=>top)).size).toBe(1);expect(new Set(row.map(([,height])=>height)).size).toBe(1);
  await expect(page.getByRole('combobox',{name:'Time of day',exact:true})).toHaveCount(0);await expect(page.getByLabel('Seed',{exact:true})).toHaveCount(0);
  // The result sits under the form, at its full width.
  const result=page.getByRole('complementary',{name:'HP result',exact:true});
  const [form,side]=await Promise.all([page.getByRole('group',{name:'HP calculator input'}).boundingBox(),result.boundingBox()]);expect(side!.y).toBeGreaterThan(form!.y+form!.height-1);expect(Math.round(side!.width)).toBe(Math.round(form!.width));
  // Nothing is sent until she is calculated once; Enter in a number field calculates 200 races.
  expect(requests).toBe(0);
  await page.locator('#hp-stamina').focus();await page.keyboard.press('Enter');
  await expect(result.getByRole('status').first()).toContainText('Holds a full last spurt');await expect(result).toContainText('Full speed in all 10 races.');
  await expect(result).toContainText('Stamina needed');await expect(result).toContainText('2:29.28');
  await expect(result.getByRole('img',{name:/HP across the race: 2,614 at the start, 912 at the median spurt decision with 771 needed, 146 left at the finish in the median race and 100 in the lowest tenth/})).toBeVisible();
  expect(sent?.samples).toBe(100);expect(sent?.seed).toBe(1);expect(sent?.uma.stats.stamina).toBe(900);// Speed 1,200 with +40 lands above 1,200, where the simulator counts raw points half.
  expect(sent?.uma.stats.speed).toBe(1280);
  // Recovery can land anywhere in mid race; she is rushed by chance, somewhere early to mid race.
  expect(sent?.effects).toEqual([expect.objectContaining({count:1,hp_percent:5.5,start_distance_m:expect.any(Number),end_distance_m:expect.any(Number)})]);
  expect(sent?.states).toContainEqual(expect.objectContaining({rushed:true,duration_seconds:5.2,chance:expect.any(Number),start_spread_m:expect.any(Number)}));
  expect(sent?.states.some(state=>state.target_speed_add_mps===0.15&&(state.start_spread_m??0)>0)).toBe(true);
  // The bill adds up the median race to the spurt decision, then to the finish.
  const before=result.getByRole('table',{name:'To the spurt decision'});
  await expect(before.getByRole('row',{name:/At the spurt decision/})).toContainText('912');await expect(before.getByRole('row',{name:/Full spurt needs/})).toContainText('771');
  await expect(result.getByRole('table',{name:'The last spurt'}).getByRole('row',{name:/Left at the finish/})).toContainText('146');
  // After that the result follows the form: one more count calculates again.
  await page.getByRole('button',{name:'More gold recovery skills',exact:true}).click();await expect(gold).toHaveValue('2');
  await expect.poll(()=>requests).toBe(2);
  // The answer reads how she spurted in each race.
  spares=[-100,-40,-20,30,60,90,120,150,180,200];await page.getByRole('button',{name:'More white recovery skills',exact:true}).click();
  await expect(result.getByRole('status').first()).toContainText('Full spurt in 70% of races');await expect(result).toContainText('Full speed in 7 of 10 races, slower or later in 2 of 10.');
  await expect(result).toContainText('Worst 1 in 10');await expect(result).toContainText('For a full spurt in 9 races in 10');
  // Counts can be typed; Clear takes every count back to none, greens too, and Undo brings them back.
  const white=page.getByRole('spinbutton',{name:'White recovery skills',exact:true});await white.fill('3');await expect(white).toHaveValue('3');
  await page.getByRole('button',{name:'Clear',exact:true}).click();await expect(gold).toHaveValue('0');await expect(greens).toHaveCount(0);
  await page.getByRole('button',{name:'Undo clear',exact:true}).click();await expect(gold).toHaveValue('2');await expect(greens).toContainText('Speed ○ +40');
  // A failed calculation says so, with a retry, and is not sent again until something changes.
  fail='down';await white.fill('0');await expect(result.getByRole('status').first()).toContainText('Couldn’t calculate');
  const failed=requests;await page.waitForTimeout(800);expect(requests).toBe(failed);
  // An older simulator that cannot sample races is named as such.
  fail='old';await result.getByRole('button',{name:'Try again',exact:true}).click();await expect(result).toContainText('older build that cannot sample races');
  fail=false;spares=spares.map(()=>141);await result.getByRole('button',{name:'Try again',exact:true}).click();await expect(result.getByRole('status').first()).toContainText('Holds a full last spurt');
  // The setup is kept in this browser.
  await page.reload();await expect(greens).toContainText('Speed ○ +40');await expect(gold).toHaveValue('2');
  // On a phone the result goes under the form, and the answer floats at the bottom while the form is in view.
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const bar=page.locator('.calc-bar');await expect(bar).toBeVisible();
  await bar.getByRole('button',{name:'Calculate HP',exact:true}).click();await expect(result.getByRole('status').first()).toContainText('Holds a full last spurt');await expect(result).toBeInViewport();
  // Her build is the calculator's own: the race field did not learn the skill.
  await page.getByRole('link',{name:'Race sim',exact:true}).click();
  await expect(page.getByRole('region',{name:'Race field',exact:true}).locator('.runner').first()).not.toContainText('Swinging Maestro');
});

test('Build search prices the skills on offer by hint and answers with the skills to buy',async({page})=>{
  const estimate=(mean:number,error=0.011)=>({samples:256,mean,standard_error:error});
  const evaluation=(time:number)=>({fitness:estimate(-time),scenarios:[{name:'x',fitness:estimate(-time),win_rate:estimate(1),team_win_rate:estimate(0),finish_time_seconds:estimate(time),skill_activations:estimate(2)}]});
  const finalist=(purchases:number[],cost:number,gain:number,contributions:{purchases:number[];gain:ReturnType<typeof estimate>}[]=[])=>({build:{purchases,stats:[]},sp_cost:cost,search:evaluation(150-gain),validation:evaluation(150-gain),gain:estimate(gain,0.02),validation_gain:estimate(gain,0.03),contributions});
  type Sent={sp_budget:number;mode:string;purchases:{name:string;cost:number;requires?:number[];replaces?:number[]}[];scenarios:{input:{course_id:number;setup:{race_type:number};runners:unknown[]}}[]};
  let sent:Sent|undefined,nothing=false,old=false,field=false,inert=false;
  await page.route('**/api/sim/optimize',route=>{
    sent=route.request().postDataJSON();
    if(old)return route.fulfill({json:{schema_version:3,mode:'cm',runs_per_variation_per_scenario:10,validation_runs_per_finalist_per_scenario:10,report:{schema_version:1,backend:'cpu',candidates_evaluated:100,fully_evaluated_candidates:3,simulations:1030,exhaustive:false,search_seeds:[1],validation_seeds:[2],finalists:[{build:{purchases:[0],stats:[]},sp_cost:102,search:{fitness:estimate(0.5),scenarios:[]},validation:null}]}}});
    const finalists=inert?[finalist([0],102,0.3,[{purchases:[0],gain:estimate(0.3)}])]:nothing?[finalist([],0,0)]:[finalist([0,1],272,0.42,[{purchases:[0],gain:estimate(0.21)},{purchases:[1],gain:estimate(0.12)}]),finalist([0],102,0.3)];
    const impacts=inert?[{purchase:0,alone:estimate(0.3),together:estimate(0.3)}]:field?[{purchase:0,alone:estimate(0.3),together:estimate(0.28),evidence:{mean:0.34,error:0.18}},{purchase:1,alone:{...estimate(0.14),samples:1},together:estimate(0.12),evidence:{mean:0.05,error:0.05}}]:nothing?[{purchase:0,alone:estimate(-0.2,0.01),together:estimate(-0.21,0.01)},{purchase:1,alone:estimate(-0.1,0.01),together:estimate(-0.09,0.01)}]:[{purchase:0,alone:estimate(0.3),together:estimate(0.28)},{purchase:1,alone:estimate(0.14),together:estimate(0.12)}];
    return route.fulfill({json:{schema_version:inert?7:field?6:5,mode:'cm',...(inert?{inert:[{purchase:1,why:['distance']}]}:{}),...(field?{objective:'field_place',fields:{course_id:10506,fields:32,held_out_races:34834,winner_accuracy:0.375,winner_accuracy_without_skills:0.331}}:{}),runs_per_variation_per_scenario:256,validation_runs_per_finalist_per_scenario:64,report:{schema_version:5,backend:'cpu',candidates_evaluated:9,fully_evaluated_candidates:3,simulations:2304,exhaustive:false,search_seeds:[1,2],validation_seeds:Array.from({length:64},(_,i)=>1000+i),finalists,baseline:evaluation(150),impacts,screen:{builds:9,combinations:3,full:estimate(0.42),full_cost:272}}}});
  });
  await page.goto('/simulator/build');
  // She races with the simulator's own fixed pack: there is no one to pick to race against.
  const goal=page.getByRole('region',{name:'Goal'});
  await expect(goal).toContainText('real CM fields');await expect(goal.getByRole('radio',{name:'Copies of her'})).toHaveCount(0);
  const find=page.getByRole('button',{name:'Find the best build',exact:true});await expect(find).toBeVisible();
  await expect(page.getByText('Add the skills she can buy first.',{exact:true})).toBeVisible();
  // Skills on offer are typed by name; a gold one says what it needs first.
  const search=page.getByRole('combobox',{name:'Add a skill on offer'});
  for(const name of ['Corner Recovery','Swinging Maestro']){await search.fill(name);await page.getByRole('option',{name:new RegExp('^'+name)}).first().click();}
  const offers=page.getByRole('list',{name:'Skills on offer'});await expect(offers.getByRole('listitem')).toHaveCount(2);
  await expect(offers).toContainText('needs Corner Recovery ○ first');
  // HP debuffs from other runners can be part of every race.
  await page.locator('#build-debuffs').fill('2');await page.locator('#build-debuff-percent').fill('3');
  // A hint takes its discount off the cost.
  await page.getByLabel('Hint for Corner Recovery ○').click();await page.getByRole('option',{name:'Hint 5 · −40%'}).click();
  await expect(offers.getByRole('listitem').first()).toContainText('102 SP');
  await find.click();
  const result=page.getByRole('figure',{name:'Result'});
  // The answer is the time the build saves her and what each skill adds to it.
  // An upgrade replaces the skill it builds on, so the two are one skill to buy, with both costs and gains.
  await expect(result.getByRole('status')).toContainText('Buy 1 skill');await expect(result).toContainText('Saves 0.42 s a race ± 0.03');await expect(result).toContainText('928 left');
  await expect(result).toContainText('Buys everything on offer.');await expect(result).not.toContainText('Wins');
  const buy=result.getByRole('list',{name:'Skills to buy'});await expect(buy.getByRole('listitem')).toHaveCount(1);
  await expect(buy.getByRole('listitem').first()).toContainText(/Swinging Maestro\s*via Corner Recovery ○.*272 SP.*\+0\.33 s/);
  // Every skill on offer, as screened: alone and with everything else.
  const impacts=result.getByRole('region',{name:'Every skill on offer'});
  await expect(impacts).toContainText('With everything (272 SP) she saves 0.42 s');
  await expect(impacts.getByRole('row').nth(1)).toContainText(/Corner Recovery.*\+0\.30.*\+0\.28/);
  await expect(result.getByRole('region',{name:'Close behind'})).toContainText('− Swinging Maestro');await expect(result.getByRole('region',{name:'Close behind'})).toContainText('0.30 s');
  await expect(result).toContainText('She raced with the pack on');await expect(result).toContainText('9 builds raced');await expect(result).toContainText('checked on 64 fresh races');
  await expect(page.locator('.search-bar .summary')).toContainText('Saves 0.42 s a race · 272 SP');
  expect(sent?.sp_budget).toBe(1200);expect(sent?.mode).toBe('cm');expect((sent as unknown as {hp_changes:unknown}).hp_changes).toEqual([{count:2,hp_percent:-3,from:1/6,to:2/3}]);
  // Only her in the race, on a CM race type.
  expect(sent!.scenarios).toHaveLength(1);expect(sent!.scenarios[0]!.input.runners).toHaveLength(1);expect(sent!.scenarios[0]!.input.setup.race_type).toBe(0);
  expect(sent?.purchases).toEqual([expect.objectContaining({name:'Corner Recovery ○',cost:102}),expect.objectContaining({name:'Swinging Maestro',requires:[0],replaces:[200352]})]);
  // When every skill she can afford surely makes her slower, she keeps the SP.
  nothing=true;await page.locator('#build-seed').fill('7');await find.click();
  await expect(result.getByRole('status')).toContainText('Buying nothing scores best');await expect(result).toContainText('Every skill she can afford makes her slower');
  await expect(result.getByRole('list',{name:'Skills to buy'})).toHaveCount(0);
  // An older optimizer service is named as such, not read as an answer, whether it answers or refuses a solo race.
  old=true;await page.locator('#build-seed').fill('8');await find.click();
  await expect(result.getByRole('status')).toContainText('Optimizer out of date');await expect(result).not.toContainText('Buying nothing');
  const refuse=(route:import('@playwright/test').Route)=>route.fulfill({status:422,json:{error:'runner count must be 2..=18'}});
  await page.route('**/api/sim/optimize',refuse);await page.locator('#build-seed').fill('9');await find.click();
  await expect(result.getByRole('status')).toContainText('older build');await page.unroute('**/api/sim/optimize',refuse);
  // A simulator with CM data races her in real CM fields: gains are runners beaten, with what recorded CM races say.
  old=false;nothing=false;field=true;await page.locator('#build-seed').fill('10');await find.click();
  await expect(result).toContainText('Beats 0.42 more of the 8 runners a race ± 0.03');await expect(result).toContainText('She raced 32 real CM fields from this CM');
  await expect(result.getByRole('region',{name:'Every skill on offer'}).getByRole('row').nth(1)).toContainText(/Corner Recovery.*\+0\.30.*\+0\.28.*\+0\.34/);
  // A value raced only until more races could not change the pick is greyed, and says how sure it is.
  await expect(result.getByRole('region',{name:'Every skill on offer'})).toContainText('Grey values stopped racing early, once more races could not change the pick.');
  await expect(result.getByRole('region',{name:'Every skill on offer'}).getByRole('row').nth(2).getByRole('cell').nth(1)).toHaveAttribute('title','± 0.01 over 1 race');
  await expect(page.locator('.search-bar .summary')).toContainText('Beats 0.42 more runners a race');
  // An older simulator cannot rule out skills that never fire for her, and the result says so.
  await expect(result).toContainText('The simulator answering is an older build that can buy skills which never fire for her here');
  field=false;
  // A skill that can never fire for her here (another distance, style, track or day) is left out, and says why.
  inert=true;await page.locator('#build-seed').fill('11');await find.click();
  await expect(result).toContainText('Left out because they can never fire for her here: Swinging Maestro needs another distance.');
  await expect(result).not.toContainText('older build that can buy skills');
  await expect(result.getByRole('region',{name:'Every skill on offer'}).getByRole('row').last()).toContainText(/Swinging Maestro\s*Never fires here: needs another distance/);
  inert=false;
  // A change marks the result as out of date; the setup is kept in this browser.
  old=false;nothing=false;await find.click();await expect(result.getByRole('status')).toContainText('Buy 1 skill');
  await page.getByRole('checkbox',{name:/Fast Learner/}).check();await expect(result).toContainText('Setup changed since this search');
  await page.reload();await expect(page.getByRole('list',{name:'Skills on offer'}).getByRole('listitem')).toHaveCount(2);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('Build codes load the runner, the course, the goal and what she can buy on every tab',async({page,context})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  const horse={outfitId:'100101',starCount:4,speed:1564,stamina:1104,power:1015,guts:768,wisdom:765,strategy:'Nige',distanceAptitude:'B',surfaceAptitude:'A',strategyAptitude:'A',aptitudes:['C','B','A','S','A','E','G','G','A','G'],skills:['200362'],uniqueLv:4,mood:2,popularity:1};
  const state={version:1,courseId:10506,racedef:{ground:2,weather:3,season:3,time:3,grade:100},mode:'tt_long',opponents:'mirror',scoring:{selfEvaluate:30000,opponentEvaluate:28000,supportCardBonus:5,winsBefore:1},uma1:{...horse,sp:1450,fans:254000,fastLearner:true},uma2:{...horse,outfitId:'101101',strategy:'Sasi'},chartSkills:['200352','200351','200362','201601'],hintLevels:{'200352':5,'201601':3}};
  const code=gzipSync(JSON.stringify(state)).toString('base64');
  let sent:{sp_budget:number;mode:string;scenarios:{input:{course_id:number;setup:{race_instance_id:number;race_type:number};runners:{fan_count?:number}[]}}[]}|undefined,fail=true;
  await page.route('**/api/sim/optimize',route=>{sent=route.request().postDataJSON();return fail?route.fulfill({status:400,json:{error:'unsupported skill 201601: fan-count scaling requires the captured fan_count input.'}}):route.fulfill({json:{schema_version:3,mode:'tt_long',runs_per_variation_per_scenario:10,report:{schema_version:1,backend:'fixture',candidates_evaluated:1,fully_evaluated_candidates:1,simulations:10,exhaustive:true,search_seeds:[1],validation_seeds:[],finalists:[]}}});});
  // Build search takes her build and fans, the course, the goal, her skill points and Fast Learner, and the skills on offer.
  await page.goto('/simulator/build');
  await page.getByRole('button',{name:'Build code',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Build code',exact:true});
  await dialog.getByLabel('Build code',{exact:true}).fill('https://example.com/#'+code);await expect(dialog).toContainText('not a link');
  await dialog.getByLabel('Build code',{exact:true}).fill(code);
  await expect(dialog).toContainText('Turf 2500m');await expect(dialog).toContainText('Yielding · Rainy · Autumn · Evening');
  await expect(dialog).toContainText('254,000 fans');await expect(dialog).toContainText('1,450 SP · Fast Learner');await expect(dialog).toContainText('Team Trials · Long');await expect(dialog).not.toContainText('against');
  await dialog.getByRole('button',{name:'Load',exact:true}).click();await expect(dialog).toBeHidden();
  await expect(page.locator('#build-stamina')).toHaveValue('1104');await expect(page.locator('#build-budget')).toHaveValue('1450');
  await expect(page.locator('#build-fans')).toHaveValue('254000');await expect(page.getByRole('checkbox',{name:/Fast Learner/})).toBeChecked();
  const offers=page.getByRole('list',{name:'Skills on offer'});await expect(offers.getByRole('listitem')).toHaveCount(3);
  // Fast Learner takes another 10% off: 170 at hint 5 is 50% off.
  await expect(offers.getByRole('listitem').first()).toContainText(/Corner Recovery.*85 SP/);
  // Team Trials draws its course per race, so she races the distance's pool of tracks, one per race.
  const tracks=page.getByRole('group',{name:'Tracks',exact:true});await expect(tracks).toContainText('1 of 1 on');
  await expect(tracks.getByRole('button',{name:'2,500 m',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('combobox',{name:'Course',exact:true})).toHaveCount(0);await expect(page.locator('#sim-ground')).toBeVisible();
  // Her fans go to the search; a skill that needs them says so in the page's words.
  await page.getByRole('button',{name:'Find the best build',exact:true}).click();
  await expect(page.getByRole('figure',{name:'Result'})).toContainText('grows with her fans');
  expect(sent?.sp_budget).toBe(1450);expect(sent?.scenarios[0]!.input.runners[0]!.fan_count).toBe(254000);
  expect(sent?.mode).toBe('tt_long');expect(sent!.scenarios.map(scenario=>scenario.input.course_id)).toEqual([10506]);
  expect(sent!.scenarios[0]!.input.setup).toMatchObject({race_instance_id:0,race_type:14});expect(sent!.scenarios.every(scenario=>scenario.input.runners.length===1)).toBe(true);
  // Switching the only track off leaves nothing to race.
  await tracks.getByRole('button',{name:'2,500 m',exact:true}).click();await expect(page.getByText('Pick at least one track for Team Trials.').first()).toBeVisible();
  await tracks.getByRole('button',{name:'JRA only',exact:true}).click();await expect(tracks).toContainText('1 of 1 on');
  // Copying writes the setup as a code that loads the same build.
  await page.getByRole('button',{name:'Build code',exact:true}).click();await dialog.getByRole('button',{name:'Copy this setup',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Copied',exact:true})).toBeVisible();
  const copied=await page.evaluate(()=>navigator.clipboard.readText());expect(copied).toMatch(/^H4sI/);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  // The HP calculator takes her build.
  await page.getByRole('link',{name:'HP calculator',exact:true}).click();
  await page.getByRole('button',{name:'Build code',exact:true}).click();await dialog.getByLabel('Build code',{exact:true}).fill(copied);
  await expect(dialog).toContainText('254,000 fans');
  await dialog.getByRole('button',{name:'Load',exact:true}).click();await expect(page.locator('#hp-stamina')).toHaveValue('1104');
  // A code pasted on the race sim opens the dialog with both runners, who join the field.
  await page.getByRole('link',{name:'Race sim',exact:true}).click();await expect(page.locator('.field .runner')).toHaveCount(9);
  await page.evaluate(text=>{const data=new DataTransfer();data.setData('text',text);document.body.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true}));},code);
  await expect(dialog.getByText('Runners',{exact:true})).toBeVisible();await expect(dialog).toContainText('Replaces the example field with both runners');await dialog.getByRole('button',{name:'Load',exact:true}).click();
  await expect(page.locator('.field .runner')).toHaveCount(2);await expect(page.locator('.field .runner').first()).toContainText('Special Week');
});
