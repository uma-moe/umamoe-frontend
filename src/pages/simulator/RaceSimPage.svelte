<script lang="ts">
  import { onMount, tick } from 'svelte';
  import RaceBar from './shell/RaceBar.svelte';
  import CourseButtons from './shell/CourseButtons.svelte';
  import SimSection from './shell/SimSection.svelte';
  import SimulatorCourseProfile from './courses/SimulatorCourseProfile.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import Button from '@/components/controls/Button.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import SimulatorShell from './shell/SimulatorShell.svelte';
  import SimulatorUmaField from './setup/SimulatorUmaField.svelte';
  import SimulatorVeteranSearch from './setup/veterans/SimulatorVeteranSearch.svelte';
  import BuildCodeDialog from './setup/build/BuildCodeDialog.svelte';
  import { BUILD_CODE_VERSION, buildCodeRunner } from './setup/build/build-code';
  import RaceSimResult from './reports/RaceSimResult.svelte';
  import { RACE_TYPE_OPTIONS } from './simulator-race-types';
  import {
    MAX_MONTE_CARLO_RUNS,
    buildMonteCarloRequest,
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
    simulatorCatalog,
    catalogErrorVisible,
    dismissCatalogError,
    simulatorSession
  } from './simulator-session.svelte';
  import {
    simulatorRoster,
    importSimulatorUmas,
    simulatorTeamColor
  } from './simulator-roster.svelte';
  import { createExampleRace } from './simulator-example';
  import type { SimulatorUma } from './simulator-uma';
  import type { ParsedRaceCapture } from '@/lib/race/race-capture-parser';
  import { trackName, type CourseCatalogEntry } from '@/lib/catalog/course-catalog';

  let raceType = $state('0'),
    runs = $state('100'),
    step = $state<'setup' | 'report'>('setup');
  let reportHeading = $state<HTMLElement>();
  let run = $state.raw<
    | (SimulatorRun<MonteCarloResult> & {
        input: MonteCarloInput;
        umas: SimulatorUma[];
        course: CourseCatalogEntry;
        track: ParsedRaceCapture['track'];
      })
    | null
  >(null);
  let error = $state(''),
    busy = $state(false),
    searchOpen = $state(false),
    codeOpen = $state(false);

  const searchParams = new URLSearchParams(location.search);
  const cmSnapshot = searchParams.get('cm-snapshot') ?? '';

  onMount(() => {
    searchOpen = searchParams.get('team-search') === '1';
  });

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
  const canRun = $derived(!!course && simulatorRoster.umas.length >= 2 && !seedInvalid);

  function loadExample() {
    const example = createExampleRace();
    if (!simulatorCatalog.courses.has(example.courseId)) {
      error = 'The example course is unavailable. Reload the course catalog and retry.';
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
      importNotice:
        'Example field: three captured CM20 teams · Nakayama 2,500 m · Yielding ground, Cloudy, Winter, Great mood. Edit any build to compare changes.'
    });
    raceType = '0';
    run = null;
    step = 'setup';
    error = '';
  }

  async function send(single: boolean): Promise<void> {
    if (busy || !canRun || (!single && runsInvalid) || !course) return;
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
          raceType: Number(raceType),
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
        outputMode: 'report'
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
            {run.course.distance.toLocaleString()} m
            <small>
              {[run.track.condition, run.track.weather, run.track.season]
                .filter(Boolean)
                .join(' · ')} · {run.result.runs.toLocaleString()}
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
          <div class="race-fields">
            <SelectField
              id="race-type"
              label="Race format"
              options={RACE_TYPE_OPTIONS.filter((option) => !['14', '7'].includes(option.value))}
              bind:value={raceType}
            />
            <TextField
              id="race-samples"
              type="number"
              min={1}
              max={MAX_MONTE_CARLO_RUNS}
              label="Sampled races"
              error={runsInvalid
                ? 'Enter 1–' + MAX_MONTE_CARLO_RUNS.toLocaleString() + ' races.'
                : undefined}
              bind:value={runs}
            />
            <div class="seed-setting">
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
                icon="refresh"
                ariaLabel="Random seed"
                onclick={() =>
                  (simulatorSession.seed = String(Math.floor(Math.random() * 2 ** 31)))}
              />
            </div>
          </div>
        </SimSection>
        <SimSection
          number={2}
          title="Course"
        >
          {#snippet actions()}<CourseButtons details={false} />{/snippet}
          <RaceBar bare />
          <SimulatorCourseProfile
            {course}
            compact
            showHeader={false}
          />
        </SimSection>
        <SimulatorUmaField number={3}>
          {#snippet actions()}
            <Button
              variant="secondary"
              size="sm"
              icon="clipboard"
              disabled={simulatorRoster.umas.length >= 18}
              onclick={() => (codeOpen = true)}
            >
              Build code
            </Button><Button
              variant="secondary"
              size="sm"
              icon="veterans"
              onclick={() => (searchOpen = true)}
            >
              Find my best team
            </Button><Button
              variant="secondary"
              size="sm"
              icon="refresh"
              disabled={busy || simulatorCatalog.loading}
              onclick={loadExample}
            >
              Load example
            </Button>
          {/snippet}
        </SimulatorUmaField>
        {#if simulatorSession.importNotice}
          <p
            class="import-notice"
            role="status"
          >
            {simulatorSession.importNotice}
          </p>
        {/if}
      </div>
      <!-- Running stays in reach while the form scrolls. -->
      <section
        class="run-bar"
        aria-label="Run simulation"
      >
        <p
          class="run-summary"
          role="status"
        >
          {#if busy}
            Simulating the field…
          {:else}
            <strong>
              {simulatorRoster.umas.length}
              {simulatorRoster.umas.length === 1 ? 'runner' : 'runners'}
            </strong>
            <span>
              {course
                ? trackName(course.race_track_id) + ' ' + course.distance.toLocaleString() + ' m'
                : 'No course yet'} · {runsInvalid
                ? 'check sampled races'
                : Number(runs).toLocaleString() + (Number(runs) === 1 ? ' race' : ' races')}
            </span>
          {/if}
        </p>
        {#if run}<Button
            variant="ghost"
            size="sm"
            icon="chart"
            disabled={busy}
            onclick={() => showStep('report')}
          >
            Last results
          </Button>{/if}
        <Button
          variant="secondary"
          size="sm"
          icon="race"
          loading={busy}
          disabled={!canRun}
          onclick={() => send(true)}
        >
          Run one race
        </Button><Button
          size="sm"
          icon="chart"
          ariaLabel={'Run ' + (runsInvalid ? 'samples' : runs + ' races')}
          loading={busy}
          disabled={!canRun || runsInvalid}
          onclick={() => send(false)}
        >
          Run simulation
        </Button>
      </section>
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
          ...(second ? { uma2: buildCodeRunner(second, course) } : {})
        }
      : undefined;
  }}
  onimport={({ umas }) => {
    try {
      importSimulatorUmas(umas);
    } catch (reason) {
      return (reason as Error).message;
    }
    simulatorSession.importNotice =
      'Added ' + umas.map((uma) => uma.name).join(' and ') + ' from a build code.';
    return undefined;
  }}
/>
<SimulatorVeteranSearch
  bind:open={searchOpen}
  {course}
  initialSnapshot={cmSnapshot}
  seed={Number(simulatorSession.seed)}
  setup={{
    raceInstanceId: selectedRaceInstanceId(),
    raceType: Number(raceType),
    season: Number(simulatorSession.season),
    weather: Number(simulatorSession.weather),
    ground: Number(simulatorSession.ground),
    startTimeType: Number(simulatorSession.startTime)
  }}
/>

<style>
  @import './race-sim-page.css';
</style>
