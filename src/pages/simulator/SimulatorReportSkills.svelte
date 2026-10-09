<script lang="ts">
  import {onMount,onDestroy} from 'svelte';
  import Button from '@/components/Button.svelte';
  import RunnerReference from '@/pages/competitive/RunnerReference.svelte';
  import RaceSkill from '@/pages/competitive/RaceSkill.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import {skillPointTotal,loadSkillCatalog,type SkillCatalogEntry} from '@/lib/catalog/skill-catalog';
  import {theme} from '@/stores/theme';
  import {binomialProbabilities} from '@/lib/timeline/planner-pull-probability';
  import {skillDistributions,skillHistogram,type SkillDistributionRow} from './skill-distributions';
  import {distributionChart} from './distribution-chart';
  import {prioritySkills,runnerColor,reportNumber as n,compareOutcomes} from './simulation-report';
  import {simulatorRepository,type MonteCarloResult} from './simulator-repository';
  import type {SimulatorUma} from './simulator-uma';
  import type {MonteCarloInput} from './race-sim-request';
  let {result,input,umas,selected,order,distance,onselect,oninspect,suspended=false}:{result:MonteCarloResult;input?:MonteCarloInput;umas:SimulatorUma[];selected:number[];order:number[];distance:number;onselect:(source:number)=>void;oninspect:(source:number)=>void;suspended?:boolean}=$props();
  let catalog=$state.raw(new Map<number,SkillCatalogEntry>()),loaded=$state(false),running=$state(false),cancelled=$state(false),error=$state(''),completed=$state(0),activeSkill=$state(0);
  let impact=$state.raw(new Map<string,ReturnType<typeof compareOutcomes>>());
  let request:AbortController|undefined;
  let activeSource=$state(-1);
  
  let expanded=$state<Record<number,boolean>>({}),recordsOpen=$state(false),ownerOpen=$state<Record<number,boolean>>({}),effectPage=$state<Record<number,number>>({});
  let data=$state.raw<{source:number;rows:ReturnType<typeof prioritySkills>}[]>([]),destroyed=false;
  const ordered=$derived([...data].sort((a,b)=>order.indexOf(a.source)-order.indexOf(b.source)));
  const priorities=$derived(data.map(r=>({source:r.source,ids:r.rows.filter(row=>umas[r.source]!.skills.some(s=>s.skillId===row.id)).slice(0,4).map(row=>row.id)})));
  const budget=$derived(priorities.reduce((sum,r)=>sum+r.ids.length,0));
  const owners=$derived(data.flatMap(r=>{const row=r.rows.find(s=>s.id===activeSkill);return row?[{source:r.source,row}]:[];}));
  const chartOwners=$derived(owners.filter(o=>selected.includes(o.source)).slice(0,4));
  const measured=(source:number,id:number)=>impact.get(source+':'+id);
  onMount(()=>{
    void loadSkillCatalog().then(async v=>{
      catalog=v;
      for(const [source,uma] of umas.entries()){
        await new Promise<void>(resolve=>setTimeout(resolve,0));
        if(destroyed)return;
        data=[...data,{source,rows:prioritySkills(uma,skillDistributions(result,source,uma.skills.map(s=>s.skillId)).rows,catalog,distance,result)}];
      }
      loaded=true;
    }).catch(()=>error='Skill labels could not be loaded. Retry by reloading the page.');

  });
  onDestroy(()=>{destroyed=true;cancelled=true;request?.abort();});

  async function test(source:number,ids:number[],count:number,signal:AbortSignal) {
    if(!input||!ids.length)return;
    const response=await simulatorRepository.comparison({body:{input,seeds:result.seeds.slice(0,count),source_input_index:source,alternatives:ids.map(id=>({name:String(id),remove_skill:id}))},signal});
    if(signal.aborted)return;
    const next=new Map(impact);
    response.result.alternatives.forEach(([id,r])=>next.set(source+':'+id,compareOutcomes(result,r,source)));
    impact=next;
  }
  $effect(()=>{if(suspended&&running){cancelled=true;request?.abort();}});
  async function priorityTest(source:number) {
    running=true;cancelled=false;error='';request=new AbortController();
    const priority=priorities.find(r=>r.source===source)!;completed=priority.ids.filter(id=>measured(source,id)).length;
    try {const ids=priority.ids.filter(id=>!measured(source,id));await test(source,ids,Math.min(32,result.runs),request.signal);completed+=ids.length;}
    catch(reason){cancelled=true;if(!request.signal.aborted)error=reason instanceof Error?reason.message:'Could not measure skill impact.';}
    finally {running=false;}
  }
  async function manual(source:number,id:number,count:number) {
    if(running)return;
    running=true;error='';request=new AbortController();
    try{await test(source,[id],count,request.signal);}catch(reason){if(!request.signal.aborted)error=reason instanceof Error?reason.message:'Could not measure skill impact.';}finally{running=false;}
  }
  function selectSkill(source:number,id:number){activeSkill=id;activeSource=source;oninspect(source);}
  function chart(mode:string) {
    const rows=chartOwners;
    const max=mode==='binomial'?result.runs:mode==='distance'?distance:mode==='duration'?Math.max(1,...rows.map(o=>o.row.durations?.max??0)):mode==='counts'?Math.max(1,...rows.map(o=>o.row.countSummary?.max??0)):Math.max(1,...rows.map(o=>o.row.timing?.max??0));
    const discrete=mode==='binomial'||mode==='counts';
    const series=rows.map(({source,row})=>({name:umas[source]!.name+' · #'+(source+1),color:runnerColor(source),values:mode==='binomial'?binomialProbabilities(result.runs,row.triggered/result.runs).map(v=>v*100):skillHistogram(row,mode,max,discrete?max+1:24),mean:mode==='binomial'?row.triggered:mode==='distance'?row.distance:mode==='duration'?row.duration:mode==='counts'?row.total/result.runs:row.time}));
    let min=0,limit=max;
    if(mode==='binomial'&&series.length){
      const visible=series.flatMap(s=>s.values.flatMap((v,i)=>v>=.001?[i]:[]));
      min=Math.max(0,Math.min(...visible)-1);limit=Math.min(max,Math.max(...visible)+1);
      series.forEach(s=>s.values=s.values.slice(min,limit+1));
    }
    return distributionChart(series,min,limit,mode==='binomial'?'races':mode==='distance'?'m':mode==='counts'?'procs':'s',$theme==='dark',discrete);
  }
  function rejected(source:number,id:number) {
    const runner=result.report?.runners.find(r=>r.source_input_index===source);
    const checks=runner?.skill_checks??runner?.diagnostics.flatMap(d=>d.skill_checks??[])??[];
    return [0,1,2].map(k=>checks.filter(c=>c[0]===id).reduce((sum,c)=>sum+c[2][k]!,0));
  }
  const exactOwners=$derived(recordsOpen?owners.map(({source})=>({source,records:(result.skill_procs??[]).flatMap((trace,run)=>trace.activations.filter(proc=>proc[0]===source&&proc[1]===activeSkill).map(proc=>({run,proc})))})):[]);
  const summary=(row:SkillDistributionRow)=>row.passive?'Passive':row.duration!=null?n(row.duration)+' s':row.instant?'Instant':'Not observed';
</script>
<div class="skill-status"><span>{!loaded?'Preparing skill observations…':running?'Measuring skill impact…':completed?'Impact tests completed':'Observations from the original batch · impact tests run only when requested'}</span>{#if running}<Button size="sm" variant="secondary" onclick={()=>{cancelled=true;request?.abort();}}>Cancel testing</Button>{/if}</div>
{#if error}<p role="alert" class="report-note">{error}</p>{/if}
{#if !result.skill_procs}<p class="report-note">This response did not collect skill observations.</p>{:else}
  <div class="skill-heading"><span>Runner</span><div class="skill-columns"><span>Important skills</span><span>Activation</span><span>Location</span><span>Duration</span><span>Time saved</span></div><span>All skills</span></div>
  {#each ordered as runner}
    <div class="runner-skills" class:highlighted={selected.includes(runner.source)}>
      <div class="runner-summary">
        <button class="runner-pick" aria-pressed={selected.includes(runner.source)} onclick={()=>onselect(runner.source)}><RunnerReference name={umas[runner.source]!.name} detail={'#'+(runner.source+1)} cardId={umas[runner.source]!.cardId} compact/></button>
        <div class="skill-highlights"><div class="skill-mini-heading" aria-hidden="true"><span>Skill</span><span>Activation</span><span>Duration</span></div>{#each runner.rows.slice(0,2) as row}{@render skillRow(runner.source,row)}{/each}</div>
        <Button size="sm" variant="ghost" ariaLabel={'All skills for '+umas[runner.source]!.name+' #'+(runner.source+1)} ariaExpanded={!!expanded[runner.source]} ariaControls={expanded[runner.source]?'runner-skill-list-'+runner.source:undefined} onclick={()=>expanded[runner.source]=!expanded[runner.source]}>{runner.rows.length} skills {expanded[runner.source]?'−':'+'}</Button>
      </div>
      {#if activeSkill&&activeSource===runner.source}{@render sharedSkill()}{/if}
      {#if expanded[runner.source]}
        <div class="runner-detail" id={'runner-skill-list-'+runner.source}><header class="section-header"><h3>{umas[runner.source]!.name} · all learned skills</h3><div class="build-actions"><Button size="sm" variant="secondary" disabled={running||!input||!result.report} onclick={()=>priorityTest(runner.source)}>Test priority skills · {(priorities.find(r=>r.source===runner.source)?.ids.filter(id=>!measured(runner.source,id)).length??0)*Math.min(32,result.runs)} races</Button><Button size="sm" variant="ghost" onclick={()=>expanded[runner.source]=false}>Close list</Button></div></header>
          <div class="skill-columns expanded-heading"><span>Skill / relevance</span><span>Activation</span><span>Location</span><span>Duration</span><span>Time saved</span></div>
          {#each runner.rows as row}{@render skillRow(runner.source,row,true)}{/each}
        </div>
      {/if}
    </div>
  {/each}
  <details class="skill-method"><summary>Skill priorities, sample sizes & impact methodology</summary><p class="report-note">Owned uniques always appear first, with level. Other priorities use observed mechanics and rarity; paid SP cost alone does not determine importance. Zero observations remain 0/{result.runs}. Tests start only on request. Cancellation stops subsequent work; an executing bounded test may finish. Marginal tests compare this full build with the skill removed on matched seeds. Contributions are not additive. Preliminary tests use up to 32 races; refine a skill from its comparison to use all {result.runs} configured races.</p></details>
{/if}

{#snippet skillRow(source:number,row:ReturnType<typeof prioritySkills>[number],detail=false)}
  {@const value=measured(source,row.id)}
  <div class="skill-row" class:full={detail}>
    <div><button class="skill-pick" onclick={()=>selectSkill(source,row.id)} aria-pressed={activeSkill===row.id&&activeSource===source} title={row.reason}><RaceSkill id={row.id}/>{#if row.owned}<b>Lv {row.level}</b>{/if}</button>{#if detail}<small>{row.reason}</small>{/if}</div>
    <div data-label="Activation" title={row.triggered+'/'+result.runs+' races · 95% CI '+n(row.interval[0],1)+'–'+n(row.interval[1],1)+'%'}><strong>{n(row.rate,1)}%</strong>{#if detail}<small>{row.triggered}/{result.runs} races · CI {n(row.interval[0],1)}–{n(row.interval[1],1)}%</small>{/if}</div>
    <div class="skill-location" data-label="Location"><span>{row.distance==null?'—':n(row.distance,0)+' m'}</span>{#if detail}<small>80%: {n(row.distances?.p10,0)}–{n(row.distances?.p90,0)} m · {n(row.time)} s</small>{/if}</div>
    <div data-label="Duration"><span>{summary(row)}</span>{#if detail}<small>{row.total} procs · {n(row.activePerRace)} proc s/race</small>{/if}</div>
    <div class="skill-impact" data-label="Time saved">
      {#if value}<button class="impact-pick" onclick={()=>selectSkill(source,row.id)} title={(value.count<result.runs?'Preliminary':'Full sample')+' · '+value.count+' paired races · 95% interval '+(value.interval?[n(-value.interval[1]!,3),n(-value.interval[0]!,3)].join('–'):'Unavailable')+' s'}>{n(-value.mean,3)} s{#if value.count<result.runs}<sup>*</sup>{/if}</button>{#if detail}{@const cost=skillPointTotal(catalog,[row.id])}{#if !row.owned&&cost&&cost>0}<small>{n(-value.mean*1000/cost,2)} ms/base SP · {cost} base SP before hints</small>{/if}<small>{value.count} paired races{value.count<result.runs?' · preliminary':''}</small>{/if}
      {:else}<Button size="sm" variant="ghost" disabled={running||!input||!umas[source]!.skills.some(s=>s.skillId===row.id)} onclick={()=>manual(source,row.id,Math.min(32,result.runs))}>Test skill · {Math.min(32,result.runs)} races</Button>{/if}
    </div>
  </div>
{/snippet}

{#snippet sharedSkill()}
  <section class="shared-skill" aria-label="Shared skill comparison">
    <header class="section-header"><div><h3>Skill comparison</h3><RaceSkill id={activeSkill}/></div><Button size="sm" variant="secondary" onclick={()=>activeSkill=0}>Close detail</Button></header>
    <div class="detail-scroll"><table><thead><tr><th>Runner</th><th>Activated</th><th>Location · mean / median</th><th>Duration · mean / median</th><th>Time saved</th><th>Win / full-spurt effect</th><th>Sample</th><th>Impact test</th></tr></thead><tbody>{#each owners as {source,row}}{@const value=measured(source,row.id)}<tr><th>{umas[source]!.name} · #{source+1}</th><td title={'95% CI '+n(row.interval[0],1)+'–'+n(row.interval[1],1)+'%'}>{row.triggered}/{result.runs} · {n(row.rate,1)}%</td><td>{n(row.distance,0)} / {n(row.distances?.median,0)} m</td><td>{n(row.duration)} / {n(row.durations?.median)} s</td><td>{value?n(-value.mean,3)+' s':'—'}{#if value}<small class="impact-interval">95%: {value.interval?[n(-value.interval[1]!,3),n(-value.interval[0]!,3)].join('–'):'Unavailable'}</small>{/if}</td><td>{value?n(-value.winChange,1)+' / '+n(value.spurtChange==null?undefined:-value.spurtChange,1)+' pp':'—'}</td><td>{value?value.count+' pairs'+(value.count<result.runs?' · preliminary':''):'Not tested'}</td><td><Button size="sm" variant="secondary" disabled={running||!input||!umas[source]!.skills.some(s=>s.skillId===row.id)} onclick={()=>manual(source,row.id,result.runs)}>Refine · {result.runs} races</Button></td></tr>{/each}</tbody></table></div>
    <div class="distribution-plots">{#each [['time','Activation timing'],['distance','Activation location'],['duration','Active duration'],['binomial','Activated races · future batch']] as [mode,label]}<div><h3>{label}</h3><LazyEChartsSurface option={chart(mode!)} label={mode==='binomial'?'Activated races in a future batch':label!} height={185}/></div>{/each}</div>
    <details><summary>How to read these distributions</summary><p class="report-note">Charts follow the shared runner selection ({chartOwners.length} highlighted owners). Timing and duration are empirical distributions; timed procs are clipped at the runner’s finish. The binomial model predicts activations in another independent batch from the observed rate, excluding uncertainty in that rate. Its axis focuses on counts with at least 0.001% modeled probability. Passive and instant effects have no timed duration.</p></details>
    <details bind:open={recordsOpen}><summary>Failed checks, repeated procs & exact effect records</summary>
      {#if recordsOpen}<div class="detail-scroll"><table><thead><tr><th>Runner</th><th>Procs / race</th><th>Proc seconds / race</th><th>Rejected: precondition / condition / disabled</th></tr></thead><tbody>{#each owners as {source,row}}<tr><th>{umas[source]!.name}</th><td>{n(row.total/result.runs)}</td><td>{n(row.activePerRace)}</td><td>{rejected(source,activeSkill).join(' / ')}</td></tr>{/each}</tbody></table></div><p class="report-note">Proc seconds sum repeated activations. Rejected checks are native evaluation attempts, including checks across ticks, rather than independent rolls.</p><LazyEChartsSurface option={chart('counts')} label="Empirical repeated procs per race" height={185}/>
      {#each exactOwners as {source,records}}<details bind:open={ownerOpen[source]}><summary>{umas[source]!.name} · {records.length} effect events</summary>
        {#if ownerOpen[source]}{@const page=effectPage[source]??0}<div class="seed-pagination"><Button size="sm" variant="secondary" disabled={page===0} onclick={()=>effectPage[source]=page-1}>Previous</Button><span>{page*25+1}–{Math.min(records.length,(page+1)*25)} of {records.length}</span><Button size="sm" variant="secondary" disabled={(page+1)*25>=records.length} onclick={()=>effectPage[source]=page+1}>Next</Button></div>
        <div class="detail-scroll"><table><thead><tr><th>Seed</th><th>Time</th><th>Distance</th><th>Duration</th><th>Flags</th><th>Effect: type / target input mask / resolved value</th></tr></thead><tbody>
        {#each records.slice(page*25,(page+1)*25) as {run,proc}}<tr><td>{result.seeds[run]}</td><td>{n(proc[4])} s</td><td>{n(proc[5],0)} m</td><td>{proc[6]<0?'Passive':n(proc[6])+' s'}</td><td>{proc[7]}</td><td>{result.skill_procs![run]!.effects.slice(proc[8],proc[8]+proc[9]).map(e=>e[1]+' / '+e[2]+' / '+n(e[3],4)).join('; ')}</td></tr>{/each}</tbody></table></div>{/if}
      </details>{/each}{/if}
    </details>
  </section>
{/snippet}
<style>
  .skill-status{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:10px;color:var(--text-secondary);margin-bottom:8px}
  .skill-heading,.runner-summary{display:grid;grid-template-columns:minmax(175px,1fr) minmax(0,4.6fr) 76px;gap:12px;align-items:center}.skill-heading{font-size:10px;color:var(--text-secondary);padding-bottom:8px}
  .skill-columns,.skill-row{display:grid;grid-template-columns:minmax(190px,2fr) .7fr .7fr .7fr .85fr;gap:8px;align-items:center}.skill-highlights{display:grid;gap:4px;min-width:0}.runner-skills{border-top:1px solid var(--border-subtle);padding:7px 0}.runner-skills.highlighted{background:color-mix(in srgb,var(--accent-primary) 3%,transparent)}
  .build-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.runner-pick{display:flex;align-items:center;background:transparent;border:0;color:inherit;padding:0;font:inherit;text-align:left;cursor:pointer;min-width:0;min-height:36px}.runner-pick:focus-visible,.skill-pick:focus-visible,.impact-pick:focus-visible{outline:2px solid var(--accent-primary);outline-offset:2px}
  .skill-mini-heading{display:none}.skill-pick :global(.skill-chip img){width:22px;height:22px}.skill-pick :global(.skill-body){min-height:22px;padding-block:3px}.skill-row{font-size:11px;min-height:24px}.skill-row>div{display:grid;gap:3px;min-width:0}.skill-row.full{padding:7px 0;border-top:1px solid var(--border-subtle)}.skill-row small{font-size:10px;color:var(--text-secondary);line-height:1.4}.skill-pick{display:flex;align-items:center;gap:5px;border:0;background:transparent;color:inherit;padding:0;cursor:pointer;min-height:24px;text-align:left;min-width:0}.skill-pick :global(.skill-chip){max-width:100%;min-width:0;min-height:22px;font-size:10px}.skill-pick b{font-size:10px;white-space:nowrap}
  .skill-row .skill-impact :global(.ui-button){justify-self:start;font-size:10px;min-height:26px;padding:3px 6px}.impact-pick{background:none;border:0;color:var(--accent-primary);font:inherit;text-align:left;padding:0;cursor:pointer;min-height:26px}.impact-pick sup{margin-left:2px}.impact-interval{display:block}
  .runner-summary>:global(.ui-button){font-size:10px;min-height:30px;padding:4px;justify-self:end}.runner-detail{padding:10px 12px;margin-top:8px;background:var(--surface-2);border-radius:var(--radius-sm)}.expanded-heading{font-size:10px;color:var(--text-secondary);padding-bottom:6px}
  .shared-skill{border:1px solid var(--border-subtle);border-radius:var(--radius-sm);padding:12px;margin:8px 0;background:var(--surface-2);min-width:0}.shared-skill .section-header h3,.runner-detail .section-header h3{margin:0}.distribution-plots{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:10px}.distribution-plots>div{min-width:0}.distribution-plots h3{font-size:11px;margin:4px 0}.skill-method{margin-top:4px}
  @media(max-width:1200px){.skill-heading,.runner-summary{grid-template-columns:155px minmax(0,1fr) 64px;gap:8px}.skill-columns,.skill-row{grid-template-columns:minmax(165px,1.8fr) .7fr .7fr .7fr .9fr;gap:6px}.distribution-plots{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:900px){.skill-heading{display:none}.runner-summary{grid-template-columns:minmax(0,1fr) auto}.runner-summary>.runner-pick{grid-column:1}.runner-summary>.skill-highlights{grid-row:2;grid-column:1/-1}.runner-summary>:global(.ui-button){grid-column:2;grid-row:1}.runner-skills{padding:8px 0}.skill-highlights .skill-row>[data-label]:before{content:attr(data-label);font-size:9px;color:var(--text-secondary)}}
  @media(max-width:600px){.skill-columns.expanded-heading{display:none}.skill-row{grid-template-columns:minmax(0,1fr) 56px 52px;gap:6px}.skill-highlights .skill-location,.skill-highlights .skill-impact{display:none}.skill-row.full{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.skill-row.full>div:first-child{grid-column:1/-1}.skill-row.full>[data-label]:before{content:attr(data-label);font-size:9px;color:var(--text-secondary)}.skill-mini-heading{display:grid;grid-template-columns:minmax(0,1fr) 56px 52px;gap:6px;font-size:9px;color:var(--text-secondary)}.skill-highlights .skill-row>[data-label]:before{display:none}.skill-highlights .skill-pick :global(.skill-chip){max-width:100%}.skill-highlights .skill-pick b{font-size:9px}.shared-skill,.runner-detail{padding:10px 8px}.distribution-plots{grid-template-columns:1fr}.skill-row.full .skill-impact{grid-column:1/-1}}
</style>
