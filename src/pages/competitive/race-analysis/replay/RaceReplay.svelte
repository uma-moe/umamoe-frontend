<script lang="ts">
  import { onDestroy, onMount, tick as flush, untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import { Spring } from 'svelte/motion';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { replayViewport } from '@/lib/race/replay/race-replay';
  import Button from '@/components/controls/Button.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import ReplayResults from '../results/ReplayResults.svelte';
  import {
    loadReplayCourses,
    loadReplayGeometry,
    type CourseData,
    type CourseShape
  } from './replay-course';
  import { defaultReplayToggles } from './replay-display';
  import { runnerCallouts, skillWindows } from './replay-callouts';
  import { ReplayState } from './replay-state.svelte';
  import ReplayReportHeader from './ReplayReportHeader.svelte';
  import ReplayDisplayOptions from './ReplayDisplayOptions.svelte';
  import ReplayStageTools from './stage/ReplayStageTools.svelte';
  import ReplayPositionStage from './stage/ReplayPositionStage.svelte';
  import ReplayRoster from './stage/ReplayRoster.svelte';
  import ReplayRunnerSnapshot from './stage/ReplayRunnerSnapshot.svelte';
  import ReplayCourseMap from './map/ReplayCourseMap.svelte';
  import ReplayPlayback, { type EnsembleTimeline } from './playback/ReplayPlayback.svelte';
  import ReplayEnsembleViews from './ensemble/ReplayEnsembleViews.svelte';
  import ReplayRunnerAnalysis from './runner/ReplayRunnerAnalysis.svelte';
  import ReplayRunnerPicker from './runner/ReplayRunnerPicker.svelte';
  import ReplayBuildDialog from './runner/ReplayBuildDialog.svelte';
  import type { RaceTrajectory } from '@/lib/race/replay/race-ensemble';
  import { recordedSimulation, type DetailedSimulation } from '../detailed-simulation';

  let {
    capture,
    ensemble,
    selected = $bindable('0'),
    skillNames = new Map<number, string>(),
    headerActions,
    sessionReport,
    hasSession = false,
    focus,
    overviewOnly = false,
    suspended = false,
    ensembleTimeline,
    simulation,
    onanalyse,
    onretrysimulation
  }: {
    capture: ParsedRaceCapture;
    ensemble?: RaceTrajectory[];
    /** Extra timeline rows for a mean race, on the replay's own time axis (the recorded skill strip needs a real race). */
    ensembleTimeline?: EnsembleTimeline;
    selected?: string;
    skillNames?: Map<number, string>;
    headerActions?: Snippet;
    sessionReport?: Snippet;
    hasSession?: boolean;
    focus?: { runner: number; time?: number };
    overviewOnly?: boolean;
    suspended?: boolean;
    /** Defaults to what the capture itself carries, for viewers that never load a simulation. */
    simulation?: DetailedSimulation;
    onanalyse?: (focus: { runner: number; time: number }) => void;
    onretrysimulation?: () => void;
  } = $props();

  let telemetryExpanded = $state(false);
  let windowMeters = $state(80),
    trackOverride = $state('');

  let report = $state<HTMLElement>(),
    analysisTarget = $state<HTMLElement>();

  let currentSection = $state('replay');

  const trackId = $derived(trackOverride || String(capture.courseId ?? ''));

  let shapes = $state.raw<Record<string, CourseShape>>(),
    geometryError = $state('');

  let courses = $state.raw<CourseData>(),
    courseError = $state(''),
    visibility = $state<Record<number, number>>({}),
    fullscreenTarget = $state<HTMLDivElement>(),
    fullscreen = $state(false);

  let toggles = $state(defaultReplayToggles());

  let settingsOpen = $state(false),
    buildOpen = $state(false),
    runnerPickerOpen = $state(false),
    focusView = $state('map');

  const mapPrimary = $derived(focusView === 'map');

  const course = $derived(courses?.courses[trackId]);
  const replay = new ReplayState({
    capture: () => capture,
    ensemble: () => ensemble,
    selected: () => selected,
    course: () => course,
    distance: () => course?.distance ?? shapes?.[trackId]?.distance
  });

  const windows = $derived(skillWindows(capture));
  const callouts = $derived(
    runnerCallouts({
      capture,
      windows,
      frame: replay.frame,
      time: replay.time,
      skillNames,
      skills: toggles.skills,
      modes: toggles.raceModes
    })
  );

  const viewport = $derived(
    replayViewport(
      replay.leader,
      replay.bounds.distanceMax,
      windowMeters,
      Math.max(0, ...(replay.frame?.horses.map((h) => h.lanePosition) ?? []))
    )
  );

  // Continuously follow the field spread; restarting a tween each frame stalls its easing.
  const laneScale = new Spring(500, { stiffness: 0.035, damping: 0.4, precision: 0.001 });

  const laneTarget = $derived(viewport.laneMax);

  let laneScaleCapture: ParsedRaceCapture | undefined;

  $effect(() => {
    const instant = laneScaleCapture !== capture;
    laneScaleCapture = capture;
    void laneScale.set(laneTarget, { instant }).catch(() => {});
  });

  onDestroy(() => {
    void laneScale.set(laneScale.current, { instant: true });
  });

  const displayedLaneMax = $derived(laneScale.current);
  const positionViewport = $derived.by(() => {
    const { bounds, leader } = replay;
    const width = viewport.max - viewport.min,
      distance = Math.max(0, Math.min(bounds.distanceMax, leader));

    const edge = Math.min(1, distance / width, (bounds.distanceMax - distance) / width);
    // Keep the leader forward during racing; gently center the start and finish.
    const center = distance - width * 0.3 * edge * edge * (3 - 2 * edge);
    return { min: center - width / 2, max: center + width / 2 };
  });

  function reviewBlocking(event: (typeof replay.blockingSpans)[number]) {
    selected = String(event.horseIndex);
    visibility = { ...visibility, [event.horseIndex]: 0, [event.blockerHorseIndex]: 0 };

    toggles = { ...toggles, blocked: true };

    reviewTime(event.startTime);
  }

  async function reviewTime(value: number) {
    replay.seek(value);
    await flush();
    analysisTarget?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  async function reviewRunner(index: number) {
    selected = String(index);
    await flush();
    jump('replay');
  }

  function jump(section: string) {
    replay.pause();
    report
      ?.querySelector<HTMLElement>('[data-report-section="' + section + '"]')
      ?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  /** Follows the reader: the current section is the last one scrolled up to where a jump would land it. */
  function trackSection() {
    if (!report) return;

    const page = document.documentElement;
    const sections = [...report.querySelectorAll<HTMLElement>('[data-report-section]')];
    const atPageEnd = innerHeight + scrollY >= page.scrollHeight - 2;
    // A jump lands a section below the page's scroll padding plus its own scroll margin.
    const pagePadding = Number.parseFloat(getComputedStyle(page).scrollPaddingTop) || 0;

    // A short last section never reaches the top, so the end of the page selects it.
    let current = atPageEnd ? sections.at(-1) : undefined;
    if (!current) {
      current = sections[0];
      for (const section of sections) {
        const margin = Number.parseFloat(getComputedStyle(section).scrollMarginTop) || 0;
        if (section.getBoundingClientRect().top > pagePadding + margin + 1) break;
        current = section;
      }
    }

    const id = current?.dataset.reportSection;
    if (id !== undefined && id !== currentSection) currentSection = id;
  }

  function analyseRunner() {
    replay.pause();
    if (overviewOnly) onanalyse?.({ runner: replay.runner?.index ?? 0, time: replay.time });
    else jump('runner');
  }

  function seekDistance(distance: number) {
    const value = replay.timeAtDistance(distance);
    if (value !== undefined) replay.seek(value);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await fullscreenTarget?.requestFullscreen();
    } catch {
      courseError = 'Fullscreen is unavailable in this browser.';
    }
  }

  function keydown(event: KeyboardEvent) {
    if (
      settingsOpen ||
      buildOpen ||
      runnerPickerOpen ||
      event.target !== document.body ||
      !analysisTarget
    )
      return;
    const box = analysisTarget.getBoundingClientRect();
    if (box.bottom < 120 || box.top > innerHeight) return;
    if (event.code === 'Space') {
      event.preventDefault();
      replay.play();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      replay.seek(replay.time + 0.1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      replay.seek(replay.time - 0.1);
    }
  }

  /** A resimulation keeps the recorded input, or for simulator samples the name and seed, of the race it replaces. */
  const race = $derived(capture.original ?? capture.fileName + '#' + capture.randomSeed);

  let initialized = false;

  // Starts each race over; the detailed simulation arriving for the race on screen keeps the reader's place.
  $effect(() => {
    race;
    if (ensemble && initialized) return;
    initialized = true;
    untrack(() => {
      replay.pause();
      replay.time = capture.frames[0]?.time ?? 0;
      if (!ensemble) selected = String(capture.runners[0]?.index ?? 0);
      trackOverride = '';
      visibility = {};
    });
  });

  $effect(() => {
    const target = focus;
    if (!ensemble) race;
    untrack(() => {
      if (target && capture.runners.some((r) => r.index === target.runner)) {
        selected = String(target.runner);
        if (target.time !== undefined) replay.seek(target.time);
      }
    });
  });

  $effect(() => {
    capture;
    untrack(() => {
      replay.time = Math.min(replay.bounds.endTime, Math.max(replay.bounds.startTime, replay.time));
    });
  });

  async function loadGeometry() {
    geometryError = '';
    try {
      shapes = await loadReplayGeometry();
    } catch {
      geometryError = 'Course geometry could not be loaded from resources.';
    }
  }

  onMount(() => {
    let alive = true;
    void loadReplayCourses()
      .then((value) => {
        if (alive) courses = value;
      })
      .catch((e) => {
        if (alive) courseError = e.message;
      });

    if (!ensemble) void loadGeometry();
    return () => {
      alive = false;
    };
  });

  onDestroy(replay.pause);

  $effect(() => {
    if (telemetryExpanded || suspended) replay.pause();
  });
</script>

<svelte:document
  onvisibilitychange={() => {
    if (document.hidden) replay.pause();
  }}
/>
<svelte:window
  onkeydown={keydown}
  onscroll={overviewOnly ? undefined : trackSection}
  onfullscreenchange={() => (fullscreen = !!document.fullscreenElement)}
/>
<section
  class="replay"
  class:overview={overviewOnly}
  class:ensemble-view={!!ensemble}
  bind:this={report}
>
  {#if !overviewOnly}
    <ReplayReportHeader
      {capture}
      {course}
      {courses}
      distance={replay.bounds.distanceMax}
      endTime={replay.bounds.endTime}
      {trackOverride}
      {hasSession}
      current={currentSection}
      {headerActions}
      onjump={jump}
    />
  {/if}
  <ReplayDisplayOptions
    {capture}
    {courses}
    frameIndex={replay.frame?.sourceIndex ?? 0}
    time={replay.time}
    onseek={replay.seek}
    bind:open={settingsOpen}
    bind:trackOverride
    bind:windowMeters
    bind:toggles
  />
  {#if courseError}
    <div class="notice">
      <Banner
        title={courseError}
        tone="warning"
      />
    </div>
  {/if}
  <div class="race-panels">
    <section
      class="analysis-section replay-panel"
      data-report-section="replay"
      aria-label="Race replay section"
      bind:this={analysisTarget}
    >
      <div
        class="replay-layout"
        bind:this={fullscreenTarget}
      >
        {#snippet replayTitle()}
          <div class="replay-view">
            <h2>{ensemble ? 'Mean race replay' : 'Race replay'}</h2>
            <SegmentedControl
              compact
              label="Primary replay view"
              options={[
                { value: 'positions', label: 'Race positions' },
                { value: 'map', label: 'Course map' }
              ]}
              bind:value={focusView}
            />
          </div>
        {/snippet}
        {#snippet replayTools()}
          <ReplayStageTools
            {fullscreen}
            onsettings={() => (settingsOpen = true)}
            onfullscreen={toggleFullscreen}
          />
        {/snippet}
        {#if ensemble}
          <ReplayEnsembleViews
            {replay}
            {ensemble}
            {course}
            courseId={Number(trackId)}
            bind:selected
          />
        {:else}
          {#if !mapPrimary || !shapes}
            <div class="stage-heading">
              {@render replayTitle()}{@render replayTools()}
            </div>
          {/if}
          <!-- Only the chosen view is mounted: a hidden one would still redraw every playback frame. -->
          {#if !mapPrimary}
            <ReplayPositionStage
              {replay}
              {course}
              {toggles}
              {callouts}
              shape={shapes?.[trackId]}
              laneMax={displayedLaneMax}
              laneTarget={viewport.laneMax}
              {positionViewport}
              {visibility}
              bind:selected
            />
          {:else if shapes}
            <ReplayCourseMap
              toolbarStart={replayTitle}
              toolbarEnd={replayTools}
              viewDistance={toggles.cone ? courses?.baseViewDistance : undefined}
              blockerIndex={toggles.blocked ? replay.blocker : -1}
              blocking={toggles.blocked ? replay.blockingNow : []}
              skillEvents={toggles.skills ? replay.recentSkills : []}
              runnerLabels={callouts}
              timers={toggles.skillTimers}
              minimap={toggles.minimap}
              frames={capture.frames}
              laneWidth={replay.laneWidth}
              onseekdistance={seekDistance}
              {course}
              shape={shapes[trackId]}
              onselectcourse={() => (settingsOpen = true)}
              frame={replay.frame}
              runners={capture.runners}
              raceOrder={replay.fieldOrder.map((r) => r.index)}
              bind:selected
              {visibility}
              teamColor={replay.teamColor}
              viewport={positionViewport}
              slopes={toggles.slopes}
              showSpeed={toggles.speed}
              showAcceleration={toggles.accel}
              acceleration={replay.acceleration}
            />
          {:else}
            <div class="map-loading fullscreen-target">
              {#if geometryError}
                <div role="status">
                  <EmptyState
                    compact
                    icon="warning"
                    title="Course map unavailable"
                    description={geometryError}
                  >
                    {#snippet actions()}
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="refresh"
                        onclick={loadGeometry}
                      >
                        Retry course geometry
                      </Button>
                    {/snippet}
                  </EmptyState>
                </div>
              {:else}
                <Spinner
                  centered
                  label="Loading course map…"
                />
              {/if}
            </div>
          {/if}
          <ReplayRoster
            {replay}
            showBlocked={toggles.blocked}
            bind:visibility
            bind:selected
          >
            {#if replay.runner}
              <ReplayRunnerSnapshot
                {replay}
                runner={replay.runner}
                {skillNames}
                onanalyse={analyseRunner}
                bind:selected
              />
            {/if}
          </ReplayRoster>
        {/if}
        <ReplayPlayback
          {replay}
          {course}
          {skillNames}
          showSkills={toggles.skills}
          {visibility}
          {ensembleTimeline}
          bind:selected
          bind:expanded={telemetryExpanded}
        />
      </div>
    </section>
    {#if !overviewOnly}
      <section
        class="analysis-section results-panel"
        data-report-section="results"
        aria-label="Race results section"
      >
        <ReplayResults
          capture={{ ...capture, raceDistance: replay.bounds.distanceMax }}
          selectedIndex={replay.runner?.index}
          oninspect={(index) => {
            selected = String(index);
            jump('runner');
          }}
        />
      </section>
      <section
        class="analysis-section runner-panel"
        data-report-section="runner"
        aria-label="Runner analysis section"
      >
        {#if replay.runner}
          <ReplayRunnerAnalysis
            {replay}
            runner={replay.runner}
            {course}
            {skillNames}
            simulation={simulation ?? recordedSimulation(capture)}
            onretry={onretrysimulation}
            onbuild={() => (buildOpen = true)}
            onpickrunner={() => (runnerPickerOpen = true)}
            onreview={reviewBlocking}
            onseek={reviewTime}
            onselect={reviewRunner}
          />
        {/if}
      </section>
      {#if hasSession}
        <div
          class="session-report"
          data-report-section="session"
        >
          {@render sessionReport?.()}
        </div>
      {/if}
    {/if}
  </div>
  <ReplayRunnerPicker
    {replay}
    {course}
    {skillNames}
    bind:open={runnerPickerOpen}
    bind:selected
  />
  <ReplayBuildDialog
    {replay}
    {course}
    {skillNames}
    bind:open={buildOpen}
  />
</section>

<style>
  @import './race-replay.css';
</style>
