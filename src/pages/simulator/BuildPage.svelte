<script lang="ts">
  import { onMount } from 'svelte';
  import { loadSkills, type SkillData } from '@/lib/game-data/skills/skills';
  import { buildOptimizeRequest } from './requests/optimize-request';
  import { simulatorRepository, type OptimizeResult } from './simulator-repository';
  import { buildRaces, fieldWhere } from './setup/build/build-races';
  import RunnerInput from './setup/runner/RunnerInput.svelte';
  import SkillOffers from './setup/build/SkillOffers.svelte';
  import BuildCodeDialog from './setup/build/code/BuildCodeDialog.svelte';
  import BuildGoal from './setup/build/BuildGoal.svelte';
  import BuildSearchBar from './setup/build/BuildSearchBar.svelte';
  import { explainBuildError, formNumber } from './setup/build/build-run';
  import {
    poolProblem,
    poolWeights,
    teamTrialsPool,
    type TeamTrialsMode
  } from './setup/build/track-pool';
  import {
    BUILD_CODE_VERSION,
    buildCodeRunner,
    type BuildCode,
    type BuildCodePage
  } from './setup/build/code/build-code';
  import {
    buildSearch,
    restoreBuildSearch,
    saveBuildSearch
  } from './setup/build/build-search.svelte';
  import { offerPurchases, type PricedOffer } from './setup/build/skill-offers';
  import BuildResult from './reports/outcomes/build/BuildResult.svelte';
  import { theorizedResult } from './reports/outcomes/build/build-result';
  import SimulatorShell from './shell/SimulatorShell.svelte';
  import {
    selectedRaceInstanceId,
    selectedCourse,
    simulatorCourseData,
    simulatorSession
  } from './simulator-session.svelte';

  /** Team Trials races carry race type 14. */
  const TEAM_TRIALS_RACE_TYPE = 14;

  let skillLookup = $state.raw(new Map<number, SkillData>());
  let run = $state<{
    result: OptimizeResult;
    offers: PricedOffer[];
    budget: number;
    key: string;
    where: string[];
  } | null>(null);

  let error = $state('');
  let busy = $state(false);
  /** The Setup row has room for her SP and fans, so the skills on offer leave them out. */
  let budgetInSetup = $state(false);
  let resultPanel = $state<HTMLElement>();
  let codeOpen = $state(false);
  let codeText = $state('');

  // Keep the setup in this browser as it changes.
  $effect(saveBuildSearch);

  /**
   * A link can carry a build code as `?build=`. It opens the import with the code so its preview shows what replaces
   * the saved setup, and leaves the address so a reload does not ask again.
   */
  function openLinkedCode(): void {
    const url = new URL(location.href);
    const linked = url.searchParams.get('build');
    if (linked === null) return;

    url.searchParams.delete('build');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);

    // An unescaped `+` in base64 arrives as a space.
    codeText = linked.trim().replace(/ /g, '+');
    codeOpen = codeText !== '';
  }

  onMount(() => {
    openLinkedCode();

    let active = true;
    void loadSkills()
      .then((value) => {
        if (active) skillLookup = value;
      })
      .catch((reason: unknown) => {
        if (active)
          error = reason instanceof Error ? reason.message : 'Skill data could not be loaded.';
      });

    return () => {
      active = false;
    };
  });

  const teamTrials = $derived(buildSearch.mode !== 'cm');
  /** Team Trials draws its course per race; these are the courses she races, one per race. */
  const pool = $derived(
    teamTrials
      ? teamTrialsPool(
          simulatorCourseData.courses,
          buildSearch.mode as TeamTrialsMode,
          buildSearch.tracks[buildSearch.mode as TeamTrialsMode]
        )
      : []
  );

  /** The course she races on; in Team Trials the first of the pool stands for the distance. */
  const course = $derived(teamTrials ? pool[0] : selectedCourse());
  const owned = $derived(buildSearch.uma.skills.map((skill) => skill.skillId));
  const offers = $derived(
    offerPurchases(buildSearch.offers, owned, skillLookup, buildSearch.fastLearner)
  );

  // Why the search cannot run yet, said next to its button.
  const blocked = $derived.by(() => {
    if (teamTrials && poolProblem(pool)) {
      return poolProblem(pool);
    }

    if (!course) {
      return 'Pick a track and course first.';
    }

    if (!offers.purchases.length) {
      return 'Add the skills she can buy first.';
    }

    if (offers.lockedCost > formNumber(buildSearch.budget)) {
      return 'The locked skills cost more than the SP available.';
    }

    return '';
  });

  /** The result as the theory valued it, its builds the most worth first: the pick, in the result and the run bar. */
  const theorized = $derived(
    run ? theorizedResult({ result: run.result, offers: run.offers }) : undefined
  );

  // What a search would plan with, said in the run bar beside its button.
  const planSetup = $derived(
    offers.purchases.length +
      (offers.purchases.length === 1 ? ' skill' : ' skills') +
      ' on offer within ' +
      formNumber(buildSearch.budget).toLocaleString('en-US') +
      ' SP'
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

  const current = $derived(run !== null && run.key === inputKey);
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
      ),
      page: { tab: 'build', setup: $state.snapshot(buildSearch) }
    };
  }

  /** Loads the whole Build optimizer from a code copied from it. */
  function restoreTab(page: BuildCodePage): string | void {
    if (page.tab !== 'build') return 'This code was copied from another tab.';

    Object.assign(buildSearch, restoreBuildSearch(page.setup));
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
      weights: teamTrials ? poolWeights(pool, buildSearch.mode as TeamTrialsMode) : undefined,
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
        locked: offers.locked,
        scenarios: races.scenarios,
        seed: formNumber(buildSearch.seed),
        debuffs: {
          count: Number(buildSearch.debuffs.count),
          percent: Number(buildSearch.debuffs.percent)
        }
      });

      const response = await simulatorRepository.optimize({ body: { ...body } });
      run = {
        result: response.result,
        offers: priced,
        budget,
        key,
        // Against the course this search raced on, not whatever is picked once it answers.
        where: response.result.fields
          ? fieldWhere(response.result.fields, races.course, simulatorCourseData.courses)
          : races.where
      };
    } catch (reason) {
      error = explainBuildError(
        reason instanceof Error ? reason.message : 'The request failed.',
        skillLookup
      );
    } finally {
      busy = false;
    }
  }
</script>

<SimulatorShell
  mode="build"
  showUma={false}
>
  <div class="build-search">
    <div
      class="build-form"
      role="group"
      aria-label="Build optimizer input"
    >
      <RunnerInput
        bind:uma={buildSearch.uma}
        {course}
        note="Her stats at the end of the career"
        oncode={() => (codeOpen = true)}
      />
      <BuildGoal
        {teamTrials}
        bind:budgetHere={budgetInSetup}
      />
      <SkillOffers
        number={3}
        {skillLookup}
        {owned}
        showBudget={!budgetInSetup}
      />
    </div>
    <BuildSearchBar
      {blocked}
      {busy}
      {error}
      result={run?.result}
      pick={theorized?.builds[0]}
      {current}
      setup={planSetup}
      onsend={send}
      onshow={() => resultPanel?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
    />
    <aside
      class="build-side"
      aria-label="Build optimizer result"
      bind:this={resultPanel}
    >
      <h2 class="sr-only">Build optimizer result</h2>
      <BuildResult
        result={run?.result}
        {theorized}
        offers={run?.offers}
        budget={run?.budget}
        where={run?.where}
        {busy}
        {error}
        stale={!!run && !current}
        onretry={blocked ? undefined : send}
      />
    </aside>
  </div>
</SimulatorShell>

<BuildCodeDialog
  bind:open={codeOpen}
  bind:text={codeText}
  target="build"
  current={currentCode}
  onrestore={restoreTab}
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
  /* The form, its run bar, then the result at full width; the bar stays in reach while the form scrolls. */
  .build-search {
    --setup-control-height: 36px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
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
    display: grid;
    gap: 10px;
    min-width: 0;
    scroll-margin-top: calc(var(--app-header-height, 64px) + 12px);
  }
  /* A phone: the design system's denser controls, as on the database filters, and a tighter panel. */
  @media (max-width: 767px) {
    .build-search {
      --setup-control-height: var(--control-height);
      gap: 10px;
    }
    .build-form {
      padding: 10px 12px;
    }
  }
</style>
