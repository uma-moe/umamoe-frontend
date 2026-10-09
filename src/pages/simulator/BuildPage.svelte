<script lang="ts">
  import Banner from '@/components/Banner.svelte';
  import Button from '@/components/Button.svelte';
  import SelectField from '@/components/SelectField.svelte';
  import TextField from '@/components/TextField.svelte';
  import SimulatorPageFrame from './shell/SimulatorPageFrame.svelte';
  import { describeCourse, trackName } from '@/lib/catalog/course-catalog';
  import { RACE_TYPE_OPTIONS, raceTypeLabel } from './simulator-race-types';
  import {
    buildOptimizeRequest,
    MAX_CANDIDATES,
    MAX_FINALISTS,
    OPTIMIZE_MODES,
    type OptimizeMode,
    type OptimizeScenarioInput
  } from './optimize-request';
  import { simulatorRepository, type OptimizeResult } from './simulator-repository';
  import { createTrainee } from './trainee';
  import PurchasesEditor, {
    MAX_PURCHASES,
    createPurchase,
    purchaseProblems,
    toOptimizePurchases,
    type PurchaseRow
  } from './PurchasesEditor.svelte';
  import OptimizeResultPanel from './OptimizeResult.svelte';
  import RaceBar from './shell/RaceBar.svelte';
  import SimulatorShell from './shell/SimulatorShell.svelte';
  import { selectedRaceInstanceId, selectedCourse, simulatorCatalog, catalogErrorVisible, dismissCatalogError, simulatorSession } from './simulator-session.svelte';

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
    courseName: string;
  }

  let mode = $state('cm');
  let seed = $state(String(Math.floor(Math.random() * 2 ** 31)));
  let selfEvaluate = $state('1');
  let opponentEvaluate = $state('1');
  let supportCardBonus = $state('0');
  let winsBefore = $state('0');
  let spBudget = $state('1200');
  let maxCandidates = $state('32');
  let finalists = $state('3');
  let purchases = $state<Array<PurchaseRow>>([createPurchase({ name: 'Build A' })]);

  let run = $state<BuildRun | null>(null);
  let error = $state('');
  let busy = $state(false);

  const course = $derived(selectedCourse());
  const isTeamTrials = $derived(mode !== 'cm');
  const raceType = $derived(isTeamTrials ? TEAM_TRIALS_RACE_TYPE : 0);
  const maxCandidatesValue = $derived(clampInt(toNumber(maxCandidates, 1), 1, MAX_CANDIDATES));
  const finalistsValue = $derived(clampInt(toNumber(finalists, 1), 1, MAX_FINALISTS));
  const finalistsTooHigh = $derived(finalistsValue > maxCandidatesValue);
  const finalistsMax = $derived(Math.min(MAX_FINALISTS, maxCandidatesValue));

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

  const canRun = $derived(Boolean(course));

  async function send(): Promise<void> {
    if (busy) return;
    error = '';
    run = null;

    const target = course;
    if (!target) {
      error = 'Pick a course first.';
      return;
    }
    // The optimizer rejects a package with no skills and duplicate names, so
    // refuse here rather than spend a request learning it.
    const issues = purchaseIssues();
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
        name: `${trackName(target.race_track_id)} · ${describeCourse(target)}`,
        weight: 1,
        courseId: target.course_id,
        seed: toNumber(seed),
        setup: {
          raceInstanceId: selectedRaceInstanceId(),
          raceType,
          season: Number(simulatorSession.season),
          weather: Number(simulatorSession.weather),
          ground: Number(simulatorSession.ground),
          startTimeType: Number(simulatorSession.startTime)
        },
        runners: [{ trainee: simulatorSession.trainee }, { trainee: createTrainee() }],
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

      const response = await simulatorRepository.optimize({
        body: { ...body }
      });
      run = {
        courseName: trackName(target.race_track_id)+", "+describeCourse(target),
        result: response.result,
        raw: response.raw,
        purchaseNames: body.purchases.map((purchase) => purchase.name)
      };
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'The request failed.';
    } finally {
      busy = false;
    }
  }

  /** Keeps the bound select narrow at the request boundary. */
  function optimizeMode(value: string): OptimizeMode {
    return OPTIMIZE_MODES.find((candidate) => candidate === value) ?? 'cm';
  }

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

  {#snippet searchPanel()}
    <div class="stack">
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
    </div>
  {/snippet}

<SimulatorPageFrame
  routeId="simulator-build"
  title="Build search"
  blurb="Compare skill purchases within an SP budget on your selected course."
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
      <Banner title="Could not run the search" tone="danger" reportable={false} dismissible>{error}</Banner>
    {/key}
  {/if}

  <SimulatorShell
    mode="build"
    panels={[{
      id: 'search',
      label: 'Search',
      shortLabel: 'Search',
      icon: 'search',
      content: searchPanel
    }]}
  >
    <div class="calculator-grid"><RaceBar workspace note={raceTypeLabel(raceType)}/><div class="calculation-main">

    <div class="run-bar">
      <Button onclick={send} loading={busy} disabled={!canRun || finalistsTooHigh || purchaseIssues().length > 0}>Run search</Button>
      <TextField
        id="build-seed"
        type="number"
        label="Seed"
        help="Seeds the search and the scenario; the same seed replays the same search."
        bind:value={seed}
      />
      <p class="hint">
        One scenario: this race, the selected Uma and one baseline opponent so the
        field has two runners.
      </p>
    </div>

    <section class="results surface" aria-labelledby="build-result-title">
      <h2 id="build-result-title">Build search results</h2>{#if run}<p class="hint">{run.courseName}</p>{/if}
      <OptimizeResultPanel result={run?.result} raw={run?.raw} purchaseNames={run?.purchaseNames} {busy}/>
    </section></div></div>
  </SimulatorShell>
</SimulatorPageFrame>

<style>
  .calculator-grid{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px;align-items:start;min-width:0}.calculation-main{display:grid;gap:12px;min-width:0}@media(max-width:1050px){.calculator-grid{grid-template-columns:260px minmax(0,1fr);gap:12px}}@media(max-width:767px){.calculator-grid{grid-template-columns:minmax(0,1fr)}}

  .run-bar { display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--border-subtle);border-radius:var(--radius-md);background:var(--surface-1); }.run-bar :global(.field){width:190px}.run-bar .hint{flex:1;min-width:200px}
  .results { display:flex;flex-direction:column;gap:10px;padding:12px 16px;min-width:0;background:var(--surface-1);border:1px solid var(--border-subtle);border-radius:var(--radius-md); }
  .results h2 { margin:0;font-size:14px; }
  .hint { margin: 0; color: var(--color-text-muted); font-size: var(--font-xs); }
  .problem { color: var(--color-danger); }
</style>
