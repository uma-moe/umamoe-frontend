<script lang="ts">
  import { onMount } from 'svelte';
  import { loadSkills, type SkillData } from '@/lib/game-data/skills/skills';
  import type { RaceCourse } from '@/lib/game-data/racing/courses';
  import {
    loadReplayCourses,
    type Course
  } from '@/pages/competitive/race-analysis/replay/replay-course';
  import SimulatorShell from './shell/SimulatorShell.svelte';
  import RunnerInput from './setup/runner/RunnerInput.svelte';
  import BuildCodeDialog from './setup/build/code/BuildCodeDialog.svelte';
  import {
    BUILD_CODE_VERSION,
    buildCodeRunner,
    type BuildCodePage
  } from './setup/build/code/build-code';
  import HpRaceSection from './setup/hp/HpRaceSection.svelte';
  import HpPlanInput from './setup/hp/HpPlanInput.svelte';
  import HpCalcBar from './setup/hp/HpCalcBar.svelte';
  import { explainStaminaError, traineeGrades } from './setup/hp/hp-run';
  import StaminaResultPanel from './reports/outcomes/hp/StaminaResult.svelte';
  import {
    countHpSkills,
    hpCalculator,
    restoreHpCalculator,
    saveHpCalculator
  } from './setup/hp/hp-calculator.svelte';
  import {
    runnerFromSetup,
    saveSimulatorRunner,
    simulatorRunner
  } from './setup/runner/simulator-runner.svelte';
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
    selectedRaceInstanceId,
    selectedCourse,
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

  // Keep the setup and the runner in this browser as they change.
  $effect(saveHpCalculator);
  $effect(saveSimulatorRunner);

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

  const trainee = $derived(simulatorRunner.uma.trainee);
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
  let codeOpen = $state(false);

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

  function showResult() {
    resultPanel?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  /** From the bar: calculates her the first time, then shows the result. */
  async function calculate() {
    if (!run && !busy) await send();
    showResult();
  }

  /** Loads the whole HP calculator from a code copied from it: her build, the HP plan and its race options. */
  function restoreTab(page: BuildCodePage): string | void {
    if (page.tab !== 'stamina') return 'This code was copied from another tab.';

    Object.assign(hpCalculator, restoreHpCalculator(page.setup));
    const runner = runnerFromSetup(page.setup);
    if (runner) simulatorRunner.uma = runner;
  }
</script>

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
        bind:uma={simulatorRunner.uma}
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
        skillCount={simulatorRunner.uma.skills.length}
        oncount={() => count(simulatorRunner.uma)}
      />
    </div>
    <HpCalcBar
      hasCourse={!!course}
      hasRun={!!run}
      {spread}
      {verdict}
      {error}
      {busy}
      {pending}
      {canRun}
      oncalculate={calculate}
      onshow={showResult}
    />
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
        onretry={canRun ? send : undefined}
        blocked={course ? '' : 'Pick a track and course first.'}
        runner={run?.runner}
        markers={run ? run.markers : events.markers}
        course={run ? run.course : course}
        distance={run ? run.course.distance : geometry.distance}
      />
    </aside>
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
    uma1: buildCodeRunner($state.snapshot(simulatorRunner.uma), course),
    page: {
      tab: 'stamina',
      setup: { ...$state.snapshot(hpCalculator), uma: $state.snapshot(simulatorRunner.uma) }
    }
  })}
  onrestore={restoreTab}
  onimport={({ umas }) => {
    simulatorRunner.uma = umas[0]!;
    count(umas[0]!);
  }}
/>

<style>
  /* The form, its run bar, then the result at full width, as on the other tabs; the bar stays in reach while the
     form scrolls. */
  .hp-calculator {
    --setup-control-height: 36px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    align-items: start;
    min-width: 0;
  }
  .hp-form,
  .hp-result {
    min-width: 0;
    padding: 12px 18px;
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
  }
  /* Its sections keep SimSection's own spacing, as the Build optimizer's form does. */
  .hp-form {
    container: sim-form / inline-size;
  }
  .hp-result {
    container: hp-result / inline-size;
    scroll-margin-top: calc(var(--app-header-height, 64px) + 12px);
  }
  /* A phone: the design system's denser controls, as on the database filters, and tighter panels. */
  @media (max-width: 767px) {
    .hp-calculator {
      --setup-control-height: var(--control-height);
      gap: 10px;
    }
    .hp-form,
    .hp-result {
      padding: 10px 12px;
    }
  }
</style>
