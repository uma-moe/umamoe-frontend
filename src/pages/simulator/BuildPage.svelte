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
    describeRace,
    loadSimulatorCourses,
    loadSimulatorRaces,
    raceTypeLabel,
    type SimulatorCourse,
    type SimulatorRace
  } from './simulator-catalog';
  import { simulatorRepository, type OptimizeResult } from './simulator-repository';
  import {
    buildOptimizeRequest,
    MAX_CANDIDATES,
    MAX_FINALISTS,
    OPTIMIZE_MODES,
    type OptimizeMode,
    type OptimizeScenarioInput
  } from './optimize-request';
  import { createTrainee, type Trainee } from './trainee';
  import TraineeInput from './TraineeInput.svelte';
  import PurchasesEditor, {
    MAX_PURCHASES,
    createPurchase,
    purchaseProblems,
    toOptimizePurchases,
    type PurchaseRow
  } from './PurchasesEditor.svelte';
  import OptimizeResultPanel from './OptimizeResult.svelte';

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
  const MODE_LABELS: Record<OptimizeMode, string> = {
    cm: 'Champions Meeting',
    tt_sprint: 'Team Trials · Sprint',
    tt_mile: 'Team Trials · Mile',
    tt_medium: 'Team Trials · Medium',
    tt_long: 'Team Trials · Long',
    tt_dirt: 'Team Trials · Dirt'
  };
  const MODE_OPTIONS = OPTIMIZE_MODES.map((candidate) => ({
    value: candidate,
    label: MODE_LABELS[candidate]
  }));

  /** Team Trials scores against the opposite team, so the setup carries race type 14. */
  const TEAM_TRIALS_RACE_TYPE = 14;

  /** A finished search plus the purchase names of the request that produced it. */
  interface BuildRun {
    result: OptimizeResult;
    raw: string;
    purchaseNames: Array<string>;
  }

  let apiKey = $state(readApiKey());
  let races = $state.raw<Array<SimulatorRace>>([]);
  let courses = $state.raw<Map<number, SimulatorCourse>>(new Map());
  let catalogError = $state('');
  let loadingCatalog = $state(true);

  let raceInstanceId = $state('');
  let ground = $state('1');
  let season = $state('1');
  let weather = $state('1');
  let startTime = $state('2');
  let seed = $state(String(Math.floor(Math.random() * 2 ** 31)));

  let trainee = $state<Trainee>(createTrainee());

  let mode = $state('cm');
  let selfEvaluate = $state('1');
  let opponentEvaluate = $state('1');
  let supportCardBonus = $state('0');
  let winsBefore = $state('0');

  let purchases = $state<Array<PurchaseRow>>([createPurchase({ name: 'Build A' })]);

  /**
   * Reasons the search cannot run, read straight from the current rows.
   *
   * A plain function rather than a `$derived`: this is only read while
   * rendering, and a derived here tripped Svelte's derived-inert failure as
   * soon as a sibling field changed, taking the whole page down.
   */
  function purchaseIssues(): Array<string> {
    return purchaseProblems(purchases);
  }
  let spBudget = $state('1200');
  let maxCandidates = $state('32');
  let finalists = $state('3');

  let run = $state<BuildRun | null>(null);
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
  const isTeamTrials = $derived(mode !== 'cm');
  const raceType = $derived(isTeamTrials ? TEAM_TRIALS_RACE_TYPE : 0);
  const maxCandidatesValue = $derived(clampInt(toNumber(maxCandidates, 1), 1, MAX_CANDIDATES));
  const finalistsValue = $derived(clampInt(toNumber(finalists, 1), 1, MAX_FINALISTS));
  const finalistsTooHigh = $derived(finalistsValue > maxCandidatesValue);
  const finalistsMax = $derived(Math.min(MAX_FINALISTS, maxCandidatesValue));

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

  async function send(): Promise<void> {
    if (busy) return;
    error = '';
    run = null;

    if (!apiKey.trim()) {
      error = 'Add your uma.moe API key to run the search.';
      return;
    }
    const race = selectedRace;
    if (!race) {
      error = 'Pick a race first.';
      return;
    }
    // The optimizer rejects a package with no skills and duplicate names, so
    // refuse here rather than spend a request learning it.
    const issues = purchaseProblems(purchases);
    if (issues.length > 0) {
      error = issues.join(' ');
      return;
    }
    if (finalistsTooHigh) {
      error = `Finalists (${finalistsValue}) cannot exceed the candidate count (${maxCandidatesValue}).`;
      return;
    }

    busy = true;
    try {
      const scenario: OptimizeScenarioInput = {
        name: race.name,
        weight: 1,
        courseId: race.course_set_id,
        seed: toNumber(seed),
        setup: {
          raceInstanceId: race.race_instance_id,
          raceType,
          season: Number(season),
          weather: Number(weather),
          ground: Number(ground),
          startTimeType: Number(startTime)
        },
        runners: [{ trainee }, { trainee: createTrainee() }],
        scoreContext: isTeamTrials
          ? {
              selfEvaluate: toNumber(selfEvaluate),
              opponentEvaluate: toNumber(opponentEvaluate),
              supportCardBonus: toNumber(supportCardBonus),
              winsBefore: toNumber(winsBefore)
            }
          : undefined
      };

      const body = buildOptimizeRequest({
        mode: optimizeMode(mode),
        targetSourceInputIndex: 0,
        spBudget: toNumber(spBudget),
        purchases: toOptimizePurchases(purchases),
        scenarios: [scenario],
        seed: toNumber(seed),
        maxCandidates: maxCandidatesValue,
        finalists: finalistsValue
      });

      const response = await simulatorRepository.optimize({ key: apiKey.trim(), body: { ...body } });
      run = {
        result: response.result,
        raw: response.raw,
        purchaseNames: body.purchases.map((purchase) => purchase.name)
      };
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

  /** Keeps the bound select narrow at the request boundary. */
  function optimizeMode(value: string): OptimizeMode {
    return OPTIMIZE_MODES.find((candidate) => candidate === value) ?? 'cm';
  }

  /** Empty or unparsable fields fall back instead of throwing. */
  /**
   * Reads a numeric field. Svelte binds a number input to a real number, to
   * null when it is cleared, and a select still hands back a string, so accept
   * all three and default anything unusable.
   */
  function toNumber(value: string | number | null | undefined, fallback = 0): number {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clampInt(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.round(value)));
  }
</script>

<svelte:head><title>Build search · uma.moe</title><meta name="robots" content="noindex, nofollow"/></svelte:head>

<PageFrame routeId="simulator-build" pageTitle="Build search" width="wide" adsEnabled={false} labelledby="build-title">
  <main>
    <header class="intro">
      <div>
        <h1 id="build-title">Build search</h1>
        <p>
          Search skill purchases against an SP budget and score the best builds on a real course.
          Runs on the private simulator through uma.moe. Currently in beta.
        </p>
      </div>
    </header>

    {#if catalogError}
      <Banner title="Race data unavailable" tone="danger" reportable={false}>{catalogError}</Banner>
    {/if}
    {#if error}
      <Banner title="Could not run the search" tone="danger" reportable={false}>{error}</Banner>
    {/if}

    <div class="workspace">
      <div class="form">
        <section class="panel" aria-labelledby="build-access-title">
          <h2 id="build-access-title">Access</h2>
          <TextField
            id="build-api-key"
            type="password"
            label="uma.moe API key"
            help="Simulator access is granted per key during the beta. Stored in this browser only."
            autocomplete="off"
            bind:value={apiKey}
          />
        </section>

        <section class="panel" aria-labelledby="build-race-title">
          <h2 id="build-race-title">Race</h2>
          <p class="hint">
            One scenario. The optimizer accepts one to four; this surface builds exactly one from
            this race, the trainee below and one baseline opponent so the field has two runners.
          </p>
          {#if loadingCatalog}
            <Spinner />
          {:else}
            <Combobox
              id="build-race"
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
            <SelectField id="build-ground" label="Ground" options={GROUND_OPTIONS} bind:value={ground} />
            <SelectField id="build-season" label="Season" options={SEASON_OPTIONS} bind:value={season} />
            <SelectField id="build-weather" label="Weather" options={WEATHER_OPTIONS} bind:value={weather} />
            <SelectField id="build-time" label="Time" options={TIME_OPTIONS} bind:value={startTime} />
          </div>

          <TextField
            id="build-seed"
            type="number"
            label="Seed"
            help="Seeds the search and the scenario; the same seed replays the same search."
            bind:value={seed}
          />
        </section>

        <TraineeInput bind:trainee />

        <section class="panel" aria-labelledby="build-search-title">
          <h2 id="build-search-title">Search</h2>
          <SelectField
            id="build-mode"
            label="Mode"
            options={MODE_OPTIONS}
            bind:value={mode}
            help="Team Trials modes add career and team bonuses to the score."
          />
          <p class="hint">Setup race type follows the mode: {raceTypeLabel(raceType)}.</p>

          {#if isTeamTrials}
            <div class="grid">
              <TextField
                id="build-self-evaluate"
                type="number"
                step={0.1}
                label="Self evaluate"
                help="Your team's evaluation score."
                bind:value={selfEvaluate}
              />
              <TextField
                id="build-opponent-evaluate"
                type="number"
                step={0.1}
                label="Opponent evaluate"
                help="The opposing team's evaluation score."
                bind:value={opponentEvaluate}
              />
              <TextField
                id="build-support-bonus"
                type="number"
                step={0.1}
                label="Support card bonus"
                help="Bonus applied to the score."
                bind:value={supportCardBonus}
              />
              <TextField
                id="build-wins-before"
                type="number"
                min={0}
                label="Wins before"
                help="Wins already banked this round."
                bind:value={winsBefore}
              />
            </div>
          {/if}

          <TextField
            id="build-sp-budget"
            type="number"
            min={0}
            label="SP budget"
            help="Total skill points a build may spend."
            bind:value={spBudget}
          />

          <TextField
            id="build-target"
            label="Target runner"
            value="0"
            readonly
            help="This surface scores the single trainee above, so the target is always runner 0."
          />

          <div class="grid">
            <TextField
              id="build-candidates"
              type="number"
              min={1}
              max={MAX_CANDIDATES}
              label="Max candidates"
              help={`1–${MAX_CANDIDATES}; the search stops here.`}
              bind:value={maxCandidates}
            />
            <TextField
              id="build-finalists"
              type="number"
              min={1}
              max={finalistsMax}
              label="Finalists"
              error={finalistsTooHigh ? 'Finalists cannot exceed the candidate count.' : undefined}
              help={`1–${MAX_FINALISTS}, at most the candidate count.`}
              bind:value={finalists}
            />
          </div>

          <PurchasesEditor bind:purchases disabled={busy} />

          {#if purchaseIssues().length > 0}
            <p class="hint problem" role="status">{purchaseIssues().join(' ')}</p>
          {/if}

          <p class="hint">Up to {MAX_PURCHASES} purchases per search.</p>

          <Button
            onclick={send}
            loading={busy}
            disabled={!apiKey.trim() || !selectedRace || finalistsTooHigh || purchaseIssues().length > 0}
          >
            Run search
          </Button>
        </section>
      </div>

      <section class="panel result" aria-labelledby="build-result-title">
        <h2 id="build-result-title">Result</h2>
        {#if run}
          <OptimizeResultPanel result={run.result} raw={run.raw} purchaseNames={run.purchaseNames} />
        {:else}
          <EmptyState
            icon="trophy"
            title="No search yet"
            description="Add purchases, set a budget, then run the search to rank the tested builds."
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
  .problem { color: var(--color-danger); }
</style>
