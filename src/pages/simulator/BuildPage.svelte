<script lang="ts">
  import { onMount } from 'svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import { loadSkillCatalog, type SkillCatalogEntry } from '@/lib/catalog/skill-catalog';
  import { buildOptimizeRequest, MAX_CANDIDATES, MAX_FINALISTS } from './requests/optimize-request';
  import { simulatorRepository, type OptimizeResult } from './simulator-repository';
  import { buildRaces, fieldWhere } from './setup/build/build-races';
  import RunnerInput from './setup/runner/RunnerInput.svelte';
  import SkillOffers from './setup/build/SkillOffers.svelte';
  import BuildCodeDialog from './setup/build/code/BuildCodeDialog.svelte';
  import BuildGoal from './setup/build/BuildGoal.svelte';
  import BuildOwnedSkills from './setup/build/BuildOwnedSkills.svelte';
  import BuildSearchBar from './setup/build/BuildSearchBar.svelte';
  import { explainBuildError, formNumber } from './setup/build/build-run';
  import { poolProblem, teamTrialsPool, type TeamTrialsMode } from './setup/build/track-pool';
  import {
    BUILD_CODE_VERSION,
    buildCodeRunner,
    type BuildCode
  } from './setup/build/code/build-code';
  import { buildSearch, saveBuildSearch } from './setup/build/build-search.svelte';
  import { offerPurchases, type PricedOffer } from './setup/build/skill-offers';
  import BuildResult from './reports/outcomes/build/BuildResult.svelte';
  import SimulatorShell from './shell/SimulatorShell.svelte';
  import {
    selectedRaceInstanceId,
    selectedCourse,
    simulatorCatalog,
    catalogErrorVisible,
    dismissCatalogError,
    simulatorSession
  } from './simulator-session.svelte';

  /** Team Trials races carry race type 14. */
  const TEAM_TRIALS_RACE_TYPE = 14;

  let catalog = $state.raw(new Map<number, SkillCatalogEntry>());
  let run = $state<{
    result: OptimizeResult;
    raw: string;
    offers: PricedOffer[];
    budget: number;
    key: string;
    where: string;
  } | null>(null);
  let error = $state('');
  let busy = $state(false);
  let resultPanel = $state<HTMLElement>();
  let codeOpen = $state(false);

  // Keep the setup in this browser as it changes.
  $effect(saveBuildSearch);

  onMount(() => {
    let active = true;
    void loadSkillCatalog()
      .then((value) => {
        if (active) catalog = value;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  });

  const teamTrials = $derived(buildSearch.mode !== 'cm');
  /** Team Trials draws its course per race; these are the courses she races, one per race. */
  const pool = $derived(
    teamTrials
      ? teamTrialsPool(
          simulatorCatalog.courses,
          buildSearch.mode as TeamTrialsMode,
          buildSearch.tracks[buildSearch.mode as TeamTrialsMode]
        )
      : []
  );
  /** The course she races on; in Team Trials the first of the pool stands for the distance. */
  const course = $derived(teamTrials ? pool[0] : selectedCourse());
  const owned = $derived(buildSearch.uma.skills.map((skill) => skill.skillId));
  const offers = $derived(
    offerPurchases(buildSearch.offers, owned, catalog, buildSearch.fastLearner)
  );
  const candidates = $derived(
    Math.min(MAX_CANDIDATES, Math.max(1, Math.round(formNumber(buildSearch.candidates, 256))))
  );
  const finalists = $derived(
    Math.min(
      MAX_FINALISTS,
      candidates,
      Math.max(1, Math.round(formNumber(buildSearch.finalists, 5)))
    )
  );
  const invalidSeed = $derived(
    !/^-?\d+$/.test(String(buildSearch.seed)) || Math.abs(Number(buildSearch.seed)) > 2147483647
  );
  // Why the search cannot run yet, said next to its button.
  const blocked = $derived(
    teamTrials && poolProblem(pool)
      ? poolProblem(pool)
      : !course
        ? 'Pick a track and course first.'
        : !offers.purchases.length
          ? 'Add the skills she can buy first.'
          : invalidSeed
            ? 'Fix the seed first.'
            : ''
  );
  // Everything the search depends on, so the result can say when it no longer matches.
  const inputKey = $derived(
    JSON.stringify([
      course?.course_id,
      pool.map((entry) => entry.course_id),
      selectedRaceInstanceId(),
      simulatorSession.ground,
      simulatorSession.weather,
      simulatorSession.season,
      simulatorSession.startTime,
      buildSearch
    ])
  );
  const current = $derived(!!run && run.key === inputKey);
  /** The setup as a build code. */
  function currentCode(): BuildCode {
    return {
      version: BUILD_CODE_VERSION,
      ...(course ? { courseId: course.course_id } : {}),
      racedef: {
        ground: Number(simulatorSession.ground),
        weather: Number(simulatorSession.weather),
        season: Number(simulatorSession.season),
        time: Number(simulatorSession.startTime)
      },
      seed: formNumber(buildSearch.seed),
      mode: buildSearch.mode,
      ...(teamTrials && pool.length ? { tracks: pool.map((entry) => entry.course_id) } : {}),
      uma1: buildCodeRunner($state.snapshot(buildSearch.uma), course, {
        sp: formNumber(buildSearch.budget),
        fastLearner: buildSearch.fastLearner
      }),
      chartSkills: buildSearch.offers.map((offer) => String(offer.skillId)),
      hintLevels: Object.fromEntries(
        buildSearch.offers
          .filter((offer) => offer.hint > 0)
          .map((offer) => [String(offer.skillId), offer.hint])
      )
    };
  }

  async function send(): Promise<void> {
    if (busy || blocked || !course) return;
    error = '';
    busy = true;
    const key = inputKey,
      priced = offers.priced,
      budget = formNumber(buildSearch.budget);
    const races = buildRaces({
      her: $state.snapshot(buildSearch.uma),
      seed: formNumber(buildSearch.seed),
      course: $state.snapshot(course),
      pool: teamTrials ? pool : undefined,
      setup: {
        raceInstanceId: selectedRaceInstanceId(),
        raceType: teamTrials ? TEAM_TRIALS_RACE_TYPE : 0,
        season: Number(simulatorSession.season),
        weather: Number(simulatorSession.weather),
        ground: Number(simulatorSession.ground),
        startTimeType: Number(simulatorSession.startTime)
      }
    });
    if (!races) {
      error = 'Pick a course first.';
      busy = false;
      return;
    }
    try {
      const body = buildOptimizeRequest({
        mode: buildSearch.mode,
        targetSourceInputIndex: 0,
        spBudget: budget,
        purchases: offers.purchases,
        scenarios: races.scenarios,
        seed: formNumber(buildSearch.seed),
        maxCandidates: candidates,
        finalists,
        debuffs: {
          count: Number(buildSearch.debuffs.count),
          percent: Number(buildSearch.debuffs.percent)
        }
      });
      const response = await simulatorRepository.optimize({ body: { ...body } });
      run = {
        result: response.result,
        raw: response.raw,
        offers: priced,
        budget,
        key,
        where: response.result.fields
          ? fieldWhere(response.result.fields, course, simulatorCatalog.courses)
          : races.where
      };
    } catch (reason) {
      error = explainBuildError(
        reason instanceof Error ? reason.message : 'The request failed.',
        catalog
      );
    } finally {
      busy = false;
    }
  }
</script>

{#if catalogErrorVisible()}
  <Banner
    title="Race data unavailable"
    tone="danger"
    reportable={false}
    dismissible
    ondismiss={dismissCatalogError}
  >
    {simulatorCatalog.error}
  </Banner>
{/if}

<SimulatorShell
  mode="build"
  showUma={false}
>
  <div class="build-search">
    <div
      class="build-form"
      role="group"
      aria-label="Build search input"
    >
      <RunnerInput
        bind:uma={buildSearch.uma}
        {course}
        idPrefix="build"
        note="Her stats at the end of the career"
        oncode={() => (codeOpen = true)}
      >
        <BuildOwnedSkills {catalog} />
      </RunnerInput>
      <BuildGoal
        {teamTrials}
        {invalidSeed}
      />
      <SkillOffers
        number={3}
        {catalog}
        {owned}
      />
    </div>
    <aside
      class="build-side"
      aria-label="Build search result"
      bind:this={resultPanel}
    >
      <h2 class="sr-only">Build search result</h2>
      <div class="search">
        <Button
          icon="tune"
          loading={busy}
          disabled={!!blocked}
          onclick={send}
        >
          Find the best build
        </Button>
        {#if blocked}<p class="blocked">{blocked}</p>{/if}
      </div>
      <BuildResult
        result={run?.result}
        raw={run?.raw}
        offers={run?.offers}
        budget={run?.budget}
        where={run?.where}
        {busy}
        {error}
        stale={!!run && !current}
        onretry={blocked ? undefined : send}
      />
    </aside>
    <BuildSearchBar
      {blocked}
      {busy}
      {error}
      result={run?.result}
      {current}
      onsend={send}
      onshow={() => resultPanel?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
    />
  </div>
</SimulatorShell>

<BuildCodeDialog
  bind:open={codeOpen}
  target="build"
  current={currentCode}
  onimport={({ umas, offers, goal }) => {
    buildSearch.uma = umas[0]!;
    buildSearch.offers = offers;
    if (goal.sp !== undefined) buildSearch.budget = String(goal.sp);
    if (goal.fastLearner !== undefined) buildSearch.fastLearner = goal.fastLearner;
    if (goal.mode) buildSearch.mode = goal.mode;
    if (goal.tracks && goal.mode && goal.mode !== 'cm') buildSearch.tracks[goal.mode] = goal.tracks;
    if (goal.seed !== undefined) buildSearch.seed = String(goal.seed);
  }}
/>

<style>
  /* The form, then the result under it at full width; a bar keeps the answer in reach while the form scrolls. */
  .build-search {
    --setup-control-height: 36px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(340px, 420px);
    gap: 16px;
    align-items: start;
    min-width: 0;
  }
  .build-form {
    min-width: 0;
    padding: 12px 18px;
    container: build-form sim-form / inline-size;
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
  }
  .build-side {
    position: sticky;
    top: calc(var(--app-header-height, 64px) + 12px);
    display: grid;
    gap: 10px;
    min-width: 0;
    scroll-margin-top: calc(var(--app-header-height, 64px) + 12px);
  }
  .search {
    display: grid;
    gap: 6px;
  }
  .search :global(.ui-button) {
    width: 100%;
    min-height: 44px;
    font-size: 14px;
  }
  .blocked {
    margin: 0;
    font-size: 12px;
    color: var(--accent-warning);
    text-align: center;
  }
  @media all {
    .build-search {
      grid-template-columns: minmax(0, 1fr);
    }
    .build-side {
      position: static;
    }
  }
  /* Narrow: the search button floats at the bottom of the screen while the form and result scroll past. */
  @media (max-width: 1180px) {
    .search {
      display: none;
    }
  }
  @media (max-width: 767px) {
    .build-search {
      --setup-control-height: 44px;
    }
    .build-form {
      padding: 14px;
    }
  }
</style>
