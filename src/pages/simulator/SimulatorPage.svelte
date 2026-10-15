<script lang="ts">
  import { onMount } from 'svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import { loadSkills, type SkillData } from '@/lib/game-data/skills/skills';
  import type { RaceCourse } from '@/lib/game-data/racing/courses';
  import {
    loadReplayCourses,
    type Course
  } from '@/pages/competitive/race-analysis/replay/replay-course';
  import SimulatorShell from './shell/SimulatorShell.svelte';
  import RunnerInput from './setup/runner/RunnerInput.svelte';
  import BuildCodeDialog from './setup/build/code/BuildCodeDialog.svelte';
  import { BUILD_CODE_VERSION, buildCodeRunner } from './setup/build/code/build-code';
  import HpRaceSection from './setup/hp/HpRaceSection.svelte';
  import HpPlanInput from './setup/hp/HpPlanInput.svelte';
  import HpCalcBar from './setup/hp/HpCalcBar.svelte';
  import { explainStaminaError, traineeGrades } from './setup/hp/hp-run';
  import StaminaResultPanel from './reports/outcomes/hp/StaminaResult.svelte';
  import { countHpSkills, hpCalculator, saveHpCalculator } from './setup/hp/hp-calculator.svelte';
  import { planEvents, planStats, type PlanMarker } from './setup/hp/hp-plan';
  import { hpSpread, hpVerdict } from './reports/outcomes/hp/hp-needed';
  import { traineeMotivation, traineeRunningStyle, traineeStats } from './setup/trainee';
  import {
    buildStaminaRequest,
    type StaminaEffectInput,
    type StaminaForm
  } from './requests/stamina-request';
  import {
    simulatorRepository,
    type SimulatorRun,
    type StaminaResult
  } from './simulator-repository';
  import type { SimulatorUma } from './simulator-uma';
  import {
    courseDataErrorVisible,
    dismissCourseDataError,
    selectedRaceInstanceId,
    selectedCourse,
    simulatorCourseData,
    simulatorSession
  } from './simulator-session.svelte';

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
        course: RaceCourse;
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
  let skills = $state.raw(new Map<number, SkillData>());

  // Keep the setup in this browser as it changes.
  $effect(saveHpCalculator);

  onMount(() => {
    let active = true;
    void loadReplayCourses()
      .then((value) => {
        if (active) courses = value.courses;
      })
      .catch((reason: unknown) => {
        if (active)
          error = reason instanceof Error ? reason.message : 'Course details could not be loaded.';
      });

    void loadSkills()
      .then((value) => {
        if (active) skills = value;
      })
      .catch((reason: unknown) => {
        if (active)
          error = reason instanceof Error ? reason.message : 'Skill data could not be loaded.';
      });

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
    busy || (live && run !== null && run.key !== inputKey && failedKey !== inputKey)
  );

  const verdict = $derived(spread && run ? hpVerdict(spread, run.forced) : undefined);
  let resultPanel = $state<HTMLElement>();
  let resultInView = $state(true);
  let codeOpen = $state(false);

  // The bar shows only while the result is out of sight.
  $effect(() => {
    if (!resultPanel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => (resultInView = Boolean(entry?.isIntersecting)),
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

  function count(uma: SimulatorUma) {
    countHpSkills(uma, skills, course);
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
      error = explainStaminaError(reason instanceof Error ? reason.message : 'The request failed.');
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

{#if courseDataErrorVisible()}
  <Banner
    title="Race data unavailable"
    tone="danger"
    reportable={false}
    dismissible
    ondismiss={dismissCourseDataError}
  >
    {simulatorCourseData.error}
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
      <HpRaceSection />
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
      <HpCalcBar
        hasCourse={!!course}
        hasRun={!!run}
        {spread}
        {verdict}
        {error}
        {busy}
        {pending}
        {canRun}
        onshow={show}
      />
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
  }
  @media (max-width: 767px) {
    .hp-calculator {
      --setup-control-height: 44px;
    }
  }
</style>
