<script lang="ts">
  import Banner from '@/components/Banner.svelte';
  import Button from '@/components/Button.svelte';
  import EmptyState from '@/components/EmptyState.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import TextField from '@/components/TextField.svelte';
  import SimulatorPageFrame from './shell/SimulatorPageFrame.svelte';
  import { HttpError } from '@/services/http/http-client';
  import { RACE_TYPE_OPTIONS, raceTypeLabel } from './simulator-race-types';
  import {
    MAX_MONTE_CARLO_RUNS,
    buildMonteCarloRequest,
    type MonteCarloRunnerInput,
    type MonteCarloSkillInput
  } from './race-sim-request';
  import {
    simulatorRepository,
    type MonteCarloResult,
    type SimulatorRun
  } from './simulator-repository';
  import RunnerField, { createOpponent, opponentToRunnerInput, type Opponent } from './RunnerField.svelte';
  import RunnerSkills from './RunnerSkills.svelte';
  import RaceSimResultPanel from './RaceSimResult.svelte';
  import RaceBar from './shell/RaceBar.svelte';
  import SimulatorShell from './shell/SimulatorShell.svelte';
  import { RACE_INSTANCE_NONE, selectedCourse, simulatorCatalog, catalogErrorVisible, dismissCatalogError, simulatorSession } from './simulator-session.svelte';

  // Team Trials and career team races need team ids this page does not set, so
  // they are not offered.
  const RACE_TYPE_CHOICES = RACE_TYPE_OPTIONS.filter(
    (option) => option.value !== '14' && option.value !== '7'
  );

  let raceType = $state('0');
  let seed = $state(String(Math.floor(Math.random() * 2 ** 31)));
  let runs = $state('100');
  let opponents = $state<Array<Opponent>>([createOpponent(1), createOpponent(2)]);
  // Skills are per runner and the race sim is the only surface that sends them,
  // so the trainee's live here rather than on the session's shared trainee.
  let traineeSkills = $state<Array<MonteCarloSkillInput>>([]);
  let run = $state<SimulatorRun<MonteCarloResult> | null>(null);
  let error = $state('');
  let busy = $state(false);

  const course = $derived(selectedCourse());
  const canRun = $derived(Boolean(simulatorSession.apiKey.trim() && course && opponents.length >= 1));
  const labels = $derived([
    'Your trainee',
    ...opponents.map((opponent, index) => opponent.name.trim() || `Opponent ${index + 1}`)
  ]);

  function rollSeed(): void {
    seed = String(Math.floor(Math.random() * 2 ** 31));
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
    if (opponents.length < 1) {
      error = 'Add at least one opponent so the field has two runners.';
      return;
    }

    const runners: Array<MonteCarloRunnerInput> = [
      { trainee: simulatorSession.trainee, skills: traineeSkills },
      ...opponents.map(opponentToRunnerInput)
    ];

    busy = true;
    try {
      const body = buildMonteCarloRequest({
        courseId: target.course_id,
        seed: Number(seed) || 0,
        setup: {
          raceInstanceId: RACE_INSTANCE_NONE,
          raceType: Number(raceType),
          season: Number(simulatorSession.season),
          weather: Number(simulatorSession.weather),
          ground: Number(simulatorSession.ground),
          startTimeType: Number(simulatorSession.startTime)
        },
        runners,
        runs: Number(runs) || 1,
        outputMode: 'results'
      });
      run = await simulatorRepository.monteCarlo({
        key: simulatorSession.apiKey.trim(),
        body: { ...body }
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

  {#snippet fieldPanel()}
    <div class="stack">
      <RunnerField bind:runners={opponents} />
      <p class="hint">
        Every run simulates every runner, so runs × field size is the real cost. A wide field
        and a high run count will take a while; start around 100 runs.
      </p>
    </div>
  {/snippet}

  {#snippet traineeSkillsPanel()}
    <RunnerSkills bind:skills={traineeSkills} idPrefix="race-trainee" />
  {/snippet}

<SimulatorPageFrame
  routeId="simulator-race"
  title="Race sim"
  blurb="Run your trainee against a full field and compare finishing orders and times over many rolls. Runs on the private simulator through uma.moe. Currently in beta."
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
    mode="race"
    traineeExtras={traineeSkillsPanel}
    panels={[{
      id: 'field',
      label: 'Field',
      shortLabel: 'Field',
      icon: 'users-add',
      content: fieldPanel
    }]}
  >
    <RaceBar note={raceTypeLabel(Number(raceType))} />

    <div class="run-bar">
      <Button onclick={send} loading={busy} disabled={!canRun}>Run simulation</Button>
      <SelectField
        id="race-type"
        label="Race type"
        options={RACE_TYPE_CHOICES}
        help="Team Trials and team races are not supported on this page."
        bind:value={raceType}
      />
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
      <Button variant="secondary" icon="refresh" disabled={busy} onclick={rollSeed}>Roll a new seed</Button>
    </div>

    <section class="results surface" aria-labelledby="race-result-title">
      <h2 id="race-result-title">Result</h2>
      {#if run}
        <RaceSimResultPanel result={run.result} raw={run.raw} {labels} />
      {:else}
        <EmptyState
          icon="tools"
          title="No run yet"
          description="Set the field in the sidebar, then run the simulation to see win counts and times."
        />
      {/if}
    </section>
  </SimulatorShell>
</SimulatorPageFrame>

<style>
  .run-bar { display: flex; flex-wrap: wrap; align-items: end; gap: var(--space-3); }
  .results { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); min-width: 0; }
  .results h2 { margin: 0; font-size: var(--font-md); }
  .hint { margin: 0; color: var(--color-text-muted); font-size: var(--font-xs); }
</style>
