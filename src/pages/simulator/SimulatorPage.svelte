<script lang="ts">
  import Banner from '@/components/Banner.svelte';
  import Button from '@/components/Button.svelte';
  import Dialog from '@/components/Dialog.svelte';
  import SegmentedControl from '@/components/SegmentedControl.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import TextField from '@/components/TextField.svelte';
  import SimulatorPageFrame from './shell/SimulatorPageFrame.svelte';
  import {
    APTITUDE_GRADES,
    buildStaminaRequest,
    type AptitudeGrade,
    type StaminaForm
  } from './stamina-request';
  import {
    simulatorRepository,
    type SimulatorRun,
    type StaminaResult
  } from './simulator-repository';
  import { traineeMotivation, traineeRunningStyle, traineeStats } from './trainee';
  import StaminaEffects, { effectRowsToInputs, type StaminaEffectRow } from './StaminaEffects.svelte';
  import StaminaStates, { stateRowsToInputs, type StaminaStateRow } from './StaminaStates.svelte';
  import StaminaResultPanel from './StaminaResult.svelte';
  import { RACE_TYPE_OPTIONS, raceTypeLabel } from './simulator-race-types';
  import RaceBar from './shell/RaceBar.svelte';
  import SimulatorShell from './shell/SimulatorShell.svelte';
  import type { SimulatorPanel } from './shell/types';
  import { trackName, describeCourse, type CourseCatalogEntry } from '@/lib/catalog/course-catalog';
  import {
    catalogErrorVisible,
    dismissCatalogError,
    selectedRaceInstanceId,
    selectedCourse,
    selectedCourseDistanceM,
    simulatorCatalog,
    simulatorSession
  } from './simulator-session.svelte';

  const SPURT_OPTIONS = [
    { value: 'true', label: 'Force full spurt' },
    { value: 'false', label: 'Normal race decision' }
  ];

  let settingsOpen = $state(false);
  // Per mode rather than shared: Build search derives it from its own mode, so
  // the two cannot agree on one session value.
  let raceType = $state('0');
  let fullSpurt = $state('false');
  let effects = $state<Array<StaminaEffectRow>>([]);
  let states = $state<Array<StaminaStateRow>>([]);
  let run = $state<(SimulatorRun<StaminaResult> & { forced: boolean; course: CourseCatalogEntry }) | null>(null);
  let error = $state('');
  let busy = $state(false);

  const course = $derived(selectedCourse());
  const courseDistanceM = $derived(selectedCourseDistanceM());
  const invalidSeed = $derived(!/^-?\d+$/.test(simulatorSession.seed) || Number(simulatorSession.seed) < -2147483648 || Number(simulatorSession.seed) > 2147483647);
  const canRun = $derived(Boolean(course) && !invalidSeed);

  /** The trainee editor holds grades as strings; the request wants the narrow union. */
  function traineeGrades(values: Array<string>): Array<AptitudeGrade> {
    return values.map((value) => APTITUDE_GRADES.find((grade) => grade === value) ?? 'A');
  }

  async function send(): Promise<void> {
    if (busy || !canRun) return;
    error = '';
    run = null;

    const target = course;
    if (!target) {
      error = 'Pick a course first.';
      return;
    }

    busy = true;
    try {
      const form: StaminaForm = {
        courseId: target.course_id,
        raceInstanceId: selectedRaceInstanceId(),
        raceType: Number(raceType),
        seed: Number(simulatorSession.seed),
        ground: Number(simulatorSession.ground),
        weather: Number(simulatorSession.weather),
        season: Number(simulatorSession.season),
        startTimeType: Number(simulatorSession.startTime),
        stats: traineeStats(simulatorSession.trainee),
        runningStyle: traineeRunningStyle(simulatorSession.trainee),
        motivation: traineeMotivation(simulatorSession.trainee),
        distanceAptitudes: traineeGrades(simulatorSession.trainee.distanceAptitudes),
        styleAptitudes: traineeGrades(simulatorSession.trainee.styleAptitudes),
        groundAptitudes: traineeGrades(simulatorSession.trainee.groundAptitudes),
        fullSpurt: fullSpurt === 'true',
        courseDistanceM,
        effects: effectRowsToInputs(effects),
        states: stateRowsToInputs(states)
      };
      const response = await simulatorRepository.stamina({ body: buildStaminaRequest(form) });
      run = { ...response, forced: form.fullSpurt, course: structuredClone($state.snapshot(target)) };
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'The request failed.';
    } finally {
      busy = false;
    }
  }
</script>

  {#snippet modifiersPanel()}
    <div class="stack">
      <StaminaEffects bind:effects courseDistanceM={courseDistanceM} />
      <StaminaStates bind:states />
    </div>
  {/snippet}

<SimulatorPageFrame
  routeId="simulator"
  title="HP calculator"
  blurb="Check HP and last-spurt feasibility on your selected course. Add recovery, debuffs and race states in HP modifiers."
>
  {#if catalogErrorVisible()}
    <Banner
      title="Race data unavailable"
      tone="danger"
      reportable={false}
      dismissible
      ondismiss={dismissCatalogError}
    >{simulatorCatalog.error}</Banner>
  {/if}
  {#if error}
    <!-- Keyed so a new failure gets a fresh Banner: the old one is still
         mounted with `visible` stuck false after being dismissed. -->
    {#key error}
      <Banner title="Could not run the simulation" tone="danger" reportable={false} dismissible>{error}</Banner>
    {/key}
  {/if}

  <SimulatorShell
    mode="stamina"
    panels={[{
      id: 'modifiers',
      label: 'HP modifiers',
      shortLabel: 'Modifiers',
      icon: 'tune',
      badge: effects.length > 0 || states.length > 0,
      content: modifiersPanel
    }]}
  >
    <div class="calculator-grid"><RaceBar workspace note={raceTypeLabel(Number(raceType))}/><div class="calculation-main">

    <div class="run-bar">
      <Button icon="battery" onclick={send} loading={busy} disabled={!canRun}>Calculate HP</Button>
      <Button variant="secondary" size="sm" icon="tune" onclick={() => settingsOpen = true}>Calculation settings</Button>
      {#if run}<Button variant="ghost" size="sm" disabled={busy} onclick={() => run = null}>Clear results</Button>{/if}
      <span class="hint">{fullSpurt === 'true' ? 'Testing forced maximum spurt' : 'Using the normal HP-aware spurt decision'}</span>
    </div>
    <p class="hint">This isolated calculation uses the effects you enter in HP modifiers. Imported skill IDs are simulated in Race sim.</p>
    <section class="results surface" aria-labelledby="sim-result-title">
      <h2 id="sim-result-title">HP calculation</h2>{#if run}<p class="hint">{trackName(run.course.race_track_id)}, {describeCourse(run.course)}</p>{/if}
      <StaminaResultPanel result={run?.result} raw={run?.raw} forced={run?.forced} {busy}/>
    </section></div></div>
  </SimulatorShell>
</SimulatorPageFrame>

<Dialog bind:open={settingsOpen} title="Calculation settings" maxWidth="600px">
  <div class="settings">
    <SelectField id="sim-race-type" label="Race type" options={RACE_TYPE_OPTIONS} bind:value={raceType}/>
    <TextField id="sim-seed" type="number" min={-2147483648} max={2147483647} label="Seed" help="The same setup and seed give the same calculation." bind:value={simulatorSession.seed}/>
    <SegmentedControl label="Spurt policy" options={SPURT_OPTIONS} bind:value={fullSpurt}/>
    <p class="hint">Normal race decision can delay or reduce the spurt. Force full spurt tests the cost of maximum pace, even if HP is insufficient.</p>
    {#if invalidSeed}<p role="alert">Enter a whole seed from −2,147,483,648 to 2,147,483,647.</p>{/if}
  </div>
  {#snippet actions()}<Button variant="secondary" onclick={() => settingsOpen = false}>Done</Button>{/snippet}
</Dialog>
<style>
  .calculator-grid{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px;align-items:start;min-width:0}.calculation-main{display:grid;gap:12px;min-width:0}@media(max-width:1050px){.calculator-grid{grid-template-columns:260px minmax(0,1fr);gap:12px}}@media(max-width:767px){.calculator-grid{grid-template-columns:minmax(0,1fr)}}

  .settings{display:grid;gap:14px}.hint{color:var(--text-secondary);font-size:11px;line-height:1.6;margin:0}

  .run-bar { display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border-subtle);border-radius:var(--radius-md);background:var(--surface-1); }
  .run-bar .hint{margin-left:auto}
  .results { display:flex;flex-direction:column;gap:10px;padding:12px 16px;min-width:0;background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:var(--radius-md); }
  .results h2 { margin:0;font-size:14px; }
  @media(max-width:550px){.run-bar,.results{padding:12px}.run-bar .hint{margin-left:0}.run-bar>:global(.ui-button:first-child){min-height:38px}}
</style>
