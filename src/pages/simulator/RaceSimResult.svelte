<script lang="ts">
  import {onDestroy,untrack,tick,type Component} from 'svelte';
  import Button from '@/components/Button.svelte';
  import RunnerReference from '@/pages/competitive/RunnerReference.svelte';
  import SimulatorReportOutcomes from './SimulatorReportOutcomes.svelte';
  import SimulatorReportProgression from './SimulatorReportProgression.svelte';
  import SimulatorReportMeasurements from './SimulatorReportMeasurements.svelte';
  import SimulatorReportSkills from './SimulatorReportSkills.svelte';
  import SimulatorBuildComparisons from './SimulatorBuildComparisons.svelte';
  import SimulatorCourseProfile from './SimulatorCourseProfile.svelte';
  import {simulatorResults,simulatorReplayCapture,simulatorSampleReplay} from './simulator-results';
  import {runnerColor,reportNumber as n} from './simulation-report';
  import {simulatorRepository,type MonteCarloResult} from './simulator-repository';
  import {trackName,type CourseCatalogEntry} from '@/lib/catalog/course-catalog';
  import type {SimulatorUma} from './simulator-uma';
  import type {MonteCarloInput} from './race-sim-request';
  import {applyResimulation,type ParsedRaceCapture} from '@/lib/race/race-capture-parser';
  import './simulation-report.css';
  let {result,input,raw='',umas,course,track={},busy=false,suspended=false}:{result?:MonteCarloResult;input?:MonteCarloInput;raw?:string;umas:SimulatorUma[];course?:CourseCatalogEntry;track?:ParsedRaceCapture['track'];busy?:boolean;suspended?:boolean}=$props();
  const metrics=$derived(result?simulatorResults(result,umas.length):[]);
  let selected=$state<number[]>(untrack(()=>metrics.slice(0,2).map(r=>r.source))),focus=$state<number>(),inspected=$state(untrack(()=>metrics[0]?.source??0));
  let notice=$state(''),sample=$state(0),sampleOpen=$state(false),sampleLoading=$state(false),sampleError=$state(''),capture=$state.raw<ParsedRaceCapture>(),seedPage=$state(0);
  let Replay=$state.raw<Component<{capture:ParsedRaceCapture;suspended?:boolean}>|undefined>();
  let sampleRequest:AbortController|undefined;
  onDestroy(()=>sampleRequest?.abort());
  function choose(source:number) {
    notice='';
    if(selected.includes(source)){if(selected.length>1){selected=selected.filter(s=>s!==source);if(inspected===source)inspected=selected[0]!;}return;}
    if(selected.length===4){notice='Compare up to four runners. Deselect one to add another.';return;}
    selected=[...selected,source];inspected=source;
  }
  function inspect(source:number) {
    notice='';
    inspected=source;
    if(!selected.includes(source))selected=[...selected.slice(0,3),source];
  }
  function download() {const url=URL.createObjectURL(new Blob([JSON.stringify({input,umas,course,result},(_,v)=>v instanceof Float32Array||v instanceof Float64Array?Array.from(v):v)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='simulation-'+result?.seeds[0]+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function replay(index:number) {
    if(!result||!input||!course)return;
    sampleRequest?.abort();const request=sampleRequest=new AbortController();
    sample=index;sampleOpen=true;sampleLoading=true;sampleError='';capture=undefined;
    await tick();document.getElementById('simulation-samples')?.scrollIntoView({block:'start',behavior:'smooth'});
    try {
      const data=index===0&&result.first_replay?result.first_replay:simulatorSampleReplay(result,(await simulatorRepository.monteCarlo({body:{input,seeds:[result.seeds[index]],output_mode:'skills',output_format:'msgpack'},signal:request.signal})).result,index);
      if(request.signal.aborted)return;
      capture=simulatorReplayCapture(data,umas,course,track);
      Replay=(await import('@/pages/race-analysis/RaceReplay.svelte')).default;
    }catch(error){if(!request.signal.aborted)sampleError=error instanceof Error?error.message:'Could not load the sample.';}
    finally{if(!request.signal.aborted)sampleLoading=false;}
  }
  function representative(source:number,index:number) {
    const recorded=result?.report?.runners.find(r=>r.source_input_index===source)?.representative_runs[index];
    if(recorded!==undefined)return recorded;
    const values=result!.finish_times.map(row=>row[source]!);
    const sorted=[...values].sort((a,b)=>a-b),mid=(sorted[(sorted.length-1)>>1]!+sorted[sorted.length>>1]!)/2;
    const target=index===0?mid:index===1?sorted[0]!:sorted.at(-1)!;
    return values.reduce((best,v,i)=>Math.abs(v-target)<Math.abs(values[best]!-target)?i:best,0);
  }
  async function detailedReplay() {
    if(!capture||!result||!input)return;
    const previous=capture,request=sampleRequest=new AbortController();
    sampleLoading=true;sampleError='';
    try {
      const response=await simulatorRepository.detailedReplay({body:{...input,seed:result.seeds[sample]},signal:request.signal});
      if(request.signal.aborted)return;
      if(response.result.engineBuild!==result.engine_build||response.result.seed!==result.seeds[sample])throw new Error('These diagnostics do not match the sampled engine and seed. Run the simulation again.');
      const next=applyResimulation(previous,response.result);
      const sources=input.runners.toSorted((a,b)=>a.frame_order-b.frame_order).map(r=>r.source_input_index);
      if(next.runners.some((r,gate)=>r.result?.finishOrder!==result!.finish_order[sample]!.indexOf(sources[gate]!)+1||Math.abs(r.result!.finishTime-result!.finish_times[sample]![sources[gate]!]!)>.001))throw new Error('These diagnostic outcomes no longer match this sampled race. Run the simulation again.');
      capture=next;
    } catch(error){if(!request.signal.aborted)sampleError=error instanceof Error?error.message:'Could not load replay diagnostics.';}
    finally{if(!request.signal.aborted)sampleLoading=false;}
  }
  const chapters=[['outcome','Build comparison'],['progression','Race progression'],['stamina','Stamina & spurt'],['skills','Skills & builds'],['samples','Sampled races']];
</script>
<div class="simulation-report" aria-busy={busy}>
  {#if result}
    <nav class="report-contents" aria-label="Report sections">{#each chapters as [id,label],i}<a href={'#simulation-'+id}>{label}</a>{/each}</nav>
    <section id="simulation-outcome" class="report-card" aria-label="Build comparison"><header class="section-header"><div><h2>Build comparison</h2><span class="section-context">{result.runs.toLocaleString()} races · {umas.length} runners{course?' · '+trackName(course.race_track_id)+' '+course.distance.toLocaleString()+' m':''}</span></div><Button variant="secondary" size="sm" icon="download" onclick={download}>Download data</Button></header><SimulatorReportOutcomes {result} {umas} {selected} {metrics} onselect={choose}/></section>
    <section id="simulation-progression" class="report-card" aria-label="Race progression"><header class="section-header"><h2>Race progression</h2><span class="section-context">Select runner rows to compare · up to four</span></header>
      <div class="comparison-bar" aria-label="Shared runner comparison"><div class="comparison-runners">{#each selected as source}<div class="comparison-runner" class:inspected={inspected===source} style:--runner-color={runnerColor(source)}><button class="selected" aria-pressed={inspected===source} aria-label={'Inspect '+umas[source]!.name} onclick={()=>inspected=source} onmouseenter={()=>focus=source} onmouseleave={()=>focus=undefined} onfocus={()=>focus=source} onblur={()=>focus=undefined}><i></i><span>{umas[source]!.name} <small>#{source+1}</small></span>{#if selected[0]===source}<small>Reference</small>{/if}</button><button class="remove-runner" aria-label={'Remove '+umas[source]!.name+' from comparison'} onclick={()=>choose(source)}>×</button></div>{/each}</div><small>Hover a runner for its middle 80% range</small>{#if notice}<p role="status">{notice}</p>{/if}</div>
      {#if result.report}<SimulatorReportProgression report={result.report} {result} {umas} {selected} {inspected} {focus} {course} {suspended} onreplay={replay}/>{:else}<p class="report-note">Progression requires the report collector.</p>{/if}<details id="simulation-behaviour"><summary>Start, blocking and race behaviour</summary><SimulatorReportMeasurements {result} {umas} {selected} {metrics} kind="behaviour" onselect={choose} onreplay={replay}/></details></section>
    <section id="simulation-stamina" class="report-card" aria-label="Stamina and final spurt"><header class="section-header"><h2>Stamina & final spurt</h2><span class="section-context">Survival and full spurt are separate measurements</span></header><SimulatorReportMeasurements {result} {umas} {selected} {metrics} kind="stamina" onselect={choose} onreplay={replay}/></section>
    <section id="simulation-skills" class="report-card" aria-label="Skill analysis"><header class="section-header"><h2>Skills & build changes</h2><span class="section-context">Owned unique + priority skill · select a skill to compare its owners</span></header><SimulatorReportSkills {result} {input} {umas} {selected} {suspended} order={metrics.map(row=>row.source)} onselect={choose} oninspect={inspect} distance={course?.distance??1}/>{#if input}<SimulatorBuildComparisons {input} {result} {umas} source={inspected}/>{/if}</section>
    <section id="simulation-samples" class="report-card" aria-label="Sampled races and reproducibility"><header class="section-header"><h2>Sampled races & reproducibility</h2><span class="section-context">Actual races from this batch</span></header>
      <div class="representatives">{#each selected as source}<div><RunnerReference name={umas[source]!.name} cardId={umas[source]!.cardId} compact/>{#each ['Median','Fastest','Slowest'] as label,i}<Button variant="secondary" size="sm" disabled={sampleLoading} onclick={()=>replay(representative(source,i))}>{label} race</Button>{/each}</div>{/each}</div>
      {#if sampleOpen}<header class="sample-heading"><strong>Sample {sample+1}/{result.runs} · seed {result.seeds[sample]}</strong>{#if capture&&!capture.detailed}<Button variant="secondary" size="sm" disabled={sampleLoading} onclick={detailedReplay}>Full replay diagnostics</Button>{/if}<Button variant="ghost" size="sm" onclick={()=>{sampleRequest?.abort();sampleLoading=false;sampleOpen=false;}}>Close replay</Button></header>{#if sampleLoading}<p role="status">Loading this race…</p>{:else if sampleError}<p role="alert">{sampleError}</p>{:else if capture&&Replay}<p class="report-note">Replay playback uses elapsed simulation seconds. Outcome comparisons above use official finish seconds.</p><Replay {capture} suspended={suspended||!sampleOpen}/>{/if}{/if}
      <details><summary>Every seed and finish order</summary><div class="seed-pagination"><Button variant="secondary" size="sm" disabled={seedPage===0} onclick={()=>seedPage--}>Previous</Button><span>{seedPage*25+1}–{Math.min(result.runs,(seedPage+1)*25)} of {result.runs}</span><Button variant="secondary" size="sm" disabled={(seedPage+1)*25>=result.runs} onclick={()=>seedPage++}>Next</Button></div><div class="detail-scroll"><table><thead><tr><th>Seed</th><th>Finish order</th>{#each selected as source}<th>#{source+1} time</th>{/each}<th>Replay</th></tr></thead><tbody>{#each result.finish_order.slice(seedPage*25,(seedPage+1)*25) as order,i}{@const index=seedPage*25+i}<tr><td>{result.seeds[index]}</td><td>{order.map(s=>'#'+(s+1)).join(' → ')}</td>{#each selected as source}<td>{n(result.finish_times[index]?.[source],3)} s</td>{/each}<td><Button variant="ghost" size="sm" onclick={()=>replay(index)}>Open race</Button></td></tr>{/each}</tbody></table></div></details>
      <details><summary>Setup, clocks, coverage and engine</summary><p class="report-note">{result.engine_build} · response schema {result.schema_version} · report {result.report?.version??'not collected'} · {result.runs} races. Simulation traces use elapsed simulation seconds; finish comparisons use official seconds. Rates describe this field and seed population. Changing a build can change downstream native RNG draws even with matched seeds.</p>{#if course}<SimulatorCourseProfile {course} compact/>{/if}<pre>{JSON.stringify(input,null,2)}</pre></details>
    </section>
  {:else}<p>Run a simulation to compare outcomes.</p>{/if}
</div>
