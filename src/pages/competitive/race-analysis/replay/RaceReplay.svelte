<script lang="ts">
  import { onDestroy, onMount, tick as flush, untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import { Spring } from 'svelte/motion';
  import { MediaQuery } from 'svelte/reactivity';
  import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
  import { replayViewport } from '@/lib/race/replay/race-replay';
  import Button from '@/components/controls/Button.svelte';
  import Banner from '@/components/feedback/Banner.svelte';
  import EmptyState from '@/components/feedback/EmptyState.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import ReplayResults from '../results/ReplayResults.svelte';
  import {
    loadReplayCourses,
    loadReplayGeometry,
    type CourseData,
    type CourseShape
  } from './replay-course';
  import { loadReplaySettings, saveReplaySettings } from './replay-settings';
  import { runnerCallouts, skillWindows } from './replay-callouts';
  import { finishCentre, finishFocus } from './replay-finish-camera';
  import { ReplayState } from './replay-state.svelte';
  import ReplayReportHeader from './ReplayReportHeader.svelte';
  import ReplayDisplayOptions from './ReplayDisplayOptions.svelte';
  import ReplayStageTools from './stage/ReplayStageTools.svelte';
  import ReplayPositionStage from './stage/ReplayPositionStage.svelte';
  import ReplayRoster from './stage/ReplayRoster.svelte';
  import ReplayCourseMap from './map/ReplayCourseMap.svelte';
  import ReplayPlayback, { type EnsembleTimeline } from './playback/ReplayPlayback.svelte';
  import ReplayEnsembleViews from './ensemble/ReplayEnsembleViews.svelte';
  import ReplayRunnerAnalysis from './runner/ReplayRunnerAnalysis.svelte';
  import ReplayBuildDialog from './runner/ReplayBuildDialog.svelte';
  import ReplayClipDialog from './clip/ReplayClipDialog.svelte';
  import ReplayClipCrop from './clip/ReplayClipCrop.svelte';
  import { ReplayClip } from './clip/replay-clip.svelte';
  import type { RaceTrajectory } from '@/lib/race/replay/race-ensemble';
  import { recordedSimulation, type DetailedSimulation } from '../detailed-simulation';

  let {
    capture,
    ensemble,
    selected = $bindable('0'),
    skillNames = new Map<number, string>(),
    headerActions,
    raceTools,
    simulationReport,
    sessionReport,
    hasSession = false,
    focus,
    overviewOnly = false,
    suspended = false,
    ensembleTimeline,
    simulation,
    onretrysimulation,
    onrecorded
  }: {
    capture: ParsedRaceCapture;
    ensemble?: RaceTrajectory[];
    /** Extra timeline rows for a mean race, on the replay's own time axis (the recorded skill strip needs a real race). */
    ensembleTimeline?: EnsembleTimeline;
    selected?: string;
    skillNames?: Map<number, string>;
    headerActions?: Snippet;
    /** Controls for the whole race, after its section tabs. */
    raceTools?: Snippet;
    /** Races simulated from this one, shown between the header and the results. */
    simulationReport?: Snippet;
    sessionReport?: Snippet;
    hasSession?: boolean;
    focus?: { runner: number; time?: number };
    overviewOnly?: boolean;
    suspended?: boolean;
    /** Defaults to what the capture itself carries, for viewers that never load a simulation. */
    simulation?: DetailedSimulation;
    onretrysimulation?: () => void;
    /** Shows the recorded race again in place of a rerun. */
    onrecorded?: () => void;
  } = $props();

  const savedSettings = loadReplaySettings();

  let telemetryExpanded = $state(false);
  let windowMeters = $state(savedSettings.windowMeters),
    trackOverride = $state(''),
    laneScaleMode = $state<string>(savedSettings.laneScaleMode),
    mapLaneSpacing = $state<string>(savedSettings.mapLaneSpacing);

  let report = $state<HTMLElement>(),
    analysisTarget = $state<HTMLElement>();

  let currentSection = $state('results');

  // The tallest the runner analysis has been for this race at this width: a shorter runner never shrinks the page under the reader.
  let analysisHeight = $state(0),
    analysisWidth = $state(0),
    analysisMinHeight = $state(0);

  const finishOrder = $derived(
    [...capture.runners].sort(
      (a, b) => (a.result?.finishOrder ?? Infinity) - (b.result?.finishOrder ?? Infinity)
    )
  );
  const runnerPosition = $derived(
    finishOrder.findIndex((runner) => runner.index === Number(selected))
  );
  const runnerChoices = $derived(
    finishOrder.map((runner, index) => ({
      value: String(runner.index),
      label: `${runner.result?.finishOrder ?? index + 1}. ${runner.name}`,
      image: portrait(runner.cardId),
      description: `Gate ${runner.index + 1}${runner.trainerName ? ' · ' + runner.trainerName : ''}`
    }))
  );

  const trackId = $derived(trackOverride || String(capture.courseId ?? ''));
  const replaySimulation = $derived(simulation ?? recordedSimulation(capture));

  let shapes = $state.raw<Record<string, CourseShape>>(),
    geometryError = $state('');

  let courses = $state.raw<CourseData>(),
    courseError = $state(''),
    visibility = $state<Record<number, number>>({}),
    comparedHidden = $state<number[]>([]),
    fullscreenTarget = $state<HTMLDivElement>(),
    fullscreen = $state(false);

  let toggles = $state(savedSettings.toggles);

  let settingsOpen = $state(false),
    buildOpen = $state(false),
    focusView = $state<string>(savedSettings.layout);

  const mapPrimary = $derived(focusView === 'map');

  // Phones leave the field out, tablets list it below the stage, and wider screens float it over the stage corner.
  const phone = new MediaQuery('max-width: 767px');
  const wideStage = new MediaQuery('min-width: 951px');
  const showField = $derived(toggles.field && !phone.current);
  let fieldWidth = $state(0);
  const fieldOverlay = $derived(wideStage.current && toggles.field);
  const fieldInset = $derived(fieldOverlay ? fieldWidth + 20 : 0);

  const course = $derived(courses?.courses[trackId]);
  const replay = new ReplayState({
    capture: () => capture,
    ensemble: () => ensemble,
    selected: () => selected,
    course: () => course,
    distance: () => course?.distance ?? shapes?.[trackId]?.distance
  });
  replay.speed = savedSettings.playbackSpeed;

  let positionStage = $state<ReturnType<typeof ReplayPositionStage>>(),
    fieldPanel = $state<ReturnType<typeof ReplayRoster>>();

  // The race positions view and the race field over it draw their own clip frames; the map is copied.
  const clip = new ReplayClip({
    replay,
    container: () => fullscreenTarget,
    canvasLayers: () =>
      positionStage && !mapPrimary
        ? [positionStage, ...(fieldPanel && fieldOverlay ? [fieldPanel] : [])]
        : undefined
  });

  $effect(() => {
    saveReplaySettings({
      layout: focusView,
      laneScaleMode,
      mapLaneSpacing,
      windowMeters,
      playbackSpeed: replay.speed,
      toggles
    });
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

  const laneTarget = $derived(
    laneScaleMode === 'fixed' ? Math.max(6000, replay.bounds.laneMax) : viewport.laneMax
  );

  let laneScaleCapture: ParsedRaceCapture | undefined;

  $effect(() => {
    const instant = laneScaleMode === 'fixed' || replay.recording || laneScaleCapture !== capture;

    laneScaleCapture = capture;
    void laneScale.set(laneTarget, { instant }).catch(() => {});
  });

  onDestroy(() => {
    void laneScale.set(laneScale.current, { instant: true });
  });

  // A recording reads each frame's lane scale directly, as it draws frames without running effects.
  const displayedLaneMax = $derived(
    laneScaleMode === 'fixed' || replay.recording ? laneTarget : laneScale.current
  );
  // The follow camera of both views, for a stretch of course of any length: it keeps the leader
  // forward while racing and turns to rest on the finish.
  function cameraWindow(length: number) {
    const { bounds, leader } = replay;
    const distance = Math.max(0, Math.min(bounds.distanceMax, leader));

    // Ease out of the centred start.
    const edge = Math.min(1, distance / length);
    const following = distance - length * 0.3 * edge * edge * (3 - 2 * edge);
    const center = finishCentre(following, {
      leader: distance,
      finish: bounds.distanceMax,
      window: length
    });

    return { min: center - length / 2, max: center + length / 2 };
  }

  const positionViewport = $derived(cameraWindow(viewport.max - viewport.min));

  // Both views centre the finish on the whole stage, including the part under the race field.
  const finishProgress = $derived(
    finishFocus(
      replay.leader,
      replay.bounds.distanceMax,
      positionViewport.max - positionViewport.min
    )
  );

  async function reviewTime(value: number) {
    replay.seek(value);
    await flush();
    analysisTarget?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  async function reviewRunner(index: number) {
    selected = String(index);
    await flush();
    scrollToSection('replay');
  }

  function scrollToSection(section: string) {
    replay.pause();
    report
      ?.querySelector<HTMLElement>('[data-report-section="' + section + '"]')
      ?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  async function inspectRunner(index: number) {
    selected = String(index);
    await flush();
    scrollToSection('runner');
  }

  function stepRunner(direction: number) {
    const runner = finishOrder[runnerPosition + direction];
    if (runner) selected = String(runner.index);
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

  function shortcut(event: KeyboardEvent): (() => void) | undefined {
    const seekStep = event.shiftKey ? 1 : 0.1;

    if (event.code === 'Space') return clip.editing ? clip.play : replay.play;
    if (event.key === 'ArrowRight') return () => replay.seek(replay.time + seekStep);
    if (event.key === 'ArrowLeft') return () => replay.seek(replay.time - seekStep);
    if (event.key === '.') return () => replay.stepFrame(1);
    if (event.key === ',') return () => replay.stepFrame(-1);
    if (clip.editing && event.key.toLowerCase() === 'i') return () => clip.mark('start');
    if (clip.editing && event.key.toLowerCase() === 'o') return () => clip.mark('end');
    return undefined;
  }

  function keydown(event: KeyboardEvent) {
    if (settingsOpen || buildOpen || replay.recording) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target !== document.body || !analysisTarget) return;

    const box = analysisTarget.getBoundingClientRect();
    if (box.bottom < 120 || box.top > innerHeight) return;

    const action = shortcut(event);
    if (!action) return;

    event.preventDefault();
    action();
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
      comparedHidden = [];
      clip.close();
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

  $effect(() => {
    race;
    analysisWidth;
    analysisMinHeight = 0;
  });

  $effect(() => {
    const height = analysisHeight;
    untrack(() => {
      if (height > analysisMinHeight) analysisMinHeight = height;
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

  onDestroy(() => {
    replay.pause();
    clip.close();
  });

  $effect(() => {
    if (telemetryExpanded || suspended) replay.pause();
  });
</script>

<svelte:document
  onvisibilitychange={() => {
    if (document.hidden) replay.pause();
  }}
/>
{#snippet clipCrop()}
  <ReplayClipCrop {clip} />
{/snippet}

<svelte:window
  onkeydown={keydown}
  onscroll={overviewOnly ? undefined : trackSection}
  onfullscreenchange={() => (fullscreen = !!document.fullscreenElement)}
/>
<section
  class="replay track-palette"
  class:overview={overviewOnly}
  class:ensemble-view={!!ensemble}
  data-surface={course?.surface === 2 ? 'dirt' : 'turf'}
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
      simulation={replaySimulation}
      {hasSession}
      current={currentSection}
      {headerActions}
      {raceTools}
      onjump={scrollToSection}
      {onrecorded}
    />
    {@render simulationReport?.()}
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
    bind:laneScaleMode
    bind:mapLaneSpacing
    bind:toggles
    hiddenOptions={phone.current ? ['field'] : []}
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
    {#if !overviewOnly}
      <section
        class="analysis-section results-panel"
        data-report-section="results"
        aria-label="Race results section"
      >
        <ReplayResults
          capture={{ ...capture, raceDistance: replay.bounds.distanceMax }}
          selectedIndex={replay.runner?.index}
          oninspect={inspectRunner}
        />
      </section>
    {/if}
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
        {#if ensemble}
          <ReplayEnsembleViews
            {replay}
            {ensemble}
            {course}
            courseId={Number(trackId)}
            bind:selected
          />
        {:else}
          <div class="stage-heading">
            <div class="replay-view">
              <h2>Race replay</h2>
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
            <ReplayStageTools
              {fullscreen}
              clipping={clip.editing}
              onclip={clip.editing ? clip.close : clip.edit}
              onsettings={() => (settingsOpen = true)}
              onfullscreen={toggleFullscreen}
            />
          </div>
          <!-- Only the chosen view is mounted: a hidden one would still redraw every playback frame. -->
          {#if !mapPrimary}
            <ReplayPositionStage
              bind:this={positionStage}
              {replay}
              {course}
              {toggles}
              {callouts}
              shape={shapes?.[trackId]}
              laneMax={displayedLaneMax}
              {laneTarget}
              {positionViewport}
              finishFocus={finishProgress}
              {visibility}
              {fieldInset}
              bind:selected
              overlay={clip.editing ? clipCrop : undefined}
            />
          {:else if shapes}
            <ReplayCourseMap
              {replay}
              {toggles}
              {callouts}
              {course}
              shape={shapes[trackId]}
              viewDistance={courses?.baseViewDistance}
              viewport={positionViewport}
              {cameraWindow}
              laneMax={displayedLaneMax}
              {visibility}
              {fieldInset}
              doubledLanes={mapLaneSpacing === 'doubled'}
              bind:selected
              onseekdistance={seekDistance}
              onselectcourse={() => (settingsOpen = true)}
              overlay={clip.editing ? clipCrop : undefined}
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
          {#if showField}
            <ReplayRoster
              bind:this={fieldPanel}
              {replay}
              overlay={fieldOverlay}
              showBlocked={toggles.blocked}
              bind:width={fieldWidth}
              bind:visibility
              bind:selected
            />
          {/if}
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
          bind:hiddenRunners={comparedHidden}
          clip={ensemble ? undefined : clip}
        />
      </div>
    </section>
    {#if !overviewOnly}
      <section
        class="analysis-section runner-panel"
        data-report-section="runner"
        aria-label="Runner analysis section"
        style:min-height={analysisMinHeight ? analysisMinHeight + 'px' : undefined}
        bind:offsetHeight={analysisHeight}
        bind:clientWidth={analysisWidth}
      >
        {#if replay.runner}
          <ReplayRunnerAnalysis
            {replay}
            runner={replay.runner}
            {course}
            {skillNames}
            simulation={replaySimulation}
            onretry={onretrysimulation}
            onbuild={() => (buildOpen = true)}
            onseek={reviewTime}
            onselect={reviewRunner}
          >
            {#snippet navigation()}
              <div class="runner-switcher">
                <Button
                  variant="secondary"
                  size="sm"
                  icon="arrow-left"
                  ariaLabel="Previous runner in finish order"
                  disabled={runnerPosition <= 0}
                  onclick={() => stepRunner(-1)}
                />
                <div class="runner-select">
                  <SelectField
                    id="analysis-runner"
                    label="Runner"
                    hideLabel
                    options={runnerChoices}
                    bind:value={selected}
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="arrow-right"
                  ariaLabel="Next runner in finish order"
                  disabled={runnerPosition >= finishOrder.length - 1}
                  onclick={() => stepRunner(1)}
                />
              </div>
            {/snippet}
          </ReplayRunnerAnalysis>
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
  <ReplayBuildDialog
    {replay}
    {course}
    {skillNames}
    bind:open={buildOpen}
  />
  <ReplayClipDialog {clip} />
</section>

<style>
  @import './track-palette.css';
  @import './race-replay.css';
</style>
