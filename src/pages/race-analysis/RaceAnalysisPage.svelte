<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import AppPage from '@/layouts/AppPage.svelte';
  import FileDrop from '@/components/FileDrop.svelte';
  import Button from '@/components/Button.svelte';
  import Banner from '@/components/Banner.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import Dialog from '@/components/Dialog.svelte';
  import { trackDetailName } from '@/lib/race/race-display';
  import { readRaceCaptureFile, type ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import { groupMultiRaceCaptures } from '@/lib/race/multi-race-analysis';
  import { resimulateRace } from '@/services/race-resimulation';
  import { loadCharacterCatalog } from '@/lib/catalog/character-catalog';
  import { loadSkillCatalog } from '@/lib/catalog/skill-catalog';
  import { runnerName } from './race-character-display';
  import { demoSkills, makeDemoRaces } from '@/pages/competitive/demo-races';
  import RaceStatistics from '@/pages/competitive/RaceStatistics.svelte';
  import RaceReplay from './RaceReplay.svelte';
  import RaceStart from './RaceStart.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import { loadReplayCourses,resolveReplayCourses,type CourseData } from './replay-course';
  let courses=$state<CourseData>();
  onMount(()=>{void loadReplayCourses().then(value=>courses=value).catch(()=>{});});
  let captures = $state.raw<ParsedRaceCapture[]>([]), errors = $state<string[]>([]), loading = $state(false), demo = $state(false);
  let selected = $state('0'), group = $state('all'), uploadsOpen=$state(false), reportTarget=$state<HTMLElement>();
  let replayFocus=$state<{runner:number;time?:number}>(),sessionBusy=$state(false),sessionProgress=$state(''),simulationErrors=$state<string[]>([]);
  let sessionController:AbortController|undefined;
  onDestroy(()=>sessionController?.abort());
  let skillNames = $state.raw(new Map<number,string>());
  onMount(()=>{ void loadSkillCatalog().then(catalog=>skillNames=new Map([...catalog].map(([id,skill])=>[id,skill.name]))).catch(()=>{}); });
  const resolvedCaptures:ParsedRaceCapture[]=$derived(captures.map(capture=>({...capture,raceDistance:courses?.courses[capture.courseId??'']?.distance??capture.raceDistance})));
  const groups = $derived(groupMultiRaceCaptures(resolvedCaptures));
  const filtered = $derived(group === 'all' ? resolvedCaptures : groups.find(item=>item.key===group)?.captures ?? []);
  const active = $derived(captures[Number(selected)]);
  const raceChoices=$derived(captures.map((capture,index)=>{
    const winner=capture.runners.find(r=>r.result?.finishOrder===1);
    return {value:String(index),label:`${index+1}. ${capture.fileName}`,image:portrait(winner?.cardId),description:[capture.raceDistance?`${capture.raceDistance} m`:undefined,winner?'Winner: '+winner.name:undefined].filter(Boolean).join(', ')};
  }));
  async function examples(count:number) { uploadsOpen=false; captures=makeDemoRaces(count); demo=true; selected='0'; group='all'; errors=[]; await tick(); window.scrollTo({top:0,behavior:'instant'}); }
  async function receive(files:FileList) {
    loading=true; errors=[];
    const loaded:ParsedRaceCapture[]=[];
    // Sequential decoding keeps memory bounded when importing a whole session.
    for(const file of Array.from(files)) {
      try { if(file.size>50*1024*1024) throw new Error('File exceeds the 50 MB limit.'); loaded.push(await readRaceCaptureFile(file)); }
      catch(error) { errors.push(`${file.name}: ${error instanceof Error?error.message:'Unable to read capture.'}`); }
    }
    if(loaded.length) {
      await resolveReplayCourses(loaded);
      try { const characters=await loadCharacterCatalog(); for(const capture of loaded) for(const runner of capture.runners) runner.name=runnerName(runner,characters); } catch { /* IDs remain usable offline. */ }
      const replace=demo||!captures.length;
      uploadsOpen=false; captures=replace?loaded:[...captures,...loaded]; demo=false; group='all';if(replace)simulationErrors=[];
      if(replace){selected='0';await tick();window.scrollTo({top:0,behavior:'instant'});}
    }
    loading=false;
    if(loaded.length)void resimulateSession(loaded);
  }
  function clear() { sessionController?.abort();captures=[];errors=[];simulationErrors=[];demo=false;uploadsOpen=false;selected='0';group='all';replayFocus=undefined; }
  function remove() { replayFocus=undefined;const index=Number(selected);captures=captures.filter((_,i)=>i!==index); selected=String(Math.min(index,Math.max(0,captures.length-1))); group='all'; if(!captures.length){sessionController?.abort();simulationErrors=[];uploadsOpen=false;demo=false;} }
  function scrollReport(section:string){reportTarget?.querySelector<HTMLElement>('[data-report-section="'+section+'"]')?.scrollIntoView({block:'start',behavior:'instant'});}
  async function watchRace(index:number,runner?:number,time?:number){replayFocus=undefined;selected=String(resolvedCaptures.indexOf(filtered[index]!));await tick();replayFocus=runner===undefined?undefined:{runner,time};await tick();scrollReport('replay');}
  function keepSimulation(result:ParsedRaceCapture){captures=captures.map(capture=>capture.original===result.original?result:capture);}
  function download(){
    if(!active?.detailed)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify({capture:active.original,resimulation:active.detailed,courseId:active.courseId})],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='detailed-'+active.fileName.replace(/\.gz$/,'');link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function resimulateSession(inputs:ParsedRaceCapture[]){
    if(sessionBusy)return;
    const pending=inputs.filter(capture=>capture.original&&!capture.detailed),controller=new AbortController();
    if(!pending.length)return;
    sessionController=controller;sessionBusy=true;
    try{
      for(const [index,input] of pending.entries()){
        if(controller.signal.aborted)break;
        if(!captures.some(c=>c.original===input.original))continue;
        sessionProgress=(index+1)+' / '+pending.length;
        try{const result=await resimulateRace(input,input.courseId??0,{signal:controller.signal});if(!controller.signal.aborted&&captures.some(c=>c.original===input.original))keepSimulation(result);}
        catch(error){if(!controller.signal.aborted)simulationErrors=[...simulationErrors,input.fileName+': '+(error instanceof Error?error.message:'Resimulation failed.')];}
      }
    }finally{if(sessionController===controller){sessionBusy=false;sessionProgress='';}}
  }
  function groupLabel(capture:ParsedRaceCapture) {
    const course=courses?.courses[capture.courseId??''];
    return [course?courses?.names[course.raceTrackId]:'Unknown course',`${capture.raceDistance??'?'} m`,trackDetailName('condition',capture.track.condition),trackDetailName('weather',capture.track.weather),trackDetailName('season',capture.track.season)].join(', ');
  }
</script>
<svelte:head><title>Race Analysis · uma.moe</title><meta name="description" content="Upload one or multiple race captures for local replay and race analysis."/></svelte:head>
{#snippet upload()}
  <FileDrop id="race-upload" label="Drop one or multiple race files" description="HorseACT or game API captures (.json or .json.gz)" actionLabel={loading?'Reading captures…':'Choose race files'} accept=".json,.gz" multiple disabled={loading||sessionBusy} onfiles={receive}/>
  <p class="upload-help">Uploaded races are automatically resimulated for detailed analysis. Multiple races add a session report. Captures are sent to the uma.moe simulator; mismatched replays are reported to Sentry for debugging.</p>
  <div class="demo-actions"><span>Try it with demo data</span><Button size="sm" variant="secondary" disabled={loading||sessionBusy} onclick={()=>examples(1)}>Try one demo race</Button><Button size="sm" variant="secondary" disabled={loading||sessionBusy} onclick={()=>examples(24)}>Try 24 demo races</Button></div>
  <a class="capture-help" href="https://github.com/ayaliz/horseACT#installation" target="_blank" rel="noreferrer">How to capture races ↗</a>
{/snippet}
<div class="race-page" class:loaded={captures.length>0}>
<AppPage routeId="race-analysis" title="Race Analysis" description={captures.length?undefined:"Follow the race. Understand the result."} width="wide">
 {#snippet actions()}{#if captures.length}<div class="file-actions">{#if active?.detailed}<Button variant="secondary" size="sm" icon="download" onclick={download}>Export detailed replay</Button>{/if}<Button variant="secondary" size="sm" icon="upload" disabled={loading||sessionBusy} onclick={()=>uploadsOpen=true}>Add race files</Button>{#if captures.length>1}<Button variant="secondary" size="sm" icon="trash" disabled={loading} onclick={clear}>Clear races</Button>{/if}</div>{/if}{/snippet}
 <div class="race-workspace">
  {#if errors.length}<Banner title="Some files could not be imported" tone="danger" reportable={false}><ul>{#each errors as error}<li>{error}</li>{/each}</ul></Banner>{/if}
  {#if simulationErrors.length}<Banner title="Resimulation failed; recorded replays were kept" tone="warning" reportable={false}><ul>{#each simulationErrors as error}<li>{error}</li>{/each}</ul></Banner>{/if}
  {#if captures.length}
    <Dialog bind:open={uploadsOpen} title="Add race files" maxWidth="640px">{@render upload()}</Dialog>
  {:else}<RaceStart loading={loading||sessionBusy} onfiles={receive} onexample={examples}/>{/if}
  {#if captures.length&&active}
  <div class="analysis-workspace" aria-label="Race analysis report" bind:this={reportTarget}>
    <RaceReplay capture={active} skillNames={demo?demoSkills:skillNames} hasSession={captures.length>1} focus={replayFocus}>
      {#snippet headerActions()}<div class="race-source"><div class="session-status"><strong>{captures.length} {captures.length===1?'race':'races'} loaded</strong>{#if sessionBusy}<span role="status">Resimulating {sessionProgress}…</span>{/if}{#if demo}<span class="demo-badge">Demo data</span>{/if}</div><div class="race-selection">{#if captures.length>1}<SelectField id="selected-race" label="Race" hideLabel options={raceChoices} value={selected} onchange={value=>{replayFocus=undefined;selected=value;}}/>{:else}<span class="file-name" title={active.fileName}>{active.fileName}</span>{/if}<Button variant="secondary" size="sm" icon="trash" disabled={loading} onclick={remove}>Remove race</Button></div></div>{/snippet}
      {#snippet sessionReport()}{#if captures.length>1}
        <section class="session-analysis" aria-label="Session statistics">
          <header class="section-heading"><div><h2>Session analysis</h2><p>Compare runners, styles, builds and skills across {filtered.length} races.</p></div>{#if groups.length>1}<SelectField id="race-group" label="Course and conditions" hideLabel options={[{value:'all',label:`All conditions (${captures.length} races)`},...groups.map(item=>({value:item.key,label:groupLabel(item.captures[0]!)+' ('+item.captures.length+' races)'}))]} bind:value={group}/>{/if}</header>
          <div class="session-simulation"><span>{filtered.filter(c=>c.detailed).length} / {filtered.length} races with detailed simulation</span></div>
          <RaceStatistics captures={filtered} skillNames={demo?demoSkills:skillNames} pending={sessionBusy} onreplay={watchRace}/>
        </section>
      {/if}{/snippet}
    </RaceReplay>
  </div>
  {/if}
 </div>
</AppPage>
</div>
<style>
  .race-page{min-width:0}.loaded :global(.page-heading){padding-block:20px 16px}.loaded :global(.page-heading h1){font-size:26px;margin:0}.loaded :global(.app-page){padding-bottom:24px}
  .race-workspace{grid-template-columns:minmax(0,1fr);--control-height:32px;display:grid;gap:12px;min-width:0}.upload-help{font-size:12px;color:var(--text-secondary);line-height:1.6;margin:12px 0}.demo-actions,.file-actions,.session-status{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.demo-actions>span{font-size:11px;color:var(--text-secondary);margin-right:4px}.capture-help{display:inline-block;font-size:11px;color:var(--accent-primary);margin-top:12px}
  .analysis-workspace{min-width:0}.race-source{display:grid;gap:4px;min-width:0}.session-status{font-size:10px;flex:none;justify-content:flex-end;color:var(--text-secondary)}.demo-badge{font-size:10px;color:var(--text-secondary);padding:3px 6px;background:var(--surface-3);border-radius:4px}.race-selection{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0;flex:1}.race-selection :global(.field){width:300px;min-width:0}.race-selection :global(.ui-button){flex:none;font-size:11px;min-height:32px}.file-name{min-width:0;max-width:580px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary);font-size:11px}
  .session-analysis{min-width:0;display:grid;grid-template-columns:minmax(0,1fr);gap:12px}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-block:8px}.section-heading :global(.field){width:340px;max-width:100%}h2{font-size:20px;margin:0}p{font-size:12px;margin:4px 0 0;color:var(--text-secondary);line-height:1.6}ul{padding-left:18px;margin:6px 0}li{overflow-wrap:anywhere}
  .session-simulation{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--text-secondary)}
  @media(min-width:951px){
    .race-source{display:flex;align-items:center;gap:12px}
    .race-selection{flex:1}
    .file-name{flex:1}
  }
  @media(max-width:767px){.loaded :global(.page-heading){padding-block:12px}.loaded :global(.page-heading h1){font-size:22px}.race-workspace{margin-inline:12px}.race-source{width:100%}.session-status{font-size:10px;justify-content:flex-start}.race-selection{flex-basis:100%;justify-content:space-between}.race-selection :global(.field){width:auto;flex:1}.file-name{flex:1}.section-heading{flex-wrap:wrap}.section-heading :global(.field){width:100%}.demo-actions>span{flex-basis:100%}}

  .race-page :global(.ui-button.ui-button--sm:not(.ui-button--ghost)){min-height:32px;padding:5px 10px;gap:6px;font-size:12px;font-weight:600;border-radius:6px;line-height:1.2}
  .race-page :global(.ui-button.ui-button--ghost){min-height:28px;font-weight:500}
  .race-page :global(.table-wrap .ui-button.ui-button--ghost),.race-page :global(.mode-periods .ui-button.ui-button--ghost),.race-page :global(.reference-periods .ui-button.ui-button--ghost){min-height:22px;padding:1px 3px;font-size:11px;font-weight:500;color:var(--accent-primary);line-height:1.3}
  .race-page :global(.ui-button svg){width:14px;height:14px;flex:none}
  .race-page :global(.field select){min-height:32px;font-size:12px;border-radius:6px}
  .race-page :global(.ui-toggle){height:32px;min-height:32px;font-size:12px;font-weight:600;border-radius:6px}
  .race-page :global(.segments.compact){height:32px;border-radius:6px}
  .race-page :global(.icon-button--sm){border-radius:6px}
</style>
