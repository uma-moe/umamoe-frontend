<script lang="ts">
  import { onMount } from 'svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import SkillChip from '@/components/game/SkillChip.svelte';
  import {
    loadSkillCatalog,
    skillImage,
    skillRarity,
    type SkillCatalogEntry
  } from '@/lib/catalog/skill-catalog';
  import {
    buildOptimizeRequest,
    MAX_CANDIDATES,
    MAX_FINALISTS,
    OPTIMIZE_MODES,
    type OptimizeMode
  } from './requests/optimize-request';
  import { simulatorRepository, type OptimizeResult } from './simulator-repository';
  import { buildRaces, fieldWhere } from './setup/build/build-races';
  import RunnerInput from './setup/RunnerInput.svelte';
  import SkillOffers from './setup/build/SkillOffers.svelte';
  import BuildCodeDialog from './setup/build/BuildCodeDialog.svelte';
  import TrackPool from './setup/build/TrackPool.svelte';
  import { poolProblem, teamTrialsPool, type TeamTrialsMode } from './setup/build/track-pool';
  import { BUILD_CODE_VERSION, buildCodeRunner, type BuildCode } from './setup/build/build-code';
  import { buildSearch, saveBuildSearch } from './setup/build/build-search.svelte';
  import { offerPurchases, type PricedOffer } from './setup/build/skill-offers';
  import BuildResult from './reports/outcomes/BuildResult.svelte';
  import CourseButtons from './shell/CourseButtons.svelte';
  import RaceBar from './shell/RaceBar.svelte';
  import SimSection from './shell/SimSection.svelte';
  import SimulatorShell from './shell/SimulatorShell.svelte';
  import {
    selectedRaceInstanceId,
    selectedCourse,
    simulatorCatalog,
    catalogErrorVisible,
    dismissCatalogError,
    simulatorSession
  } from './simulator-session.svelte';

  const MODE_LABELS: Record<OptimizeMode, string> = {
    cm: 'Champions Meeting',
    tt_sprint: 'Team Trials · Sprint',
    tt_mile: 'Team Trials · Mile',
    tt_medium: 'Team Trials · Medium',
    tt_long: 'Team Trials · Long',
    tt_dirt: 'Team Trials · Dirt'
  };
  const MODE_OPTIONS = OPTIMIZE_MODES.map((mode) => ({ value: mode, label: MODE_LABELS[mode] }));
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
  const number = (value: string | number | null | undefined, fallback = 0) => {
    const parsed = Number(value);
    return value === '' || value == null || !Number.isFinite(parsed) ? fallback : parsed;
  };
  const candidates = $derived(
    Math.min(MAX_CANDIDATES, Math.max(1, Math.round(number(buildSearch.candidates, 256))))
  );
  const finalists = $derived(
    Math.min(MAX_FINALISTS, candidates, Math.max(1, Math.round(number(buildSearch.finalists, 5))))
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
  const summary = $derived(
    busy
      ? 'Searching builds…'
      : error
        ? 'Couldn’t search'
        : !run
          ? 'Not searched yet'
          : !current
            ? 'Setup changed'
            : run.result.report.finalists[0]
              ? bestSummary(run.result.report.finalists[0], run.result.objective === 'field_place')
              : 'No build came back'
  );

  /** The best build in a line: what it gains her (time, or runners beaten in real fields) and what it costs. */
  function bestSummary(
    best: OptimizeResult['report']['finalists'][number],
    field: boolean
  ): string {
    const gain = best.validation_gain ?? best.gain;
    const cost = best.sp_cost.toLocaleString() + ' SP';
    return gain && best.build.purchases.length && gain.mean > 0
      ? (field
          ? 'Beats ' + gain.mean.toFixed(2) + ' more runners a race · '
          : 'Saves ' + gain.mean.toFixed(2) + ' s a race · ') + cost
      : best.build.purchases.length
        ? 'Best build: ' + cost
        : 'Buying nothing scores best';
  }

  /** The server's message in the page's words, for the errors a reader can fix here. */
  function explain(message: string): string {
    const skill = /skill (\d+)/.exec(message)?.[1];
    const name = skill ? (catalog.get(Number(skill))?.name ?? 'Skill ' + skill) : 'A skill';
    if (/fan_count/.test(message))
      return name + ' grows with her fans. Enter her fans under Skills to buy and search again.';
    // What an older simulator service says to a search that races her alone over a pool of tracks.
    if (
      /runner count must be 2|1\.\.=4 scenarios|needs score_context|unknown field `hp_changes`/.test(
        message
      )
    )
      return 'The simulator service is an older build: it can’t race her alone or over a pool of tracks. Rebuild and restart it, then search again.';
    return message;
  }

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
      seed: number(buildSearch.seed),
      mode: buildSearch.mode,
      ...(teamTrials && pool.length ? { tracks: pool.map((entry) => entry.course_id) } : {}),
      uma1: buildCodeRunner($state.snapshot(buildSearch.uma), course, {
        sp: number(buildSearch.budget),
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
      budget = number(buildSearch.budget);
    const races = buildRaces({
      her: $state.snapshot(buildSearch.uma),
      seed: number(buildSearch.seed),
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
        seed: number(buildSearch.seed),
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
      error = explain(reason instanceof Error ? reason.message : 'The request failed.');
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
        <div class="owned">
          <span class="owned-label">Owns</span>
          {#if buildSearch.uma.skills.length}
            <ul>
              {#each buildSearch.uma.skills as learned (learned.skillId)}
                {@const skill = catalog.get(learned.skillId)}
                <li>
                  <SkillChip
                    name={skill?.name ?? 'Skill ' + learned.skillId}
                    icon={skillImage(skill?.icon)}
                    rarity={skillRarity(skill, Boolean(skill?.inherited))}
                    compact
                  />
                </li>
              {/each}
            </ul>
          {:else}
            <small>No skills yet; add the ones she has with Full build &amp; skills.</small>
          {/if}
        </div>
      </RunnerInput>
      <SimSection
        number={2}
        title="Goal"
        note="What the build is for and where she races"
      >
        {#snippet actions()}{#if !teamTrials}<CourseButtons />{/if}{/snippet}
        <div class="goal-mode">
          <SelectField
            id="build-mode"
            label="Optimize for"
            options={MODE_OPTIONS}
            bind:value={buildSearch.mode}
          />
        </div>
        <p class="goal-note">
          {#if teamTrials}
            She races with a fixed pack of eight runners without skills: one front runner, three
            pace chasers, three late surgers and one end closer, all with her stats. Every build
            meets the same pack, so each skill is judged by the time she actually runs.
          {:else}
            She races in real CM fields recorded in game, in place of a runner of her style, and
            each skill is judged by how many runners she beats, weighed with what recorded CM races
            say about it. On a course no recorded CM ran, the closest CM's runners are rebuilt for
            it. A simulator without CM data races her with a fixed pack instead.
          {/if}
        </p>
        {#if teamTrials}
          <TrackPool
            mode={buildSearch.mode as TeamTrialsMode}
            catalog={simulatorCatalog.courses}
            bind:picked={
              () => buildSearch.tracks[buildSearch.mode as TeamTrialsMode],
              (value) => (buildSearch.tracks[buildSearch.mode as TeamTrialsMode] = value)
            }
          />
          <RaceBar
            bare
            conditionsOnly
          />
        {:else}
          <RaceBar bare />
        {/if}
        <div class="goal-fields">
          <div class="seed">
            <TextField
              id="build-seed"
              label="Seed"
              type="number"
              error={invalidSeed ? 'Enter a whole number.' : undefined}
              bind:value={buildSearch.seed}
            />
            <Button
              variant="secondary"
              size="sm"
              icon="refresh"
              ariaLabel="Random seed"
              onclick={() => (buildSearch.seed = String(Math.floor(Math.random() * 2 ** 31)))}
            />
          </div>
          <TextField
            id="build-candidates"
            label="Builds to try"
            type="number"
            min={1}
            max={MAX_CANDIDATES}
            bind:value={buildSearch.candidates}
          />
          <TextField
            id="build-finalists"
            label="Builds to check again"
            type="number"
            min={1}
            max={MAX_FINALISTS}
            bind:value={buildSearch.finalists}
          />
          <TextField
            id="build-debuffs"
            label="HP debuffs taken"
            type="number"
            min={0}
            max={256}
            bind:value={buildSearch.debuffs.count}
          />
          <TextField
            id="build-debuff-percent"
            label="% HP each"
            type="number"
            min={0.1}
            max={100}
            step={0.5}
            bind:value={buildSearch.debuffs.percent}
          />
        </div>
      </SimSection>
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
    <!-- Narrow screens: the search button and its answer stay in reach while the form scrolls. -->
    <div class="search-bar">
      <button
        type="button"
        class="summary"
        onclick={() => resultPanel?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
      >
        {blocked || summary}
        <small>See result</small>
      </button>
      <Button
        icon="tune"
        loading={busy}
        disabled={!!blocked}
        onclick={send}
      >
        Find the best build
      </Button>
    </div>
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
  .search-bar {
    display: none;
  }
  /* The skills she owns, under her stats. */
  .owned {
    display: flex;
    align-items: baseline;
    gap: 8px 12px;
    min-width: 0;
  }
  .owned-label {
    flex: none;
    font-size: 12px;
    font-weight: 600;
  }
  .owned ul {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .owned small {
    font-size: 12px;
    color: var(--text-secondary);
  }
  .goal-mode {
    --control-height: var(--setup-control-height);
    display: grid;
    max-width: 420px;
  }
  .goal-mode :global(.field) {
    gap: 4px;
  }
  .goal-mode :global(label) {
    font-size: 12px;
    font-weight: 600;
  }
  .goal-mode :global(.select-control) {
    font-size: 13px;
  }
  .goal-note {
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
  .goal-fields {
    --control-height: var(--setup-control-height);
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px 12px;
    align-items: start;
  }
  .goal-fields :global(.field) {
    gap: 4px;
  }
  .goal-fields :global(label) {
    font-size: 12px;
  }
  .goal-fields :global(input),
  .goal-fields :global(.select-control) {
    font-size: 13px;
  }
  .seed {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 36px;
    gap: 6px;
    align-items: start;
  }
  .seed > :global(.ui-button) {
    width: 36px;
    height: var(--setup-control-height);
    margin-top: 18px;
    padding: 0;
  }
  @container build-form (max-width: 700px) {
    .goal-fields {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .seed {
      grid-column: 1 / -1;
    }
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
    .search-bar {
      position: sticky;
      bottom: 12px;
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 8px 8px 14px;
      border: 1px solid var(--border-primary);
      border-radius: var(--radius-lg);
      background: var(--surface-1);
      box-shadow: 0 6px 24px rgb(0 0 0 / 0.28);
    }
    .summary {
      display: grid;
      flex: 1;
      min-width: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--text-primary);
      font: inherit;
      font-size: 14px;
      font-weight: 650;
      text-align: left;
      cursor: pointer;
    }
    .summary small {
      font-size: 11px;
      font-weight: 400;
      color: var(--text-secondary);
    }
    .search-bar :global(.ui-button) {
      min-height: 44px;
    }
  }
  @media (max-width: 767px) {
    .build-search {
      --setup-control-height: 44px;
    }
    .build-form {
      padding: 14px;
    }
    .seed {
      grid-template-columns: minmax(0, 1fr) 44px;
    }
    .seed > :global(.ui-button) {
      width: 44px;
    }
  }
</style>
