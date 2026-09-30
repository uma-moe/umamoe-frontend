<script lang="ts">
  import Banner from '@/components/Banner.svelte';
  import Button from '@/components/Button.svelte';
  import EmptyState from '@/components/EmptyState.svelte';
  import SegmentedControl from '@/components/SegmentedControl.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import TextField from '@/components/TextField.svelte';
  import SimulatorPageFrame from './shell/SimulatorPageFrame.svelte';
  import { HttpError } from '@/services/http/http-client';
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
  import {
    catalogErrorVisible,
    dismissCatalogError,
    RACE_INSTANCE_NONE,
    selectedCourse,
    selectedCourseDistanceM,
    simulatorCatalog,
    simulatorSession
  } from './simulator-session.svelte';

  const SPURT_OPTIONS = [
    { value: 'true', label: 'Full spurt' },
    { value: 'false', label: 'HP-aware' }
  ];

  let seed = $state(String(Math.floor(Math.random() * 2 ** 31)));
  // Per mode rather than shared: Build search derives it from its own mode, so
  // the two cannot agree on one session value.
  let raceType = $state('0');
  let fullSpurt = $state('true');
  let effects = $state<Array<StaminaEffectRow>>([]);
  let states = $state<Array<StaminaStateRow>>([]);
  let run = $state<SimulatorRun<StaminaResult> | null>(null);
  let error = $state('');
  let busy = $state(false);

  const course = $derived(selectedCourse());
  const courseDistanceM = $derived(selectedCourseDistanceM());
  const canRun = $derived(Boolean(simulatorSession.apiKey.trim() && course));

  /** The trainee editor holds grades as strings; the request wants the narrow union. */
  function traineeGrades(values: Array<string>): Array<AptitudeGrade> {
    return values.map((value) => APTITUDE_GRADES.find((grade) => grade === value) ?? 'A');
  }

  async function send(): Promise<void> {
    if (busy) return;
    error = '';
    run = null;

    if (!simulatorSession.apiKey.trim()) {
      error = 'Add your uma.moe API key to run the simulator.';
      return;
    }
    const target = course;
    if (!target) {
      error = 'Pick a course first.';
      return;
    }

    busy = true;
    try {
      const form: StaminaForm = {
        courseId: target.course_id,
        raceInstanceId: RACE_INSTANCE_NONE,
        raceType: Number(raceType),
        seed: Number(seed) || 0,
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
      run = await simulatorRepository.stamina({
        key: simulatorSession.apiKey.trim(),
        body: buildStaminaRequest(form)
      });
    } catch (reason) {
      if (reason instanceof HttpError && reason.status === 403) {
        error =
          'The simulator is not enabled for this account yet. Access is limited to granted API keys during the beta.';
      } else if (reason instanceof HttpError && reason.status === 401) {
        error =
          'That API key was rejected. Create one in Settings, and make sure it is granted simulator access.';
      } else {
        error = reason instanceof Error ? reason.message : 'The request failed.';
      }
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
  title="Simulator"
  blurb="Test a trainee against a real course: will it last, and where does the last spurt break? Runs on the private simulator through uma.moe. Currently in beta."
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
    <RaceBar note={raceTypeLabel(Number(raceType))} />

    <div class="run-bar">
      <Button onclick={send} loading={busy} disabled={!canRun}>Run simulation</Button>
      <SelectField
        id="sim-race-type"
        label="Race type"
        options={RACE_TYPE_OPTIONS}
        help="Career and Career (team) enable career stat bonuses; Team Trials runs a team race."
        bind:value={raceType}
      />
      <TextField
        id="sim-seed"
        type="number"
        min={-2147483648}
        max={2147483647}
        label="Seed"
        help="Same seed, same run."
        bind:value={seed}
      />
      <SegmentedControl label="Spurt plan" options={SPURT_OPTIONS} bind:value={fullSpurt} />
      <Button variant="ghost" disabled={busy || run === null} onclick={() => (run = null)}>Clear</Button>
    </div>

    <section class="results surface" aria-labelledby="sim-result-title">
      <h2 id="sim-result-title">Result</h2>
      {#if run}
        <StaminaResultPanel result={run.result} raw={run.raw} />
      {:else}
        <EmptyState
          icon="tools"
          title="No run yet"
          description="Set a race and a trainee in the sidebar, then run the simulation to see HP and the spurt plan."
        />
      {/if}
    </section>
  </SimulatorShell>
</SimulatorPageFrame>

<style>
  .run-bar { display: flex; flex-wrap: wrap; align-items: end; gap: var(--space-3); }
  .results { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); min-width: 0; }
  .results h2 { margin: 0; font-size: var(--font-md); }
</style>
