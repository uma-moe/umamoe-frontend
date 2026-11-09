<script lang="ts">
  import { onMount, tick } from 'svelte';
  import RaceBar from './shell/RaceBar.svelte';
  import CourseButtons from './shell/CourseButtons.svelte';
  import RunBar from './shell/RunBar.svelte';
  import SimSection from './shell/SimSection.svelte';
  import ToggleField from './shell/ToggleField.svelte';
  import SimulatorCourseProfile from './courses/SimulatorCourseProfile.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import InfoIcon from '@/components/feedback/InfoIcon.svelte';
  import Button from '@/components/controls/Button.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import TextField from '@/components/controls/TextField.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import { HttpError } from '@/services/http/http-client';
  import SimulatorShell from './shell/SimulatorShell.svelte';
  import SimulatorUmaField from './setup/runner/SimulatorUmaField.svelte';
  import BuildCodeDialog from './setup/build/code/BuildCodeDialog.svelte';
  import JsonImportDialog from './setup/json-import/JsonImportDialog.svelte';
  import ScreenshotImportDialog from './setup/screenshot-import/ScreenshotImportDialog.svelte';
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
    receiveSimulatorHandoff,
    selectedRaceInstanceId,
    selectedCourse,
    simulatorCourseData,
    simulatorSession
  } from './simulator-session.svelte';
  import { SIMULATOR_HANDOFF_PARAMETER, takeSimulatorHandoff } from './simulator-handoff';
  import {
    simulatorRoster,
    importSimulatorUmas,
    isPlaceholderRunner,
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
    // Skill conditions on the runner's place always hold, so even a small field can trigger them.
    positionChecksPass = $state(false),
    runs = $state('100'),
    step = $state<'setup' | 'report'>('setup');

  let reportHeading = $state<HTMLElement>();
  let run = $state.raw<
    | (SimulatorRun<MonteCarloResult> & {
        /** Missing for a run another page finished from its own race data. */
        input?: MonteCarloInput;
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
    replaceOpen = $state(false),
    codeOpen = $state(false),
    jsonOpen = $state(false),
    screenshotOpen = $state(false);

  onMount(() => {
    const address = new URL(location.href);
    const token = address.searchParams.get(SIMULATOR_HANDOFF_PARAMETER);
    if (token === null) return;

    // The field is read once, so a reload or a shared address must not ask for it again.
    address.searchParams.delete(SIMULATOR_HANDOFF_PARAMETER);
    history.replaceState(history.state, '', address.pathname + address.search + address.hash);
    void openHandoff(token);
  });

  /** Opens a field another page handed to this tab, with the run it finished when there is one. */
  async function openHandoff(token: string) {
    let handoff: Awaited<ReturnType<typeof takeSimulatorHandoff>>;
    try {
      handoff = await takeSimulatorHandoff(token);
    } catch {
      error = 'The race field could not be read from this browser’s storage. Open it again.';
      return;
    }

    if (!handoff) {
      error = 'This race field was already opened or has expired. Open it again from its page.';
      return;
    }

    const target = await receiveSimulatorHandoff(handoff);
    gateOrder = handoff.gateOrder;
    positionChecksPass = false;
    populateError = '';
    error = '';
    run = null;
    step = 'setup';
    if (!handoff.run || !target) return;

    const umas = structuredClone($state.snapshot(simulatorRoster.umas)).map((uma) => ({
      ...uma,
      teamColor: simulatorTeamColor(uma.teamId)
    }));

    runs = String(handoff.run.runs);
    run = {
      result: handoff.run,
      raw: '',
      umas,
      course: target,
      track: {
        condition: optionLabel(GROUND_OPTIONS, simulatorSession.ground),
        weather: optionLabel(WEATHER_OPTIONS, simulatorSession.weather),
        season: optionLabel(SEASON_OPTIONS, simulatorSession.season)
      }
    };

    await showStep('report');
  }

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

  /** Populating silently replaces only a field the simulator itself filled. */
  const hasOwnRunners = $derived(simulatorRoster.umas.some((uma) => !isPlaceholderRunner(uma)));

  function loadExample() {
    const example = createExampleRace();
    if (!simulatorCourseData.courses.has(example.courseId)) {
      error = 'The example course is unavailable. Reload the course data and retry.';
      return;
    }

    importSimulatorUmas(example.umas, true);
    populateError = '';
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
    positionChecksPass = false;
    run = null;
    step = 'setup';
    error = '';
  }

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

  /** A non-negative seed the simulator's signed 32-bit field accepts. */
  const randomSeed = (): number => Math.floor(Math.random() * 2 ** 31);

  function courseLabel(courseId: number): string {
    const raceCourse = simulatorCourseData.courses.get(courseId);
    return raceCourse
      ? trackName(raceCourse.race_track_id) +
          ' ' +
          raceCourse.distance.toLocaleString('en-US') +
          ' m'
      : 'course ' + courseId;
  }

  function beginPopulate() {
    if (hasOwnRunners) {
      replaceOpen = true;
      return;
    }

    void populate();
  }

  /** Why populate failed, in words: a CM-less course and the backend's limits need explaining. */
  function populateErrorText(reason: unknown): string {
    if (reason instanceof HttpError && reason.status === 429) {
      const code = isRecord(reason.body) ? reason.body.error : undefined;
      if (code === 'run_in_progress')
        return 'The field is still being populated. Wait for it to finish, then try again.';

      const seconds = Number.parseInt(reason.response.headers.get('retry-after') ?? '', 10);
      return Number.isFinite(seconds)
        ? 'You can populate once a minute. Try again in ' + seconds + ' seconds.'
        : 'You can populate once a minute. Try again in a moment.';
    }

    const message = reason instanceof Error ? reason.message : 'Could not populate the field.';
    return /no published CM snapshot|no CM model or published room/i.test(message)
      ? 'This course has no CM data. Population works for CM presets and CM tracks; choose one, or add runners yourself.'
      : message;
  }

  /** Fill the field with real CM runners for the settings on screen. */
  async function populate() {
    if (!course || busy || populating || seedInvalid) return;

    populating = true;
    populateError = '';
    simulatorSession.importNotice = '';
    try {
      const body = buildFieldRequest({
        courseId: course.course_id,
        // The field seed is not the race seed: a new draw should give a new room for the same unedited settings.
        seed: randomSeed(),
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
      populateError = populateErrorText(reason);
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
      case 'json':
        jsonOpen = true;
        break;
      case 'screenshot':
        screenshotOpen = true;
        break;
      case 'example':
        loadExample();
        break;
    }
  }

  /** Imported runners join the field; returns why the field can't take them. */
  function addImportedRunners(umas: SimulatorUma[], origin: string): string | undefined {
    try {
      importSimulatorUmas(umas);
    } catch (reason) {
      return reason instanceof Error ? reason.message : 'Could not import these runners.';
    }

    const added =
      umas.length <= 2 ? umas.map((uma) => uma.name).join(' and ') : umas.length + ' runners';
    populateError = '';
    simulatorSession.importNotice = 'Added ' + added + ' from ' + origin + '.';
    return undefined;
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
        gateOrder,
        positionChecksPass
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
    if (typeof page.positionChecksPass === 'boolean') positionChecksPass = page.positionChecksPass;
    const races = wholeNumber(page.runs);
    if (races !== undefined) runs = races;
    populateError = '';
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
    title={simulatorRoster.umas.length
      ? 'Replace the field with a new CM field'
      : 'Fill the field with real CM runners'}
    onclick={beginPopulate}
  >
    {simulatorRoster.umas.length ? 'Repopulate' : 'Populate'}
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
                    onclick={() => (simulatorSession.seed = String(randomSeed()))}
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
                <div class="run-field position-skills">
                  <div class="run-field-label">
                    <span>Position skills</span>
                    <InspectPopover
                      label="About position skills"
                      align="end"
                    >
                      {#snippet trigger()}<InfoIcon />{/snippet}
                      <p class="about-text">
                        When on, skills that need a place in the field, like Budding Blossom, can
                        trigger in any place and any field size. Their other conditions still apply.
                        When off, the game checks the place.
                      </p>
                    </InspectPopover>
                  </div>
                  <Checkbox
                    id="race-position-checks"
                    label="Ignore place"
                    ariaLabel="Position skills ignore place and field size"
                    variant="field"
                    bind:checked={positionChecksPass}
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
              id: 'json',
              label: 'JSON file',
              icon: 'folder-open',
              disabled: simulatorRoster.umas.length >= 18
            },
            {
              id: 'screenshot',
              label: 'Screenshot',
              icon: 'image',
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
          {#snippet notice()}
            {#if populateError}
              <Banner
                title="Could not populate the field"
                tone="danger"
                reportable={false}
                dismissible
                ondismiss={() => (populateError = '')}
              >
                <p>{populateError}</p>
              </Banner>
            {/if}
            {#if simulatorSession.importNotice}
              <Banner
                title="Race field updated"
                dismissible
                ondismiss={() => (simulatorSession.importNotice = '')}
              >
                <p>{simulatorSession.importNotice}</p>
              </Banner>
            {/if}
          {/snippet}
        </SimulatorUmaField>
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
            runs: String(runs),
            positionChecksPass
          }
        }
      : undefined;
  }}
  onrestore={restoreTab}
  onimport={({ umas }) => addImportedRunners(umas, 'a build code')}
/>
<JsonImportDialog
  bind:open={jsonOpen}
  target="race"
  onimport={({ umas }) => addImportedRunners(umas, 'a JSON file')}
/>
<ScreenshotImportDialog
  bind:open={screenshotOpen}
  target="race"
  onimport={({ umas }) => addImportedRunners(umas, 'a screenshot')}
/>

<Dialog
  bind:open={replaceOpen}
  title="Replace the field?"
  compact
  maxWidth="420px"
>
  <p class="replace-note">
    Populating replaces the {simulatorRoster.umas.length} runners on the field with real CM runners for
    these race settings.
  </p>
  {#snippet actions()}
    <Button
      variant="secondary"
      onclick={() => (replaceOpen = false)}
    >
      Cancel
    </Button>
    <Button
      icon="users-add"
      onclick={() => {
        replaceOpen = false;
        void populate();
      }}
    >
      Populate
    </Button>
  {/snippet}
</Dialog>

<style>
  @import './race-sim-page.css';
</style>
