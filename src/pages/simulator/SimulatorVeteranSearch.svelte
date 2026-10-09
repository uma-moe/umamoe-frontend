<script lang="ts">
  import Dialog from '@/components/Dialog.svelte';
  import Button from '@/components/Button.svelte';
  import Checkbox from '@/components/Checkbox.svelte';
  import TextField from '@/components/TextField.svelte';
  import Artwork from '@/components/Artwork.svelte';
  import DataTable from '@/components/DataTable.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import Spinner from '@/components/Spinner.svelte';
  import SimulatorVeteranPicker from './SimulatorVeteranPicker.svelte';
  import { characterImagePath } from '@/lib/catalog/character-catalog';
  import { simulatorRoster, importSimulatorUmas } from './simulator-roster.svelte';
  import { simulatorRepository } from './simulator-repository';
  import { veteranTeamCount, veteranTeams, pairingSeeds, benchmarkFields, pairingFrameOrders } from './veteran-pairings';
  import { winRateInterval } from './simulator-results';
  import { simulatorSession } from './simulator-session.svelte';
  import { cmGet, type Manifest } from '@/pages/competitive/cm-data';
  import type { Snapshot } from '@/pages/competitive/hakuraku-types';
  import { loadCmBenchmark, type CmBenchmark } from './cm-benchmark';
  import { buildMonteCarloRequest } from './race-sim-request';
  import type { RaceSetupInput } from './stamina-request';
  import type { SimulatorUma } from './simulator-uma';
  import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
  let { open = $bindable(false), course, setup, seed, initialSnapshot = '' }: {open?:boolean;course?:CourseCatalogEntry;setup:RaceSetupInput;seed:number;initialSnapshot?:string} = $props();
  type TeamResult = {id:number;umas:SimulatorUma[];wins:number;successes:number;errors:number;rankTotal:number};
  let candidates = $state<SimulatorUma[]>([]), opponentIds = $state<string[]>([]), samples = $state('100');
  let opponentSource = $state(''), snapshotId = $state(''), snapshots = $state.raw<Snapshot[]>([]), benchmark = $state.raw<CmBenchmark>();
  let benchmarkLoading = $state(false), benchmarkError = $state(''), loadAttempt = $state(0);
  let searchDescription = $state(''), searchCourse = $state.raw<CourseCatalogEntry>(), searchSetup = $state.raw<RaceSetupInput>();
  let pickerOpen = $state(false), busy = $state(false), stop = $state(false), completed = $state(0), total = $state(0), failures = $state(0), error = $state('');
  let top = $state.raw<TeamResult[]>([]), searchOpponents = $state.raw<SimulatorUma[]>([]), failedMessages = $state.raw<string[]>([]);
  $effect(() => { if (!open) stop=true; });
  $effect(() => { if (open && !opponentSource) opponentSource=initialSnapshot || !simulatorRoster.configured || simulatorRoster.umas.length<6 ? 'cm' : 'field'; });
  $effect(() => {
    if (!open || opponentSource!=='cm') return;
    loadAttempt; const controller=new AbortController(); benchmarkError='';
    cmGet<Manifest>('/manifest',controller.signal).then(manifest=>{
      if(controller.signal.aborted)return;
      if(!manifest.snapshots?.length)throw Error('No CM datasets are available.');
      snapshots=manifest.snapshots;
      if(!snapshotId)snapshotId=manifest.snapshots.find(snapshot=>snapshot.snapshotId===initialSnapshot)?.snapshotId??manifest.snapshots[0]!.snapshotId;
    }).catch(reason=>{if(!controller.signal.aborted)benchmarkError=(reason as Error).message;});
    return()=>controller.abort();
  });
  $effect(() => {
    const snapshot=snapshots.find(snapshot=>snapshot.snapshotId===snapshotId); loadAttempt;
    if(!open || opponentSource!=='cm' || !snapshot)return;
    const controller=new AbortController(); benchmark=undefined;benchmarkLoading=true;benchmarkError='';
    loadCmBenchmark(snapshot,controller.signal).then(value=>{if(!controller.signal.aborted)benchmark=value;})
      .catch(reason=>{if(!controller.signal.aborted)benchmarkError=(reason as Error).message;})
      .finally(()=>{if(!controller.signal.aborted)benchmarkLoading=false;});
    return()=>controller.abort();
  });
  $effect(() => { if (open && !opponentIds.length && simulatorRoster.umas.length >= 6) opponentIds=simulatorRoster.umas.slice(-6).map(uma=>uma.id); });
  const opponents = $derived(simulatorRoster.umas.filter(uma=>opponentIds.includes(uma.id)));
  const teams = $derived(veteranTeamCount(candidates));
  const validSamples = $derived(/^\d+$/.test(String(samples)) && Number(samples)>=1 && Number(samples)<=1000);
  const canRun = $derived(Number.isInteger(seed) && seed>=-2147483648 && seed<=2147483647 && teams>0 && validSamples && (opponentSource==='cm' ? !!benchmark&&!benchmarkLoading : !!course&&opponents.length===6));
  const rows = $derived(top.map((team,index)=>({id:team.id,place:index+1,team:team.umas.map(uma=>uma.name).join(', '),rate:team.successes ? team.wins/team.successes*100 : 0,wins:team.wins,samples:team.successes,errors:team.errors,rank:team.rankTotal/team.successes})));
  const teamMap = $derived(new Map(top.map(team=>[team.id,team])));
  function addCandidates(umas:SimulatorUma[]) { candidates=umas; top=[];completed=0;error=''; }
  function useTeam(team:TeamResult) {
    importSimulatorUmas([...team.umas.map(uma=>({...uma,teamId:1,frameOrder:undefined})),...searchOpponents],true);
    if(searchCourse && searchSetup){
      simulatorSession.courseId=String(searchCourse.course_id);simulatorSession.sourceCourseId=simulatorSession.courseId;
      simulatorSession.raceInstanceId=searchSetup.raceInstanceId;simulatorSession.season=String(searchSetup.season);simulatorSession.weather=String(searchSetup.weather);
      simulatorSession.ground=String(searchSetup.ground);simulatorSession.startTime=String(searchSetup.startTimeType);
      simulatorSession.importNotice='Team search selection loaded with the first tested opponent field. '+searchDescription;
    }
    open=false;
  }
  async function search() {
    if (!canRun || busy) return;
    const cm=opponentSource==='cm'?benchmark:undefined;
    const target=structuredClone($state.snapshot(cm?.course??course!)), raceSetup=structuredClone($state.snapshot(cm?.setup??setup));
    const pool=structuredClone($state.snapshot(candidates)), sampleCount=Number(samples), seeds=pairingSeeds(seed,sampleCount);
    if(cm)for(const uma of pool)uma.trainee.motivation=String(cm.motivation);
    const fields=cm ? benchmarkFields(structuredClone(cm.teams.map(team=>team.umas))) : [structuredClone($state.snapshot(opponents)).map((uma,index)=>({...uma,teamId:index<3?2:3,frameOrder:undefined}))];
    searchOpponents=fields[0]!;searchCourse=target;searchSetup=raceSetup;
    searchDescription=cm ? `${cm.snapshot.label} · ${cm.teams.length} leading captured teams · ${Math.min(fields.length,sampleCount)} opponent matchups.` : 'Six fixed opponents from the race field.';
    const iterator=veteranTeams(pool);
    top=[];completed=0;failures=0;failedMessages=[];error='';stop=false;busy=true;total=teams*sampleCount;
    let team:TeamResult|undefined, sample=0, nextId=0, engine='';
    try {
      while (!stop) {
        const races=[], jobs:{team:TeamResult;seed:number}[]=[];
        let bytes=0;
        while (races.length<50) {
          if (!team || sample===sampleCount) {
            const next=iterator.next(); if(next.done)break;
            team={id:nextId++,umas:next.value,wins:0,successes:0,errors:0,rankTotal:0};sample=0;
          }
          const gates=pairingFrameOrders(seeds[sample]!,9);
          const race=buildMonteCarloRequest({
            courseId:target.course_id,seed:seeds[sample]!,setup:raceSetup,
            runners:[...team.umas.map(uma=>({...uma,teamId:1,frameOrder:undefined})),...fields[sample%fields.length]!].map((uma,index)=>({
              trainee:uma.trainee,skills:uma.skills,teamId:uma.teamId,fanCount:uma.fanCount,frameOrder:gates[index]
            }))
          }).input;
          const size=new TextEncoder().encode(JSON.stringify(race)).length;
          if(races.length && bytes+size>7*1024*1024)break;
          races.push(race);jobs.push({team,seed:seeds[sample]!});bytes+=size;sample++;
        }
        if(!races.length)break;
        const response=(await simulatorRepository.batch({body:{races}})).result;
        const build=JSON.stringify(response.engine_builds);
        if(engine && build!==engine)throw Error('Simulator resources changed during the search. Start a new search to compare teams on the same resources.');
        engine=build;
        if(response.results.length!==jobs.length || response.results.some((result,index)=>result.seed!==jobs[index]!.seed || !result.error && (!result.finish_order || result.finish_order.length!==9 || new Set(result.finish_order).size!==9 || result.finish_order.some(source=>!Number.isInteger(source)||source<0||source>8))))throw Error('The simulator returned mismatched matchup results.');
        for(let index=0;index<jobs.length;index++){
          const job=jobs[index]!,result=response.results[index]!,record=job.team;
          if(result.error){record.errors++;failures++;failedMessages=[...failedMessages.slice(-9),record.umas.map(uma=>uma.name).join(', ')+': '+result.error];}
          else{record.successes++;record.wins+=Number(result.finish_order![0]!<3);record.rankTotal+=Math.min(...[0,1,2].map(source=>result.finish_order!.indexOf(source)+1));}
          completed++;
          if(record.successes===sampleCount && !record.errors){
            // ponytail: retain the best 50 teams; export streaming results if full-corpus storage is needed.
            top=[...top,record].sort((a,b)=>b.wins/b.successes-a.wins/a.successes||a.rankTotal/a.successes-b.rankTotal/b.successes||a.id-b.id).slice(0,50);
          }
        }
      }
    }catch(reason){error=(reason as Error).message;}finally{busy=false;}
  }
</script>
<Dialog bind:open title="Find my best team" maxWidth="1200px" maxHeight="92dvh">
  <p>Compare every valid three-Uma team from your Veterans by its Monte Carlo team win rate. Every candidate gets the same opponents, seeds and starting gates. Variants of the same character cannot be teammates.</p>
  <div class="setup">
    <section><h3>Veterans <span>{candidates.length} builds</span></h3><Button size="sm" variant="secondary" disabled={busy} onclick={()=>pickerOpen=true}>Choose collection</Button>
      {#if candidates.length}<p>{teams.toLocaleString()} valid teams. The entire selected collection is included.</p>{/if}
    </section>
    <section><h3>Compare against</h3><SelectField id="team-search-source" label="Opponent source" hideLabel bind:value={opponentSource} disabled={busy} options={[{value:'cm',label:'CM Data · competitive benchmark'},{value:'field',label:'Current race field · fixed opponents'}]}/>
    {#if opponentSource==='cm'}
      <div class="benchmark"><SelectField id="team-search-dataset" label="CM dataset" bind:value={snapshotId} disabled={busy} options={snapshots.map(snapshot=>({value:snapshot.snapshotId,label:snapshot.label}))}/>
        {#if benchmarkLoading}<Spinner label="Loading captured CM teams…"/>{:else if benchmarkError}<p role="alert">{benchmarkError}</p><Button size="sm" variant="secondary" onclick={()=>loadAttempt++}>Retry CM Data</Button>
        {:else if benchmark}<strong>{benchmark.snapshot.meta.course}</strong><p>{benchmark.snapshot.meta.conditions}</p><p>Rotates through pairs of {benchmark.teams.length} leading captured teams from different players, ranked by their published lower win estimate. Uses the dataset’s course, conditions and mood for every candidate.</p>
          <details><summary>Benchmark teams</summary>{#each benchmark.teams as team,index}<p>{index+1}. {team.umas.map(uma=>uma.name).join(' · ')}</p>{/each}</details>
          <a href={'/competitive/cm-data?snapshot='+encodeURIComponent(snapshotId)+'&tab=archetypes'}>Explore these CM builds →</a>
        {/if}
      </div>
    {:else}<p>{opponents.length}/6 opponents selected</p><div class="opponents">
      {#each simulatorRoster.umas as uma}<div class="opponent"><Artwork src={uma.cardId?characterImagePath(uma.cardId):undefined} alt="" size="xs"/>
        <Checkbox id={'search-opponent-'+uma.id} label={uma.name} checked={opponentIds.includes(uma.id)} disabled={busy || !opponentIds.includes(uma.id) && opponents.length>=6}
          onchange={checked=>opponentIds=checked?[...opponentIds,uma.id]:opponentIds.filter(id=>id!==uma.id)}/>
      </div>{/each}
    </div><p>The selected order forms two opponent teams of three.</p>{/if}</section>
  </div>
  <div class="run-controls"><TextField id="pairing-samples" label="Races per team" type="number" min={1} max={1000} bind:value={samples} disabled={busy}/>
    <strong>{validSamples ? (teams*Number(samples)).toLocaleString() : '—'} races total</strong>
    {#if busy}<Button variant="secondary" size="sm" onclick={()=>stop=true} disabled={stop}>{stop?'Stopping after this batch…':'Stop search'}</Button>
    {:else}<Button icon="chart" disabled={!canRun} onclick={search}>{completed?'Run search again':'Compare teams'}</Button>{/if}
  </div>
  {#if opponentSource==='field' && !course}<p role="alert">Select a course before searching.</p>{/if}
  {#if candidates.length && !teams}<p role="alert">The collection needs at least three different characters.</p>{/if}
  {#if completed || busy}<div class="progress" role="status"><progress max={total || 1} value={completed}></progress><span>{completed.toLocaleString()} / {total.toLocaleString()} races{busy?'':completed<total?' (stopped)':' (complete)'}</span></div>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if failures}<p role="alert">{failures} races failed. Teams with failed races are excluded from the ranking.</p><details><summary>Latest failures</summary>{#each failedMessages as message}<p>{message}</p>{/each}</details>{/if}
  <h3 class="ranking-heading">Best tested teams</h3><p>{searchDescription || 'Choose your Veterans and a benchmark to compare teams.'}</p><p>{rows.length ? 'Showing up to 50 fully tested teams. Estimated ranges show sampling uncertainty (95%); close results need more races. This ranking applies to this benchmark, not every possible opponent.' : 'Team rankings and win rates will appear after each team completes.'}</p>
    <DataTable caption="Veteran team pairings" plain compact {rows} maxHeight={440} emptyMessage={busy ? 'Comparing Veteran teams…' : 'Choose your collection and an opponent benchmark, then compare teams.'} columns={[
      {key:'place',label:'Rank',numeric:true},{key:'team',label:'Team'},{key:'rate',label:'Team win rate',numeric:true},{key:'rank',label:'Avg. best place',numeric:true},{key:'samples',label:'Races',numeric:true},{key:'use',label:'',sortable:false}
    ]}>
      {#snippet cell(row,column)}{@const team=teamMap.get(Number(row.id))!}
        {#if column.key==='team'}<div class="lineup">{#each team.umas as uma}<span><Artwork src={uma.cardId?characterImagePath(uma.cardId):undefined} alt="" size="xs"/>{uma.name}</span>{/each}</div>
        {:else if column.key==='rate'}{@const interval=winRateInterval(team.wins,team.successes)}<div class="team-rate"><strong>{Number(row.rate).toFixed(1)}%</strong><small>{interval[0].toFixed(1)}–{interval[1].toFixed(1)}%</small></div>
        {:else if column.key==='rank'}{Number(row.rank).toFixed(2)}
        {:else if column.key==='use'}<Button size="sm" variant="secondary" disabled={busy} onclick={()=>useTeam(team)}>Use team</Button>
        {:else}{row[column.key]}{/if}
      {/snippet}
    </DataTable>
  {#snippet actions()}<Button variant="secondary" onclick={()=>{stop=true;open=false;}}>Close</Button>{/snippet}
</Dialog>
<SimulatorVeteranPicker bind:open={pickerOpen} onselect={uma=>addCandidates([...candidates,uma])} onselectMany={addCandidates}/>
<style>
  .ranking-heading{margin-top:24px}
  .benchmark{display:grid;gap:8px;margin-top:12px}.benchmark>strong{font-size:13px}.benchmark p{margin:0}.benchmark details,.benchmark a{font-size:11px}.benchmark summary{cursor:pointer}.benchmark details p{margin-top:6px}.team-rate{display:grid;gap:3px}.team-rate strong{font-size:15px;color:var(--accent-primary)}.team-rate small{font-size:10px;color:var(--text-secondary)}
  .setup{display:grid;grid-template-columns:minmax(200px,.6fr) minmax(0,1.4fr);gap:24px;margin:16px 0}.setup section{min-width:0}h3{font-size:13px;margin:0 0 8px}h3 span{font-size:11px;font-weight:400;color:var(--text-secondary);margin-left:8px}p{font-size:11px;line-height:1.6;color:var(--text-secondary)}.opponents{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 16px}.opponent{display:flex;align-items:center;gap:6px;min-width:0}.run-controls{display:flex;align-items:end;gap:12px;flex-wrap:wrap}.run-controls :global(.field){width:120px}.run-controls strong{font-size:12px;padding-bottom:10px}.progress{display:flex;gap:12px;align-items:center;font-size:11px;margin:16px 0}.progress progress{flex:1;height:10px;accent-color:var(--accent-primary)}.lineup{display:flex;gap:12px;flex-wrap:wrap}.lineup span{display:flex;align-items:center;gap:4px;font-size:11px}.lineup :global(.art){border:0;background:transparent}
  @media(max-width:700px){.setup{grid-template-columns:1fr;gap:16px}.opponents{grid-template-columns:1fr 1fr}.lineup{flex-direction:column;gap:4px}}
</style>
