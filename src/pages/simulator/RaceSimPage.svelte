<script lang="ts">
  import { onMount, tick } from 'svelte';
  import RaceBar from './shell/RaceBar.svelte';
  import SimulatorCourseProfile from './SimulatorCourseProfile.svelte';
  import Banner from '@/components/Banner.svelte';
  import Button from '@/components/Button.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import TextField from '@/components/TextField.svelte';
  import SimulatorPageFrame from './shell/SimulatorPageFrame.svelte';
  import SimulatorShell from './shell/SimulatorShell.svelte';
  import SimulatorUmaField from './SimulatorUmaField.svelte';
  import SimulatorVeteranSearch from './SimulatorVeteranSearch.svelte';
  import RaceSimResult from './RaceSimResult.svelte';
  import { RACE_TYPE_OPTIONS } from './simulator-race-types';
  import { MAX_MONTE_CARLO_RUNS, buildMonteCarloRequest, type MonteCarloInput } from './race-sim-request';
  import { simulatorRepository, type MonteCarloResult, type SimulatorRun } from './simulator-repository';
  import { GROUND_OPTIONS, WEATHER_OPTIONS, SEASON_OPTIONS, optionLabel, selectedRaceInstanceId, selectedCourse, simulatorCatalog, catalogErrorVisible, dismissCatalogError, simulatorSession } from './simulator-session.svelte';
  import { simulatorRoster, importSimulatorUmas, simulatorTeamColor } from './simulator-roster.svelte';
  import { createExampleRace } from './simulator-example';
  import type { SimulatorUma } from './simulator-uma';
  import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';

  let raceType = $state('0'), runs = $state('100'), step = $state<'setup'|'report'>('setup');
  let reportHeading = $state<HTMLElement>();
  let run = $state.raw<(SimulatorRun<MonteCarloResult> & { input: MonteCarloInput; umas: SimulatorUma[]; course: CourseCatalogEntry; track: ParsedRaceCapture['track'] }) | null>(null);
  let error = $state(''), busy = $state(false), searchOpen = $state(false);
  const searchParams = new URLSearchParams(location.search);
  const cmSnapshot = searchParams.get('cm-snapshot') ?? '';
  onMount(() => { searchOpen=searchParams.get('team-search')==='1'; });
  async function showStep(value:'setup'|'report') {
    step=value; await tick(); reportHeading?.focus({preventScroll:true}); reportHeading?.scrollIntoView({block:'start'});
  }
  const course = $derived(selectedCourse());
  const seedInvalid = $derived(!/^-?\d+$/.test(String(simulatorSession.seed)) || Number(simulatorSession.seed) < -2147483648 || Number(simulatorSession.seed) > 2147483647);
  const runsInvalid = $derived(!/^\d+$/.test(String(runs)) || Number(runs) < 1 || Number(runs) > MAX_MONTE_CARLO_RUNS);
  const canRun = $derived(!!course && simulatorRoster.umas.length >= 2 && !seedInvalid);

  function loadExample() {
    const example = createExampleRace();
    if (!simulatorCatalog.courses.has(example.courseId)) { error = 'The example course is unavailable. Reload the course catalog and retry.'; return; }
    importSimulatorUmas(example.umas,true);
    Object.assign(simulatorSession,{
      courseId:String(example.courseId),sourceCourseId:String(example.courseId),raceInstanceId:example.raceInstanceId,
      ground:example.ground,weather:example.weather,season:example.season,startTime:example.startTime,umaId:example.umas[0]!.id,
      importNotice:'Example field: three captured CM20 teams · Nakayama 2,500 m · Good ground, Cloudy, Winter, Great mood. Edit any build to compare changes.'
    });
    raceType='0';run=null;step='setup';error='';
  }

  async function send(single: boolean): Promise<void> {
    if (busy || !canRun || !single && runsInvalid || !course) return;
    const target = structuredClone($state.snapshot(course));
    const umas = structuredClone($state.snapshot(simulatorRoster.umas)).map(uma=>({...uma,teamColor:simulatorTeamColor(uma.teamId)}));
    const track = {
      condition: optionLabel(GROUND_OPTIONS, simulatorSession.ground), weather: optionLabel(WEATHER_OPTIONS, simulatorSession.weather),
      season: optionLabel(SEASON_OPTIONS, simulatorSession.season)
    };
    busy = true; error = '';
    try {
      const body = buildMonteCarloRequest({
        courseId: target.course_id, seed: Number(simulatorSession.seed), runs: Number(runs),
        ...(single ? { seeds: [Number(simulatorSession.seed)] } : {}),
        setup: {
          raceInstanceId: selectedRaceInstanceId(), raceType: Number(raceType),
          season: Number(simulatorSession.season), weather: Number(simulatorSession.weather),
          ground: Number(simulatorSession.ground), startTimeType: Number(simulatorSession.startTime)
        },
        runners: umas.map(uma => ({ trainee: uma.trainee, skills: uma.skills, teamId: uma.teamId, fanCount: uma.fanCount, frameOrder: uma.frameOrder })),
        outputMode: 'report'
      });
      let response;
      try {response=await simulatorRepository.monteCarlo({body:{...body,report_version:2,output_format:'msgpack'}});}
      catch(reason) {
        if(reason instanceof Error&&/report_version/.test(reason.message)){response=await simulatorRepository.monteCarlo({body:{...body,output_format:'msgpack'}});}else{
        if(!(reason instanceof Error)||!/output_mode.*(?:skills|procs|report)/i.test(reason.message))throw reason;
        response=await simulatorRepository.monteCarlo({body:{...body,output_mode:'procs',output_format:'msgpack'}});
        }
      }
      run = { ...response, input:body.input, umas, course: target, track };
      await showStep('report');
    } catch (reason) { error = reason instanceof Error ? reason.message : 'The simulation could not be completed.'; }
    finally { busy = false; }
  }
</script>

<SimulatorPageFrame width="wide" routeId="simulator-race" title="Race simulator" blurb="Compare runners, understand race performance, and test changes to your builds.">
  {#if catalogErrorVisible()}<Banner title="Race data unavailable" tone="danger" reportable={false} dismissible ondismiss={dismissCatalogError}>{simulatorCatalog.error}</Banner>{/if}
  {#if error}{#key error}<Banner title="Could not run the simulation" tone="danger" reportable={false} dismissible>{error}</Banner>{/key}{/if}
  <SimulatorShell mode="race" showUma={false}>
    <div class="race-workspace" class:showing-report={step==='report'}>
      <div class="step-heading">
        {#if step==='setup'}
        <ol aria-label="Simulation steps"><li class="current"><button aria-current="step" disabled={busy} onclick={()=>showStep('setup')}><span>1</span> Set up race</button></li><li><button disabled={!run || busy} onclick={()=>showStep('report')}><span>2</span> Simulation results</button></li></ol>
        {:else}<h2 class="step-title" bind:this={reportHeading} tabindex="-1">Simulation results</h2>{/if}
        {#if step==='report'}<div class="report-actions"><Button variant="secondary" size="sm" icon="edit" disabled={busy} onclick={()=>showStep('setup')}>Edit setup</Button><Button size="sm" icon="chart" loading={busy} disabled={!canRun || runsInvalid} onclick={()=>send(false)}>Run again</Button></div>{/if}
      </div>
      {#if step==='setup'}
        <h2 class="step-title" bind:this={reportHeading} tabindex="-1">Set up your comparison</h2>
        <p class="step-description">Choose the field and conditions. The report compares every runner across the same sampled races.</p>
        <section class="simulation-actions" aria-label="Run simulation">
          <div class="sample-settings">
            <TextField id="race-samples" type="number" min={1} max={MAX_MONTE_CARLO_RUNS} label="Sampled races" error={runsInvalid?'Enter 1–'+MAX_MONTE_CARLO_RUNS.toLocaleString()+' races.':undefined} bind:value={runs}/>
            <div class="seed-setting"><TextField id="race-seed" label="Seed" type="number" min={-2147483648} max={2147483647} error={seedInvalid?'Enter a whole number from −2,147,483,648 to 2,147,483,647.':undefined} bind:value={simulatorSession.seed}/><span title="Generate a random seed"><Button variant="secondary" size="sm" icon="refresh" ariaLabel="Random seed" onclick={() => simulatorSession.seed = String(Math.floor(Math.random() * 2 ** 31))}/></span></div>
            <SelectField id="race-type" label="Race format" options={RACE_TYPE_OPTIONS.filter(option => !['14', '7'].includes(option.value))} bind:value={raceType}/>
          </div>
          <div class="run-buttons"><Button variant="secondary" size="sm" icon="race" loading={busy} disabled={!canRun} onclick={()=>send(true)}>Run one race</Button><Button size="sm" icon="chart" ariaLabel={'Run '+(runsInvalid?'samples':runs+' races')} loading={busy} disabled={!canRun || runsInvalid} onclick={()=>send(false)}>Run simulation</Button></div>
        </section>
        {#if busy}<p role="status" class="hint">Simulating the field…</p>{/if}
        <div class="course-overview">
          <aside class="course-setup" aria-label="Course setup"><RaceBar workspace inlineConditions/></aside>
          <div class="course-breakdown"><SimulatorCourseProfile {course} compact/></div>
        </div>
        <SimulatorUmaField>
          {#snippet actions()}<Button variant="secondary" size="sm" icon="veterans" onclick={()=>searchOpen=true}>Find my best team</Button><Button variant="secondary" size="sm" icon="refresh" disabled={busy || simulatorCatalog.loading} onclick={loadExample}>Load example</Button>{/snippet}
        </SimulatorUmaField>
        {#if simulatorSession.importNotice}<p class="import-notice" role="status">{simulatorSession.importNotice}</p>{/if}
      {/if}
      {#if run}<div class="race-main" hidden={step!=='report'}>{#key run}<RaceSimResult result={run.result} input={run.input} raw={run.raw} umas={run.umas} course={run.course} track={run.track} {busy} suspended={step!=='report'}/>{/key}</div>{/if}
    </div>
  </SimulatorShell>
</SimulatorPageFrame>

<SimulatorVeteranSearch bind:open={searchOpen} {course} initialSnapshot={cmSnapshot} seed={Number(simulatorSession.seed)} setup={{raceInstanceId:selectedRaceInstanceId(),raceType:Number(raceType),season:Number(simulatorSession.season),weather:Number(simulatorSession.weather),ground:Number(simulatorSession.ground),startTimeType:Number(simulatorSession.startTime)}}/>
<style>
  .race-workspace{--setup-panel-padding:20px;--setup-control-height:36px;display:grid;gap:16px;min-width:0}
  .race-workspace.showing-report{gap:10px}.showing-report .step-title{font-size:21px}
  .step-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.step-heading ol{display:flex;gap:24px;list-style:none;margin:0;padding:0}.step-heading li+li{position:relative}.step-heading li+li:before{content:'›';position:absolute;left:-16px;top:8px;color:var(--text-secondary)}.step-heading li button{display:flex;align-items:center;gap:8px;padding:6px 0;border:0;background:transparent;color:var(--text-secondary);font:inherit;font-size:12px;cursor:pointer}.step-heading li button:disabled{cursor:default;opacity:.5}.step-heading li span{display:grid;place-items:center;width:24px;height:24px;border:1px solid var(--border-primary);border-radius:50%;font-size:11px}.step-heading .current button{color:var(--text-primary);font-weight:600}.step-heading .current span{background:var(--color-accent-soft);border-color:var(--accent-primary);color:var(--accent-primary)}.report-actions{display:flex;gap:8px}
  .step-title{font-size:24px;letter-spacing:-.03em;margin:0;scroll-margin-top:90px}.step-title:focus{outline:none}.step-description{color:var(--text-secondary);font-size:12px;line-height:1.6;margin:-8px 0 0}
  .course-overview{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px;align-items:stretch;min-width:0;container:course-overview / inline-size}.course-setup,.course-breakdown{min-width:0;display:grid}.course-setup :global(.race-bar){align-self:stretch}.course-breakdown :global(.profile){display:flex;flex-direction:column}.course-breakdown :global(.profile-body){flex:1}
  .simulation-actions{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:16px var(--setup-panel-padding);background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);container:simulation-controls / inline-size}
  .sample-settings{display:grid;grid-template-columns:120px 210px minmax(190px,240px);gap:12px;min-width:0}.seed-setting{display:grid;grid-template-columns:minmax(0,1fr) 36px;gap:6px;align-items:end}.seed-setting>span{display:flex}.seed-setting>span :global(.ui-button){width:36px;padding:0}
  .sample-settings :global(.field){gap:6px;--control-height:var(--setup-control-height)}.sample-settings :global(label){font-size:11px}.sample-settings :global(input),.sample-settings :global(.select-control){font-size:12px}
  .run-buttons{display:flex;align-items:center;gap:8px}.simulation-actions :global(.ui-button),.report-actions :global(.ui-button){height:var(--setup-control-height);min-height:var(--setup-control-height);font-size:12px;border-radius:var(--radius-sm)}
  .import-notice,.hint{margin:0;font-size:11px;line-height:1.6;color:var(--text-secondary)}.import-notice{max-width:100ch}.race-main[hidden]{display:none}.race-main{min-width:0;container:race-main / inline-size}
  @container simulation-controls (max-width:900px){.sample-settings{grid-template-columns:minmax(100px,.8fr) minmax(180px,1.2fr) minmax(180px,1fr);width:100%}.run-buttons{margin-left:auto}}
  @media(max-width:1100px){.course-overview{grid-template-columns:280px minmax(0,1fr);gap:12px}}
  @media(max-width:900px){.course-overview{grid-template-columns:minmax(0,1fr)}}
  @media(max-width:767px){.race-workspace{--setup-panel-padding:14px;--setup-control-height:44px}.step-title{font-size:21px}.simulation-actions{padding:14px;gap:12px}.sample-settings{grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);width:100%;gap:12px}.sample-settings>:global(.field:last-child){grid-column:1 / -1}.seed-setting{grid-template-columns:minmax(0,1fr) 44px}.seed-setting>span :global(.ui-button){width:44px}.run-buttons{width:100%;gap:8px}.run-buttons>:global(.ui-button){flex:1;padding-inline:8px;font-size:11px}.report-actions{gap:4px}.step-heading{gap:8px}.step-heading ol{gap:20px}.step-heading li button{font-size:11px}.report-actions>:global(.ui-button){font-size:11px}}
</style>
