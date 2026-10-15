<script lang="ts">
  import { onMount } from 'svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Icon from '@/components/Icon.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import { loadSkillCatalog, type SkillCatalogEntry } from '@/lib/catalog/skill-catalog';
  import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
  import {
    loadReplayCourses,
    type Course
  } from '@/pages/competitive/race-analysis/replay/replay-course';
  import SimulatorShell from './shell/SimulatorShell.svelte';
  import RaceBar from './shell/RaceBar.svelte';
  import CourseButtons from './shell/CourseButtons.svelte';
  import SimSection from './shell/SimSection.svelte';
  import RunnerInput from './setup/RunnerInput.svelte';
  import BuildCodeDialog from './setup/build/BuildCodeDialog.svelte';
  import { BUILD_CODE_VERSION, buildCodeRunner } from './setup/build/build-code';
  import HpPlanInput from './setup/hp/HpPlanInput.svelte';
  import StaminaResultPanel from './reports/outcomes/StaminaResult.svelte';
  import { hpCalculator, saveHpCalculator } from './setup/hp/hp-calculator.svelte';
  import { countSkills, planEvents, planStats, type PlanMarker } from './setup/hp/hp-plan';
  import { hpSpread, hpVerdict } from './reports/outcomes/hp-needed';
  import {
    RUNNING_STYLES,
    traineeMotivation,
    traineeRunningStyle,
    traineeStats
  } from './setup/trainee';
  import {
    APTITUDE_GRADES,
    buildStaminaRequest,
    type AptitudeGrade,
    type StaminaEffectInput,
    type StaminaForm
  } from './requests/stamina-request';
  import {
    simulatorRepository,
    type SimulatorRun,
    type StaminaResult
  } from './simulator-repository';
  import { RACE_TYPE_OPTIONS } from './simulator-race-types';
  import type { SimulatorUma } from './simulator-uma';
  import {
    GROUND_OPTIONS,
    catalogErrorVisible,
    dismissCatalogError,
    selectedRaceInstanceId,
    selectedCourse,
    simulatorCatalog,
    simulatorSession
  } from './simulator-session.svelte';

  const SPURT_OPTIONS = [
    { value: 'false', label: 'By HP left' },
    { value: 'true', label: 'Always full' }
  ];
  /**
   * Races sampled per calculation, on seeds from one fixed start so the same setup gives the same answer. Each race
   * rolls her pace, where her skills land, whether she gets rushed and her spurt's wit roll.
   */
  const SEED = 1,
    SAMPLES = 100;
  /** How long typing may pause before the result follows. */
  const SETTLE_MS = 450;

  let run = $state<
    | (SimulatorRun<StaminaResult> & {
        forced: boolean;
        course: CourseCatalogEntry;
        /** Stamina with green skills, and `base` without them. */
        runner: { stamina: number; base: number; style: string; motivation: number };
        effects: StaminaEffectInput[];
        markers: PlanMarker[];
        key: string;
      })
    | null
  >(null);
  let error = $state('');
  let busy = $state(false);
  // After the first calculation the result follows every change; until then nothing is sent on its own.
  let live = $state(false);
  // Inputs whose calculation failed, so a failure is not retried until something changes.
  let failedKey = $state('');
  let courses = $state.raw<Record<string, Course>>({});
  let skills = $state.raw(new Map<number, SkillCatalogEntry>());

  // Keep the setup in this browser as it changes.
  $effect(saveHpCalculator);

  onMount(() => {
    let active = true;
    void loadReplayCourses()
      .then((value) => {
        if (active) courses = value.courses;
      })
      .catch(() => {});
    void loadSkillCatalog()
      .then((value) => {
        if (active) skills = value;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  });

  const course = $derived(selectedCourse());
  const geometry = $derived(
    (course && courses[course.course_id]) ?? { distance: course?.distance ?? 2000 }
  );
  const trainee = $derived(hpCalculator.uma.trainee);
  const stats = $derived(planStats(traineeStats(trainee), hpCalculator.plan));
  // What the counts and situations become on this course; the course strip shows it before calculating too.
  const events = $derived(planEvents(hpCalculator.plan, geometry, stats.guts, stats.wisdom));
  const canRun = $derived(Boolean(course));
  const spread = $derived(run ? hpSpread(run.result, run.runner, run.forced) : undefined);
  // Everything the calculation depends on, so the result can follow the inputs.
  const inputKey = $derived(
    JSON.stringify([
      course?.course_id,
      selectedRaceInstanceId(),
      hpCalculator.raceType,
      hpCalculator.fullSpurt,
      simulatorSession.ground,
      trainee,
      hpCalculator.plan
    ])
  );
  // The result is on its way to the current inputs.
  const pending = $derived(
    busy || (live && !!run && run.key !== inputKey && failedKey !== inputKey)
  );
  const verdict = $derived(spread && run ? hpVerdict(spread, run.forced) : undefined);
  // The answer in one line, for the bar that keeps it in reach while the form scrolls.
  const summary = $derived(
    !course
      ? 'Pick a track and course first'
      : error && !busy
        ? 'Couldn’t calculate'
        : !run
          ? busy
            ? 'Calculating…'
            : 'Does her HP last a full last spurt?'
          : verdict!.title +
            (spread?.needed
              ? ' · needs ≈ ' + Math.round(spread.needed.p50).toLocaleString() + ' stamina'
              : '')
  );
  let resultPanel = $state<HTMLElement>();
  let resultInView = $state(true);
  let codeOpen = $state(false);

  // The bar shows only while the result is out of sight.
  $effect(() => {
    if (!resultPanel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => (resultInView = !!entry?.isIntersecting),
      { rootMargin: '0px 0px -72px 0px' }
    );
    observer.observe(resultPanel);
    return () => observer.disconnect();
  });

  // Once she has a result, it follows the form a moment after each change.
  $effect(() => {
    const key = inputKey;
    if (!live || !canRun || busy || run?.key === key || failedKey === key) return;
    const timer = setTimeout(() => void send(), SETTLE_MS);
    return () => clearTimeout(timer);
  });

  /** Enter in any number field calculates at once, as a form would; menus and buttons keep their own Enter. */
  function submitOnEnter(node: HTMLElement) {
    const listener = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.key === 'Enter' && target instanceof HTMLInputElement && target.type === 'number') {
        event.preventDefault();
        void send();
      }
    };
    node.addEventListener('keydown', listener);
    return { destroy: () => node.removeEventListener('keydown', listener) };
  }

  /** The trainee editor holds grades as strings; the request wants the narrow union. */
  function traineeGrades(values: Array<string>): Array<AptitudeGrade> {
    return values.map((value) => APTITUDE_GRADES.find((grade) => grade === value) ?? 'A');
  }

  /** Counts her learned skills into the skill counts, for this course and her running style. */
  function count(uma: SimulatorUma) {
    if (!uma.skills.length || !skills.size) return;
    const style = RUNNING_STYLES.indexOf(
      uma.trainee.runningStyle as (typeof RUNNING_STYLES)[number]
    );
    Object.assign(
      hpCalculator.plan,
      countSkills(uma.skills, skills, {
        distance: course?.distance,
        distanceType: course?.distance_type,
        surface: course?.surface,
        turn: course?.turn,
        style: style === 4 ? 1 : style + 1
      })
    );
    hpCalculator.counted = 'Counted from ' + uma.name + '’s ' + uma.skills.length + ' skills';
  }

  /**
   * A simulator from before sampled races rejects the new fields: it names them, or, behind a proxy that keeps only the
   * status, answers 422 (the request no longer fits its JSON shape). Say what to do about it.
   */
  function explain(message: string) {
    return /unknown field `(samples|chance|start_spread_m)`|^422\b/.test(message)
      ? 'The simulator running here is an older build that cannot sample races. Rebuild and restart it.'
      : message;
  }

  async function send(): Promise<void> {
    if (busy || !canRun || !course) return;
    live = true;
    busy = true;
    const key = inputKey,
      target = $state.snapshot(course),
      plan = events;
    try {
      const form: StaminaForm = {
        courseId: target.course_id,
        raceInstanceId: selectedRaceInstanceId(),
        raceType: Number(hpCalculator.raceType),
        seed: SEED,
        samples: SAMPLES,
        ground: Number(simulatorSession.ground),
        weather: Number(simulatorSession.weather),
        season: Number(simulatorSession.season),
        startTimeType: Number(simulatorSession.startTime),
        stats,
        runningStyle: traineeRunningStyle(trainee),
        motivation: traineeMotivation(trainee),
        distanceAptitudes: traineeGrades(trainee.distanceAptitudes),
        styleAptitudes: traineeGrades(trainee.styleAptitudes),
        groundAptitudes: traineeGrades(trainee.groundAptitudes),
        fullSpurt: hpCalculator.fullSpurt === 'true',
        courseDistanceM: target.distance,
        effects: plan.effects,
        states: plan.states
      };
      const response = await simulatorRepository.stamina({ body: buildStaminaRequest(form) });
      run = {
        ...response,
        forced: form.fullSpurt,
        course: target,
        runner: {
          stamina: stats.stamina,
          base: traineeStats(trainee).stamina,
          style: form.runningStyle,
          motivation: form.motivation
        },
        effects: plan.effects,
        markers: plan.markers,
        key
      };
      error = '';
      failedKey = '';
    } catch (reason) {
      error = explain(reason instanceof Error ? reason.message : 'The request failed.');
      failedKey = key;
    } finally {
      busy = false;
    }
  }

  /** From the bar: calculates the first time, then shows the result. */
  async function show() {
    if (!run && !busy) await send();
    resultPanel?.scrollIntoView({ block: 'start', behavior: 'smooth' });
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
  mode="stamina"
  showUma={false}
>
  <div class="hp-calculator">
    <div
      class="hp-form"
      role="group"
      aria-label="HP calculator input"
      use:submitOnEnter
    >
      <RunnerInput
        bind:uma={hpCalculator.uma}
        green={hpCalculator.plan.green}
        {course}
        onbuild={count}
        oncode={() => (codeOpen = true)}
      />
      <SimSection
        number={2}
        title="Race"
      >
        {#snippet actions()}<CourseButtons />{/snippet}
        <div class="race-row">
          <RaceBar
            bare
            courseOnly
          />
          <SelectField
            id="hp-ground"
            label="Ground"
            options={GROUND_OPTIONS}
            bind:value={simulatorSession.ground}
          />
          <SelectField
            id="hp-race-type"
            label="Race format"
            options={RACE_TYPE_OPTIONS}
            bind:value={hpCalculator.raceType}
          />
          <SelectField
            id="hp-spurt"
            label="Last spurt"
            options={SPURT_OPTIONS}
            bind:value={hpCalculator.fullSpurt}
          />
        </div>
      </SimSection>
      <HpPlanInput
        course={geometry}
        guts={stats.guts}
        wit={stats.wisdom}
        skillCount={hpCalculator.uma.skills.length}
        oncount={() => count(hpCalculator.uma)}
      />
    </div>
    <aside
      class="hp-result"
      aria-label="HP result"
      bind:this={resultPanel}
    >
      <StaminaResultPanel
        result={run?.result}
        raw={run?.raw}
        forced={run?.forced}
        {busy}
        {pending}
        {error}
        oncalculate={canRun ? send : undefined}
        blocked={course ? '' : 'Pick a track and course first.'}
        runner={run?.runner}
        markers={run ? run.markers : events.markers}
        distance={run ? run.course.distance : geometry.distance}
      />
    </aside>
    <!-- The answer stays in reach while the form scrolls: until the result itself is in sight. -->
    {#if !resultInView}
      <div
        class="calc-bar {error && !busy ? 'bad' : (verdict?.tone ?? '')}"
        role="status"
      >
        <span class="summary">
          {#if verdict && !error}<Icon
              name={verdict.tone === 'good' ? 'check' : 'warning'}
              size={16}
            />{/if}
          {summary}
          {#if pending && run}<small>Updating…</small>{/if}
        </span>
        <Button
          icon={run ? undefined : 'battery'}
          variant={run ? 'secondary' : 'primary'}
          loading={busy && !run}
          disabled={!canRun}
          onclick={show}
        >
          {run ? 'See result' : 'Calculate HP'}
        </Button>
      </div>
    {/if}
  </div>
</SimulatorShell>

<BuildCodeDialog
  bind:open={codeOpen}
  target="stamina"
  current={() => ({
    version: BUILD_CODE_VERSION,
    ...(course ? { courseId: course.course_id } : {}),
    racedef: {
      ground: Number(simulatorSession.ground),
      weather: Number(simulatorSession.weather),
      season: Number(simulatorSession.season),
      time: Number(simulatorSession.startTime)
    },
    uma1: buildCodeRunner($state.snapshot(hpCalculator.uma), course)
  })}
  onimport={({ umas }) => {
    hpCalculator.uma = umas[0]!;
    count(umas[0]!);
  }}
/>

<style>
  /* The form, then the result under it at full width; a bar keeps the answer in reach while the form scrolls. */
  .hp-calculator {
    --setup-control-height: 34px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
    gap: 12px;
    align-items: start;
    min-width: 0;
  }
  .hp-form,
  .hp-result {
    min-width: 0;
    padding: 10px 14px 12px;
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
  }
  .hp-form {
    container: sim-form / inline-size;
  }
  .hp-form > :global(.hp-section) {
    gap: 8px;
    padding-block: 10px;
  }
  .hp-form > :global(.hp-section:first-child) {
    padding-top: 0;
  }
  .hp-result {
    container: hp-result / inline-size;
    position: sticky;
    top: calc(var(--app-header-height, 64px) + 12px);
    max-height: calc(100dvh - var(--app-header-height, 64px) - 24px);
    overflow-y: auto;
    scroll-margin-top: calc(var(--app-header-height, 64px) + 12px);
  }
  /* Track, course, ground, race format and how she spurts: one row on the runner's five columns. */
  .race-row {
    --control-height: var(--setup-control-height);
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px 12px;
    align-items: start;
  }
  .race-row :global(.field) {
    gap: 4px;
  }
  .race-row :global(label) {
    font-size: 12px;
  }
  .race-row :global(input),
  .race-row :global(.select-control) {
    font-size: 13px;
  }
  /* A phone: the track and course a row each, the rest two a row. */
  @container sim-form (max-width: 560px) {
    .race-row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .race-row :global(.course-picker) {
      grid-column: 1 / -1;
    }
  }
  .calc-bar {
    display: none;
  }
  /* Narrower: the result under the form, and the answer floating at the bottom while it is out of sight. */
  @media all {
    .hp-calculator {
      grid-template-columns: minmax(0, 1fr);
    }
    .hp-result {
      position: static;
      max-height: none;
      overflow: visible;
    }
    .calc-bar {
      position: sticky;
      bottom: 12px;
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 8px 8px 14px;
      border: 1px solid var(--border-primary);
      border-radius: var(--radius-lg);
      background: var(--surface-1);
      box-shadow: 0 6px 24px rgb(0 0 0 / 0.28);
    }
  }
  .summary {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px 6px;
    flex: 1;
    min-width: 0;
    font-size: 14px;
    font-weight: 650;
  }
  .good .summary :global(svg) {
    color: var(--accent-success);
  }
  .warn .summary :global(svg) {
    color: var(--accent-warning);
  }
  .bad .summary {
    color: var(--accent-error);
  }
  .summary small {
    font-size: 12px;
    font-weight: 400;
    color: var(--text-secondary);
  }
  .calc-bar :global(.ui-button) {
    flex: none;
    min-height: 40px;
  }
  @media (max-width: 767px) {
    .hp-calculator {
      --setup-control-height: 44px;
    }
    .calc-bar :global(.ui-button) {
      min-height: 44px;
    }
  }
</style>
