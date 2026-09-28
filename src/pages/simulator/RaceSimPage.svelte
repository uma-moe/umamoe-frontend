<script lang="ts">
  import { onMount } from 'svelte';
  import Banner from '@/components/Banner.svelte';
  import Button from '@/components/Button.svelte';
  import Combobox from '@/components/Combobox.svelte';
  import EmptyState from '@/components/EmptyState.svelte';
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
    type SimulatorCourse,
    type SimulatorRace
  } from './simulator-catalog';
  import {
    MAX_MONTE_CARLO_RUNS,
    buildMonteCarloRequest,
    type MonteCarloRunnerInput
  } from './race-sim-request';
  import { simulatorRepository, type MonteCarloResult, type SimulatorRun } from './simulator-repository';
  import { createTrainee, type Trainee } from './trainee';
  import TraineeInput from './TraineeInput.svelte';
  import RunnerField, { createOpponent, opponentToRunnerInput, type Opponent } from './RunnerField.svelte';
  import RaceSimResultPanel from './RaceSimResult.svelte';

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
  // Team Trials and career team races need team ids this page does not set, so
  // they are not offered.
  const RACE_TYPE_CHOICES = RACE_TYPE_OPTIONS.filter((option) => option.value !== '14' && option.value !== '7');

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

  let trainee = $state<Trainee>(createTrainee());
  let opponents = $state<Array<Opponent>>([createOpponent(1), createOpponent(2)]);

  let runs = $state('100');
  let seed = $state(String(Math.floor(Math.random() * 2 ** 31)));

  let run = $state<SimulatorRun<MonteCarloResult> | null>(null);
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
  const labels = $derived([
    'Your trainee',
    ...opponents.map((opponent, index) => opponent.name.trim() || `Opponent ${index + 1}`)
  ]);

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

  function rollSeed(): void {
    seed = String(Math.floor(Math.random() * 2 ** 31));
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
    if (opponents.length < 1) {
      error = 'Add at least one opponent so the field has two runners.';
      return;
    }

    const runners: Array<MonteCarloRunnerInput> = [
      { trainee },
      ...opponents.map(opponentToRunnerInput)
    ];

    busy = true;
    try {
      const body = buildMonteCarloRequest({
        courseId: race.course_set_id,
        seed: Number(seed) || 0,
        setup: {
          raceInstanceId: race.race_instance_id,
          raceType: Number(raceType),
          season: Number(season),
          weather: Number(weather),
          ground: Number(ground),
          startTimeType: Number(startTime)
        },
        runners,
        runs: Number(runs) || 1,
        outputMode: 'results'
      });
      run = await simulatorRepository.monteCarlo({ key: apiKey.trim(), body: { ...body } });
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

<svelte:head><title>Race sim · uma.moe</title><meta name="robots" content="noindex, nofollow"/></svelte:head>

<PageFrame routeId="simulator-race" pageTitle="Race sim" width="wide" adsEnabled={false} labelledby="race-sim-title">
  <main>
    <header class="intro">
      <div>
        <h1 id="race-sim-title">Race sim</h1>
        <p>
          Run your trainee against a full field and compare finishing orders and times over
          many rolls. Runs on the private simulator through uma.moe. Currently in beta.
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
        <section class="panel" aria-labelledby="race-access-title">
          <h2 id="race-access-title">Access</h2>
          <TextField
            id="race-api-key"
            type="password"
            label="uma.moe API key"
            help="Simulator access is granted per key during the beta. Stored in this browser only."
            autocomplete="off"
            bind:value={apiKey}
          />
        </section>

        <section class="panel" aria-labelledby="race-race-title">
          <h2 id="race-race-title">Race</h2>
          {#if loadingCatalog}
            <Spinner />
          {:else}
            <Combobox
              id="race-race"
              label="Race"
              options={raceOptions}
              placeholder="Search races…"
              emptyText="No races found"
              bind:value={raceInstanceId}
            />
            {#if selectedRace}
              <p class="hint">{describeRace(selectedRace, courses.get(selectedRace.course_set_id))} · course {selectedRace.course_set_id}</p>
            {/if}
          {/if}

          <div class="grid">
            <SelectField id="race-type" label="Race type" options={RACE_TYPE_CHOICES} bind:value={raceType} />
            <SelectField id="race-ground" label="Ground" options={GROUND_OPTIONS} bind:value={ground} />
            <SelectField id="race-season" label="Season" options={SEASON_OPTIONS} bind:value={season} />
            <SelectField id="race-weather" label="Weather" options={WEATHER_OPTIONS} bind:value={weather} />
            <SelectField id="race-time" label="Time" options={TIME_OPTIONS} bind:value={startTime} />
          </div>
          <p class="hint">Team Trials and team races are not supported on this page.</p>
        </section>

        <TraineeInput bind:trainee />

        <RunnerField bind:runners={opponents} />

        <section class="panel" aria-labelledby="race-run-title">
          <h2 id="race-run-title">Run</h2>
          <div class="grid">
            <TextField
              id="race-runs"
              type="number"
              min={1}
              max={MAX_MONTE_CARLO_RUNS}
              label="Runs"
              help={`1–${MAX_MONTE_CARLO_RUNS}, one fresh seed each.`}
              bind:value={runs}
            />
            <TextField id="race-seed" type="number" label="Seed" help="Same seed, same batch." bind:value={seed} />
          </div>

          <div class="actions">
            <Button variant="secondary" icon="refresh" disabled={busy} onclick={rollSeed}>Roll a new seed</Button>
          </div>

          <Banner title="Big fields are slow" tone="warning" reportable={false}>
            Every run simulates every runner, so runs × field size is the real cost. A wide
            field and a high run count will take a while; start around 100 runs.
          </Banner>

          <Button onclick={send} loading={busy} disabled={!apiKey.trim() || !selectedRace}>
            Run simulation
          </Button>
        </section>
      </div>

      <section class="panel result" aria-labelledby="race-result-title">
        <h2 id="race-result-title">Result</h2>
        {#if run}
          <RaceSimResultPanel result={run.result} raw={run.raw} {labels} />
        {:else}
          <EmptyState
            icon="tools"
            title="No run yet"
            description="Set up a race, your trainee and a field, then run the simulation to see win counts and times."
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
  .actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
</style>
