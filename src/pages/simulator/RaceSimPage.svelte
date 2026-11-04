<script lang="ts">
  import { tick } from 'svelte';
  import RaceBar from './shell/RaceBar.svelte';
  import CourseButtons from './shell/CourseButtons.svelte';
  import RunBar from './shell/RunBar.svelte';
  import SimSection from './shell/SimSection.svelte';
  import ToggleField from './shell/ToggleField.svelte';
  import SimulatorCourseProfile from './courses/SimulatorCourseProfile.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import SimulatorShell from './shell/SimulatorShell.svelte';
  import SimulatorUmaField from './setup/runner/SimulatorUmaField.svelte';
  import BuildCodeDialog from './setup/build/code/BuildCodeDialog.svelte';
  import {
    BUILD_CODE_VERSION,
    buildCodeRunner,
    type BuildCodePage
  } from './setup/build/code/build-code';
  import RaceSimResult from './reports/RaceSimResult.svelte';
  import {
    MAX_MONTE_CARLO_RUNS,
    buildMonteCarloRequest,
    type MonteCarloGateOrder,
    type MonteCarloInput
  } from './requests/race-sim-request';
  import {
    simulatorRepository,
    type MonteCarloResult,
    type SimulatorRun
  } from './simulator-repository';
  import {
    GROUND_OPTIONS,
    WEATHER_OPTIONS,
    SEASON_OPTIONS,
    optionLabel,
    selectedRaceInstanceId,
    selectedCourse,
    simulatorCourseData,
    simulatorSession
  } from './simulator-session.svelte';
  import {
    simulatorRoster,
    importSimulatorUmas,
    replaceSimulatorField,
    restoreSimulatorField,
    simulatorTeamColor,
    simulatorTeamColors
  } from './simulator-roster.svelte';
  import { createExampleRace } from './simulator-example';
  import type { SimulatorUma } from './simulator-uma';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { trackName, type RaceCourse } from '@/lib/game-data/racing/courses';
  import { loadCharacters } from '@/lib/game-data/characters';
  import { buildFieldRequest } from './requests/field-request';
  import { simulatorUmasFromField } from './setup/field/field-population';

  const GATE_OPTIONS: Array<{ value: MonteCarloGateOrder; label: string; title: string }> = [
    { value: 'sent', label: 'As set', title: 'Every race starts each runner from her own gate' },
    { value: 'randomized', label: 'Random', title: 'Every race draws new gates, as CM does' }
  ];

  let gateOrder = $state<MonteCarloGateOrder>('sent'),
    runs = $state('100'),
    step = $state<'setup' | 'report'>('setup');

  let reportHeading = $state<HTMLElement>();
  let run = $state.raw<
    | (SimulatorRun<MonteCarloResult> & {
        input: MonteCarloInput;
        umas: SimulatorUma[];
        course: RaceCourse;
        track: ParsedRaceCapture['track'];
      })
    | null
  >(null);

  let error = $state(''),
    populateError = $state(''),
    busy = $state(false),
    populating = $state(false),
    codeOpen = $state(false);

  async function showStep(value: 'setup' | 'report') {
    step = value;
    await tick();
    reportHeading?.focus({ preventScroll: true });
    reportHeading?.scrollIntoView({ block: 'start' });
  }

  const course = $derived(selectedCourse());
  const seedInvalid = $derived(
    !/^-?\d+$/.test(String(simulatorSession.seed)) ||
      Number(simulatorSession.seed) < -2147483648 ||
      Number(simulatorSession.seed) > 2147483647
  );

  const runsInvalid = $derived(
    !/^\d+$/.test(String(runs)) || Number(runs) < 1 || Number(runs) > MAX_MONTE_CARLO_RUNS
  );

  const canRun = $derived(Boolean(course) && simulatorRoster.umas.length >= 2 && !seedInvalid);

  function loadExample() {
    const example = createExampleRace();
    if (!simulatorCourseData.courses.has(example.courseId)) {
      error = 'The example course is unavailable. Reload the course data and retry.';
      return;
    }

    importSimulatorUmas(example.umas, true);
    Object.assign(simulatorSession, {
      courseId: String(example.courseId),
      sourceCourseId: String(example.courseId),
      raceInstanceId: example.raceInstanceId,
      ground: example.ground,
      weather: example.weather,
      season: example.season,
      startTime: example.startTime,
      umaId: example.umas[0]!.id,
      importNotice: ''
    });

    gateOrder = 'sent';
    run = null;
    step = 'setup';
    error = '';
  }

  function courseLabel(courseId: number): string {
    const raceCourse = simulatorCourseData.courses.get(courseId);
    return raceCourse
      ? trackName(raceCourse.race_track_id) +
          ' ' +
          raceCourse.distance.toLocaleString('en-US') +
          ' m'
      : 'course ' + courseId;
  }

  /** Fill the field with real CM runners for the settings on screen. */
  async function populate() {
    if (!course || busy || populating || seedInvalid) return;

    populating = true;
    populateError = '';
    try {
      const body = buildFieldRequest({
        courseId: course.course_id,
        seed: Number(simulatorSession.seed),
        setup: {
          raceInstanceId: selectedRaceInstanceId(),
          raceType: 0,
          season: Number(simulatorSession.season),
          weather: Number(simulatorSession.weather),
          ground: Number(simulatorSession.ground),
          startTimeType: Number(simulatorSession.startTime)
        },
        mode: 'cm'
      });
      const response = await simulatorRepository.field({ body: { ...body } });
      const characters = await loadCharacters().catch(() => new Map());
      const umas = simulatorUmasFromField(response.result, characters);
      replaceSimulatorField(umas, {});
      simulatorSession.umaId = umas[0]?.id ?? '';
      const source = response.result.source;
      const target = courseLabel(source.course_id);
      const origin =
        source.from_course_id === undefined
          ? ' from ' + target
          : ' from ' + courseLabel(source.from_course_id) + ', adapted to ' + target;
      simulatorSession.importNotice =
        'Populated ' + umas.length + ' real CM runners' + origin + ' for these race settings.';
      error = '';
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not populate the field.';
      populateError = /no published CM snapshot|no CM model or published room/i.test(message)
        ? 'This course has no CM data. Population works for CM presets and CM tracks; choose one, or add runners yourself.'
        : message;
    } finally {
      populating = false;
    }
  }

  /** The page's entries in the race field's Import menu. */
  function importRunners(id: string) {
    switch (id) {
      case 'code':
        codeOpen = true;
        break;
      case 'example':
        loadExample();
        break;
    }
  }

  async function send(single: boolean): Promise<void> {
    if (busy || populating || !canRun || (!single && runsInvalid) || !course) return;
    const target = structuredClone($state.snapshot(course));
    const umas = structuredClone($state.snapshot(simulatorRoster.umas)).map((uma) => ({
      ...uma,
      teamColor: simulatorTeamColor(uma.teamId)
    }));

    const track = {
      condition: optionLabel(GROUND_OPTIONS, simulatorSession.ground),
      weather: optionLabel(WEATHER_OPTIONS, simulatorSession.weather),
      season: optionLabel(SEASON_OPTIONS, simulatorSession.season)
    };

    busy = true;
    error = '';
    try {
      const body = buildMonteCarloRequest({
        courseId: target.course_id,
        seed: Number(simulatorSession.seed),
        runs: Number(runs),
        ...(single ? { seeds: [Number(simulatorSession.seed)] } : {}),
        setup: {
          raceInstanceId: selectedRaceInstanceId(),
          // Champions Meeting: the race sim races CM fields, so the format is not a choice.
          raceType: 0,
          season: Number(simulatorSession.season),
          weather: Number(simulatorSession.weather),
          ground: Number(simulatorSession.ground),
          startTimeType: Number(simulatorSession.startTime)
        },
        runners: umas.map((uma) => ({
          trainee: uma.trainee,
          skills: uma.skills,
          teamId: uma.teamId,
          fanCount: uma.fanCount,
          frameOrder: uma.frameOrder
        })),
        outputMode: 'report',
        gateOrder
      });

      let response;
      try {
        response = await simulatorRepository.monteCarlo({
          body: { ...body, report_version: 2, output_format: 'msgpack' }
        });
      } catch (reason) {
        if (reason instanceof Error && /report_version/.test(reason.message)) {
          response = await simulatorRepository.monteCarlo({
            body: { ...body, output_format: 'msgpack' }
          });
        } else {
          if (
            !(reason instanceof Error) ||
            !/output_mode.*(?:skills|procs|report)/i.test(reason.message)
          )
            throw reason;
          response = await simulatorRepository.monteCarlo({
            body: { ...body, output_mode: 'procs', output_format: 'msgpack' }
          });
        }
      }

      run = { ...response, input: body.input, umas, course: target, track };

      await showStep('report');
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'The simulation could not be completed.';
    } finally {
      busy = false;
    }
  }

  /** A whole number a code carries as text or a number, as text. */
  function wholeNumber(value: unknown): string | undefined {
    const text = typeof value === 'number' || typeof value === 'string' ? String(value).trim() : '';
    return /^-?\d+$/.test(text) ? text : undefined;
  }

  /** Loads a whole race tab from a code copied from it: the field, its team colors, the seed and the race options. */
  function restoreTab(page: BuildCodePage): string | void {
    if (page.tab !== 'race') return 'This code was copied from another tab.';

    let restored: ReturnType<typeof restoreSimulatorField>;
    try {
      restored = restoreSimulatorField(page);
    } catch (reason) {
      return reason instanceof Error ? reason.message : 'The race field can’t be read.';
    }

    replaceSimulatorField(restored.umas, restored.teamColors);
    // Number fields hold numbers once edited, so a code may carry either.
    const seed = wholeNumber(page.seed);
    if (seed !== undefined) simulatorSession.seed = seed;
    if (typeof page.raceInstanceId === 'number' && page.raceInstanceId >= 0)
      simulatorSession.raceInstanceId = page.raceInstanceId;
    if (page.gateOrder === 'sent' || page.gateOrder === 'randomized') gateOrder = page.gateOrder;
    const races = wholeNumber(page.runs);
    if (races !== undefined) runs = races;
    simulatorSession.importNotice =
      'Loaded the whole race field of ' + restored.umas.length + ' runners from a build code.';
  }
</script>

{#snippet populateButton()}
  <Button
    variant="secondary"
    size="sm"
    icon="users-add"
    loading={populating}
    disabled={!course || seedInvalid || busy || populating}
    onclick={populate}
  >
    Populate
  </Button>
{/snippet}

{#if error}
  {#key error}
    <Banner
      title="Could not run the simulation"
      tone="danger"
      reportable={false}
      dismissible
    >
      {error}
    </Banner>
  {/key}
{/if}
<SimulatorShell
  mode="race"
  showUma={false}
>
  <div
    class="race-workspace"
    class:showing-report={step === 'report'}
  >
    {#if step === 'report'}
      <div class="step-heading">
        <h2
          class="step-title"
          bind:this={reportHeading}
          tabindex="-1"
        >
          {#if run}{trackName(run.course.race_track_id)}
            {run.course.distance.toLocaleString('en-US')} m
            <small>
              {[run.track.condition, run.track.weather, run.track.season]
                .filter(Boolean)
                .join(', ')}, {run.result.runs.toLocaleString('en-US')}
              {run.result.runs === 1 ? 'race' : 'races'}
            </small>{:else}Results{/if}
        </h2>
        <div class="report-actions">
          <Button
            variant="secondary"
            size="sm"
            icon="edit"
            disabled={busy}
            onclick={() => showStep('setup')}
          >
            Edit setup
          </Button><Button
            size="sm"
            icon="chart"
            loading={busy}
            disabled={!canRun || runsInvalid}
            onclick={() => send(false)}
          >
            Run again
          </Button>
        </div>
      </div>
    {:else}
      <div
        class="race-form"
        role="group"
        aria-label="Race setup"
        bind:this={reportHeading}
        tabindex="-1"
      >
        <SimSection
          number={1}
          title="Race"
          note="Every runner runs the same sampled races"
        >
          {#snippet actions()}<CourseButtons details={false} />{/snippet}
          <RaceBar bare>
            {#snippet extra()}
              <div class="run-fields">
                <div class="run-field samples">
                  <TextField
                    id="race-samples"
                    type="number"
                    min={1}
                    max={MAX_MONTE_CARLO_RUNS}
                    label="Sampled races"
                    error={runsInvalid
                      ? 'Enter 1–' + MAX_MONTE_CARLO_RUNS.toLocaleString('en-US') + ' races.'
                      : undefined}
                    bind:value={runs}
                  />
                </div>
                <div class="run-field seed-setting">
                  <TextField
                    id="race-seed"
                    label="Seed"
                    type="number"
                    min={-2147483648}
                    max={2147483647}
                    error={seedInvalid
                      ? 'Enter a whole number from −2,147,483,648 to 2,147,483,647.'
                      : undefined}
                    bind:value={simulatorSession.seed}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    icon="dice"
                    ariaLabel="Random seed"
                    onclick={() =>
                      (simulatorSession.seed = String(Math.floor(Math.random() * 2 ** 31)))}
                  />
                </div>
                <div class="run-field gates">
                  <ToggleField
                    id="race-gates"
                    label="Gates"
                    options={GATE_OPTIONS}
                    bind:value={gateOrder}
                  />
                </div>
              </div>
            {/snippet}
          </RaceBar>
          <SimulatorCourseProfile
            {course}
            compact
            showHeader={false}
          />
        </SimSection>
        <SimulatorUmaField
          number={2}
          imports={[
            {
              id: 'code',
              label: 'Build code',
              icon: 'clipboard',
              disabled: simulatorRoster.umas.length >= 18
            },
            {
              id: 'example',
              label: 'Load example',
              icon: 'refresh',
              disabled: busy || simulatorCourseData.loading
            }
          ]}
          onimport={importRunners}
          emptyAction={populateButton}
        >
          {#snippet actions()}
            {#if simulatorRoster.umas.length}
              {@render populateButton()}
            {/if}
          {/snippet}
        </SimulatorUmaField>
        {#if populateError}
          <div class="import-notice">
            <Banner
              title="Could not populate the field"
              tone="danger"
              reportable={false}
              dismissible
              ondismiss={() => (populateError = '')}
            >
              <p>{populateError}</p>
            </Banner>
          </div>
        {/if}
        {#if simulatorSession.importNotice}
          <div class="import-notice">
            <Banner
              title="Race field updated"
              dismissible
              ondismiss={() => (simulatorSession.importNotice = '')}
            >
              <p>{simulatorSession.importNotice}</p>
            </Banner>
          </div>
        {/if}
      </div>
      <!-- Running stays in reach while the form scrolls. -->
      <RunBar
        label="Run simulation"
        busy={busy || populating}
      >
        {#snippet summary()}
          {#if populating}
            <strong>Populating the field…</strong>
          {:else if busy}
            <strong>Simulating the field…</strong>
          {:else}
            <strong>
              {simulatorRoster.umas.length}
              {simulatorRoster.umas.length === 1 ? 'runner' : 'runners'}
            </strong>
            <span>
              {course
                ? trackName(course.race_track_id) +
                  ' ' +
                  course.distance.toLocaleString('en-US') +
                  ' m'
                : 'No course yet'}, {runsInvalid
                ? 'check sampled races'
                : Number(runs).toLocaleString('en-US') + (Number(runs) === 1 ? ' race' : ' races')}
            </span>
          {/if}
        {/snippet}
        {#if run}<Button
            variant="ghost"
            size="sm"
            icon="chart"
            disabled={busy || populating}
            onclick={() => showStep('report')}
          >
            See result
          </Button>{/if}
        <Button
          variant="secondary"
          size="sm"
          icon="play"
          disabled={busy || populating || !canRun}
          onclick={() => send(true)}
        >
          Run one race
        </Button><Button
          size="sm"
          icon="chart"
          ariaLabel={'Run ' + (runsInvalid ? 'samples' : runs + ' races')}
          disabled={busy || populating || !canRun || runsInvalid}
          onclick={() => send(false)}
        >
          Run simulation
        </Button>
      </RunBar>
    {/if}
    {#if run}
      <div
        class="race-main"
        hidden={step !== 'report'}
      >
        {#key run}
          <RaceSimResult
            result={run.result}
            input={run.input}
            raw={run.raw}
            umas={run.umas}
            course={run.course}
            track={run.track}
            {busy}
            suspended={step !== 'report'}
          />
        {/key}
      </div>
    {/if}
  </div>
</SimulatorShell>

<BuildCodeDialog
  bind:open={codeOpen}
  target="race"
  current={() => {
    const [first, second] = $state.snapshot(simulatorRoster.umas);
    return first
      ? {
          version: BUILD_CODE_VERSION,
          ...(course ? { courseId: course.course_id } : {}),
          racedef: {
            ground: Number(simulatorSession.ground),
            weather: Number(simulatorSession.weather),
            season: Number(simulatorSession.season),
            time: Number(simulatorSession.startTime)
          },
          uma1: buildCodeRunner(first, course),
          ...(second ? { uma2: buildCodeRunner(second, course) } : {}),
          page: {
            tab: 'race',
            field: $state.snapshot(simulatorRoster.umas),
            teamColors: $state.snapshot(simulatorTeamColors),
            seed: String(simulatorSession.seed),
            raceInstanceId: simulatorSession.raceInstanceId,
            gateOrder,
            runs: String(runs)
          }
        }
      : undefined;
  }}
  onrestore={restoreTab}
  onimport={({ umas }) => {
    try {
      importSimulatorUmas(umas);
    } catch (reason) {
      return reason instanceof Error ? reason.message : 'Could not import this build.';
    }
    simulatorSession.importNotice =
      'Added ' + umas.map((uma) => uma.name).join(' and ') + ' from a build code.';
    return undefined;
  }}
/>

<style>
  @import './race-sim-page.css';
</style>
