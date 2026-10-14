import { expect,test } from './fixtures/test';
import { deflateSync,inflateSync,gzipSync,gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { matchesTeam } from '../../src/pages/competitive/hakuraku-query';
import { makeDemoRaces } from '../../src/pages/competitive/demo-races';
import {raceFrameAtTime} from '../../src/lib/race/race-replay';
import type { Performer,Requirement,Card } from '../../src/pages/competitive/hakuraku-types';
const cmFixture=JSON.parse(gunzipSync(readFileSync('tests/e2e/fixtures/hakuraku-cm.json.gz')).toString());

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('uma-browser-proof-v1',JSON.stringify({token:'test-browser-proof',expiresAt:Date.now()+300_000})));
  // Recorded-only workflows exercise the failure fallback without contacting the live simulator.
  await page.route('**/api/sim/races/resimulate',route=>route.fulfill({status:503,json:{error:'Simulator unavailable in this fixture'}}));
});

test('session resimulation requires browser verification when signed in and reports replay mismatches',async({page},info)=>{
  test.setTimeout(120_000);
  await page.addInitScript(()=>localStorage.setItem('uma-browser-proof-v1',JSON.stringify({token:'test-browser-proof',expiresAt:Date.now()+300_000})));
  for(const [name,json] of Object.entries(replayCourses))await page.route(`**/resources/*/${name}.json*`,route=>route.fulfill({json}));
  const raw=JSON.parse(captureFile('first.json').buffer.toString());
  raw.jwt='redact-original-credential';
  const bytes=inflateSync(Buffer.from(raw.race_scenario,'base64'));bytes.writeFloatLE(15,56);
  const response={engineBuild:'codex-verification-v7',seed:42,replay:{encoding:'base64',compression:'gzip',format:'uma-race-binary',data:gzipSync(bytes).toString('base64')},
    validation:{status:'mismatch',framesMatch:false,resultsMatch:true,referenceFrameCount:2,simulatedFrameCount:2,firstMismatch:{section:'frames',field:'distance',frameIndex:1,horseIndex:0,timeSeconds:1,expected:14,actual:15},reasons:[]},
    annotations:{schemaVersion:7,flags:{downhill:32},sampleTimes:[0,1],horses:[{horseIndex:0,spans:[{startTime:.25,endTime:1,phase:0,mask:32}],startHp:1000,finalHp:850,maxHp:1000,
      activeSkillSpans:[{startTime:.5,endTime:1,skillId:200001,detailIndex:0}],skillActivationDecisions:[{skillId:200001,required:true,passed:true,activated:true,roll:20,threshold:80}],
      targetSpeeds:[18,19],accelerationRates:[1,.5],baseTargetSpeedSections:[{sectionIndex:0,phase:0,baseTargetSpeed:18,random:.1,randomPercentage:.1}],
      hpSkillApplications:[{time:.5,skillId:200001,casterHorseIndex:0,targetHorseIndex:0,requestedHpDelta:50,appliedHpDelta:50}],worldTransformDistanceLoss:1.25,
      lastSpurtDecision:{result:'True',time:.5,checkDistance:1600,checkHp:600,fullSpurtNeedHp:550,fullSpurtTargetSpeed:24,selectedStartDistance:1650,selectedTargetSpeed:24,calculationCount:1,delayPenalty:false,speedPenalty:false}
    }]}};
  let calls=0,envelope='';
  const sentryResponse=process.env.E2E_SENTRY_LIVE?page.waitForResponse(r=>r.url().includes('.ingest.de.sentry.io/')&&r.request().method()==='POST'):undefined;
  if(!process.env.E2E_SENTRY_LIVE)await page.route('https://*.ingest.de.sentry.io/**',async route=>{envelope=route.request().postDataBuffer()!.toString();await route.fulfill({json:{id:'verified'},headers:{'access-control-allow-origin':'*'}});});
  await page.route('**/api/sim/races/resimulate',async route=>{
    expect(route.request().headers()['authorization']).toBe('Bearer test-jwt');
    expect(route.request().headers()['x-browser-proof']).toBe('test-browser-proof');
    expect(route.request().headers()['x-api-key']).toBeUndefined();
    expect(route.request().postDataJSON()).toEqual({capture:raw,courseId:10606});calls++;
    await route.fulfill({json:calls===1?response:{...response,validation:{status:'matched'}}});
  });
  await page.goto('/competitive/race-analysis');
  await page.evaluate(()=>localStorage.setItem('auth_token','test-jwt'));
  await page.locator('#race-upload').setInputFiles(['first.json','second.json'].map(name=>({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw))})));
  await openRaceSection(page,'Session analysis');
  await expect(page.locator('.session-simulation')).toContainText('2 / 2 races with detailed simulation');
  expect(calls).toBe(2);
  await expect(page.getByRole('button',{name:'Detailed simulation',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Resimulate session',exact:true})).toHaveCount(0);
  if(sentryResponse){const sent=await sentryResponse;expect(sent.status()).toBe(200);envelope=sent.request().postDataBuffer()!.toString();}
  else await expect.poll(()=>envelope).toContain('3-mismatch.json');
  expect(envelope).toContain('1-original-replay.json.gz');expect(envelope).toContain('2-returned-replay.json.gz');expect(envelope).toContain('frames.distance');
  expect(envelope).not.toContain('test-jwt');expect(envelope).not.toContain('redact-original-credential');
  await page.getByRole('button',{name:'Detailed analysis',exact:true}).click();
  const session=page.getByRole('table',{name:'Session detailed race results',exact:true});
  await expect(session).toContainText('850');await expect(session).toContainText('85.0%');await expect(session).toContainText('1.25');
  await expect(session.getByRole('columnheader',{name:'Spurt delay',exact:true})).toBeVisible();
  await expect(session.locator('.spurt-result').first()).toContainText('Delay: 50.0 m');
  await expect(session.locator('.spurt-result').first()).toContainText('Speed: 24.00 m/s');
  await page.getByRole('button',{name:'Inspect race 2 Uploaded Special Week diagnostics',exact:true}).click();
  const details=page.locator('.session-diagnostics .diagnostics');
  await expect(details.getByRole('table',{name:'Runner skill analysis',exact:true})).toContainText('20.00');
  await details.locator('.section-speeds').scrollIntoViewIfNeeded();
  await expect(details.getByRole('figure',{name:'Base target speed and RNG by course section',exact:true})).toBeVisible();
  await expect(details.getByRole('button',{name:'Detailed measurements & simulation data',exact:true})).toHaveAttribute('aria-expanded','true');
  await expect(details.getByRole('table',{name:'Skill active periods',exact:true})).toHaveCount(0);
  await expect(details.getByRole('button',{name:'Position keeping',exact:true})).toHaveAttribute('aria-expanded','true');
  await expect(details.getByRole('button',{name:'Race pacemakers',exact:true})).toHaveAttribute('aria-expanded','true');
  await expect(details.getByRole('button',{name:'Position-keep decisions',exact:true})).toHaveAttribute('aria-expanded','true');
  await expect(details.getByRole('button',{name:'Recovery & HP changes',exact:true})).toHaveAttribute('aria-expanded','true');
  await expect(details.getByRole('table',{name:'HP change details',exact:true})).toHaveCount(1);
  await expect(details.getByRole('table',{name:'HP change details',exact:true})).not.toContainText('Requested');
  await expect(details.getByRole('table',{name:'Base target speed by section',exact:true})).toContainText('18.00');
  await page.locator('.session-diagnostics').screenshot({path:info.outputPath('session-diagnostics.png')});
  await page.locator('.session-diagnostics').getByRole('button',{name:'Watch in replay',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Race',exact:true})).toContainText('2. second.json');
  await expect(page.locator('.capture-summary')).toContainText('Detailed resimulation');
  await openRaceSection(page,'Session analysis');
  await page.getByRole('button',{name:'Show session Downhill periods',exact:true}).click();
  await page.getByRole('button',{name:'Race 1: 0.250–1.000 s ↗',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Race',exact:true})).toContainText('1. first.json');
  await expect(page.getByRole('slider',{name:'Replay time',exact:true})).toHaveValue('0.25');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('CM combines individual captured runners into an editable custom team',async({page},info)=>{
  await page.route('https://hakuraku.moe/api/simdata/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    const team=cmFixture.teams.teams.find((t:Performer)=>t.id===decodeURIComponent(path.split('/').at(-1)!));
    const listing={...cmFixture.teams,teams:cmFixture.teams.teams.map((team:Performer)=>({...team,members:team.members.map(({id,card,chara,style,racingStyle,score,stats})=>({id,card,chara,style,racingStyle,score,stats}))}))};
    const payload=path.endsWith('/manifest')?cmFixture.manifest:path.endsWith('/summary')?cmFixture.summary:path.endsWith('/team-distribution')?cmFixture.distribution:path.endsWith('/teams')?listing:{snapshotId:cmFixture.summary.snapshotId,team,skills:{}};
    await route.fulfill({json:payload,headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto('/competitive/cm-data?tab=archetypes');
  const cards=page.locator('.team-row'),tray=page.getByRole('region',{name:'Custom team selection',exact:true});
  await expect(cards.first()).toBeVisible();
  await expect(page.getByRole('checkbox',{name:'Build a team',exact:true})).not.toBeChecked();
  await expect(cards.first().locator('.runner-toggle')).toHaveCount(3);
  await cards.first().locator('.runner-toggle').first().click();
  await expect(tray).toContainText('Build a team · 1/3');
  await expect(page.getByRole('checkbox',{name:'Build a team',exact:true})).toBeChecked();
  await cards.first().locator('.runner-toggle').first().click();
  await page.getByRole('checkbox',{name:'Build a team',exact:true}).uncheck();
  await cards.first().screenshot({path:info.outputPath('cm-list-single-picks.png')});
  await cards.first().getByRole('button',{name:'Details',exact:true}).click();
  const detail=page.getByRole('dialog',{name:'Team details',exact:true});
  await expect(detail.getByRole('checkbox',{name:'Build a team',exact:true})).not.toBeChecked();
  const pick=detail.locator('.build-identity .runner-toggle').first();
  await pick.click();
  await expect(pick).toHaveAttribute('aria-pressed','true');
  await expect(detail.getByRole('region',{name:'Selected runners',exact:true})).toContainText('Build a team · 1/3');
  await detail.screenshot({path:info.outputPath('cm-detail-selection.png')});
  await pick.click();
  await expect(pick).toHaveAttribute('aria-pressed','false');
  await expect(detail.getByRole('region',{name:'Selected runners',exact:true})).toContainText('Build a team · 0/3');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('checkbox',{name:'Build a team',exact:true})).toBeChecked();
  await cards.nth(0).locator('.runner-toggle').nth(0).click();
  await expect(tray).toContainText('Build a team · 1/3');
  await expect(cards.nth(0).locator('.runner-toggle').nth(0)).toHaveAttribute('aria-pressed','true');
  await cards.nth(0).locator('.runner-toggle').nth(0).click();
  await expect(tray).toContainText('Build a team · 0/3');
  for(let i=0;i<3;i++){
    await cards.nth(i).locator('.runner-toggle').nth(i).click();
    await expect(tray).toContainText('Build a team · '+(i+1)+'/3');
  }
  await expect(cards.nth(0).locator('.runner-toggle').nth(1)).toBeDisabled();
  await tray.screenshot({path:info.outputPath('cm-individual-team.png')});
  await cards.first().getByRole('button',{name:'Details',exact:true}).click();
  await expect(detail.getByRole('region',{name:'Selected runners',exact:true})).toContainText('Build a team · 3/3');
  await expect(detail.locator('.build-identity .runner-toggle').nth(1)).toBeDisabled();
  await detail.getByRole('button',{name:'Add custom team to lobby',exact:true}).click();
  await expect(detail).not.toBeVisible();
  const team=page.locator('.teams>.team').first();
  await expect(team).toContainText('Custom team');await expect(team).toContainText('Team win rate not measured');
  await expect(team.locator('.runner')).toHaveCount(3);
  await team.locator('.runner').first().click();
  const editor=page.getByRole('dialog',{name:'Edit runner',exact:true});
  await expect(editor.locator('.stats input').first()).not.toHaveValue('');
  await editor.locator('.stats input').first().fill('1500');
  await editor.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(team).toContainText('Modified');await expect(team).toContainText('1500');
  await expect(team.locator('.race-aptitudes')).toHaveCount(3);
  await page.locator('.teams').screenshot({path:info.outputPath('cm-custom-lobby.png')});
  await page.getByRole('button',{name:'Browse teams',exact:true}).click();
  await cards.first().getByRole('button',{name:'Add to lobby',exact:true}).click();
  await page.getByRole('tab',{name:'Lobby Builder 2/3',exact:true}).click();
  const captured=page.locator('.teams>.team').nth(1);
  await expect(captured.locator('.race-aptitudes [aria-label="Distance: E"]').first()).toBeVisible();
  await captured.locator('.runner').first().click();
  await expect(editor.getByRole('combobox',{name:'Distance',exact:true})).toContainText('E');
  await editor.getByRole('button',{name:'Cancel',exact:true}).click();
  const sourceRow=team.locator('.gate').first(),targetRow=captured.locator('.gate').nth(1);
  const sourceName=await sourceRow.locator('.identity h3').innerText(),targetName=await targetRow.locator('.identity h3').innerText();
  await sourceRow.getByRole('combobox').click();await page.getByRole('option',{name:'Gate 1',exact:true}).click();
  await targetRow.getByRole('combobox').click();await page.getByRole('option',{name:'Gate 2',exact:true}).click();
  await sourceRow.getByRole('button',{name:/^Move /}).click();
  const move=page.getByRole('dialog',{name:'Move runner',exact:true});
  await expect(move).toContainText(sourceName);
  await move.screenshot({path:info.outputPath('cm-move-runner.png')});
  await move.locator('.move-choice').nth(1).click();
  await expect(move).not.toBeVisible();
  await expect(sourceRow.locator('.identity h3')).toHaveText(targetName);
  await expect(targetRow.locator('.identity h3')).toHaveText(sourceName);
  await expect(targetRow).toContainText('1500');await expect(targetRow).toContainText('Modified');
  await expect(sourceRow.getByRole('combobox')).toContainText('Gate 2');
  await expect(targetRow.getByRole('combobox')).toContainText('Gate 1');
  await expect(captured).toContainText('Team win rate not measured');
  await targetRow.locator('.runner').click();
  await expect(editor.locator('.stats input').first()).toHaveValue('1500');
  await editor.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.locator('.teams').screenshot({path:info.outputPath('cm-swapped-lobby.png')});
  await page.getByRole('button',{name:'Browse teams',exact:true}).click();
  await expect(cards.first().getByRole('button',{name:'Add to lobby',exact:true})).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

async function openRaceSection(page:import('@playwright/test').Page,title:string){
  await page.getByRole('button',{name:title,exact:true}).click();
}

const replayCourses=JSON.parse(gunzipSync(readFileSync('tests/e2e/fixtures/replay-courses.json.gz')).toString());

function captureFile(name:string,gzip=false,courseId:number|null=10606) {
  const bytes=Buffer.alloc(127);
  for(const [offset,value] of [[0,4],[4,1],[12,1],[16,12],[20,31],[28,2],[32,16],[72,0],[107,1],[119,0],[123,200001]])bytes.writeInt32LE(value!,offset!);
  for(const [offset,value] of [[8,20],[52,1],[56,14],[76,118.42],[84,.12],[90,1780],[113,.5]])bytes.writeFloatLE(value!,offset!);
  for(const [offset,value] of [[44,5000],[46,1400],[48,1000],[60,5000],[62,1600],[64,900],[111,14]])bytes.writeUInt16LE(value!,offset!);
  bytes[94]=2;bytes[117]=3;bytes[118]=2;
  const json=Buffer.from(JSON.stringify({race_horse_data_array:[{card_id:100101,chara_name:'Uploaded Special Week',speed:1200,skill_array:[200001]}],race_scenario:deflateSync(bytes).toString('base64'),race_course_set:{id:courseId,lane_distance_max:16.875}}));
  return {name,mimeType:gzip?'application/gzip':'application/json',buffer:gzip?gzipSync(json):json};
}


test('race field follows live positions and locks individual finishes with trimmed telemetry',async({page},info)=>{
  for(const [name,json] of Object.entries(replayCourses))await page.route(`**/resources/*/${name}.json*`,route=>route.fulfill({json}));
  await page.goto('/competitive/race-analysis');
  await page.getByRole('button',{name:'Try one demo race',exact:true}).click();
  const demo=makeDemoRaces(1)[0]!,ordered=[...demo.runners].sort((a,b)=>a.result!.finishOrder-b.result!.finishOrder);
  const field=page.getByRole('complementary',{name:'Race field',exact:true}),slider=page.getByRole('slider',{name:'Replay time',exact:true});
  await expect(field.locator('.field-order')).toHaveText('Live order');
  expect(await field.locator('.field-runner').evaluateAll(rows=>rows.map(row=>Number((row as HTMLElement).dataset.runnerIndex)))).toEqual(demo.runners.map(r=>r.index));
  await expect(field.locator('.finished')).toHaveCount(0);
  await expect(field.locator('.field-hp strong')).toHaveText(Array(9).fill('100%'));
  const selected=demo.runners[0]!,selectedFinish=selected.result!.finishTime;
  await expect.poll(async()=>Number(await slider.getAttribute('max'))).toBeCloseTo(selectedFinish,5);
  await expect(page.locator('.chart-host svg path[fill="#f5f5f5"]').first()).toBeVisible();
  if(info.project.name==='mobile-chromium')await page.getByRole('button',{name:'Telemetry display options',exact:true}).click();
  await page.getByRole('button',{name:'Race events',exact:true}).click();
  await expect(page.locator('.chart-host svg path[fill="#f5f5f5"]').first()).toBeVisible();
  // Comparison shares the last finisher's axis, while each trace ends at its own finish.
  await page.getByRole('button',{name:'Compare runners',exact:true}).click();
  if(info.project.name==='mobile-chromium')await page.getByRole('button',{name:'Close Telemetry display options',exact:true}).click();
  await expect.poll(async()=>Number(await slider.getAttribute('max'))).toBeCloseTo(ordered.at(-1)!.result!.finishTime,5);
  const blue=page.locator('.chart-host svg path[stroke="#69b7ee"][stroke-width="2.5"]');
  const traceEnd=(await page.locator('.chart-host').boundingBox())!.width*selectedFinish/ordered.at(-1)!.result!.finishTime;
  await expect.poll(()=>blue.evaluate((e,end)=>{const box=(e as SVGGraphicsElement).getBBox();return Math.abs(box.x+box.width-end);},traceEnd)).toBeLessThan(2);
  const seek=async(t:number)=>slider.evaluate((e,t)=>{(e as HTMLInputElement).value=String(t);e.dispatchEvent(new Event('input',{bubbles:true}));},t);
  const racingFrame=demo.frames[40]!;
  const firstHp=demo.frames[0]!.horses[selected.index]!.hp,nextHp=demo.frames[1]!.horses[selected.index]!.hp;
  await seek(demo.frames[1]!.time*(firstHp*.001)/(firstHp-nextHp));
  await expect(field.locator(`.field-runner[data-runner-index="${selected.index}"] .field-hp strong`)).toHaveText('99.9%');
  await seek(racingFrame.time);
  expect(await field.locator('.field-runner').evaluateAll(rows=>rows.map(row=>Number((row as HTMLElement).dataset.runnerIndex)))).toEqual([...demo.runners].sort((a,b)=>racingFrame.horses[b.index]!.distance-racingFrame.horses[a.index]!.distance).map(r=>r.index));
  await seek(ordered[0]!.result!.finishTime-.01);
  await expect(field.locator('.finished')).toHaveCount(0);
  await seek((ordered[0]!.result!.finishTime+ordered[1]!.result!.finishTime)/2);
  await expect(field.locator('.finished')).toHaveCount(1);
  await expect(field.locator(`.field-runner[data-runner-index="${ordered[0]!.index}"]`)).toContainText('Finished');
  await expect(field.locator(`.field-runner[data-runner-index="${ordered[1]!.index}"]`)).not.toContainText('Finished');
  await expect(field.locator('.field-runner').first()).toHaveAttribute('data-runner-index',String(ordered[0]!.index));
  await seek(ordered.at(-1)!.result!.finishTime);
  await expect(field.locator('.finished')).toHaveCount(9);
  for(const r of demo.runners){
    // Finish HP is interpolated at the finish, rather than taken from an earlier sample.
    const hp=raceFrameAtTime(demo.frames,r.result!.finishTimeRaw??r.result!.finishTime)!.horses[r.index]!.hp/demo.frames[0]!.horses[r.index]!.hp*100;
    const rounded=Math.round(Math.min(100,Math.max(0,hp))*10)/10;
    await expect(field.locator(`.field-runner[data-runner-index="${r.index}"] .field-hp strong`)).toHaveText((rounded===0||rounded===100?String(rounded):rounded.toFixed(1))+'%');
  }
  await expect(field.locator('.field-order')).toHaveText('Finish order');
  expect(await field.locator('.field-runner').evaluateAll(rows=>rows.map(row=>Number((row as HTMLElement).dataset.runnerIndex)))).toEqual(ordered.map(r=>r.index));
  await seek(0);
  await expect(field.locator('.finished')).toHaveCount(0);
  await expect(field.locator('.field-order')).toHaveText('Live order');
  if(info.project.name==='chromium'){
    const reading=await page.locator('.telemetry-reading').boundingBox(),plot=await page.locator('.chart-host').boundingBox();
    expect(reading!.x+reading!.width).toBeLessThan(plot!.x);
    const signals=await page.locator('.signal-reading').evaluateAll(rows=>rows.map(e=>e.getBoundingClientRect().y));
    expect(signals[0]).toBeLessThan(signals[1]!);expect(signals[1]).toBeLessThan(signals[2]!);
    expect(await field.locator('.field-runner.chosen').evaluate(e=>getComputedStyle(e).boxShadow)).toBe('none');
  }
  await page.getByRole('button',{name:'Expand Race telemetry',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Race telemetry',exact:true}).locator('.chart-host svg path[fill="#f5f5f5"]').first()).toBeVisible();
  await page.keyboard.press('Escape');
});

test('race field keeps nine runners visible when blocking and activation details change',async({page},info)=>{
  for(const [name,json] of Object.entries(replayCourses))await page.route(`**/resources/*/${name}.json*`,route=>route.fulfill({json}));
  // A recorded-format fixture includes post-finish HP recovery and simultaneous activations.
  const count=9,frameSize=4+count*12,results=36+4*frameSize+4,events=results+count*31+8;
  const bytes=Buffer.alloc(events+count*16);
  for(const [offset,value] of [[0,4],[4,1],[12,count],[16,12],[20,31],[28,4],[32,frameSize],[events-4,count]])bytes.writeInt32LE(value!,offset!);
  for(let i=0;i<4;i++){
    const start=36+i*frameSize;bytes.writeFloatLE(i,start);
    for(let h=0;h<count;h++){
      const p=start+4+h*12;
      bytes.writeFloatLE([0,20,2000,2450][i]!-h,p);bytes.writeUInt16LE(400+h*200,p+4);
      bytes.writeUInt16LE(2000,p+6);bytes.writeUInt16LE([1000,999,0,500][i]!,p+8);bytes.writeInt8(i===1&&h===0?1:-1,p+11);
    }
  }
  for(let h=0;h<count;h++){
    const p=results+h*31;bytes.writeInt32LE(h,p);bytes.writeFloatLE(2.8+h*.02,p+4);bytes.writeFloatLE(2.8+h*.02,p+27);bytes[p+22]=3;
    const e=events+h*16;bytes.writeInt16LE(14,e);bytes.writeFloatLE(.5,e+2);bytes[e+6]=3;bytes[e+7]=2;bytes.writeInt32LE(h,e+8);bytes.writeInt32LE(200001,e+12);
  }
  const raw={race_course_set:{id:10606,lane_distance_max:16.875},race_scenario:deflateSync(bytes).toString('base64'),race_horse_data_array:makeDemoRaces(1)[0]!.runners.map(r=>({frame_order:r.index+1,card_id:r.cardId,chara_name:r.name,skill_array:[200001]}))};
  await page.goto('/competitive/race-analysis');
  await page.locator('#race-upload').setInputFiles({name:'field-layout.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw))});
  await expect(page.locator('.chart-host svg')).toBeVisible();
  const field=page.locator('.field-runners'),slider=page.getByRole('slider',{name:'Replay time',exact:true});
  const seek=async(t:number)=>slider.evaluate((e,t)=>{(e as HTMLInputElement).value=String(t);e.dispatchEvent(new Event('input',{bubbles:true}));},t);
  const toggleComparison=async()=>{
    const options=page.getByRole('button',{name:'Telemetry display options',exact:true}),menu=await options.isVisible();
    if(menu)await options.click();
    await page.getByRole('button',{name:'Compare runners',exact:true}).click();
    if(menu)await page.getByRole('button',{name:'Close Telemetry display options',exact:true}).click();
  };
  const sizes=info.project.name==='chromium'?[[1920,1080],[1920,960],[1366,900],[1366,768]]:[];
  for(const size of sizes.length?sizes:[undefined]){
    if(size)await page.setViewportSize({width:size[0]!,height:size[1]!});
    await seek(0);
    await expect(field.locator('.field-hp strong')).toHaveText(Array(9).fill('100%'));
    const emptyFeed=(await page.locator('.skill-feed').boundingBox())!,emptySnapshot=(await page.locator('.runner-snapshot').boundingBox())!,emptyMap=(await page.locator('.map-scene').boundingBox())!;
    await seek(1);
    await expect(field.locator('.field-hp strong')).toHaveText(Array(9).fill('99.9%'));
    await expect(page.locator('.skill-trigger')).toHaveCount(9);
    await expect(page.locator('.blocked-by')).toBeVisible();
    await expect(page.locator('.current-skills .active-skill')).toHaveCount(1);
    expect((await page.locator('.skill-feed').boundingBox())!.height).toBe(emptyFeed.height);
    expect((await page.locator('.runner-snapshot').boundingBox())!.height).toBe(emptySnapshot.height);
    expect((await page.locator('.map-scene').boundingBox())!.height).toBe(emptyMap.height);
    if(size){
      await expect.poll(()=>field.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeLessThanOrEqual(1);
      expect(await field.evaluate(e=>{const box=e.getBoundingClientRect();return [...e.children].every(row=>row.getBoundingClientRect().bottom<=box.bottom+1);})).toBe(true);
    }
    await page.getByRole('button',{name:'Following details',exact:true}).click();
    const details=page.getByRole('dialog',{name:'Following details',exact:true});
    await expect(details).toContainText('Front blocker');
    await expect(details.locator('.snapshot-skill')).toHaveCount(1);
    expect((await page.locator('.runner-snapshot').boundingBox())!.height).toBe(emptySnapshot.height);
    await page.getByRole('button',{name:'Close Following details',exact:true}).click();
    await toggleComparison();
    await page.getByRole('toolbar',{name:'Playback and telemetry controls',exact:true}).getByRole('button',{name:'Finish',exact:true}).click();
    await expect(field.locator('.finished')).toHaveCount(9);
    await expect(field.locator('.field-hp strong')).toHaveText(Array(9).fill('0%'));
    await toggleComparison();
    await seek(0);
    await expect(field.locator('.field-hp strong')).toHaveText(Array(9).fill('100%'));
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await seek(1);
  if(info.project.name==='chromium')await page.setViewportSize({width:1920,height:1080});
  await page.locator('.replay-panel').screenshot({path:info.outputPath('replay-field-with-blocking.png')});
});

test('CM performance ranges use compact portraits and keep the ranges interactive',async({page},info)=>{
  await page.route('https://hakuraku.moe/api/simdata/**',route=>{
    const path=new URL(route.request().url()).pathname;
    const json=path.endsWith('/manifest')?cmFixture.manifest:path.endsWith('/summary')?cmFixture.summary:path.includes('/characters/')?cmFixture.context:cmFixture.distribution;
    return route.fulfill({json,headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto('/competitive/cm-data?tab=character');
  await page.getByRole('tab',{name:'Performance ranges',exact:true}).click();
  const first=page.locator('.ranking').first();
  await expect(first).toBeVisible();
  expect((await first.boundingBox())!.height).toBeLessThanOrEqual(42);
  await expect(first.locator('.art--portrait')).toBeVisible();
  const label=await first.getAttribute('aria-label');
  await first.click();
  await expect(page.getByRole('complementary',{name:'Selected Uma insight',exact:true})).toBeVisible();
  await expect(first).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Close Uma details',exact:true}).click();
  await expect(page.getByRole('complementary',{name:'Selected Uma insight',exact:true})).toHaveCount(0);
  await page.locator('.canvas').scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('compact-cm-ranges.png')});
  await page.getByRole('searchbox',{name:'Find an Uma',exact:true}).fill(label!.split(' ').slice(1,3).join(' '));
  await expect(page.locator('.ranking').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('lane range follows playback continuously and eases the axis and runners after seeking',async({page})=>{
  for(const [name,json] of Object.entries(replayCourses))await page.route(`**/resources/*/${name}.json*`,route=>route.fulfill({json}));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/competitive/race-analysis');
  await page.getByRole('button',{name:'Try one demo race',exact:true}).click();
  await page.getByRole('radio',{name:'Race positions',exact:true}).click();
  const stage=page.locator('.race-stage');
  await expect.poll(()=>stage.evaluate(e=>Math.abs(Number((e as HTMLElement).dataset.laneMax)-Number((e as HTMLElement).dataset.laneTarget)))).toBeLessThan(.001);
  await expect(page.locator('.fullscreen-target .stage-heading')).toHaveCount(0);
  const plot=await page.locator('.track-plane').boundingBox(),panel=await page.locator('.positions-target').boundingBox();
  expect(plot!.width/panel!.width).toBeGreaterThan(.9);
  await expect(stage.locator('.race-boundary[data-distance="0"]')).toHaveAttribute('x1','500');
  // Both expansion and contraction must ease, even when playback is paused.
  for(const time of [35,0]){
    const samples=await stage.evaluate(async(element,time)=>{
      const stage=element as HTMLElement,slider=document.querySelector<HTMLInputElement>('.time-slider')!;
      const before=Number(stage.dataset.laneMax),start=performance.now(),samples=[];
      slider.value=String(time);slider.dispatchEvent(new Event('input',{bubbles:true}));
      await new Promise<void>(resolve=>queueMicrotask(()=>queueMicrotask(resolve)));
      const initial=Number(stage.dataset.laneMax);
      while(performance.now()-start<1200){
        await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
        samples.push({elapsed:performance.now()-start,max:Number(stage.dataset.laneMax),target:Number(stage.dataset.laneTarget),position:parseFloat(stage.querySelector<HTMLElement>('.replay-marker')!.style.bottom)});
      }
      return {before,initial,samples};
    },time);
    const {before}=samples,frames=samples.samples,target=frames.at(-1)!.target;
    expect(target).not.toBe(before);
    expect(Math.abs(samples.initial-before)).toBeLessThan(.1);
    expect(frames.filter(f=>Math.abs(f.max-before)>.1&&Math.abs(f.max-target)>.1).length).toBeGreaterThan(5);
    await expect.poll(()=>stage.evaluate(e=>Number((e as HTMLElement).dataset.laneMax))).toBeCloseTo(target,3);
    // A paused runner's lane is fixed: only the shared animated scale moves it.
    const lane=frames.at(-1)!.position*frames.at(-1)!.max;
    // Bound spring overshoot in rendered pixels, independent of raw lane units.
    const scaleTolerance=.25*Math.max(before,target)/plot!.height;
    for(const frame of frames){
      expect(frame.max).toBeGreaterThanOrEqual(Math.min(before,target)-scaleTolerance);
      expect(frame.max).toBeLessThanOrEqual(Math.max(before,target)+scaleTolerance);
      // CSS serializes percentage positions with finite precision; compare in plot coordinates.
      expect(Math.abs(frame.position-lane/frame.max)).toBeLessThan(.001);
    }
  }
  await page.getByRole('button',{name:'Play',exact:true}).click();
  const live=await stage.evaluate(async element=>{
    const stage=element as HTMLElement,samples=[],until=performance.now()+2000;
    while(performance.now()<until){
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      samples.push({max:Number(stage.dataset.laneMax),target:Number(stage.dataset.laneTarget)});
    }
    return samples;
  });
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  // Catch bucketed targets and continuously restarted tweens that barely move.
  expect(new Set(live.map(f=>f.target.toFixed(3))).size).toBeGreaterThan(20);
  expect(new Set(live.map(f=>f.max.toFixed(3))).size).toBeGreaterThan(20);
  expect(Math.abs(live.at(-1)!.max-live.at(-1)!.target)).toBeLessThan(5);
  expect(Math.max(...live.slice(1).map((f,i)=>Math.abs(f.max-live[i]!.max)))).toBeLessThan(8);
  await page.getByRole('slider',{name:'Replay time',exact:true}).evaluate(e=>{
    const slider=e as HTMLInputElement;slider.value=slider.max;slider.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await expect(stage.locator('.race-boundary').last()).toHaveAttribute('x1','500');
});

test('course map centers the finish and removes portraits when runners leave the screen',async({page},info)=>{
  for(const [name,json] of Object.entries(replayCourses))await page.route(`**/resources/*/${name}.json*`,route=>route.fulfill({json}));
  const file=captureFile('past-finish.json'),raw=JSON.parse(file.buffer.toString());
  const bytes=inflateSync(Buffer.from(raw.race_scenario,'base64'));
  // Continue far enough past the line to leave the centered track view.
  bytes.writeFloatLE(2390,40);bytes.writeFloatLE(2690,56);bytes.writeFloatLE(10,52);
  bytes.writeUInt16LE(500,44);bytes.writeUInt16LE(500,60);
  raw.race_scenario=deflateSync(bytes).toString('base64');
  await page.goto('/competitive/race-analysis');
  await page.locator('#race-upload').setInputFiles({...file,buffer:Buffer.from(JSON.stringify(raw))});
  const map=page.getByRole('group',{name:'Race course and runner positions',exact:true}),slider=page.getByRole('slider',{name:'Replay time',exact:true});
  await expect(map).toBeVisible();
  const seek=async(time:number)=>slider.evaluate((e,time)=>{(e as HTMLInputElement).value=String(time);e.dispatchEvent(new Event('input',{bubbles:true}));},time);
  for(const view of ['Course map']){
    await page.getByRole('radio',{name:view,exact:true}).click();
    await seek(1);
    const finish=map.getByRole('button',{name:'Jump to Finish at 2400 metres',exact:true});
    await expect(finish).toBeAttached();
    await expect.poll(()=>finish.evaluate(g=>{
      const path=g.querySelector<SVGPathElement>('.landmark-hit')!,svg=g.ownerSVGElement!;
      const a=path.getPointAtLength(0),b=path.getPointAtLength(path.getTotalLength());
      return Math.abs((a.x+b.x)/2-svg.viewBox.baseVal.width/2);
    })).toBeLessThan(2);
    await expect(finish.locator('.map-finish')).toBeVisible();
    expect(await finish.locator('.map-finish rect').evaluateAll(rects=>new Set(rects.map(r=>r.getAttribute('x'))).size)).toBe(2);
    expect(await finish.locator('.map-finish rect').evaluateAll(rects=>new Set(rects.map(r=>r.getAttribute('fill'))).size)).toBe(2);
    expect(await finish.evaluate(g=>{
      const stripe=g.querySelector<SVGGElement>('.map-finish')!,line=g.querySelector<SVGPathElement>('.landmark-hit')!;
      const box=stripe.getBBox(),matrix=stripe.transform.baseVal.consolidate()!.matrix;
      const a=new DOMPoint(0,0).matrixTransform(matrix),b=new DOMPoint(0,box.height).matrixTransform(matrix);
      const start=line.getPointAtLength(0),end=line.getPointAtLength(line.getTotalLength());
      return Math.max(Math.hypot(a.x-start.x,a.y-start.y),Math.hypot(b.x-end.x,b.y-end.y));
    })).toBeLessThan(.01);
    const atFinish=Number(await map.locator('.runner-location').getAttribute('cx'));
    await expect.poll(()=>map.locator('.map-runner').evaluate(g=>{
      const portrait=g.querySelector<SVGForeignObjectElement>('.runner-callout')!,dot=g.querySelector<SVGCircleElement>('.runner-location')!;
      const distance=Math.hypot(portrait.x.baseVal.value+portrait.width.baseVal.value/2-dot.cx.baseVal.value,portrait.y.baseVal.value+portrait.height.baseVal.value/2-dot.cy.baseVal.value);
      return distance>=portrait.width.baseVal.value/2+6&&distance<=portrait.width.baseVal.value/2+14;
    })).toBe(true);
    await seek(1.25);
    await expect(map.locator('.runner-callout')).toHaveCount(1);
    expect(Number(await map.locator('.runner-location').getAttribute('cx'))).toBeGreaterThan(atFinish+10);
    await seek(20);
    await expect(map.locator('.map-runner')).toHaveCount(0);
    if(view==='Race positions')await expect(page.locator('.race-stage .replay-marker')).toHaveCount(0);
    // Seeking back restores the portrait and its captured position.
    await seek(1);
    await expect(map.locator('.runner-callout')).toHaveCount(1);
  }
  await page.locator('.replay-layout').screenshot({path:info.outputPath('centered-map-finish.png')});
});

test('course portraits keep breathing room without jitter and match the live field order',async({page},info)=>{
  for(const [name,json] of Object.entries(replayCourses))await page.route(`**/resources/*/${name}.json*`,route=>route.fulfill({json}));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/competitive/race-analysis');
  await page.getByRole('button',{name:'Try one demo race',exact:true}).click();
  const map=page.getByRole('group',{name:'Race course and runner positions',exact:true});
  await expect(map.locator('.runner-callout')).toHaveCount(9);
  await expect(page.locator('.map-caption>span')).toHaveText('-40–40 m');
  const nearPositions=()=>map.evaluate(svg=>[...svg.querySelectorAll('.map-runner')].every(g=>{
    const label=g.querySelector<SVGForeignObjectElement>('.runner-callout')!,dot=g.querySelector<SVGCircleElement>('.runner-location')!;
    return Math.hypot(label.x.baseVal.value+label.width.baseVal.value/2-dot.cx.baseVal.value,label.y.baseVal.value+label.height.baseVal.value/2-dot.cy.baseVal.value)<=98;
  }));
  await expect.poll(nearPositions).toBe(true);
  await page.locator('.map-scene').screenshot({path:info.outputPath('nearby-packed-portraits.png')});
  await page.getByRole('slider',{name:'Replay time',exact:true}).evaluate(e=>{(e as HTMLInputElement).value='5';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.getByRole('button',{name:'Play',exact:true}).click();
  const motion=await map.evaluate(async svg=>{
    const read=()=>[...svg.querySelectorAll<SVGGElement>('.map-runner')].map(g=>{
      const label=g.querySelector<SVGForeignObjectElement>('.runner-callout')!,dot=g.querySelector<SVGCircleElement>('.runner-location')!;
      return {id:g.dataset.runnerIndex,x:label.x.baseVal.value+label.width.baseVal.value/2,y:label.y.baseVal.value+label.height.baseVal.value/2,dx:dot.cx.baseVal.value,dy:dot.cy.baseVal.value};
    });
    const frameDuration=1000/60;
    await new Promise(requestAnimationFrame);
    let sampledAt=performance.now(),previousStep=frameDuration;
    const start=read();let previous=start,beforePrevious=start,maxOffsetChange=0,maxDistance=0,minDistance=Infinity,minSpacing=Infinity,maxCrossings=0,frames=0;
    const jitter:number[]=[];
    const labelSize=svg.querySelector<SVGForeignObjectElement>('.runner-callout')!.width.baseVal.value;
    const end=performance.now()+4000;
    while(performance.now()<end){
      await new Promise(requestAnimationFrame);
      const now=performance.now();
      const step=Math.max(1,now-sampledAt);sampledAt=now;
      const next=read();frames++;
      const links=next.map(p=>{
        const scale=Math.max(0,1-(labelSize/2+3)/Math.hypot(p.x-p.dx,p.y-p.dy));
        return {a:{x:p.dx,y:p.dy},b:{x:p.dx+(p.x-p.dx)*scale,y:p.dy+(p.y-p.dy)*scale}};
      });
      const side=(p:{x:number;y:number},q:typeof p,r:typeof p)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
      let crossings=0;
      for(let i=0;i<links.length;i++)for(const other of links.slice(i+1)){
        const {a,b}=links[i]!,{a:c,b:d}=other;
        if(side(a,b,c)*side(a,b,d)<-1e-6&&side(c,d,a)*side(c,d,b)<-1e-6)crossings++;
      }
      maxCrossings=Math.max(maxCrossings,crossings);
      for(const p of next){
        maxDistance=Math.max(maxDistance,Math.hypot(p.x-p.dx,p.y-p.dy));
        minDistance=Math.min(minDistance,Math.hypot(p.x-p.dx,p.y-p.dy));
        for(const other of next)if(other.id!==p.id)minSpacing=Math.min(minSpacing,Math.hypot(p.x-other.x,p.y-other.y));
        const old=previous.find(q=>q.id===p.id);
        // Compare motion at 60 Hz even when the browser skips an animation frame.
        if(old)maxOffsetChange=Math.max(maxOffsetChange,Math.hypot((p.x-p.dx)-(old.x-old.dx),(p.y-p.dy)-(old.y-old.dy))*frameDuration/step);
        const prior=beforePrevious.find(q=>q.id===p.id);
        if(frames>1&&old&&prior)jitter.push(Math.hypot(
          ((p.x-p.dx)-(old.x-old.dx))*frameDuration/step-((old.x-old.dx)-(prior.x-prior.dx))*frameDuration/previousStep,
          ((p.y-p.dy)-(old.y-old.dy))*frameDuration/step-((old.y-old.dy)-(prior.y-prior.dy))*frameDuration/previousStep
        ));
      }
      beforePrevious=previous;previous=next;previousStep=step;
    }
    const dotMovement=Math.max(...previous.map(p=>{const old=start.find(q=>q.id===p.id)!;return Math.hypot(p.dx-old.dx,p.dy-old.dy);}));
    jitter.sort((a,b)=>a-b);
    return {frames,maxOffsetChange,maxDistance,minDistance,minSpacing,maxCrossings,labelSize,dotMovement,p99Jitter:jitter[Math.floor(jitter.length*.99)]??0};
  });
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  expect(motion.frames).toBeGreaterThan(20);
  expect(motion.dotMovement).toBeGreaterThan(5);
  expect(motion.maxDistance).toBeLessThanOrEqual(98);
  expect(motion.minDistance).toBeGreaterThanOrEqual(motion.labelSize/2+6);
  // SVG coordinates and the portrait spring settle within a hundredth of a pixel.
  expect(motion.minSpacing).toBeGreaterThanOrEqual(motion.labelSize+8-.01);
  expect(motion.maxCrossings).toBe(0);
  expect(motion.maxOffsetChange).toBeLessThan(5);
  expect(motion.p99Jitter).toBeLessThan(1.5);
  const order=await page.locator('.field-runner').evaluateAll(rows=>rows.map(row=>(row as HTMLElement).dataset.runnerIndex));
  expect(await map.locator('.map-runner').evaluateAll((groups,order)=>groups.every(g=>{
    const position=String(order.indexOf((g as SVGGElement).dataset.runnerIndex)+1);
    return g.querySelector('.runner-portrait b')!.textContent===position&&g.classList.contains('leading')===(position==='1');
  }),order)).toBe(true);
  const portraitOffsets=()=>map.locator('.map-runner').evaluateAll(groups=>groups.map(g=>{
    const label=g.querySelector<SVGForeignObjectElement>('.runner-callout')!,dot=g.querySelector<SVGCircleElement>('.runner-location')!;
    return {id:(g as SVGGElement).dataset.runnerIndex,dx:label.x.baseVal.value+label.width.baseVal.value/2-dot.cx.baseVal.value,dy:label.y.baseVal.value+label.height.baseVal.value/2-dot.cy.baseVal.value};
  }));
  const beforeOverlays=await portraitOffsets();
  await page.getByRole('button',{name:'Display options',exact:true}).click();
  await page.getByRole('button',{name:'Speed [m/s]',exact:true}).click();
  await page.getByRole('button',{name:'Acceleration [m/s²]',exact:true}).click();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  const afterOverlays=await portraitOffsets();
  expect(Math.max(...afterOverlays.map(p=>{const old=beforeOverlays.find(q=>q.id===p.id)!;return Math.hypot(p.dx-old.dx,p.dy-old.dy);}))).toBeLessThan(12);
  await expect(map.locator('.map-runner.selected .runner-speed')).toBeVisible();
  await expect(map.locator('.map-runner.selected .runner-acceleration')).toBeVisible();
  expect(await map.locator('.runner-telemetry').evaluateAll(values=>values.every(value=>{
    const text=value.getBoundingClientRect(),dot=value.closest('.map-runner')!.querySelector('.runner-location')!.getBoundingClientRect();
    return text.top>dot.bottom||text.bottom<dot.top||text.left>dot.right||text.right<dot.left;
  }))).toBe(true);
  const captionsClear=()=>map.evaluate(svg=>{
    const obstacles=[...svg.querySelectorAll('.runner-callout,.runner-location')].map(e=>e.getBoundingClientRect());
    const visible=[...svg.querySelectorAll('.runner-name,.runner-telemetry')].filter(e=>{const style=getComputedStyle(e);return style.display!=='none'&&style.visibility!=='hidden';});
    return visible.every(e=>{
      const text=e.getBoundingClientRect(),map=svg.getBoundingClientRect();
      return text.left>=map.left&&text.right<=map.right&&text.top>=map.top&&text.bottom<=map.bottom
        &&obstacles.every(p=>text.top>=p.bottom||text.bottom<=p.top||text.left>=p.right||text.right<=p.left);
    });
  });
  await expect.poll(captionsClear).toBe(true);
  if(info.project.name==='chromium'){
    const crowded=map.locator('.map-runner.crowded:not(.selected)').first();
    await expect(crowded.locator('.runner-speed')).toHaveCSS('visibility','hidden');
    await crowded.locator('.runner-callout').hover();
    await expect(crowded.locator('.runner-speed')).toBeVisible();
    await expect.poll(captionsClear).toBe(true);
  }
  await page.locator('.map-scene').screenshot({path:info.outputPath('nearby-moving-portraits.png')});
});

test('race uploads keep replay and session sections together, retaining valid files',async({page},info)=>{
  for(const [name,json] of Object.entries(replayCourses))await page.route(`**/resources/*/${name}.json*`,route=>route.fulfill({json}));
  await page.route('**/resources/*/room_match_races.json*',route=>route.fulfill({json:{races:[{race_instance_id:800023,course_set_id:10506}]}}));
  await page.goto('/competitive/race-analysis');
  await expect(page.getByRole('heading',{name:'Race Analysis',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Try one demo race',exact:true}).click();
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.locator('.skill-period').first().click();
  await openRaceSection(page,'Race replay');
  await expect(page.locator('.skill-period.current')).not.toHaveCount(0);
  await openRaceSection(page,'Race replay');
  await page.getByLabel('Replay time',{exact:true}).evaluate(element=>{(element as HTMLInputElement).value='60';element.dispatchEvent(new Event('input',{bubbles:true}));});
  const playback=page.getByRole('region',{name:'Race playback',exact:true});
  const focus=page.getByRole('radiogroup',{name:'Primary replay view',exact:true});
  await expect(focus.getByRole('radio',{name:'Course map',exact:true})).toHaveAttribute('aria-checked','true');
  await expect(page.locator('.race-stage')).toBeHidden();
  await expect(page.locator('.race-stage .replay-marker .art')).toHaveCount(9);
  await expect(page.locator('.race-stage .distance-dot')).toHaveCount(0);
  await expect(page.locator('.race-stage .track-plane')).toHaveCSS('background-image','none');
  await focus.getByRole('radio',{name:'Race positions',exact:true}).click();
  expect(await page.locator('.race-stage').evaluate(stage=>{
    const box=stage.getBoundingClientRect();
    return [...stage.querySelectorAll('.replay-marker .art,.distance-axis span')].every(e=>{
      const b=e.getBoundingClientRect();return b.left>=box.left&&b.right<=box.right&&b.top>=box.top&&b.bottom<=box.bottom;
    });
  })).toBe(true);
  await expect(page.locator('.map-scene')).toBeHidden();
  expect((await page.locator('.race-stage').boundingBox())!.height).toBeGreaterThanOrEqual(160);
  await expect(page.locator('.map-scene')).toBeHidden();
  await focus.getByRole('radio',{name:'Course map',exact:true}).click();
  await page.getByRole('radio',{name:'Full course',exact:true}).click();
  await expect(focus.getByRole('radio',{name:'Course map',exact:true})).toHaveAttribute('aria-checked','true');
  await expect(page.getByRole('radio',{name:'Follow window',exact:true})).toHaveAttribute('aria-checked','false');
  expect((await page.locator('.map-scene').boundingBox())!.height).toBeGreaterThanOrEqual(160);
  await page.getByRole('radio',{name:'Follow window',exact:true}).click();
  await expect(playback.getByRole('slider',{name:'Replay time',exact:true})).toHaveValue('60');
  expect((await playback.locator('.terrain').boundingBox())!.height).toBeGreaterThanOrEqual(20);
  expect((await playback.locator('.course-bands').boundingBox())!.height).toBeGreaterThanOrEqual(16);
  await expect(playback.locator('.scrub-events')).toHaveCount(0);
  await expect(playback.getByRole('region',{name:'Skill activity timeline',exact:true})).toHaveCount(1);
  await expect(page.locator('.runner-panel .skill-activity')).toHaveCount(0);
  await expect(page.locator('.runner-panel .telemetry')).toHaveCount(0);
  await expect(playback.locator('.period-track')).toHaveCount(1);
  expect((await playback.locator('.period-track').boundingBox())!.height).toBeLessThanOrEqual(38);
  await expect(playback.locator('.period-track .skill-body')).toHaveCount(0);
  expect(await playback.evaluate(element=>{
    const chart=element.querySelector('.telemetry-track')!.getBoundingClientRect(),course=element.querySelector('.course-tracks')!.getBoundingClientRect(),scrubber=element.querySelector('.time-axis')!.getBoundingClientRect();
    return scrubber.bottom<=chart.top&&Math.abs(chart.left-course.left)<1&&Math.abs(chart.right-course.right)<1&&Math.abs(chart.left-scrubber.left)<1&&Math.abs(chart.right-scrubber.right)<1;
  })).toBe(true);
  await expect(playback.locator('.chart-host svg')).toBeVisible();
  expect((await playback.locator('.chart-host').boundingBox())!.height).toBeGreaterThanOrEqual(136);
  await expect(playback.getByRole('radiogroup',{name:'Telemetry metric',exact:true}).getByRole('radio',{name:'Combined',exact:true})).toHaveAttribute('aria-checked','true');
  await expect(playback.locator('.signal-reading')).toHaveCount(3);
  expect(await playback.locator('.signal-reading>span').allTextContents()).toEqual(['Speed','HP remaining','To leader']);
  expect(await playback.locator('.signal-reading').evaluateAll(readings=>readings.every(e=>{
    const box=e.getBoundingClientRect();return box.left>=0&&box.right<=innerWidth;
  }))).toBe(true);
  const graph=playback.locator('.chart-host');
  await graph.scrollIntoViewIfNeeded();
  const graphBox=(await graph.boundingBox())!;

  const midpoint=(Number(await playback.getByRole('slider',{name:'Replay time',exact:true}).getAttribute('max'))+Number(await playback.getByRole('slider',{name:'Replay time',exact:true}).getAttribute('min')))/2;
  for(const band of [.18,.5,.82]){
    await playback.getByRole('slider',{name:'Replay time',exact:true}).evaluate(e=>{(e as HTMLInputElement).value='60';e.dispatchEvent(new Event('input',{bubbles:true}));});
    await graph.click({position:{x:graphBox.width*.5,y:graphBox.height*band}});
    expect(Number(await playback.getByRole('slider',{name:'Replay time',exact:true}).inputValue())).toBeCloseTo(midpoint,0);
  }
  expect(await playback.evaluate(element=>{
    const graph=element.querySelector('.telemetry-cursor')!.getBoundingClientRect(),course=element.querySelector('.timeline-cursor')!.getBoundingClientRect(),skill=element.querySelector('.time-cursor')!.getBoundingClientRect();
    const slider=element.querySelector<HTMLInputElement>('.time-slider')!,box=slider.getBoundingClientRect(),position=(Number(slider.value)-Number(slider.min))/(Number(slider.max)-Number(slider.min));
    const handle=box.left+7+(box.width-14)*position;
    return Math.abs(graph.left-course.left)<1&&Math.abs(graph.left-skill.left)<1&&Math.abs(graph.left+graph.width/2-handle)<1;
  })).toBe(true);
  await playback.getByRole('radiogroup',{name:'Telemetry metric',exact:true}).getByRole('radio',{name:'Gap',exact:true}).click();
  await expect(playback.locator('.telemetry-reading')).toContainText('To leader');
  await playback.getByRole('radiogroup',{name:'Telemetry metric',exact:true}).getByRole('radio',{name:'Speed',exact:true}).click();
  await expect(playback.locator('.signal-reading')).toHaveCount(1);
  await playback.getByRole('radiogroup',{name:'Telemetry metric',exact:true}).getByRole('radio',{name:'Combined',exact:true}).click();
  await expect(playback.locator('.signal-reading')).toHaveCount(3);
  await playback.getByRole('slider',{name:'Replay time',exact:true}).evaluate(e=>{(e as HTMLInputElement).value='60';e.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(await playback.evaluate(element=>{
    const course=element.querySelector('.course-tracks')!.getBoundingClientRect(),skills=element.querySelector('.period-track')!.getBoundingClientRect();
    return Math.abs(course.left-skills.left)<1&&Math.abs(course.right-skills.right)<1;
  })).toBe(true);
  await page.getByRole('button',{name:'How to read the replay timeline',exact:true}).click();
  const timelineHelp=page.getByRole('dialog',{name:'How to read the replay timeline',exact:true});
  await expect(timelineHelp).toContainText('same replay time axis');
  await timelineHelp.getByRole('button',{name:'Close How to read the replay timeline',exact:true}).click();
  const scrubber=playback.getByRole('slider',{name:'Replay time',exact:true});
  await expect(scrubber).toHaveCSS('opacity','1');
  await scrubber.focus();await page.keyboard.press('ArrowRight');
  expect(Number(await scrubber.inputValue())).toBeGreaterThan(60);
  await expect(page.locator('.live-focus')).toHaveCount(0);
  await expect(page.locator('.runner-details')).toHaveCount(0);
  await expect(page.locator('.replay-layout').getByRole('button',{name:'Find blocking',exact:true})).toHaveCount(0);
  await openRaceSection(page,'Runner analysis');
  await page.getByRole('checkbox',{name:'All runners',exact:true}).check();
  await page.getByRole('region',{name:'Blocking incidents',exact:true}).getByRole('button',{name:/Review .* blocked by/}).first().click();
  await expect(page.locator('.map-runner.blocked-runner')).not.toHaveCount(0);
  await expect(page.locator('.map-blocker')).toBeVisible();
  await expect(page.locator('.block-connection.focused')).toBeVisible();
  await expect(page.locator('.field-runner.front-blocked')).not.toHaveCount(0);
  await page.locator('.replay-layout').screenshot({path:info.outputPath('blocking-example.png')});
  await expect(page.getByRole('button',{name:'Race replay',exact:true})).toBeVisible();
  await openRaceSection(page,'Runner analysis');
  await page.locator('.skill-period').first().click();
  await expect(page.getByRole('button',{name:'Race replay',exact:true})).toBeVisible();
  await expect(page.getByLabel('Recent course skill triggers',{exact:true})).toBeVisible();
  await expect(page.locator('.map-runner.triggered')).not.toHaveCount(0);
  const feed=page.getByLabel('Recent course skill triggers',{exact:true});
  expect(await feed.evaluate(element=>element.getBoundingClientRect().top>=document.querySelector('.race-timeline')!.getBoundingClientRect().bottom)).toBe(true);
  expect(await page.locator('.skill-activity').evaluate(element=>element.getBoundingClientRect().bottom<=document.querySelector('.skill-feed')!.getBoundingClientRect().top)).toBe(true);
  expect(await page.locator('.playback .timeline-label').evaluateAll(labels=>{
    const reference=getComputedStyle(labels[0]!);
    const left=labels[0]!.getBoundingClientRect().left;
    return labels.every(label=>{const style=getComputedStyle(label);return style.fontSize===reference.fontSize&&style.fontWeight===reference.fontWeight&&style.color===reference.color&&Math.abs(label.getBoundingClientRect().left-left)<1;});
  })).toBe(true);
  expect(await page.locator('.skill-feed-scroll').evaluate(element=>Math.abs(element.getBoundingClientRect().left-document.querySelector('.period-track')!.getBoundingClientRect().left)<1)).toBe(true);
  expect(await page.locator('.skill-trigger').first().evaluate(element=>{
    const portrait=element.querySelector('.art')!,style=getComputedStyle(element);
    return style.borderWidth==='0px'&&portrait.getBoundingClientRect().width>=28&&getComputedStyle(portrait).borderWidth==='0px';
  })).toBe(true);
  expect(await feed.locator('.skill-name').evaluateAll(names=>names.every(e=>e.scrollWidth<=e.clientWidth+1))).toBe(true);
  await expect(page.locator('.course-map .lane-guide')).toHaveCount(0);
  await scrubber.evaluate(e=>{(e as HTMLInputElement).value='60';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await expect(playback.getByRole('slider',{name:'Replay time',exact:true})).toHaveCount(1);
  await expect(page.locator('.course-progress')).toHaveCount(0);
  expect(await playback.evaluate(element=>{
    const top=element.getBoundingClientRect().top;
    return top>=document.querySelector('.map-scene')!.getBoundingClientRect().bottom;
  })).toBe(true);
  await expect(playback.getByRole('img',{name:/Course elevation/})).toBeVisible();
  const corner=playback.getByRole('button',{name:/Seek to (Final corner|Corner) at/}).first();
  await corner.click();
  await expect(playback.locator('.playback-state')).toContainText('Corner');
  await page.getByLabel('Replay time',{exact:true}).evaluate(element=>{(element as HTMLInputElement).value='60';element.dispatchEvent(new Event('input',{bubbles:true}));});
  await expect(page.locator('.runner-lane')).toHaveCount(0);
  expect(new Set(await page.locator('.runner-location').evaluateAll(elements=>elements.map(e=>e.getAttribute('cy')))).size).toBeGreaterThan(1);
  await expect(page.getByRole('complementary',{name:'Race field',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Late race',exact:true}).click();
  await expect(page.locator('.race-phase')).toContainText('Late race');
  const follow=page.locator('.runner-pick').last(),followName=(await follow.getAttribute('aria-label'))!.slice('Follow '.length);
  await follow.click();
  await expect(page.locator('.field-runner.chosen')).toContainText(followName);
  await page.getByRole('button',{name:followName+': visible. Change visibility',exact:true}).click();
  await expect(page.getByRole('button',{name:followName+': dimmed. Change visibility',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Show all runners',exact:true}).click();
  const map=page.getByRole('group',{name:'Race course and runner positions',exact:true});
  await expect(map).toBeVisible();
  await expect(map.getByRole('button',{name:'Follow '+followName+' on course',exact:true})).toHaveAttribute('aria-pressed','true');
  const portraitPick=map.locator('.map-runner').last();
  await portraitPick.locator('.runner-callout').click();
  await expect(portraitPick).toHaveAttribute('aria-pressed','true');
  const mapPick=map.locator('.map-runner').first(),mapName=(await mapPick.getAttribute('aria-label'))!.slice(7,-10);
  await mapPick.focus();await page.keyboard.press('Enter');
  await expect(page.locator('.field-runner.chosen')).toContainText(mapName);
  await expect(page.locator('.runner-pick[aria-pressed=true]')).toHaveAttribute('aria-label','Follow '+mapName);
  await expect(page.getByRole('radio',{name:'Follow window',exact:true})).toHaveAttribute('aria-checked','true');
  await expect(map.locator('.runner-portrait')).toHaveCount(9);
  await expect(map.locator('circle.runner-location')).toHaveCount(9);
  const savedTime=await scrubber.inputValue();
  for(const time of ['10','30','90']){
    await scrubber.evaluate((e,value)=>{(e as HTMLInputElement).value=value;e.dispatchEvent(new Event('input',{bubbles:true}));},time);
    await expect.poll(()=>map.evaluate(svg=>{
      const portraits=[...svg.querySelectorAll<SVGForeignObjectElement>('.runner-callout')];
      const dots=[...svg.querySelectorAll<SVGCircleElement>('.runner-location')];
      const path=svg.querySelector<SVGPolylineElement>('.pack-range')!,matrix=svg.querySelector<SVGGElement>('.track-camera')!.transform.baseVal.consolidate()!.matrix;
      const a=path.points.getItem(0),b=path.points.getItem(path.points.numberOfItems-1);
      const dx=matrix.a*(b.x-a.x)+matrix.c*(b.y-a.y),dy=matrix.b*(b.x-a.x)+matrix.d*(b.y-a.y);
      return dx>0&&Math.abs(dy)<dx*.2
        &&portraits.length===9&&dots.length===9&&[...svg.querySelectorAll('.map-runner')].every(g=>{
          const dot=g.querySelector<SVGCircleElement>('.runner-location')!,portrait=g.querySelector<SVGForeignObjectElement>('.runner-callout')!;
          const connector=g.querySelector<SVGPolygonElement>('.runner-leader')!,start=connector.points.getItem(0),left=connector.points.getItem(1),right=connector.points.getItem(2),end={x:(left.x+right.x)/2,y:(left.y+right.y)/2};
          const distance=Math.hypot(dot.cx.baseVal.value-portrait.x.baseVal.value-portrait.width.baseVal.value/2,dot.cy.baseVal.value-portrait.y.baseVal.value-portrait.height.baseVal.value/2);
          return Math.hypot(start.x-dot.cx.baseVal.value,start.y-dot.cy.baseVal.value)<.01
            &&Math.abs(Math.hypot(end.x-portrait.x.baseVal.value-portrait.width.baseVal.value/2,end.y-portrait.y.baseVal.value-portrait.height.baseVal.value/2)-Math.min(distance,portrait.width.baseVal.value/2-4))<.01;
        })&&portraits.every(p=>{
        const x=p.x.baseVal.value,y=p.y.baseVal.value,w=p.width.baseVal.value,h=p.height.baseVal.value;
        return dots.every(dot=>Math.hypot(x+w/2-dot.cx.baseVal.value,y+h/2-dot.cy.baseVal.value)>w/2+dot.r.baseVal.value+2);
      });
    })).toBe(true);
    if(info.project.name==='chromium'&&time==='30'){
      await map.scrollIntoViewIfNeeded();
      const box=(await map.boundingBox())!,dot=map.locator('.runner-location').first();
      const before=(await dot.boundingBox())!;
      await page.mouse.move(box.x+box.width*.1,box.y+box.height*.7);
      await page.mouse.down();await page.mouse.move(box.x+box.width*.1+50,box.y+box.height*.7+15,{steps:4});await page.mouse.up();
      await expect(page.getByRole('radio',{name:'Follow window',exact:true})).toHaveAttribute('aria-checked','false');
      await expect.poll(async()=>{
        const after=(await dot.boundingBox())!;
        return Math.abs(after.x-before.x-50)<2&&Math.abs(after.y-before.y-15)<2;
      }).toBe(true);
      await page.getByRole('radio',{name:'Follow window',exact:true}).click();
    }
  }
  await scrubber.evaluate((e,value)=>{(e as HTMLInputElement).value=value;e.dispatchEvent(new Event('input',{bubbles:true}));},savedTime);
  await expect(map.locator('.runner-location .art')).toHaveCount(0);
  expect(new Set(await map.locator('.runner-location').evaluateAll(elements=>elements.map(e=>e.getAttribute('data-lane-metres')))).size).toBeGreaterThan(1);
  await expect(map.locator('.runner-trail')).toHaveCount(1);
  await expect(map.locator('.map-distance').first()).toBeVisible();
  const transform=()=>map.locator('.track-camera').getAttribute('transform');
  const original=await transform();
  await page.getByRole('button',{name:'Zoom course out',exact:true}).click();
  await expect.poll(transform).not.toBe(original);
  const zoomIn=page.getByRole('button',{name:'Zoom course in',exact:true});
  await expect(zoomIn).toBeEnabled();
  const zoomedOut=await transform();
  await zoomIn.click();
  await expect.poll(transform).not.toBe(zoomedOut);
  await expect(page.getByRole('radio',{name:'Follow window',exact:true})).toHaveAttribute('aria-checked','true');
  await page.getByRole('radio',{name:'Full course',exact:true}).click();
  await expect(page.getByRole('radio',{name:'Follow window',exact:true})).toHaveAttribute('aria-checked','false');
  expect(await map.locator('.map-landmark text').evaluateAll(labels=>{
    const boxes=labels.map(e=>e.getBoundingClientRect());
    return boxes.every((a,i)=>boxes.slice(i+1).every(b=>a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top));
  })).toBe(true);
  const railWidth=()=>map.evaluate(svg=>{
    const rails=svg.querySelectorAll<SVGPolylineElement>('.track-rail');
    const i=Math.floor(rails[0]!.points.numberOfItems/2),a=rails[0]!.points.getItem(i),b=rails[1]!.points.getItem(i);
    return Math.hypot(b.x-a.x,b.y-a.y)/Number(svg.querySelector('.track-base')!.getAttribute('stroke-width'));
  });
  await expect.poll(railWidth).toBeCloseTo(1,2);
  await page.getByRole('button',{name:'Expand lane spacing',exact:true}).click();
  await expect.poll(railWidth).toBeCloseTo(1,2);
  await page.getByRole('button',{name:'Expand lane spacing',exact:true}).click();
  await page.getByRole('radio',{name:'Follow window',exact:true}).click();
  await expect(page.getByRole('radio',{name:'Follow window',exact:true})).toHaveAttribute('aria-checked','true');
  await expect(page.getByRole('tablist',{name:'Course camera',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Compact pack',exact:true})).toHaveCount(0);
  const runnerPosition=()=>map.locator('.map-runner.selected .runner-leader').getAttribute('points');
  const beforeSeek=await runnerPosition();
  await page.getByLabel('Replay time',{exact:true}).evaluate(element=>{(element as HTMLInputElement).value='60';element.dispatchEvent(new Event('input',{bubbles:true}));});
  await expect.poll(runnerPosition).not.toBe(beforeSeek);
  const assertWindowVisible=async()=>{
    const visible=await map.evaluate(async svg=>{
      await new Promise(requestAnimationFrame);
      const box=(svg as SVGSVGElement).viewBox.baseVal,path=svg.querySelector<SVGPolylineElement>('.pack-range')!;
      const matrix=svg.querySelector<SVGGElement>('.track-camera')!.transform.baseVal.consolidate()!.matrix;
      return Array.from({length:path.points.numberOfItems},(_,i)=>{
        const p=path.points.getItem(i),screen=new DOMPoint(p.x,p.y).matrixTransform(matrix);
        return screen.x>=0&&screen.y>=0&&screen.x<=box.width&&screen.y<=box.height;
      }).every(Boolean);
    });
    expect(visible).toBe(true);
  };
  await assertWindowVisible();
  await expect(page.getByRole('complementary',{name:'Race field',exact:true}).locator('.field-runner.chosen')).toContainText(mapName);
  for(const value of ['0','90','125']){
    await page.getByLabel('Replay time',{exact:true}).evaluate((element,value)=>{(element as HTMLInputElement).value=value;element.dispatchEvent(new Event('input',{bubbles:true}));},value);
    await assertWindowVisible();
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByLabel('Replay time',{exact:true}).evaluate(element=>{(element as HTMLInputElement).value='60';element.dispatchEvent(new Event('input',{bubbles:true}));});
  await assertWindowVisible();
  if(info.project.name==='chromium'){
    await page.getByRole('button',{name:'Fullscreen',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.classList.contains('replay-layout'))).toBe(true);
    await expect(page.getByRole('complementary',{name:'Race field',exact:true}).locator('.field-runner.chosen')).toBeVisible();
    await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();
  }
  await page.getByRole('button',{name:'Display options',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'Course overview',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Speed [m/s]',exact:true}).click();
  await page.getByRole('button',{name:'Acceleration [m/s²]',exact:true}).click();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(map).toBeVisible();
  await expect(map.locator('.runner-speed')).toHaveCount(await map.locator('.map-runner').count());
  await expect(map.locator('.runner-acceleration')).toHaveCount(await map.locator('.map-runner').count());
  await expect(map.locator('.runner-speed').first()).toContainText('m/s');
  await expect(map.locator('.runner-acceleration').first()).toContainText('m/s²');
  expect(await map.locator('.runner-telemetry').evaluateAll(values=>values.every(value=>{
    const rect=value.getBoundingClientRect(),map=value.closest('svg')!.getBoundingClientRect();
    return rect.left>=map.left&&rect.right<=map.right&&rect.top>=map.top&&rect.bottom<=map.bottom;
  }))).toBe(true);
  await page.screenshot({path:info.outputPath('race-replay.png'),fullPage:true});
  await page.getByRole('button',{name:'Add race files',exact:true}).click();
  await page.getByRole('button',{name:'Try 24 demo races',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Session analysis',exact:true})).toBeVisible();
  await expect(page.locator('.session-status:visible')).toContainText('24 races loaded');
  await expect(page.locator('.replay-layout')).toBeVisible();
  await openRaceSection(page,'Skill analysis');
  const skillTable=page.getByRole('table',{name:'Skill Analysis',exact:true});
  await expect(skillTable).toBeVisible();
  await skillTable.getByRole('button',{name:'Activation rate',exact:true}).click();
  const rates=await skillTable.locator('tbody tr[data-virtual-index] td:nth-child(3)').allTextContents();
  expect(rates.map(value=>parseFloat(value))).toEqual(rates.map(value=>parseFloat(value)).sort((a,b)=>b-a));
  await expect(skillTable.getByRole('columnheader',{name:'Activation rate',exact:true})).toHaveAttribute('aria-sort','descending');
  await page.locator('.analysis-section:not([hidden]) .lazy-surface').first().scrollIntoViewIfNeeded();
  await expect(page.locator('.analysis-section:not([hidden]) .lazy-surface svg').first()).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:info.outputPath('race-analysis.png'),fullPage:false});
  await page.getByRole('button',{name:'Add race files',exact:true}).click();
  await page.locator('#race-upload').setInputFiles([captureFile('one.json'),captureFile('two.json.gz',true),{name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')}]);
  await expect(page.getByRole('heading',{name:'Session analysis',exact:true})).toBeVisible();
  await expect(page.locator('.session-status:visible')).toContainText('2 races loaded');
  await expect(page.getByText('Some files could not be imported')).toBeVisible();
  await openRaceSection(page,'Race replay');
  await page.getByRole('button',{name:'Remove race',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Session analysis',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Race replay',exact:true})).toBeVisible();
  await expect(map).toBeVisible();
  await expect(page.locator('.replay-title')).toContainText('Tokyo · 2,400 m');
  await page.getByRole('button',{name:'Display options',exact:true}).click();
  await page.getByRole('combobox',{name:'Track',exact:true}).click();
  await page.getByRole('option',{name:'Sapporo · 1200m · Turf · Right',exact:true}).click();
  await expect(page.locator('.replay-title')).toContainText('Sapporo · 1,200 m');
  await page.getByRole('combobox',{name:'Track',exact:true}).click();
  await page.getByRole('option',{name:'Auto · Course 10606',exact:true}).click();
  await expect(page.locator('.replay-title')).toContainText('Tokyo · 2,400 m');
  await page.getByRole('button',{name:'Done',exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByRole('button',{name:'Remove race',exact:true}).click();
  await expect(page.getByRole('region',{name:'Upload race captures',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Try one demo race',exact:true})).toBeVisible();
  await page.locator('#race-upload').setInputFiles(captureFile('800023_recorded-race.json',false,null));
  await expect(page.locator('.replay-title')).toContainText('Nakayama · 2,500 m');
  await expect(page.locator('.course-source')).toHaveText('Course detected');
  await expect(map).toBeVisible();
});

test('race analysis is one continuous report with preserved selection and compact detailed results',async({page})=>{
  for(const [name,json] of Object.entries(replayCourses))await page.route(`**/resources/*/${name}.json*`,route=>route.fulfill({json}));
  await page.goto('/competitive/race-analysis');
  await page.getByRole('button',{name:'Try one demo race',exact:true}).click();
  if(page.viewportSize()!.width>1000){
    // The viewport height belongs to the replay itself; page and race headers sit above it.
    for(const height of [1080,960]){
      await page.setViewportSize({width:1920,height});
      await expect.poll(()=>page.locator('.replay-panel').evaluate(e=>e.getBoundingClientRect().height)).toBeCloseTo(height,1);
      expect(await page.locator('.replay-panel').evaluate(e=>e.querySelector('.period-track')!.getBoundingClientRect().bottom<=e.getBoundingClientRect().bottom)).toBe(true);
      expect(await page.evaluate(()=>window.scrollY)).toBe(0);
      const header=(await page.locator('.replay-header').boundingBox())!,navigation=(await page.locator('.report-navigation').boundingBox())!;
      expect(header.y).toBeGreaterThanOrEqual(0);
      expect(navigation.y).toBeGreaterThanOrEqual(header.y+header.height);
      await expect(page.getByRole('heading',{name:'Race Analysis',exact:true})).toBeVisible();
      const field=page.locator('.field-runners');
      await expect(field.locator('.field-runner')).toHaveCount(9);
      await expect.poll(()=>field.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeLessThanOrEqual(1);
      expect(await field.evaluate(e=>{
        const box=e.getBoundingClientRect();return [...e.querySelectorAll('.field-runner')].every(row=>{
          const rect=row.getBoundingClientRect();return rect.top>=box.top&&rect.bottom<=box.bottom+1;
        });
      })).toBe(true);
      const playbackTools=page.getByRole('toolbar',{name:'Playback and telemetry controls',exact:true});
      expect(await playbackTools.evaluate(element=>{
        const controls=[...element.querySelectorAll('button,select')].map(control=>control.getBoundingClientRect()).filter(rect=>rect.width&&rect.height);
        const centers=controls.map(rect=>rect.top+rect.height/2);
        return Math.max(...centers)-Math.min(...centers);
      })).toBeLessThan(1);
      await expect(playbackTools.getByRole('radiogroup',{name:'Telemetry metric',exact:true})).toBeVisible();
      await expect(playbackTools.getByRole('button',{name:'Expand Race telemetry',exact:true})).toBeVisible();
      await expect(page.locator('.telemetry .chart-frame>figcaption')).toHaveCount(0);
    }
    await page.setViewportSize({width:1920,height:1080});
    const toolbar=page.getByRole('toolbar',{name:'Race replay controls',exact:true});
    const controls=(await toolbar.locator('.map-controls').boundingBox())!,view=(await toolbar.locator('.replay-view').boundingBox())!,actions=(await toolbar.locator('.stage-tools').boundingBox())!;
    expect(Math.abs(controls.y-view.y)).toBeLessThan(1);
    expect(Math.abs(actions.y-view.y)).toBeLessThan(1);
    expect((await page.locator('.runner-pick .art').first().boundingBox())!.height).toBeGreaterThanOrEqual(30);
    await toolbar.getByRole('button',{name:'Replay guide',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'Replay guide',exact:true})).toContainText('Drag to pan');
    await page.keyboard.press('Escape');
    await toolbar.getByRole('button',{name:'Fullscreen',exact:true}).click();
    await expect(page.locator('.replay-layout:fullscreen')).toHaveCount(1);
    await expect.poll(()=>page.locator('.field-runners').evaluate(e=>e.scrollHeight-e.clientHeight)).toBeLessThanOrEqual(1);
    await toolbar.getByRole('button',{name:'Exit fullscreen',exact:true}).click();
    await expect(page.locator('.replay-layout:fullscreen')).toHaveCount(0);
  }
  const slider=page.getByRole('slider',{name:'Replay time',exact:true});
  await slider.evaluate(e=>{(e as HTMLInputElement).value='60';e.dispatchEvent(new Event('input',{bubbles:true}));});
  const follow=page.locator('.runner-pick').last(),name=(await follow.getAttribute('aria-label'))!.slice(7);
  await follow.click();
  await openRaceSection(page,'Race replay');
  if(page.viewportSize()!.width>1000){
    const layout=(await page.locator('.replay-layout').boundingBox())!,timeline=(await page.locator('.replay-timeline').boundingBox())!;
    const map=(await page.locator('.fullscreen-target').boundingBox())!,field=(await page.locator('.live-roster').boundingBox())!;
    expect(Math.abs(timeline.x-layout.x)).toBeLessThan(1);
    expect(Math.abs(timeline.width-layout.width)).toBeLessThan(1);
    expect(timeline.y).toBeGreaterThanOrEqual(Math.max(map.y+map.height,field.y+field.height));
    await expect.poll(()=>page.locator('.field-runners').evaluate(e=>e.scrollHeight-e.clientHeight)).toBeLessThanOrEqual(1);
    expect(await page.locator('.runner-snapshot').evaluate(e=>e.querySelector('.runner-extra')!.getBoundingClientRect().bottom<=e.getBoundingClientRect().bottom+1)).toBe(true);
  }
  await expect(page.locator('.race-stage')).toBeHidden();
  await expect(page.locator('.live-focus')).toHaveCount(0);
  await openRaceSection(page,'Runner analysis');
  await expect(page.getByRole('navigation',{name:'Jump to analysis section',exact:true})).toBeVisible();
  await expect(page.getByRole('tablist',{name:'Race analysis views',exact:true})).toHaveCount(0);
  await expect(page.locator('.race-panels>[data-report-section]')).toHaveCount(3);
  expect(await page.locator('.race-panels>[data-report-section]').evaluateAll(sections=>sections.map(e=>e.getAttribute('data-report-section')))).toEqual(['replay','results','runner']);
  await expect(page.locator('.replay-layout')).toBeVisible();
  await expect(page.locator('.runner-card')).toContainText(name);
  await page.getByRole('button',{name:'Build details',exact:true}).click();
  const build=page.getByRole('dialog',{name:'Runner build',exact:true});
  await expect(build).toContainText(name);
  await build.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.getByRole('button',{name:'Expand Race telemetry',exact:true}).click();
  const expanded=page.getByRole('dialog',{name:'Race telemetry',exact:true});
  await expect(expanded.locator('.chart-host')).toBeVisible();
  await expect.poll(async()=> (await expanded.locator('.chart-host').boundingBox())!.height).toBeGreaterThan(page.viewportSize()!.height*.6);
  await expect(expanded.locator('.signal-reading')).toHaveCount(0);
  await expect(expanded.getByRole('list',{name:'Chart legend',exact:true})).toContainText('HP remaining (%)');
  const expandedGraph=expanded.locator('.chart-host'),graphBox=(await expandedGraph.boundingBox())!;
  await expandedGraph.hover({position:{x:graphBox.width*.4,y:graphBox.height*.4}});
  const tooltip=expanded.locator('[class^="chart-tooltip-"]:visible');
  await expect(tooltip).toHaveCount(1);
  await expect(tooltip).toContainText('Speed');
  expect(await tooltip.evaluate(element=>{
    const rect=element.getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight;
  })).toBe(true);
  await expanded.getByRole('button',{name:'Close dialog',exact:true}).click();
  await expect(page.getByRole('button',{name:'Expand Race telemetry',exact:true})).toBeFocused();
  await openRaceSection(page,'Race results');
  const results=page.getByRole('table',{name:'Race results',exact:true});
  await expect(page.locator('.runner-card')).toBeVisible();
  await expect(page.getByRole('radiogroup',{name:'Results columns',exact:true})).toHaveCount(0);
  await expect(results.getByRole('columnheader')).toHaveCount(7);
  await expect(results.getByRole('columnheader',{name:'Race modes (s)',exact:true})).toHaveCount(0);
  await expect(results.getByRole('columnheader',{name:'Incidents (s)',exact:true})).toHaveCount(0);
  const inspect=results.getByRole('button',{name:/^Inspect /}).first();
  const inspectedName=(await inspect.getAttribute('aria-label'))!.slice(8);
  await inspect.click();
  await expect(page.getByRole('dialog',{name:'Runner details',exact:true})).toHaveCount(0);
  await expect(page.locator('.runner-card')).toContainText(inspectedName);
  await expect(inspect).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.runner-panel .runner-snapshot')).toHaveCount(0);
  await expect(page.locator('.replay-panel .runner-snapshot')).toHaveCount(1);
  await page.getByRole('button',{name:'Skill activity details',exact:true}).click();
  const skillDetails=page.getByRole('dialog',{name:'Skill activity details',exact:true});
  await skillDetails.getByRole('checkbox',{name:'All learned skills',exact:true}).check();
  await expect(page.locator('.inactive-outcome')).not.toHaveCount(0);
  expect(await page.evaluate(()=>Math.abs(document.querySelector('.course-tracks')!.getBoundingClientRect().left-document.querySelector('.period-track')!.getBoundingClientRect().left)<1)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await skillDetails.getByRole('checkbox',{name:'All learned skills',exact:true}).uncheck();
  await skillDetails.getByRole('button',{name:'Close Skill activity details',exact:true}).click();
  await page.locator('.runner-pick').filter({hasText:name}).click();
  await openRaceSection(page,'Race results');
  if(page.viewportSize()!.width>1000){
    const area=page.getByRole('region',{name:'Race results scroll area',exact:true});
    expect(await area.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
  }
  await openRaceSection(page,'Race replay');
  await expect(slider).toHaveValue('60');
  await expect(page.locator('.field-runner.chosen')).toContainText(name);
  await page.getByRole('button',{name:'Add race files',exact:true}).click();
  await page.getByRole('button',{name:'Try 24 demo races',exact:true}).click();
  await expect(page.getByRole('button',{name:'Session analysis',exact:true})).toBeVisible();
  await expect(page.locator('.replay-layout')).toBeVisible();
  await openRaceSection(page,'Strategy analysis');
  await expect(page.getByRole('navigation',{name:'Jump to session section',exact:true})).toBeVisible();
  await expect(page.locator('.session-sections>.analysis-section')).toHaveCount(7);
  await expect(page.getByRole('tablist',{name:'Session analysis views',exact:true})).toHaveCount(0);
  if(page.viewportSize()!.width>1000){
    const charts=page.locator('.analysis-section').filter({has:page.getByRole('heading',{name:'Strategy analysis',exact:true})}).locator('.two-col').first().locator(':scope>figure');
    await expect(charts).toHaveCount(2);
    const [first,second]=await charts.evaluateAll(elements=>elements.map(e=>({left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right,top:e.getBoundingClientRect().top})));
    expect(Math.abs(first!.top-second!.top)).toBeLessThan(1);
    expect(second!.left).toBeGreaterThanOrEqual(first!.right);
  }
  await openRaceSection(page,'Uma analysis');
  await page.getByRole('combobox',{name:'Rank by',exact:true}).click();
  await page.getByRole('option',{name:'Popularity',exact:true}).click();
  const umaPlot=page.getByRole('group',{name:'Uma popularity and win rate. Select a portrait to inspect its results.',exact:true});
  expect(await umaPlot.locator('image').count()).toBeGreaterThan(8);
  const point=umaPlot.getByRole('button').first(),pointName=(await point.getAttribute('aria-label'))!.slice('Select '.length).split(':')[0]!;
  await point.focus();await point.press('Enter');
  await expect(page.locator('.uma-inspection')).toContainText(pointName);
  await expect(page.locator('.character-select[aria-pressed=true]')).toContainText(pointName);
  await page.locator('.uma-inspection').getByRole('button',{name:'Find teams',exact:true}).click();
  await expect(page.locator('.team-grid .team-card').first()).toContainText(pointName);
  await page.getByRole('button',{name:'Clear Uma filter',exact:true}).click();
  await openRaceSection(page,'HP & last spurt');
  const hpTable=page.getByRole('table',{name:'HP & Last Spurt',exact:true});
  expect(await hpTable.locator('.runner-reference img').count()).toBeGreaterThan(0);
  await expect(hpTable.getByRole('columnheader',{name:'Avg. spurt delay',exact:true})).toHaveCount(1);
  await openRaceSection(page,'Teams & builds');
  await expect(page.locator('.team-grid .team-card')).toHaveCount(12);
  await page.getByRole('button',{name:'Show more teams',exact:true}).click();
  await expect(page.locator('.team-grid .team-card')).toHaveCount(24);
  await expect(page.getByRole('combobox',{name:'Sort teams',exact:true})).toContainText('Team win rate');
  const sessionTeam=page.locator('.team-grid .team-card').first();
  const sessionRunnerName=(await sessionTeam.locator('.identity h3').first().innerText()).trim();
  await sessionTeam.getByRole('button',{name:'Inspect team',exact:true}).click();
  const sessionBuild=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Learned skills'})});
  await expect(sessionBuild.getByRole('heading',{name:'Learned skills'})).toHaveCount(3);
  await expect(sessionBuild.getByLabel(/^(All|Race) aptitudes$/)).toHaveCount(3);
  await expect(sessionBuild).toContainText(sessionRunnerName);
  await page.keyboard.press('Escape');
  await sessionTeam.getByRole('button',{name:'Inspect '+sessionRunnerName+' build',exact:true}).click();
  await expect(sessionBuild.getByRole('heading',{name:'Learned skills'})).toHaveCount(1);
  await expect(sessionBuild.getByRole('button',{name:'View race replay',exact:true})).toBeEnabled();
  await page.keyboard.press('Escape');
  await page.getByRole('searchbox',{name:'Uma or trainer',exact:true}).fill('no such trainer');
  await expect(page.getByText('No matching teams',{exact:true})).toBeVisible();
  await openRaceSection(page,'Skill analysis');
  await expect(page.getByRole('searchbox',{name:'Filter skills',exact:true})).toHaveValue('');
  await expect(page.getByRole('table',{name:'Skill Analysis',exact:true}).locator('tbody tr[data-virtual-index]')).not.toHaveCount(0);
  await openRaceSection(page,'Race replay');
  await expect(page.getByRole('table',{name:'Skill Analysis',exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Race',exact:true}).click();
  await page.getByRole('option',{name:/^2\. Demo race 2\b/}).click();
  await expect(page.getByRole('combobox',{name:'Race',exact:true})).toContainText('2. Demo race 2');
  await slider.evaluate(e=>{(e as HTMLInputElement).value='40';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await openRaceSection(page,'Session analysis');
  await expect(page.getByRole('button',{name:'Skill analysis',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Add race files',exact:true}).click();
  await page.locator('#race-upload').setInputFiles(captureFile('another-race.json'));
  await expect(page.locator('.session-status:visible')).toContainText('1 race loaded');
  await expect(page.getByRole('button',{name:'Race replay',exact:true})).toBeVisible();
  await slider.evaluate(e=>{(e as HTMLInputElement).value='.5';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await openRaceSection(page,'Race results');
  await page.getByRole('button',{name:'Add race files',exact:true}).click();
  await page.locator('#race-upload').setInputFiles(captureFile('additional-race.json'));
  await expect(page.locator('.session-status:visible')).toContainText('2 races loaded');
  await expect(page.getByRole('button',{name:'Race results',exact:true})).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Race',exact:true})).toContainText('1. another-race.json');
  await openRaceSection(page,'Race replay');
  await expect(slider).toHaveValue('0.5');
  await openRaceSection(page,'Session analysis');
  await expect(page.getByRole('button',{name:'Session overview',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('Competitive shows a compact dataset preview and recovers from a failed request',async({page})=>{
  let fail=true;
  await page.route('https://hakuraku.moe/api/simdata/**',async route=>{
    const manifest=new URL(route.request().url()).pathname.endsWith('/manifest');
    if(fail&&manifest){await route.fulfill({status:503,json:{error:'temporarily unavailable'},headers:{'access-control-allow-origin':'*'}});return;}
    await route.fulfill({json:manifest?cmFixture.manifest:cmFixture.summary,headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto('/competitive');
  await expect(page.getByRole('heading',{name:'Race Analysis',exact:true})).toBeVisible();
  await expect(page.locator('.tools a')).toHaveCount(3);
  await expect(page.getByRole('alert')).toContainText('CM preview unavailable');
  fail=false;await page.getByRole('button',{name:'Retry',exact:true}).click();
  await expect(page.locator('.field-preview tbody tr')).toHaveCount(5);
  await expect(page.locator('.field-key')).toContainText('Team wins: any teammate finishes first.');
  await expect(page.locator('.dataset-facts')).toContainText(cmFixture.summary.meta.populationRaces.toLocaleString('en-US'));
  await expect(page.getByRole('link',{name:'Browse captured teams',exact:true})).toHaveAttribute('href',/tab=archetypes/);
  await expect(page.locator('.tools a').last()).toHaveAttribute('href','/competitive/cm-data?tab=lobby');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('CM uses Hakuraku charts and captured teams without inventing a replay catalogue',async({page},info)=>{
  test.setTimeout(90_000);
  if(info.project.name==='chromium')await page.setViewportSize({width:1920,height:1080});
  const methods:string[]=[];
  let teamSlots:Requirement[]=[];
  let failSkillDetail=true,holdTeams=true,releaseTeams!:()=>void,releaseSkills!:()=>void;
  const teamsReady=new Promise<void>(resolve=>releaseTeams=resolve);
  const skillsReady=new Promise<void>(resolve=>releaseSkills=resolve);
  await page.route('**/resources/*/simulator_courses.json*',route=>route.fulfill({json:replayCourses.simulator_courses}));
  await page.route('**/resources/*/room_match_races.json*',route=>route.fulfill({json:{races:[{race_instance_id:800023,course_set_id:10506}]}}));
  await page.route('https://hakuraku.moe/api/simdata/**',async route=>{
    const request=route.request(),url=new URL(request.url());methods.push(request.method());
    let payload:unknown;
    if(url.pathname.endsWith('/manifest'))payload=cmFixture.manifest;
    else if(url.pathname.endsWith('/summary'))payload=cmFixture.summary;
    else if(url.pathname.includes('/characters/'))payload=cmFixture.context;
    else if(url.pathname.endsWith('/team-distribution'))payload=cmFixture.distribution;
    else if(url.pathname.endsWith('/skills/overview'))payload=cmFixture.skills;
    else if(url.pathname.includes('/skills/details/')){
      if(failSkillDetail){failSkillDetail=false;await route.fulfill({status:503,json:{error:'temporarily unavailable'},headers:{'access-control-allow-origin':'*'}});return;}
      await skillsReady;
      payload={...cmFixture.skillDetail,skillId:Number(url.pathname.split('/').at(-1))};
    }
    else if(url.pathname.endsWith('/teams')){
      if(holdTeams)await teamsReady;
      const slots=JSON.parse(url.searchParams.get('slots')??'[{}, {}, {}]') as Requirement[];
      teamSlots=slots;
      const matching=(cmFixture.teams.teams as Performer[]).filter(t=>matchesTeam(t.members,slots));
      payload={...cmFixture.teams,teams:matching,totalTeams:matching.length,totalOwners:matching.length};
    }else if(url.pathname.includes('/teams/')){
      const id=url.pathname.split('/').at(-1),team=(cmFixture.teams.teams as Performer[]).find(t=>t.id===id);
      payload={snapshotId:cmFixture.summary.snapshotId,team,skills:{}};
    }else throw new Error('Unexpected Hakuraku request '+url);
    await route.fulfill({json:payload,headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto('/competitive/cm-data');
  await expect(page.getByRole('tab',{name:'Introduction',exact:true})).toHaveAttribute('aria-selected','true',{timeout:15000});
  await expect(page.getByRole('tab',{name:'Replays',exact:true})).toHaveCount(0);
  await expect(page.getByRole('tab',{name:'Overview',exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Dataset summary'})).toContainText('10,000,000');
  await expect(page.getByRole('heading',{name:'The meeting at a glance',exact:true})).toBeVisible();
  const overviewStyle=cmFixture.summary.styles.find((r:{style:number})=>r.style===1);
  const overviewFront=page.getByRole('button',{name:'Explore Front Runner',exact:true});
  await expect(overviewFront).toContainText((overviewStyle.pop*100).toFixed(1)+'%');
  await expect(overviewFront).toContainText((overviewStyle.winShare*100).toFixed(1)+'%');
  await overviewFront.click();
  await expect(page.getByRole('radio',{name:'Front Runner',exact:true})).toHaveAttribute('aria-checked','true');
  await page.getByRole('radio',{name:'All styles',exact:true}).click();
  await page.getByRole('tab',{name:'Introduction',exact:true}).click();
  await page.locator('figure').filter({has:page.locator('#cm-overview-umas-title')}).getByRole('button',{name:/^Explore /}).first().click();
  await expect(page.getByRole('tab',{name:'Uma Analysis',exact:true})).toHaveAttribute('aria-selected','true');
  await page.getByRole('tab',{name:'Strategy Analysis',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Effects of style saturation',exact:true})).toBeVisible();
  const counts=page.getByRole('group',{name:'Inspect room count',exact:true});
  await counts.getByRole('button',{name:'2 in room',exact:true}).click();
  await expect(counts.getByRole('button',{name:'2 in room',exact:true})).toHaveAttribute('aria-pressed','true');
  const front=cmFixture.summary.styles.find((r:{style:number})=>r.style===1);
  await expect(page.locator('.style-row').filter({hasText:'Front Runner'})).toContainText((front.winShare*100).toFixed(1)+'%');
  await expect(page.getByRole('img',{name:'Per-Uma win rate versus number of the same style',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Expand Effects of style saturation',exact:true}).click();
  await page.getByRole('dialog').getByText('Inspect values',{exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('table')).toContainText('95% interval');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Expand Effects of style saturation',exact:true})).toBeFocused();
  if(info.project.name==='chromium'){
    await expect.poll(()=>page.locator('.representatives').evaluate(panel=>{
      const plot=panel.querySelector('.plot')!,groups=Array.from(panel.querySelectorAll('.reps>section'));
      const bounds=plot.getBoundingClientRect();
      return groups.length===6&&groups.every(group=>{const rect=group.getBoundingClientRect();return rect.top>=bounds.top-1&&rect.bottom<=bounds.bottom+1;});
    })).toBe(true);
    const cards=await page.locator('.composition-panels .chart-frame').evaluateAll(cards=>cards.map(card=>card.getBoundingClientRect().height));
    expect(Math.abs(cards[0]!-cards[1]!)).toBeLessThan(2);
    expect(cards[0]).toBeLessThan(700);
    expect(await page.getByRole('tab',{name:'Strategy Analysis',exact:true}).evaluate(e=>e.getBoundingClientRect().height)).toBeLessThanOrEqual(30);
  }
  await expect(page.locator('.composition-table .rate-bar').first()).toHaveAttribute('aria-label',/neutral baseline 33.3%/);
  await expect(page.locator('.comparison-key').first()).toContainText('one win in three');
  expect(await page.locator('.full .chart-frame').evaluate(card=>card.querySelector('thead')!.getBoundingClientRect().bottom-card.getBoundingClientRect().top)).toBeLessThan(info.project.name==='chromium'?90:110);
  await page.getByRole('button',{name:'About the estimated win range',exact:true}).first().click();
  await expect(page.getByRole('dialog',{name:'About the estimated win range',exact:true})).toContainText('narrower range means a more precise estimate');
  await page.keyboard.press('Escape');
  await expect.poll(()=>page.locator('.composition-table').first().evaluate(table=>{const label=table.querySelector('.comparison-key')!.getBoundingClientRect(),line=table.querySelector('.baseline')!.getBoundingClientRect();return Math.abs(label.left+label.width/2-line.left-1);})).toBeLessThan(2);
  await page.screenshot({path:info.outputPath('cm-strategy.png'),fullPage:true});
  await page.getByRole('radio',{name:'Other styles',exact:true}).click();
  await expect(page.getByRole('img',{name:'Debuffer win rate versus styles in the field',exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Uma Analysis',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Individual vs. team win rate',exact:true})).toBeVisible();
  await expect(page.locator('.bubble')).toContainText('Individual win rate');
  await expect(page.locator('.bubble')).toContainText('Team win rate');
  if(info.project.name==='chromium'){
    await expect.poll(()=>page.locator('.roster').evaluate(panel=>{
      const scroll=panel.querySelector('.breakdown-scroll')!,card=panel.querySelector('.chart-frame')!;
      return Math.abs(scroll.getBoundingClientRect().bottom-(card.getBoundingClientRect().bottom-parseFloat(getComputedStyle(card).paddingBottom)));
    })).toBeLessThan(3);
  }
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:info.outputPath('cm-uma-field.png'),fullPage:true});
  await page.getByRole('searchbox',{name:'Find an Uma',exact:true}).fill('no such uma');
  await expect(page.getByText('No Umas match these chart filters.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Reset chart filters',exact:true}).click();
  await page.getByRole('searchbox',{name:'Find an Uma',exact:true}).fill('Kitasan Black');
  await page.getByRole('button',{name:'Expand Individual vs. team win rate',exact:true}).click();
  const umaDialog=page.getByRole('dialog');
  await umaDialog.locator('.bubble [role="button"]').first().click();
  await expect(umaDialog.getByRole('region',{name:'Uma chart details',exact:true})).toContainText('Kitasan Black');
  const kitasan=cmFixture.summary.pairs.find((p:{key:string})=>p.key==='106801:1');
  await expect(umaDialog.locator('.inspection')).toContainText((kitasan.individual*100).toFixed(1)+'%');
  await expect(umaDialog.locator('.inspection img')).toHaveAttribute('src',/\/game-assets\/character_thumbs\//);
  await page.screenshot({path:info.outputPath('cm-uma-expanded.png')});
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Expand Individual vs. team win rate',exact:true})).toBeFocused();
  await page.getByRole('tab',{name:'Strategy Analysis',exact:true}).click();
  await expect(page.getByRole('radio',{name:'Other styles',exact:true})).toHaveAttribute('aria-checked','true');
  await page.getByRole('tab',{name:'Uma Analysis',exact:true}).click();
  await expect(page.getByRole('searchbox',{name:'Find an Uma',exact:true})).toHaveValue('Kitasan Black');
  await page.screenshot({path:info.outputPath('cm-uma.png'),fullPage:true});
  await page.getByRole('tab',{name:'Skill Analysis',exact:true}).click();
  await expect(page.getByRole('table',{name:'CM Skill Analysis',exact:true})).toBeVisible();
  await page.getByRole('searchbox',{name:'Search skills',exact:true}).fill('no such skill');
  await expect(page.getByText('No skills match these filters.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Reset skill filters',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search skills',exact:true}).fill('10071');
  await page.getByRole('button',{name:'Inspect Skill 10071',exact:true}).click();
  const retry=page.getByRole('button',{name:'Retry activation data',exact:true});
  await expect(retry).toBeVisible();await retry.click();
  const skillDetail=page.getByRole('region',{name:'Skill 10071 activation details',exact:true});
  await expect(skillDetail.getByRole('status')).toContainText('Loading Skill 10071');
  await expect(skillDetail.locator('.course-bands')).toHaveAttribute('aria-label',/Final straight · 2,190–2,500 m/);
  await expect(skillDetail.locator('.course-bands')).toHaveAttribute('aria-label',/Start section · 0–100 m/);
  const loadingHeight=await skillDetail.evaluate(e=>e.getBoundingClientRect().height);
  releaseSkills();
  await expect(page.locator('.lane svg[role="slider"]')).toHaveCount(1);
  expect(Math.abs(await skillDetail.evaluate(e=>e.getBoundingClientRect().height)-loadingHeight)).toBeLessThan(2);
  await expect(skillDetail.locator('.phase-background')).toHaveAttribute('aria-label',/Mid race · 417–1,667 m/);
  await expect(skillDetail.locator('.phase-background')).toHaveAttribute('aria-label',/Final leg · 2,083–2,500 m/);
  expect(await skillDetail.locator('.phase-background').evaluate(background=>{
    const back=background.getBoundingClientRect(),bars=background.parentElement!.querySelector('svg')!.getBoundingClientRect();
    return Math.abs(back.top-bars.top)+Math.abs(back.height-bars.height)+Math.abs(back.width-bars.width);
  })).toBeLessThan(2);
  await expect(skillDetail.locator('.course-reading')).toContainText('Downhill -1.5%');
  const activationHelp=skillDetail.getByRole('button',{name:'How to read activation distances',exact:true});
  await activationHelp.click();
  await expect(page.getByRole('dialog',{name:'How to read activation distances',exact:true})).toContainText('The final leg covers the last sixth');
  await page.keyboard.press('Escape');
  await expect(activationHelp).toBeFocused();
  await page.getByRole('button',{name:'Add Skill 10071 to comparison',exact:true}).click();
  const addSkill=page.getByRole('combobox',{name:'Add a skill to comparison',exact:true});
  await addSkill.fill('10081');
  await page.getByRole('option',{name:'Skill 10081 [Id 10081]',exact:true}).click();
  const comparison=page.getByRole('region',{name:'Skill comparison',exact:true});
  await expect(comparison.locator('.lane.card')).toHaveCount(2);
  await expect(comparison.locator('svg[role="slider"]')).toHaveCount(2);
  const sliders=comparison.locator('svg[role="slider"]');
  await sliders.first().focus();await page.keyboard.press('End');
  await expect(sliders.nth(1)).toHaveAttribute('aria-valuenow','99');
  await expect(comparison.locator('.course-reading')).toContainText('Final leg');
  await page.keyboard.press('Home');
  await expect(sliders.nth(1)).toHaveAttribute('aria-valuenow','0');
  await expect(comparison.locator('.course-reading')).toContainText('Early race');
  await expect(comparison.locator('.course-reading')).toContainText('Start section');
  await page.keyboard.press('ArrowRight');
  await expect(sliders.nth(1)).toHaveAttribute('aria-valuenow','1');
  await page.screenshot({path:info.outputPath('cm-skills.png'),fullPage:true});
  await page.getByRole('button',{name:'Remove Skill 10081 from comparison',exact:true}).click();
  await expect(comparison.locator('.lane.card')).toHaveCount(1);
  await page.getByRole('tab',{name:'Uma Analysis',exact:true}).click();
  await page.getByRole('button',{name:'Find teams',exact:true}).click();
  await expect(page.getByRole('tab',{name:'Archetype Analysis',exact:true})).toHaveAttribute('aria-selected','true');
  const teamLoader=page.locator('.teams-loading .spinner');
  await expect(teamLoader).toContainText('Loading captured teams…');
  await expect(teamLoader.locator('.loading-mark')).toBeVisible();
  expect(await teamLoader.locator('.loading-mark').evaluate(mark=>mark.getBoundingClientRect().width)).toBeGreaterThanOrEqual(120);
  expect(await teamLoader.evaluate(loader=>loader.querySelector('.caption')!.getBoundingClientRect().top-loader.querySelector('.loading-mark')!.getBoundingClientRect().bottom)).toBeGreaterThan(8);
  const loadingMark=teamLoader.locator('.loading-mark');
  await expect(loadingMark.locator('img')).toHaveCount(0);
  await expect(loadingMark.locator('path')).toHaveCount(2);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect(loadingMark.locator('animateTransform').first()).toBeAttached();
  await expect(loadingMark.locator('animateTransform[type="scale"], svg [transform*="scale"]')).toHaveCount(0);
  await expect(loadingMark.locator('svg.art')).toHaveCSS('transform','none');
  await expect.poll(()=>loadingMark.evaluate(mark=>mark.getAnimations({subtree:true}).length)).toBe(0);
  const initialTrace=await loadingMark.locator('.outline').evaluate(trace=>getComputedStyle(trace).strokeDashoffset);
  await expect.poll(()=>loadingMark.locator('.outline').evaluate(trace=>getComputedStyle(trace).strokeDashoffset)).not.toBe(initialTrace);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(loadingMark.locator('animateTransform')).toHaveCount(0);
  await expect.poll(()=>loadingMark.evaluate(mark=>mark.getAnimations({subtree:true}).length)).toBe(0);
  await expect(teamLoader.locator('.base')).toHaveCSS('opacity','1');
  await page.screenshot({path:info.outputPath('cm-team-loading.png')});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect(loadingMark.locator('animateTransform').first()).toBeAttached();
  const loadingArea=page.locator('.teams-loading');
  const oldLoadingStyle=await loadingArea.getAttribute('style');
  for(const height of [88,52]){
    await loadingArea.evaluate((area,height)=>{(area as HTMLElement).style.cssText=`width:180px;height:${height}px;min-height:0;`;},height);
    await expect.poll(()=>loadingMark.evaluate(mark=>mark.getBoundingClientRect().width)).toBeLessThan(80);
    const layout=await teamLoader.evaluate(loader=>{
      const container=loader.parentElement!.getBoundingClientRect(),spinner=loader.getBoundingClientRect(),mark=loader.querySelector('.loading-mark')!.getBoundingClientRect(),caption=loader.querySelector('.caption')!.getBoundingClientRect();
      return {height:spinner.height,contained:[mark,caption].every(rect=>rect.left>=container.left-.5&&rect.right<=container.right+.5&&rect.top>=container.top-.5&&rect.bottom<=container.bottom+.5)};
    });
    expect(layout.height).toBeCloseTo(height,0);
    expect(layout.contained).toBe(true);
  }
  await loadingArea.evaluate((area,style)=>{if(style===null)area.removeAttribute('style');else area.setAttribute('style',style);},oldLoadingStyle);
  await expect.poll(()=>loadingMark.evaluate(mark=>mark.getBoundingClientRect().width)).toBeGreaterThanOrEqual(120);
  holdTeams=false;releaseTeams();
  await expect(page.locator('.team-row').first()).toContainText('Kitasan Black');
  await page.getByRole('button',{name:'Reset',exact:true}).click();
  const lineupFilters=page.getByRole('button',{name:'Lineup filters',exact:true});
  await expect(page.getByRole('combobox',{name:/^Runner \d Uma$/})).toHaveCount(3);
  const runnerPicker=page.getByRole('combobox',{name:'Runner 1 Uma',exact:true});
  await runnerPicker.click();
  const umaPicker=page.getByRole('listbox',{name:'Runner 1 Uma suggestions',exact:true});
  await expect(umaPicker.getByRole('option',{name:'Any Uma',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await runnerPicker.fill('Kitasan Black');
  await expect(umaPicker.getByRole('option').first()).toContainText('Kitasan Black');
  await runnerPicker.press('ArrowDown');
  await runnerPicker.press('Enter');
  await expect(umaPicker).not.toBeVisible();
  await expect(runnerPicker).toHaveValue(/Kitasan Black/);
  await expect(runnerPicker).toBeFocused();
  await runnerPicker.click();
  await runnerPicker.fill('');
  await umaPicker.getByRole('option',{name:'Any Uma',exact:true}).click();
  await expect(runnerPicker).toHaveValue('Any Uma');
  const fieldChart=page.locator('.field-panel .chart-host');
  if(info.project.name==='chromium')await expect(fieldChart).toBeVisible();
  const initialFieldHeight=info.project.name==='chromium'?(await fieldChart.boundingBox())!.height:0;
  const advancedTrigger=page.getByRole('button',{name:'Advanced filters',exact:true});
  await advancedTrigger.click();
  const advanced=page.getByRole('region',{name:'Advanced filters',exact:true});
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(advanced).toContainText('Any Uma + Debuffer');
  await expect(advanced.getByRole('button',{name:'Add exclusion',exact:true})).toBeDisabled();
  await advanced.getByRole('radio',{name:'Add another choice',exact:true}).click();
  const ruleRow=advanced.getByRole('combobox',{name:'Lineup row',exact:true});
  await ruleRow.click();
  const ruleRowOptions=advanced.getByRole('listbox',{name:'Lineup row',exact:true});
  await expect(ruleRowOptions.getByRole('option')).toHaveCount(3);
  await ruleRowOptions.getByRole('option',{name:/^Runner 2/}).click();
  await expect(advanced).toContainText('Add this row’s first choice below');
  await expect(advanced.getByRole('button',{name:'Add option',exact:true})).toBeDisabled();
  await advanced.getByRole('combobox',{name:'Running style',exact:true}).click();
  await advanced.getByRole('option',{name:'Front Runner',exact:true}).click();
  await expect(advanced.getByRole('button',{name:'Add option',exact:true})).toBeEnabled();
  await expect(advanced.locator('.rule-preview')).toContainText('Runner 2: Any Uma · Front Runner');
  await advanced.getByRole('button',{name:'Add option',exact:true}).click();
  await expect.poll(()=>teamSlots[1]).toEqual({style:1});
  await expect(page.getByRole('combobox',{name:'Teammate 2 style',exact:true})).toContainText('Front Runner');
  await advanced.getByRole('radio',{name:'Exclude runners',exact:true}).click();
  await advanced.getByRole('radio',{name:'Add another choice',exact:true}).click();
  await expect(ruleRow).toContainText('Runner 2');
  await expect(ruleRow).toContainText('Front Runner');
  await expect(advanced).toContainText('The other rows still need separate runners');
  await advanced.getByRole('combobox',{name:'Running style',exact:true}).click();
  await advanced.getByRole('option',{name:'Front Runner',exact:true}).click();
  await expect(advanced.getByRole('button',{name:'Add option',exact:true})).toBeDisabled();
  await expect(advanced).toContainText('This choice is already applied');
  await page.getByRole('button',{name:'Advanced filters',exact:true}).click();
  await page.getByRole('button',{name:'Reset',exact:true}).click();
  await advancedTrigger.click();
  await advanced.getByRole('radio',{name:'Exclude runners',exact:true}).click();
  await advanced.getByRole('combobox',{name:'Running style',exact:true}).click();
  await advanced.getByRole('option',{name:'Debuffer',exact:true}).click();
  await advanced.getByRole('button',{name:'Add exclusion',exact:true}).click();
  await expect.poll(()=>teamSlots.some(slot=>slot.exclude&&slot.style===6)).toBe(true);
  await expect(advanced.locator('.applied-rules')).toContainText('Debuffer');
  await page.getByRole('button',{name:'Advanced filters',exact:true}).click();
  await expect(page.locator('#cm-advanced-filter-editor')).not.toBeVisible();
  await expect(page.locator('.inline-rules')).toContainText('Debuffer');
  await expect(advancedTrigger).toContainText('1 applied');
  await expect(advancedTrigger).toHaveAttribute('aria-expanded','false');
  await advancedTrigger.click();
  await expect(advancedTrigger).toHaveAttribute('aria-expanded','true');
  await expect(advanced.locator('.applied-rules')).toContainText('Debuffer');
  await page.getByRole('button',{name:'Advanced filters',exact:true}).click();
  expect(await page.locator('.inline-rules li').first().evaluate(row=>{
    const name=row.querySelector('.applied-choice strong')!.getBoundingClientRect(),outfit=row.querySelector('.applied-choice small')!.getBoundingClientRect();
    return Math.abs(name.top-outfit.top)<3;
  })).toBe(true);
  if(info.project.name==='chromium'){
    await expect.poll(async()=>(await fieldChart.boundingBox())?.height??0).toBeGreaterThan(initialFieldHeight+25);
    await expect.poll(async()=>page.locator('.field-panel').evaluate(panel=>{
      const help=panel.querySelector('.field-help')!.getBoundingClientRect();
      return panel.getBoundingClientRect().bottom-help.bottom;
    })).toBeLessThan(16);
  }
  await page.getByRole('button',{name:/^Remove exclusion .*Debuffer/}).click();
  await expect.poll(()=>teamSlots.some(slot=>slot.exclude)).toBe(false);
  if(info.project.name==='chromium')await expect.poll(async()=>Math.abs(((await fieldChart.boundingBox())?.height??0)-initialFieldHeight)).toBeLessThan(1);
  const firstStyle=page.getByRole('combobox',{name:'Teammate 1 style',exact:true});
  await firstStyle.click();
  await page.getByRole('option',{name:'Front Runner',exact:true}).click();
  await advancedTrigger.click();
  await advanced.getByRole('radio',{name:'Add another choice',exact:true}).click();
  await expect(ruleRow).toContainText('Runner 1');
  await expect(ruleRow).toContainText('Front Runner');
  const alternativeUma=advanced.getByRole('combobox',{name:'Uma / outfit',exact:true});
  await alternativeUma.click();
  await alternativeUma.fill('Kitasan Black');
  await page.getByRole('listbox',{name:'Uma / outfit suggestions',exact:true}).getByRole('option',{name:'Kitasan Black · Any outfit',exact:true}).click();
  await advanced.getByRole('combobox',{name:'Running style',exact:true}).click();
  await advanced.getByRole('option',{name:'Pace Chaser',exact:true}).click();
  await expect(advanced.locator('.rule-preview')).toContainText('Any Uma · Front Runner or Kitasan Black · Any outfit · Pace Chaser');
  await advanced.getByRole('button',{name:'Add option',exact:true}).click();
  await expect.poll(()=>teamSlots[0]?.anyOf?.some(option=>option.chara===(Object.values(cmFixture.summary.cards) as Card[]).find(card=>card.name==='Kitasan Black')!.chara&&option.card===undefined&&option.style===2)).toBe(true);
  await page.getByRole('button',{name:'Advanced filters',exact:true}).click();
  await expect(page.locator('.inline-rules')).toContainText('Runner 1 or');
  await firstStyle.click();
  await page.getByRole('option',{name:'End Closer',exact:true}).click();
  await expect.poll(()=>teamSlots[0]?.anyOf?.map(option=>option.style)).toEqual([4,2]);
  await page.getByRole('button',{name:/^Remove Runner 1 alternative .*Pace Chaser/}).click();
  await expect.poll(()=>teamSlots[0]).toEqual({style:4});
  await page.getByRole('button',{name:'Reset',exact:true}).click();
  await expect.poll(()=>teamSlots.every(slot=>!slot.exclude&&!slot.anyOf&&!slot.style&&!slot.card&&!slot.chara)).toBe(true);
  await lineupFilters.click();
  await expect(lineupFilters).toHaveAttribute('aria-expanded','false');
  await lineupFilters.click();
  const filterRows=await page.locator('.filter-slot').evaluateAll(rows=>rows.map(row=>row.getBoundingClientRect().top));
  expect(filterRows[1]).toBeGreaterThan(filterRows[0]!);
  expect(filterRows[2]).toBeGreaterThan(filterRows[1]!);
  await expect(page.locator('.field-panel .chart-host svg')).toBeVisible();
  if(info.project.name==='chromium'){
    const fieldLayout=await page.locator('.field-content').evaluate(field=>({
      graph:field.querySelector('.chart-host')!.getBoundingClientRect().right,
      numbers:field.querySelector('.field-stats')!.getBoundingClientRect().left
    }));
    expect(fieldLayout.numbers).toBeGreaterThan(fieldLayout.graph);
  }
  const teamCard=page.locator('.team-row').first();
  const teamDetails=teamCard.getByRole('button',{name:'Details',exact:true});
  await expect(teamDetails).toBeVisible();
  expect(await teamCard.locator('.team-actions').evaluate(actions=>{
    const [details,lobby]=Array.from(actions.querySelectorAll('button')).map(button=>button.getBoundingClientRect());
    return details!.right<=lobby!.left&&Math.abs(details!.top-lobby!.top)<1&&Math.abs(details!.width-lobby!.width)<1&&Math.abs(details!.height-lobby!.height)<1;
  })).toBe(true);
  await expect(teamCard.locator('.member')).toHaveCount(3);
  await expect(teamCard).toContainText('Estimated win range');
  await expect(teamCard).toContainText('Simulated races');
  await expect(page.getByRole('checkbox',{name:'Build stats',exact:true})).toBeChecked();
  await expect(teamCard.locator('.member-stats')).toHaveCount(3);
  await expect(teamCard.locator('.member-stats').first()).toContainText('stamina');
  await expect(teamCard.locator('.member-stats').first().locator('[data-stat]')).toHaveCount(5);
  expect(await teamCard.evaluate(card=>{
    const rows=Array.from(card.querySelectorAll('.member-stats')).map(strip=>Array.from(strip.querySelectorAll('dd')).map(value=>value.getBoundingClientRect().right));
    return Math.max(...rows[0]!.map((_,column)=>Math.max(...rows.map(row=>row[column]!))-Math.min(...rows.map(row=>row[column]!))));
  })).toBeLessThan(1);
  expect(await teamCard.locator('.member-stats').evaluateAll(strips=>strips.every(strip=>Array.from(strip.querySelectorAll('[data-stat]')).every(cell=>{
    const icon=cell.querySelector('img')!.getBoundingClientRect(),value=cell.querySelector('dd')!.getBoundingClientRect(),next=cell.nextElementSibling?.querySelector('img')?.getBoundingClientRect();
    return value.left-icon.right<=4&&(!next||next.left-value.right>value.left-icon.right);
  })))).toBe(true);
  await page.screenshot({path:info.outputPath('cm-teams-with-stats.png')});
  await page.getByRole('checkbox',{name:'Build stats',exact:true}).uncheck();
  await expect(teamCard.locator('.member-stats')).toHaveCount(0);
  if(info.project.name==='chromium'){
    const bounds=await page.locator('.team-row').evaluateAll(cards=>cards.slice(0,3).map(card=>({top:card.getBoundingClientRect().top,height:card.getBoundingClientRect().height,width:card.getBoundingClientRect().width})));
    expect(bounds).toHaveLength(3);
    expect(Math.max(...bounds.map(b=>b.top))-Math.min(...bounds.map(b=>b.top))).toBeLessThan(2);
    expect(Math.max(...bounds.map(b=>b.height))).toBeLessThan(350);
    expect(Math.max(...bounds.map(b=>b.height))-Math.min(...bounds.map(b=>b.height))).toBeLessThan(2);
    expect(Math.max(...bounds.map(b=>b.width))).toBeLessThan(600);
  }
  await page.getByRole('combobox',{name:'Rank teams by',exact:true}).click();
  await page.getByRole('option',{name:'Win rate',exact:true}).click();
  await expect(page.locator('.ranking-help')).toContainText('simulated team win rate');
  await page.getByRole('combobox',{name:'Rank teams by',exact:true}).click();
  await page.getByRole('option',{name:'Reliable win rate',exact:true}).click();
  await expect(page.locator('.ranking-help')).toContainText('lower end');
  await page.screenshot({path:info.outputPath('cm-teams.png')});
  await page.getByRole('button',{name:'Expand Matching field',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Matching field',exact:true})).toBeVisible();
  await expect.poll(()=>page.getByRole('dialog').locator('.chart-host svg').evaluate(svg=>svg.getBoundingClientRect().width)).toBeGreaterThan(100);
  await expect.poll(()=>page.getByRole('dialog',{name:'Matching field',exact:true}).evaluate(dialog=>{
    const bounds=dialog.getBoundingClientRect(),graph=dialog.querySelector('.chart-host')!.getBoundingClientRect(),numbers=dialog.querySelector('.field-stats')!.getBoundingClientRect();
    return bounds.width>=innerWidth-28&&graph.width>bounds.width*.9&&graph.height>bounds.height*.6&&numbers.bottom<=graph.top;
  })).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Expand Matching field',exact:true})).toBeFocused();
  await teamDetails.click();
  await expect(page.getByRole('dialog',{name:'Team details',exact:true})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(teamDetails).toBeFocused();
  const openTeam=page.getByRole('button',{name:'View team 1 details',exact:true});
  await openTeam.focus();
  await openTeam.press('Enter');
  const detail=page.getByRole('dialog');
  await expect(detail.locator('.build')).toHaveCount(3);
  await expect(detail.locator('.build-card')).toHaveCount(3);
  expect(await detail.evaluate(dialog=>{
    const title=dialog.querySelector('.dialog-panel>header h2')!.getBoundingClientRect(),actions=dialog.querySelector('.detail-actions')!.getBoundingClientRect();
    return Math.abs((title.top+title.bottom)/2-(actions.top+actions.bottom)/2);
  })).toBeLessThan(2);
  expect(await detail.evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await expect(detail.getByRole('button',{name:/replay/i})).toHaveCount(0);
  await expect(detail.locator('.skill-chip').first()).toBeVisible();
  await expect(detail.getByRole('tab',{name:'Training setup',exact:true})).toHaveCount(0);
  await expect(detail.locator('.training')).toHaveCount(3);
  await expect(detail.locator('.support-deck')).toHaveCount(3);
  const firstBuild=detail.locator('.build-card').first();
  await expect(firstBuild).toHaveCSS('border-top-left-radius','0px');
  await expect(firstBuild).toHaveCSS('border-top-right-radius','0px');
  expect(await firstBuild.evaluate(build=>{
    const identity=build.querySelector('.build-identity')!.getBoundingClientRect(),stats=build.querySelector('.stat-overview')!.getBoundingClientRect(),aptitudes=build.querySelector('.aptitude-overview')!.getBoundingClientRect();
    return stats.top-identity.bottom<=10&&aptitudes.top-stats.bottom<=10;
  })).toBe(true);
  if(info.project.name==='chromium'){
    await expect(detail.locator('.training details')).toHaveCount(0);
    for(const section of ['.stat-overview','.aptitude-overview','.runner-results','.skills-section','.training-title','.support-section','.inheritance-section','.parent-factors']){
      const tops=await detail.locator('.build-card '+section).evaluateAll(sections=>sections.map(section=>section.getBoundingClientRect().top));
      expect(tops).toHaveLength(3);
      expect(Math.max(...tops)-Math.min(...tops)).toBeLessThan(2);
    }
  }else{
    const trainingToggle=firstBuild.getByRole('button',{name:'Training setup',exact:true});
    await expect(trainingToggle).toHaveAttribute('aria-expanded','false');
    await expect(firstBuild.locator('.support-deck')).not.toBeVisible();
    await trainingToggle.click();
    await expect(trainingToggle).toHaveAttribute('aria-expanded','true');
    await expect(firstBuild.locator('.support-deck')).toBeVisible();
  }
  const dialogContent=detail.locator('.content');
  expect(await detail.locator('.build-content').evaluateAll(contents=>contents.every(content=>!['auto','scroll'].includes(getComputedStyle(content).overflowY)))).toBe(true);
  if(await dialogContent.evaluate(content=>content.scrollHeight>content.clientHeight)){
    const headerTop=await firstBuild.locator('.build-identity').evaluate(header=>header.getBoundingClientRect().top);
    await dialogContent.evaluate(content=>content.scrollTop+=100);
    expect(await firstBuild.locator('.build-identity').evaluate(header=>header.getBoundingClientRect().top)).toBeLessThan(headerTop);
  }else{
    expect(await dialogContent.evaluate(content=>Array.from(content.querySelectorAll('.build-card')).every(build=>build.getBoundingClientRect().bottom<=content.getBoundingClientRect().bottom))).toBe(true);
  }
  await firstBuild.locator('.inheritance-section').scrollIntoViewIfNeeded();
  await firstBuild.locator('.parent-builds input[type="radio"]').nth(1).check();
  await expect(firstBuild.locator('.parent-builds input[type="radio"]').nth(1)).toBeChecked();
  await expect(detail.locator('.parent-sparks .spark').first()).toBeVisible();
  await page.screenshot({path:info.outputPath('cm-build.png')});
  await detail.getByRole('button',{name:'Add to lobby',exact:true}).click();
  await page.keyboard.press('Escape');
  await expect(openTeam).toBeFocused();
  await page.locator('.team-row .member').first().click();
  await expect(detail).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tab',{name:'Archetype Analysis',exact:true})).toHaveAttribute('aria-selected','true');
  for(let i=0;i<2;i++)await page.getByRole('button',{name:'Add to lobby',exact:true}).first().click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button',{name:'Lobby full',exact:true}).first()).toBeDisabled();
  await page.getByRole('tab',{name:'Lobby Builder 3/3',exact:true}).click();
  await expect(page.locator('.team .runner')).toHaveCount(9);
  await expect(page.getByRole('button',{name:'Run race',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Export lobby',exact:true})).toHaveCount(0);
  await expect(page.locator('.team .gate')).toHaveCount(9);
  await expect(page.getByRole('link',{name:'Original Hakuraku',exact:false})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'MIT license',exact:false})).toHaveCount(0);
  await page.getByLabel('Lobby seed',{exact:true}).fill('2147483648');
  await expect(page.getByRole('alert')).toContainText('32-bit');
  await page.getByLabel('Lobby seed',{exact:true}).fill('42');
  await page.locator('.gate').first().getByRole('combobox').click();
  await page.getByRole('option',{name:'Gate 1',exact:true}).click();
  await page.locator('.gate').nth(1).getByRole('combobox').click();
  await expect(page.getByRole('option',{name:'Gate 1',exact:true})).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.screenshot({path:info.outputPath('cm-lobby.png'),fullPage:true});
  await page.getByRole('tab',{name:'Archetype Analysis',exact:true}).click();
  await page.getByRole('tab',{name:'Lobby Builder 3/3',exact:true}).click();
  await expect(page.getByLabel('Lobby seed',{exact:true})).toHaveValue('42');
  await expect(page.locator('.gate').first().getByRole('combobox')).toContainText('Gate 1');
  expect(methods.every(method=>method==='GET')).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('master data executes SQLite, reports errors, inspects schemas and exports results',async({page},info)=>{
  await page.goto('/tools/master-data');
  await expect(page.getByRole('button',{name:'Run query',exact:true})).toBeEnabled({timeout:30000});
  await page.getByLabel('SQL query',{exact:true}).fill('SELECT COUNT(*) AS count FROM chara');
  await page.getByRole('button',{name:'Run query',exact:true}).click();
  await expect(page.getByRole('table',{name:'SQL query results',exact:true})).toContainText('count');
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export JSON',exact:true}).click();
  expect((await download).suggestedFilename()).toBe('master-data.json');
  await page.getByLabel('SQL query',{exact:true}).fill('SELECT * FROM missing_table');
  await page.getByRole('button',{name:'Run query',exact:true}).click();
  await expect(page.getByText('no such table: missing_table',{exact:true})).toBeVisible();
  await page.getByLabel('SQL query',{exact:true}).fill('SELECT * FROM chara LIMIT 10');
  await page.getByRole('button',{name:'Run query',exact:true}).click();
  await expect(page.getByText(/^10 rows ·/)).toBeVisible();
  await page.getByLabel('SQL query',{exact:true}).fill('DELETE FROM chara');
  await page.getByRole('button',{name:'Run query',exact:true}).click();
  await expect(page.getByText('attempt to write a readonly database',{exact:true})).toBeVisible();
  await page.getByLabel('SQL query',{exact:true}).fill('SELECT * FROM chara LIMIT 10');
  await page.getByRole('button',{name:'Run query',exact:true}).click();
  await expect(page.getByRole('table',{name:'SQL query results',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('master-browser.png'),fullPage:true});
  await page.getByRole('tab',{name:'Schema & References',exact:true}).click();
  await page.getByRole('heading',{name:'Columns',exact:true}).waitFor();
  await page.screenshot({path:info.outputPath('master-data.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test('research opens original notes with math, attachments, and mobile layouts in both themes',async({page},info)=>{
  await page.goto('/research');
  await expect(page.locator('.notes .note')).toHaveCount(10);
  await expect(page.locator('[data-route-id="research"]')).toHaveAttribute('data-page-width','wide');
  await page.screenshot({path:info.outputPath('research-library.png'),fullPage:true});
  await page.getByRole('combobox',{name:'Sort notes',exact:true}).click();
  await page.getByRole('option',{name:'Oldest first',exact:true}).click();
  await expect(page.locator('.notes .note').first()).toContainText('SingleModeUtils.CalcRelationPoint');
  await page.getByRole('combobox',{name:'Sort notes',exact:true}).click();
  await page.getByRole('option',{name:'Title A–Z',exact:true}).click();
  await expect(page.locator('.notes .note').first()).toContainText('A new age for Umamusume data');
  await page.getByRole('tab',{name:'Race mechanics 3',exact:true}).click();
  await expect(page.locator('.notes .note')).toHaveCount(3);
  await page.getByRole('searchbox',{name:'Search research',exact:true}).fill('spot struggle');
  await expect(page).toHaveURL(/topic=Race\+mechanics/);
  await page.reload();
  await expect(page.getByRole('searchbox',{name:'Search research',exact:true})).toHaveValue('spot struggle');
  await expect(page.locator('.notes .note')).toHaveCount(1);
  await page.locator('.notes .note').click();
  await expect(page.locator('.markdown .katex').first()).toBeVisible();
  if(info.project.name==='chromium'){
    await page.getByRole('navigation',{name:'Article outline'}).getByRole('link',{name:'Baseline mechanics',exact:true}).click();
    await expect(page).toHaveURL(/spot-struggle\?.*#section-0/);
    await expect(page.getByRole('heading',{name:'Baseline mechanics',exact:true})).toBeVisible();
  }
  if(info.project.name!=='chromium'){
    await page.getByRole('button',{name:'In this note',exact:true}).click();
    await page.getByRole('navigation',{name:'Article outline'}).getByRole('link',{name:'Baseline mechanics',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Baseline mechanics',exact:true})).toBeVisible();
  }
  for(const image of await page.locator('.markdown img').all()) {
    await image.evaluate(element=>element.scrollIntoView({block:'center'}));
    await expect.poll(()=>image.evaluate(element=>(element as HTMLImageElement).complete&&(element as HTMLImageElement).naturalWidth>0)).toBe(true);
  }
  await page.evaluate(()=>window.scrollTo(0,0));
  for(const theme of ['dark','light']) {
    await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({path:info.outputPath(`research-${theme}.png`)});
  }
  await expect(page.getByRole('navigation',{name:'More research notes',exact:true})).toContainText('Dueling mechanics');
  if(info.project.name==='chromium')await expect(page.getByRole('link',{name:'Race Analysis',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Back to research',exact:true}).click();
  await expect(page.getByRole('searchbox',{name:'Search research',exact:true})).toHaveValue('spot struggle');
  await expect(page.locator('.notes .note')).toHaveCount(1);
});

test('automatic resimulation falls back on failure and exposes simulator decisions',async({page},info)=>{
  test.setTimeout(120_000);
  await page.addInitScript(()=>localStorage.setItem('uma-browser-proof-v1',JSON.stringify({token:'test-browser-proof',expiresAt:Date.now()+300_000})));
  if(info.project.name==='chromium')await page.setViewportSize({width:1920,height:1080});
  const learnedSkills=(JSON.parse(readFileSync('tests/fixtures/resources/skills.json','utf8')) as {skill_id:number}[]).slice(0,18).map(skill=>skill.skill_id);
  for(const [name,json] of Object.entries(replayCourses))await page.route(`**/resources/*/${name}.json*`,route=>route.fulfill({json:name==='simulator_courses'?{...(json as object),race_parameters:{around_horse:{visible_distance_m:20}}}:json}));
  const bytes=Buffer.alloc(226);
  for(const [offset,value] of [[0,4],[4,1],[12,2],[16,12],[20,31],[28,3],[32,28],[190,2]])bytes.writeInt32LE(value!,offset!);
  for(let i=0;i<3;i++){
    const start=36+i*28;bytes.writeFloatLE(i,start);
    for(let h=0;h<2;h++){
      const p=start+4+h*12;
      bytes.writeFloatLE(i*15+h*2,p);bytes.writeUInt16LE(1000+h*1500,p+4);
      bytes.writeUInt16LE(1600+h*100,p+6);bytes.writeUInt16LE(1000-i*100,p+8);bytes.writeInt8(h===0?1:-1,p+11);
    }
  }
  for(let h=0;h<2;h++){
    const p=124+h*31;
    bytes.writeInt32LE(1-h,p);bytes.writeFloatLE(120+h,p+4);bytes.writeFloatLE(.04,p+12);
    bytes.writeFloatLE(1600,p+18);bytes[p+22]=2;bytes.writeFloatLE(2-h*.1,p+27);
    const e=194+h*16;bytes.writeInt16LE(14,e);bytes.writeFloatLE(.5,e+2);bytes[e+6]=3;bytes[e+7]=2;
    bytes.writeInt32LE(h,e+8);bytes.writeInt32LE(learnedSkills[0]!,e+12);
  }
  const raw={race_course_set:{id:10606,lane_distance_max:16.875},race_scenario:gzipSync(bytes).toString('base64'),
    race_horse_data_array:[{frame_order:2,card_id:100201,chara_name:'Blocker Suzuka',speed:1200,stamina:900,power:1150,guts:700,wiz:1050,proper_running_style_nige:1,proper_running_style_senko:7,proper_ground_turf:7,proper_distance_middle:8,skill_array:learnedSkills},
      {frame_order:1,card_id:100101,chara_name:'Inspected Special Week',speed:1100,stamina:850,power:1200,guts:650,wiz:1150,proper_running_style_nige:1,proper_running_style_senko:6,proper_ground_turf:7,proper_ground_dirt:1,proper_distance_middle:8,proper_distance_long:2,skill_array:learnedSkills,support_card_list:[{support_card_id:30001,limit_break_count:4}],
      factor_info_array:[{factor_id:1001,level:3}],succession_chara_array:[{position_id:10,card_id:100201,factor_info_array:[{factor_id:1001,level:3}]}]}]};
  const response={engineBuild:'test-contract-v7',seed:7,replay:{encoding:'base64',compression:'gzip',format:'uma-race-binary',data:raw.race_scenario},
    diagnostics:{simulationMilliseconds:12},annotations:{schemaVersion:7,flags:{positionKeepPaceUp:4,downhill:32,dueling:128},sampleTimes:[0,1,2],
      paceMakerSpans:[{startTime:0,endTime:2,horseIndex:1}],horses:[0,1].map(h=>({horseIndex:h,
        spans:[{startTime:0,endTime:1,mask:4,phase:0},{startTime:1,endTime:2,mask:160,phase:2}],
        frontBlockSpans:h===0?[{startTime:.25,endTime:1.5,blockerHorseIndex:1}]:[],
        positionKeepReferenceSpans:[{startTime:0,endTime:2,referenceHorseIndex:1-h}],
        baseTargetSpeedSections:Array.from({length:24},(_,sectionIndex)=>{
          const phase=sectionIndex<4?0:sectionIndex<16?1:2,rng=[-1.2,.1,-.55,.25,-.95,0][sectionIndex%6]!;
          return {sectionIndex,phase,baseTargetSpeed:(phase===0?18:phase===1?19:22)+rng*.1975,random:rng,randomPercentage:rng};
        }),
        activeSkillSpans:[{startTime:.5,endTime:1.5,skillId:learnedSkills[0]!,detailIndex:0}],
        skillActivationDecisions:learnedSkills.map((skillId,i)=>({skillId,required:true,passed:i<2,roll:i===0?22:i===1?30:91,threshold:h===1&&i===1?75:80,activated:i===0})),
        targetSpeeds:[19,20,21],accelerationRates:[1.2,.2,null],startHp:1000,finalHp:800,maxHp:1000,hpDeficit:0,
        hpExhaustedDistance:null,lostStartAccelerationFrame:h===0,worldTransformDistanceLoss:3.25,popularity:h+1,
        hpSkillApplications:[.4,.7,1,1.2,1.5,1.8].map((time,i)=>({time,skillId:learnedSkills[i]!,casterHorseIndex:i%2,targetHorseIndex:0,requestedHpDelta:-30,appliedHpDelta:-30})),
        lastSpurtDecision:{result:'True',checkDistance:1600,checkHp:500,fullSpurtNeedHp:550,fullSpurtTargetSpeed:22,selectedStartDistance:h===0?1620:1600,selectedTargetSpeed:h===0?21:22,delayPenalty:h===0,speedPenalty:h===0,calculationCount:3,time:1},
        futureField:{preserved:'yes'}
      }))}};
  let calls=0;
  await page.route('**/api/sim/races/resimulate',async route=>{
    expect(route.request().postDataJSON()).toEqual({capture:raw,courseId:10606});
    expect(route.request().headers()['x-api-key']).toBeUndefined();
    expect(route.request().headers()['x-browser-proof']).toBe('test-browser-proof');
    calls++;
    await route.fulfill(calls===1?{status:403,json:{error:'Simulator access is required'}}:{json:response});
  });
  await page.goto('/competitive/race-analysis');
  await page.locator('#race-upload').setInputFiles({name:'diagnostics.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw))});
  await expect(page.locator('.field-runner.chosen')).toContainText('Inspected Special Week');
  await expect(page.getByRole('button',{name:'Detailed simulation',exact:true})).toHaveCount(0);
  await expect(page.getByRole('dialog',{name:'Detailed simulation',exact:true})).toHaveCount(0);
  await expect(page.getByLabel('Seed override (optional)',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Run resimulation',exact:true})).toHaveCount(0);
  await expect(page.locator('.banner--warning')).toContainText('Resimulation failed; recorded replays were kept');
  await expect(page.locator('.banner--warning')).toContainText('Simulator access is required');
  await openRaceSection(page,'Runner analysis');
  await expect(page.locator('.live-diagnostics')).toHaveCount(0);
  await expect(page.locator('.runner-outcomes .fallback')).toContainText('Showing recorded skill activations and blocking events');
  await expect(page.locator('.runner-outcomes .outcome-summary')).toHaveCount(0);
  await page.getByRole('button',{name:'Remove race',exact:true}).click();
  await page.locator('#race-upload').setInputFiles({name:'diagnostics.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(raw))});
  await expect(page.locator('.capture-summary')).toContainText('Detailed resimulation');
  expect(calls).toBe(2);
  await openRaceSection(page,'Runner analysis');
  await expect(page.locator('.runner-outcomes')).toContainText('test-contract-v7');
  await expect(page.locator('.runner-outcomes .fallback')).toHaveCount(0);
  await openRaceSection(page,'Race replay');
  const scrubber=page.getByLabel('Replay time',{exact:true});
  await scrubber.evaluate(e=>{(e as HTMLInputElement).value='1';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await openRaceSection(page,'Runner analysis');
  await page.getByRole('button',{name:'Following details',exact:true}).click();
  await expect(page.locator('.live-diagnostics')).toContainText('20.00 m/s');
  await expect(page.locator('.runner-snapshot')).toContainText('0.5s left');
  await page.getByRole('button',{name:'Close Following details',exact:true}).click();
  const activity=page.getByRole('region',{name:'Skill activity timeline',exact:true});
  await expect(activity.locator('.skill-period:not(.activation-only)')).toHaveCount(1);
  await activity.getByRole('button',{name:'Skill activity details',exact:true}).click();
  const rollHelp=page.getByRole('dialog',{name:'Skill activity details',exact:true});
  await expect(rollHelp).toContainText('1.00 s active');
  await expect(rollHelp).toContainText('22.00%');
  await expect(rollHelp).toContainText('80.00%');
  await rollHelp.getByRole('button',{name:'Close Skill activity details',exact:true}).click();
  await expect(activity.locator('.skill-period')).toHaveAttribute('title',/active from 0\.50 to 1\.50 s \(1\.00 s\)/);
  await expect(activity.locator('.axis')).toHaveCount(0);
  await expect(page.locator('.time-ticks')).toHaveCount(1);
  await expect(page.locator('.time-ticks')).toContainText('0:00');
  await expect(page.locator('.time-label')).toHaveText('Time m:ss');
  expect(await page.locator('.playback').evaluate(element=>{
    const axis=element.querySelector('.time-axis')!.getBoundingClientRect();
    const aligned=[...element.querySelectorAll<HTMLElement>('.time-ticks>span')].every(tick=>{
      const box=tick.getBoundingClientRect();return Math.abs(box.left+box.width/2-axis.left-axis.width*parseFloat(tick.style.left)/100)<1;
    });
    return aligned&&Math.abs(element.querySelector('.time-label')!.getBoundingClientRect().left-element.querySelector('.timeline-labels')!.getBoundingClientRect().left)<1;
  })).toBe(true);
  expect((await page.locator('.time-ticks>span').allTextContents()).every(label=>/^\d+:[0-5]\d(?:\.\d)?$/.test(label))).toBe(true);
  await activity.screenshot({path:info.outputPath('skill-activity.png')});
  await activity.locator('.skill-period').click();
  await expect(scrubber).toHaveValue('0.5');
  await scrubber.evaluate(e=>{(e as HTMLInputElement).value='1';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await openRaceSection(page,'Race replay');
  await expect(page.locator('.map-blocker')).toContainText('Blocker Suzuka');
  await expect(page.locator('.map-runner.blocker')).toHaveCount(1);
  await expect(page.locator('.map-runner.triggered')).not.toHaveCount(0);
  await expect(page.locator('.view-cone')).toBeVisible();
  await expect(page.locator('.block-connection')).toBeVisible();
  await openRaceSection(page,'Runner analysis');
  await page.locator('.blocked-by').click();
  await expect(page.locator('.runner-card')).toContainText('Blocker Suzuka');
  await expect(page.locator('.blocked-by')).toHaveCount(0);
  await page.getByRole('radio',{name:'Target speed',exact:true}).click();
  await expect(page.getByRole('radio',{name:'Target speed',exact:true})).toHaveAttribute('aria-checked','true');
  await openRaceSection(page,'Race results');
  const results=page.getByRole('table',{name:'Race results',exact:true});
  await expect(results.getByRole('columnheader',{name:'HP result',exact:true})).toBeVisible();
  await expect(page.getByRole('radiogroup',{name:'Results columns',exact:true})).toHaveCount(0);
  await expect(results.getByRole('columnheader')).toHaveCount(10);
  await expect(results).toContainText('3.25');
  await expect(results).toContainText('1.25');
  await expect(results).toContainText('Downhill');
  await expect(results.getByRole('columnheader',{name:'Spurt delay',exact:true})).toBeVisible();
  const delayHelp=results.getByRole('button',{name:'About Start delay',exact:true});
  if(info.project.name==='chromium')await delayHelp.hover();else await delayHelp.click();
  const delayExplanation=page.getByRole('dialog',{name:'About Start delay',exact:true});
  await expect(delayExplanation).toContainText('66.6 ms');
  await expect(delayExplanation).toContainText('80 ms');
  await delayExplanation.getByRole('button',{name:'Close About Start delay',exact:true}).click();
  await results.getByRole('button',{name:'About Spurt delay',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'About Spurt delay',exact:true})).toContainText('negative value in parentheses');
  await page.getByRole('button',{name:'Close About Spurt delay',exact:true}).click();
  await expect(results.locator('.spurt-result .warning').first()).toHaveText('Delay: 20.0 m');
  await expect(results.locator('.spurt-result')).toContainText([/Delay: 0\.0 m\s*Speed: 22\.00 m\/s/,/Delay: 20\.0 m\s*Speed: 21\.00 m\/s\s*\(−1\.00\)/]);
  await expect(results.locator('.spurt-result .clean').first()).toHaveText('Delay: 0.0 m');
  await results.screenshot({path:info.outputPath('detailed-race-results.png'),style:'.utility-bar,.report-navigation{visibility:hidden !important}'});
  await results.getByRole('button',{name:'Inspect Inspected Special Week',exact:true}).click();
  const analysis=page.locator('.runner-panel'),details=page.locator('.runner-outcomes');
  await expect(details.locator('.outcome-summary')).toContainText('800');
  await expect(details.locator('.outcome-summary')).toContainText('Delayed');
  await expect(analysis.getByRole('tablist')).toHaveCount(0);
  await expect(analysis.locator('.runner-card .build')).toHaveClass(/compact/);
  await expect(analysis.locator('.runner-card .stat-overview')).toContainText('Total stats');
  await expect(analysis.getByRole('combobox',{name:'Inspect runner',exact:true})).toHaveCount(0);
  await expect(analysis.getByRole('button',{name:'Watch replay',exact:true})).toHaveCount(0);
  expect(await analysis.locator('.runner-card').evaluate(element=>getComputedStyle(element).borderTopWidth)).toBe('0px');
  if(info.project.name==='chromium'){
    expect((await analysis.locator('.runner-card').boundingBox())!.height).toBeLessThan(90);
    const identity=(await analysis.locator('.runner-card .build-identity').boundingBox())!,stats=(await analysis.locator('.runner-card .stat-overview').boundingBox())!;
    expect(Math.abs(identity.y+identity.height/2-stats.y-stats.height/2)).toBeLessThan(2);
    expect((await details.locator('.runner-overview').boundingBox())!.height).toBeLessThan(165);
  }
  await analysis.locator('.runner-overview').screenshot({path:info.outputPath('runner-cm-overview.png')});
  await analysis.getByRole('button',{name:'Choose runner',exact:true}).click();
  const picker=page.getByRole('dialog',{name:'Choose runner',exact:true});
  await expect(picker.locator('.runner-choice .build.compact')).toHaveCount(2);
  await expect(picker.getByRole('button',{name:'Gate 1 · Inspected Special Week',exact:true})).toHaveAttribute('aria-pressed','true');
  await picker.screenshot({path:info.outputPath('runner-cm-picker.png')});
  await picker.getByRole('button',{name:'Gate 1 · Inspected Special Week',exact:true}).click();
  await expect(analysis.locator('.race-aptitudes [aria-label="Pace: B"]')).toBeVisible();
  await expect(analysis.locator('.race-aptitudes [aria-label="Turf: A"]')).toBeVisible();
  await expect(analysis.locator('.race-aptitudes [aria-label="Medium: S"]')).toBeVisible();
  await expect(details.getByRole('table',{name:'Runner skill analysis',exact:true})).toContainText('22.00');
  await expect(details.locator('.activation-threshold')).toContainText('80.00%');
  await expect(details.getByRole('table',{name:'Runner skill analysis',exact:true})).toContainText('Wit check failed');
  await expect(details.getByRole('table',{name:'Runner skill analysis',exact:true})).toContainText('22.00%');
  await expect(details.getByRole('table',{name:'Runner skill analysis',exact:true})).toContainText('91.00%');
  await expect(details.locator('.activation-threshold')).toContainText('Wit checks pass below');
  expect(await details.getByRole('table',{name:'Runner skill analysis',exact:true}).textContent()).not.toContain('22.00% < 80.00%');
  await details.locator('.skills-report').screenshot({path:info.outputPath('skill-performance.png')});
  await expect(details.getByRole('table',{name:'Runner skill analysis',exact:true})).toContainText('Passed wit check, failed condition');
  await details.getByRole('button',{name:'About Wit check',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'About Wit check',exact:true})).toContainText('race conditions still need to be met');
  await page.getByRole('button',{name:'Close About Wit check',exact:true}).click();
  await expect(details.getByRole('table',{name:'Runner skill analysis',exact:true}).getByRole('columnheader',{name:'Wit threshold (%)',exact:true})).toHaveCount(0);
  await expect(details.getByRole('table',{name:'Runner skill analysis',exact:true})).toHaveAttribute('aria-rowcount','19');
  expect(await details.getByRole('region',{name:'Runner skill analysis scroll area',exact:true}).evaluate(element=>element.scrollHeight-element.clientHeight)).toBeLessThanOrEqual(1);
  await expect(details.getByRole('button',{name:'Race mode periods',exact:true})).toHaveCount(0);
  await details.getByRole('button',{name:'Show Downhill periods',exact:true}).click();
  const downhillPeriods=details.getByRole('list',{name:'Downhill periods',exact:true});
  await expect(downhillPeriods).toContainText('1.000');
  await expect(downhillPeriods).toContainText('2.000');
  await downhillPeriods.getByRole('button',{name:'1.000 s ↗',exact:true}).click();
  await expect(scrubber).toHaveValue('1');
  await openRaceSection(page,'Runner analysis');
  await details.getByRole('button',{name:'Show Downhill periods',exact:true}).click();
  const spurtCalculation=details.getByRole('button',{name:'Last-spurt calculation',exact:true});
  await spurtCalculation.click();
  await expect(details.getByRole('table',{name:'Full and selected spurt',exact:true})).toContainText('1,620');
  await expect(details.locator('.hp-equation')).toContainText('-50.00');
  await expect(details.locator('.spurt-result')).toContainText('20 m delay');
  await expect(details.locator('.spurt-result')).toContainText('1 m/s slower');
  await expect(details.locator('.spurt-result')).toContainText('3 calculations');
  await expect(details.getByRole('button',{name:'Last-spurt decision details',exact:true})).toHaveCount(0);
  await details.locator('.spurt-report').screenshot({path:info.outputPath('last-spurt-calculation.png')});
  await spurtCalculation.click();
  if(info.project.name==='chromium')expect((await details.locator('.report-grid').boundingBox())!.height).toBeLessThan(650);
  await analysis.screenshot({path:info.outputPath('runner-analysis-overview.png')});
  await expect(details.getByRole('table',{name:'Simulator telemetry samples',exact:true})).toBeVisible();
  await expect(details.getByRole('table',{name:'Skill active periods',exact:true})).toHaveCount(0);
  await expect(details.locator('.reference-panel')).toBeVisible();
  await expect(details.getByRole('table',{name:'HP change details',exact:true})).toHaveCount(1);
  await details.locator('.pace-chart').scrollIntoViewIfNeeded();
  await expect(details.getByRole('figure',{name:'Simulator pace over time',exact:true})).toBeVisible();
  const rngChart=details.getByRole('figure',{name:'Base target speed and RNG by course section',exact:true});
  await expect(rngChart.locator('svg')).toBeVisible();
  await expect(details.locator('.rng-summary')).toContainText('Average RNG -0.39%');
  await expect(details.locator('pre')).toHaveCount(0);
  await details.locator('.measurements').screenshot({path:info.outputPath('runner-measurements.png')});
  await rngChart.scrollIntoViewIfNeeded();
  const rngBounds=(await rngChart.locator('.chart-host').boundingBox())!;
  await page.mouse.move(rngBounds.x+48+(rngBounds.width-60)/48,rngBounds.y+160);
  await expect(page.locator('[class*="chart-tooltip-"]').filter({hasText:'RNG: -1.20% (slower)'})).toBeVisible();
  await rngChart.screenshot({path:info.outputPath('section-speed-rng.png')});
  await page.mouse.move(0,0);
  const measurementToggle=details.getByRole('button',{name:'Detailed measurements & simulation data',exact:true});
  const chartBottom=rngBounds.y+rngBounds.height;
  expect((await measurementToggle.boundingBox())!.y).toBeGreaterThanOrEqual(chartBottom);
  await expect(measurementToggle).toHaveAttribute('aria-expanded','true');
  await expect(details.getByRole('list',{name:'Position keeping periods',exact:true})).toContainText('Blocker Suzuka');
  await expect(details.getByRole('list',{name:'Race pacemakers periods',exact:true})).toContainText('Blocker Suzuka');
  const sectionTable=page.getByRole('table',{name:'Base target speed by section',exact:true});
  await expect(sectionTable).toHaveAttribute('aria-rowcount','25');
  await expect(sectionTable.getByRole('columnheader')).toHaveCount(5);
  await expect(sectionTable).toContainText('-1.20%');
  await expect(sectionTable).toContainText('+0.25%');
  await sectionTable.getByRole('button',{name:'Section 1 ↗',exact:true}).click();
  await expect(scrubber).toHaveValue('0');
  await openRaceSection(page,'Runner analysis');
  await expect(details.getByRole('button',{name:'Course section speed details',exact:true})).toHaveCount(0);
  await expect(details.getByRole('button',{name:'Exact telemetry samples',exact:true})).toHaveCount(0);
  await details.locator('.measurement-data').screenshot({path:info.outputPath('measurement-tables-expanded.png')});
  await details.getByRole('table',{name:'Simulator telemetry samples',exact:true}).getByRole('button',{name:'1.000 s ↗',exact:true}).click();
  await expect(scrubber).toHaveValue('1');
  await openRaceSection(page,'Runner analysis');
  await details.getByRole('button',{name:'Detailed measurements & simulation data',exact:true}).click();
  await expect(page.getByRole('region',{name:'Blocking incidents',exact:true}).getByRole('button',{name:/Review .*blocked by/})).toHaveCount(1);
  await page.getByRole('button',{name:'Choose runner',exact:true}).click();
  await page.getByRole('dialog',{name:'Choose runner',exact:true}).getByRole('button',{name:'Gate 2 · Blocker Suzuka',exact:true}).click();
  await expect(details.locator('.outcome-summary')).toContainText('Clean');
  await expect(analysis.locator('.race-aptitudes [aria-label="Pace: A"]')).toBeVisible();
  await expect(details.locator('.activation-threshold')).toHaveCount(0);
  await expect(details.getByRole('table',{name:'Runner skill analysis',exact:true})).toContainText('Pass below 75.00%');
  await expect(details.getByRole('table',{name:'Runner skill analysis',exact:true}).getByRole('columnheader',{name:'Wit threshold (%)',exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Blocking incidents',exact:true})).toContainText('No front blocking recorded');
  await page.getByRole('button',{name:'Choose runner',exact:true}).click();
  await page.getByRole('dialog',{name:'Choose runner',exact:true}).getByRole('button',{name:'Gate 1 · Inspected Special Week',exact:true}).click();
  await details.getByRole('button',{name:'Detailed measurements & simulation data',exact:true}).click();
  await details.getByRole('button',{name:'Raw simulator response',exact:true}).click();
  await expect(details.locator('pre')).toContainText('lostStartAccelerationFrame');
  await expect(details).toContainText('"futureField"');
  await details.getByRole('button',{name:'Raw simulator response',exact:true}).click();
  await page.getByRole('button',{name:'Build details',exact:true}).click();
  const runnerBuild=page.getByRole('dialog',{name:'Runner build',exact:true});
  await expect(runnerBuild.locator('.build')).toHaveClass(/compact/);
  await expect(runnerBuild).toContainText('Learned skills');
  await expect(runnerBuild.getByRole('button',{name:'Watch replay',exact:true})).toHaveCount(0);
  await expect(runnerBuild.locator('.race-build-card')).toHaveCSS('border-top-width','0px');
  if(info.project.name==='mobile-chromium')await runnerBuild.getByRole('button',{name:'Training setup',exact:true}).click();
  await expect(runnerBuild).toContainText('Support deck');
  await expect(runnerBuild.locator('.support-deck')).toBeVisible();
  await expect(runnerBuild.locator('.parent-builds input[type=radio]').first()).toBeChecked();
  await expect(runnerBuild.locator('.parent-factors .parent-sparks')).toBeVisible();
  await expect(runnerBuild.locator('.full-aptitudes')).toBeVisible();
  expect(await runnerBuild.evaluate(dialog=>dialog.scrollWidth<=dialog.clientWidth)).toBe(true);
  await runnerBuild.screenshot({path:info.outputPath('runner-build-cm-layout.png')});
  await expect(runnerBuild).toContainText('Parent 1');
  await runnerBuild.getByRole('button',{name:'Close dialog',exact:true}).click();
  const hpChanges=details.getByRole('table',{name:'HP change details',exact:true});
  await expect(hpChanges.getByRole('columnheader',{name:'Source',exact:true})).toHaveCount(1);
  await expect(hpChanges.getByRole('columnheader',{name:'HP change',exact:true})).toHaveCount(1);
  await expect(hpChanges.locator('.detail-skill')).toHaveCount(0);
  await hpChanges.scrollIntoViewIfNeeded();
  await expect(hpChanges).toHaveCount(1);
  await expect(details.getByRole('list',{name:'Recovery & HP changes',exact:true})).toHaveCount(0);
  await expect(hpChanges).toContainText('-30');
  await expect(hpChanges).toContainText('-3.0%');
  await expect(hpChanges).toContainText('≈ 930 → 900');
  await expect(hpChanges).not.toContainText('Requested');
  await expect(hpChanges.locator('.detail-transition')).toHaveCount(6);
  expect((await hpChanges.locator('.detail-transition').allTextContents()).every(value=>/≈ \d+ → \d+/.test(value))).toBe(true);
  await analysis.screenshot({path:info.outputPath('runner-analysis-hp.png')});
  await details.locator('.hp-application-details').screenshot({path:info.outputPath('hp-change-rows.png')});
  await page.locator('.runner-outcomes').screenshot({path:info.outputPath('resimulation-details.png')});
  await page.getByRole('button',{name:'Add race files',exact:true}).click();
  await page.locator('#race-upload').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({capture:raw,resimulation:{}}))});
  await expect(page.locator('.banner--danger')).toContainText('Invalid detailed simulator response');
  await page.getByRole('dialog',{name:'Add race files',exact:true}).getByRole('button',{name:'Close dialog',exact:true}).click();
  await expect(page.locator('.runner-outcomes')).toContainText('test-contract-v7');
  await expect(page.locator('.capture-summary')).toContainText('Detailed resimulation');
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export detailed replay',exact:true}).click();
  const exported=JSON.parse(readFileSync((await (await download).path())!).toString());
  expect(exported).toEqual({capture:raw,resimulation:response,courseId:10606});
  expect(JSON.stringify(exported)).not.toContain('test-only-key');
  await openRaceSection(page,'Race results');
  await page.getByRole('button',{name:'Remove race',exact:true}).click();
  await page.locator('#race-upload').setInputFiles({name:'detailed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});
  await openRaceSection(page,'Runner analysis');
  await page.getByRole('button',{name:'Following details',exact:true}).click();
  await expect(page.locator('.live-diagnostics')).toBeVisible();
  await page.getByRole('button',{name:'Close Following details',exact:true}).click();
  expect(calls).toBe(2); // Exported detailed captures already contain the simulation.
  // Exercise the expanded report with enough real skill rows to expose spacing and clipping.
  const reportHorse=response.annotations.horses[0]!;
  reportHorse.activeSkillSpans.push(...learnedSkills.slice(1,12).map((skillId,i)=>({skillId,startTime:.1+i*.1,endTime:.3+i*.1,detailIndex:0})));
  Object.assign(reportHorse,{
    sampleTimes:Array.from({length:21},(_,i)=>i/10),
    targetSpeeds:Array.from({length:21},(_,i)=>19+i/10),
    accelerationRates:Array.from({length:21},(_,i)=>i===20?-2:1.2),
    temptationDecision:{enabled:false,preventedByModifier:false,roll:99,threshold:11.335,startSection:-1},
    positionKeepDecisions:[{time:.25,sequence:1,attemptedMode:3,referenceHorseIndex:1,outcome:'FailedRoll',roll:85,threshold:70},{time:.75,sequence:2,attemptedMode:3,referenceHorseIndex:1,outcome:'Started',roll:20,threshold:70}]
  });
  reportHorse.hpSkillApplications[5]!.appliedHpDelta=0;
  await page.getByRole('button',{name:'Remove race',exact:true}).click();
  await page.locator('#race-upload').setInputFiles({name:'report.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({capture:raw,resimulation:response,courseId:10606}))});
  await expect(page.locator('.capture-summary')).toContainText('Detailed resimulation');
  expect(calls).toBe(2);
  await openRaceSection(page,'Runner analysis');
  const reportToggle=details.getByRole('button',{name:'Detailed measurements & simulation data',exact:true});
  if(await reportToggle.getAttribute('aria-expanded')!=='true')await reportToggle.click();
  await expect(details.getByRole('table',{name:'Skill active periods',exact:true})).toHaveCount(0);
  await expect(details.getByRole('button',{name:'Skill active periods',exact:true})).toHaveCount(0);
  const references=details.locator('.reference-panel'),decisionPanel=details.locator('.position-decisions');
  await expect(references.getByRole('button',{name:'Position keeping',exact:true})).toHaveAttribute('aria-expanded','true');
  await expect(references.getByRole('button',{name:'Race pacemakers',exact:true})).toHaveAttribute('aria-expanded','true');
  const referenceBounds=(await references.boundingBox())!,decisionBounds=(await decisionPanel.boundingBox())!;
  if(info.project.name==='chromium'){
    expect(Math.abs(referenceBounds.y-decisionBounds.y)).toBeLessThan(1);
    expect(Math.abs(referenceBounds.height-decisionBounds.height)).toBeLessThan(1);
    expect(decisionBounds.x).toBeGreaterThanOrEqual(referenceBounds.x+referenceBounds.width);
  } else expect(decisionBounds.y).toBeGreaterThanOrEqual(referenceBounds.y+referenceBounds.height);
  await expect(details.getByRole('button',{name:'Recovery & HP changes',exact:true})).toHaveAttribute('aria-expanded','true');
  const applications=details.getByRole('table',{name:'HP change details',exact:true});
  await applications.scrollIntoViewIfNeeded();
  await expect(applications.getByRole('columnheader')).toHaveCount(5);
  await expect(applications).toContainText('Requested -30.00');
  await expect(applications.locator('.application-change small')).toHaveCount(1);
  await expect(applications).toContainText('0.0%');
  await expect(applications).toContainText('≈');
  await expect(details.getByRole('button',{name:'Rushing details',exact:true})).toHaveAttribute('aria-expanded','true');
  await expect(details.locator('.rushing-summary')).toContainText('No rushing');
  await expect(details.locator('.rushing-summary')).toContainText('Check 99%');
  await expect(details.locator('.rushing-summary')).toContainText('Rushing chance 11.34%');
  await expect(details.locator('.rushing-summary')).toContainText('Not scheduled');
  await expect(details.locator('.rushing-summary')).not.toContainText('-1');
  await expect(details.getByRole('button',{name:'Position-keep decisions',exact:true})).toHaveAttribute('aria-expanded','true');
  const decisions=details.getByRole('table',{name:'Position-keep decisions',exact:true});
  await expect(decisions).toContainText('Pace up');
  await expect(decisions).toContainText('Roll failed');
  await expect(decisions).toContainText('85.00%');
  await expect(decisions.getByRole('columnheader',{name:'Sequence',exact:true})).toHaveCount(0);
  await details.locator('.measurement-data').screenshot({path:info.outputPath('runner-details-redesigned.png'),style:'.utility-bar,.report-navigation{visibility:hidden !important}'});
  await decisions.getByRole('button',{name:'0.250 s ↗',exact:true}).click();
  await expect(scrubber).toHaveValue('0.25');
  await openRaceSection(page,'Runner analysis');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});
