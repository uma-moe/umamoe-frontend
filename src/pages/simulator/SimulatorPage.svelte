<script lang="ts">
  import { onMount } from 'svelte';
  import Banner from '@/components/Banner.svelte';
  import Button from '@/components/Button.svelte';
  import Combobox from '@/components/Combobox.svelte';
  import EmptyState from '@/components/EmptyState.svelte';
  import SegmentedControl from '@/components/SegmentedControl.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import Spinner from '@/components/Spinner.svelte';
  import TextField from '@/components/TextField.svelte';
  import PageFrame from '@/layouts/PageFrame.svelte';
  import { HttpError } from '@/services/http/http-client';
  import { readApiKey, writeApiKey } from './simulator-key';
  import {
    RACE_TYPE_OPTIONS,
    describeRace,
    loadSimulatorCourses,
    loadSimulatorRaces,
    raceTypeLabel,
    type SimulatorCourse,
    type SimulatorRace
  } from './simulator-catalog';
  import { simulatorRepository, type SimulatorRun, type StaminaResult } from './simulator-repository';
  import { APTITUDE_GRADES, buildStaminaRequest, type AptitudeGrade, type StaminaForm } from './stamina-request';
  import { createTrainee, traineeMotivation, traineeRunningStyle, traineeStats } from './trainee';
  import TraineeInput from './TraineeInput.svelte';
  import StaminaEffects, {
    effectRowsToInputs,
    type StaminaEffectRow
  } from './StaminaEffects.svelte';
  import StaminaStates, {
    stateRowsToInputs,
    type StaminaStateRow
  } from './StaminaStates.svelte';
  import StaminaResultPanel from './StaminaResult.svelte';

  const GROUND_OPTIONS = [
    { value: '1', label: 'Good' },
    { value: '2', label: 'Yielding' },
    { value: '3', label: 'Soft' },
    { value: '4', label: 'Heavy' }
  ];
  const SEASON_OPTIONS = [
    { value: '1', label: 'Spring' },
    { value: '2', label: 'Summer' },
    { value: '3', label: 'Autumn' },
    { value: '4', label: 'Winter' },
    { value: '5', label: 'Cherry blossom' }
  ];
  const WEATHER_OPTIONS = [
    { value: '1', label: 'Sunny' },
    { value: '2', label: 'Cloudy' },
    { value: '3', label: 'Rainy' },
    { value: '4', label: 'Snowy' }
  ];
  const TIME_OPTIONS = [
    { value: '1', label: 'Morning' },
    { value: '2', label: 'Midday' },
    { value: '3', label: 'Evening' },
    { value: '4', label: 'Night' }
  ];
  const SPURT_OPTIONS = [
    { value: 'true', label: 'Full spurt' },
    { value: 'false', label: 'HP-aware' }
  ];

  let apiKey = $state(readApiKey());
  let races = $state.raw<Array<SimulatorRace>>([]);
  let courses = $state.raw<Map<number, SimulatorCourse>>(new Map());
  let catalogError = $state('');
  let loadingCatalog = $state(true);

  let raceInstanceId = $state('');
  let raceType = $state('0');
  let ground = $state('1');
  let season = $state('1');
  let weather = $state('1');
  let startTime = $state('2');
  let seed = $state(String(Math.floor(Math.random() * 2 ** 31)));

  let trainee = $state(createTrainee());
  let fullSpurt = $state('true');
  let effects = $state<Array<StaminaEffectRow>>([]);
  let states = $state<Array<StaminaStateRow>>([]);

  let run = $state<SimulatorRun<StaminaResult> | null>(null);
  let error = $state('');
  let busy = $state(false);

  const raceOptions = $derived(
    races.map((race) => ({
      value: String(race.race_instance_id),
      label: race.name,
      keywords: describeRace(race, courses.get(race.course_set_id))
    }))
  );
  const selectedRace = $derived(
    races.find((race) => String(race.race_instance_id) === raceInstanceId)
  );
  const selectedCourse = $derived(selectedRace ? courses.get(selectedRace.course_set_id) : undefined);
  const courseDistanceM = $derived(selectedCourse?.distance ?? selectedRace?.distance);

  $effect(() => {
    writeApiKey(apiKey);
  });

  onMount(() => {
    void (async () => {
      try {
        const [loadedRaces, loadedCourses] = await Promise.all([
          loadSimulatorRaces(),
          loadSimulatorCourses()
        ]);
        races = loadedRaces;
        courses = loadedCourses;
        if (!raceInstanceId && loadedRaces[0]) {
          raceInstanceId = String(loadedRaces[0].race_instance_id);
        }
      } catch (reason) {
        catalogError = reason instanceof Error ? reason.message : 'Could not load race data.';
      } finally {
        loadingCatalog = false;
      }
    })();
  });

  /** The trainee editor holds grades as strings; the request wants the narrow union. */
  function traineeGrades(values: Array<string>): Array<AptitudeGrade> {
    return values.map((value) => APTITUDE_GRADES.find((grade) => grade === value) ?? 'A');
  }

  async function send(): Promise<void> {
    if (busy) return;
    error = '';
    run = null;

    if (!apiKey.trim()) {
      error = 'Add your uma.moe API key to run the simulator.';
      return;
    }
    const race = selectedRace;
    if (!race) {
      error = 'Pick a race first.';
      return;
    }

    busy = true;
    try {
      const form: StaminaForm = {
        courseId: race.course_set_id,
        raceInstanceId: race.race_instance_id,
        raceType: Number(raceType),
        seed: Number(seed) || 0,
        ground: Number(ground),
        weather: Number(weather),
        season: Number(season),
        startTimeType: Number(startTime),
        stats: traineeStats(trainee),
        runningStyle: traineeRunningStyle(trainee),
        motivation: traineeMotivation(trainee),
        distanceAptitudes: traineeGrades(trainee.distanceAptitudes),
        styleAptitudes: traineeGrades(trainee.styleAptitudes),
        groundAptitudes: traineeGrades(trainee.groundAptitudes),
        fullSpurt: fullSpurt === 'true',
        courseDistanceM,
        effects: effectRowsToInputs(effects),
        states: stateRowsToInputs(states)
      };
      const body = buildStaminaRequest(form);
      run = await simulatorRepository.stamina({ key: apiKey.trim(), body });
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

<svelte:head><title>Simulator · uma.moe</title><meta name="robots" content="noindex, nofollow"/></svelte:head>

<PageFrame routeId="simulator" pageTitle="Simulator" width="wide" adsEnabled={false} labelledby="simulator-title">
  <main>
    <header class="intro">
      <div>
        <h1 id="simulator-title">Simulator</h1>
        <p>
          Test a trainee against a real course: will it last, and where does the last spurt break?
          Runs on the private simulator through uma.moe. Currently in beta.
        </p>
      </div>
    </header>

    {#if catalogError}
      <Banner title="Race data unavailable" tone="danger" reportable={false}>{catalogError}</Banner>
    {/if}
    {#if error}
      <Banner title="Could not run the simulation" tone="danger" reportable={false}>{error}</Banner>
    {/if}

    <div class="workspace">
      <div class="form">
        <section class="panel" aria-labelledby="sim-access-title">
          <h2 id="sim-access-title">Access</h2>
          <TextField
            id="sim-api-key"
            type="password"
            label="uma.moe API key"
            help="Simulator access is granted per key during the beta. Stored in this browser only."
            autocomplete="off"
            bind:value={apiKey}
          />
        </section>

        <section class="panel" aria-labelledby="sim-race-title">
          <h2 id="sim-race-title">Race</h2>
          {#if loadingCatalog}
            <Spinner />
          {:else}
            <Combobox
              id="sim-race"
              label="Race"
              options={raceOptions}
              placeholder="Search races…"
              emptyText="No races found"
              bind:value={raceInstanceId}
            />
            {#if selectedRace}
              <p class="hint">{describeRace(selectedRace, selectedCourse)} · course {selectedRace.course_set_id} · {raceTypeLabel(Number(raceType))}</p>
            {/if}
          {/if}

          <div class="grid">
            <SelectField
              id="sim-race-type"
              label="Race type"
              options={RACE_TYPE_OPTIONS}
              help="Career and Career (team) enable career stat bonuses; Team Trials runs a team race."
              bind:value={raceType}
            />
            <SelectField id="sim-ground" label="Ground" options={GROUND_OPTIONS} bind:value={ground} />
            <SelectField id="sim-season" label="Season" options={SEASON_OPTIONS} bind:value={season} />
            <SelectField id="sim-weather" label="Weather" options={WEATHER_OPTIONS} bind:value={weather} />
            <SelectField id="sim-time" label="Time" options={TIME_OPTIONS} bind:value={startTime} />
          </div>

          <TextField id="sim-seed" type="number" min={-2147483648} max={2147483647} label="Seed" help="Same seed, same run." bind:value={seed} />
        </section>

        <TraineeInput bind:trainee />

        <StaminaEffects bind:effects courseDistanceM={courseDistanceM} />

        <StaminaStates bind:states />

        <section class="panel" aria-labelledby="sim-plan-title">
          <h2 id="sim-plan-title">Last spurt</h2>
          <SegmentedControl label="Spurt plan" options={SPURT_OPTIONS} bind:value={fullSpurt} />
          <p class="hint">
            Full spurt asks whether the trainee can hold maximum spurt speed from the final third;
            HP-aware lets the engine slow the spurt instead.
          </p>
          <Button onclick={send} loading={busy} disabled={!apiKey.trim() || !selectedRace}>Run simulation</Button>
        </section>
      </div>

      <section class="panel result" aria-labelledby="sim-result-title">
        <h2 id="sim-result-title">Result</h2>
        {#if run}
          <StaminaResultPanel result={run.result} raw={run.raw} />
        {:else}
          <EmptyState
            icon="tools"
            title="No run yet"
            description="Set up a race and a trainee, then run the simulation to see HP and the spurt plan."
          />
        {/if}
      </section>
    </div>
  </main>
</PageFrame>

<style>
  .intro { margin-bottom: var(--space-4); }
  h1 { margin: 0; font-size: var(--font-lg); }
  .intro p { max-width: 65ch; margin: var(--space-1) 0 0; color: var(--color-text-muted); font-size: var(--font-sm); }
  .workspace { display: grid; gap: var(--space-4); align-items: start; }
  @media (min-width: 1100px) { .workspace { grid-template-columns: minmax(320px, 460px) minmax(0, 1fr); } }
  .form { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }
  .panel { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface-2); }
  .panel h2 { margin: 0; font-size: var(--font-md); }
  .result { min-width: 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--space-3); }
  .hint { margin: 0; color: var(--color-text-muted); font-size: var(--font-xs); }
</style>
