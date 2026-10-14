<script lang="ts">
  import { onDestroy, onMount, tick as flush, untrack } from 'svelte';
  import type { Snippet } from 'svelte';
  import type { EChartsCoreOption } from 'echarts/core';
  import type { CustomSeriesRenderItem } from 'echarts';
  import { Spring } from 'svelte/motion';
  import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/race-capture-parser';
  import {
    raceFrameAtTime,
    raceReplayBounds,
    replayViewport,
    replayLaneMetres,
    raceTimeAtDistance
  } from '@/lib/race/race-replay';
  import {
    formatRaceTime,
    runningStyleName,
    trackDetailName,
    hpRemainingColor
  } from '@/lib/race/race-display';
  import Button from '@/components/controls/Button.svelte';
  import Checkbox from '@/components/controls/Checkbox.svelte';
  import ToggleButton from '@/components/controls/ToggleButton.svelte';
  import StatStrip from '@/components/game/StatStrip.svelte';
  import Icon from '@/components/Icon.svelte';
  import Spinner from '@/components/feedback/Spinner.svelte';
  import IconButton from '@/components/controls/IconButton.svelte';
  import SelectField from '@/components/controls/SelectField.svelte';
  import SegmentedControl from '@/components/controls/SegmentedControl.svelte';
  import Dialog from '@/components/overlays/Dialog.svelte';
  import InspectPopover from '@/components/overlays/InspectPopover.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import RaceSkill from '@/pages/competitive/runners/RaceSkill.svelte';
  import ReplayResults from './ReplayResults.svelte';
  import ReplayDiagnostics from './ReplayDiagnostics.svelte';
  import SkillActivityTimeline from './SkillActivityTimeline.svelte';
  import {
    activeSpan,
    blockerAt,
    frontBlockingSpans,
    diagnosticHorse,
    diagnosticLabel,
    detailedSample,
    runnerHpResult
  } from '@/lib/race/race-diagnostics';
  import ChartFrame from '@/components/charts/ChartFrame.svelte';
  import LazyEChartsSurface from '@/components/charts/LazyEChartsSurface.svelte';
  import RunnerBuild from '@/pages/competitive/runners/RunnerBuild.svelte';
  import RunnerBuildDetails from '@/pages/competitive/runners/RunnerBuildDetails.svelte';
  import RunnerBuildGroup from '@/pages/competitive/runners/RunnerBuildGroup.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import { theme } from '@/stores/theme';
  import {
    loadReplayCourses,
    loadReplayGeometry,
    courseSegments,
    courseLandmarks,
    type Course,
    type CourseData,
    type CourseShape
  } from './replay-course';
  import ReplayCourseMap from './ReplayCourseMap.svelte';
  import ReplayTimeline from './ReplayTimeline.svelte';
  import ReplayFieldSpread from './ReplayFieldSpread.svelte';
  import ReplayOutcomeCourse from './ReplayOutcomeCourse.svelte';
  import {
    meanTrajectorySignal,
    trajectorySeries,
    type RaceTrajectory
  } from '@/lib/race/race-ensemble';

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
    onanalyse
  }: {
    capture: ParsedRaceCapture;
    ensemble?: RaceTrajectory[];
    /** Extra timeline rows for a mean race, on the replay's own time axis (the recorded skill strip needs a real race). */
    ensembleTimeline?: Snippet<
      [
        {
          ticks: number[];
          time: number;
          startTime: number;
          endTime: number;
          runner: number;
          seek: (time: number) => void;
          course?: Course;
          timeAt: (distance: number) => number | undefined;
          distanceMax: number;
        }
      ]
    >;
    selected?: string;
    skillNames?: Map<number, string>;
    headerActions?: Snippet;
    sessionReport?: Snippet;
    hasSession?: boolean;
    focus?: { runner: number; time?: number };
    overviewOnly?: boolean;
    suspended?: boolean;
    onanalyse?: (focus: { runner: number; time: number }) => void;
  } = $props();

  let telemetryExpanded = $state(false);
  let time = $state(0),
    playing = $state(false),
    speed = $state('1'),
    metric = $state('combined'),
    chartEvents = $state(true),
    compare = $state(false),
    windowMeters = $state(80),
    trackOverride = $state('');
  let report = $state<HTMLElement>(),
    analysisTarget = $state<HTMLElement>();

  const trackId = $derived(trackOverride || String(capture.courseId ?? ''));

  let shapes = $state.raw<Record<string, CourseShape>>(),
    geometryError = $state('');
  let courses = $state.raw<CourseData>(),
    courseError = $state(''),
    visibility = $state<Record<number, number>>({}),
    fullscreenTarget = $state<HTMLDivElement>(),
    fullscreen = $state(false);
  let toggles = $state({
    skills: true,
    blocked: true,
    slopes: true,
    speed: false,
    accel: false,
    course: true,
    positionKeep: false,
    cone: true
  });

  const toggleLabels = {
    skills: 'Skill labels',
    blocked: 'Block indicator',
    slopes: 'Slopes',
    speed: 'Speed [m/s]',
    accel: 'Acceleration [m/s²]',
    course: 'Course events',
    positionKeep: 'Position Keep',
    cone: 'Base view cone'
  };

  let settingsOpen = $state(false),
    buildOpen = $state(false),
    runnerPickerOpen = $state(false),
    focusView = $state('map'),
    ensembleView = $state('field');

  const mapPrimary = $derived(focusView === 'map');

  let animationFrame: number | undefined, lastTick: number | undefined;

  const course = $derived(courses?.courses[trackId]);
  const bounds = $derived(
    raceReplayBounds(
      capture.frames,
      course?.distance ?? shapes?.[trackId]?.distance ?? capture.raceDistance
    )
  );
  const frame = $derived(raceFrameAtTime(capture.frames, time));
  const runner = $derived(
    capture.runners.find((r) => r.index === Number(selected)) ?? capture.runners[0]
  );
  const leader = $derived(Math.max(0, ...(frame?.horses.map((h) => h.distance) ?? [])));
  const viewport = $derived(
    replayViewport(
      leader,
      bounds.distanceMax,
      windowMeters,
      Math.max(0, ...(frame?.horses.map((h) => h.lanePosition) ?? []))
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
  const segments = $derived(courseSegments(course));
  const laneWidth = $derived(
    capture.laneDistanceMax && capture.laneDistanceMax > 0
      ? capture.laneDistanceMax > 3
        ? capture.laneDistanceMax
        : 11.25 * capture.laneDistanceMax
      : (course?.laneMax ?? 11250) / 1000
  );

  const laneMetres = (value: number) => replayLaneMetres(value, laneWidth).toFixed(1);

  const recentSkills = $derived(
    capture.events.filter((e) => e.type === 3 && time >= e.frameTime && time - e.frameTime < 2)
  );
  const diagnostic = $derived(diagnosticHorse(capture, runner?.index ?? 0));
  const activeSkills = $derived(
    diagnostic?.activeSkillSpans
      ? [
          ...new Set(
            diagnostic.activeSkillSpans
              .filter((s) => time >= s.startTime && time < s.endTime)
              .map((s) => s.skillId)
          )
        ].map((id) => ({
          params: [runner?.index ?? 0, id],
          endTime: Math.max(
            ...diagnostic
              .activeSkillSpans!.filter(
                (s) => s.skillId === id && time >= s.startTime && time < s.endTime
              )
              .map((s) => s.endTime)
          )
        }))
      : recentSkills
          .filter((e) => e.params[0] === runner?.index)
          .map((e) => ({ ...e, endTime: undefined }))
  );
  const blockingSpans = $derived(frontBlockingSpans(capture));

  let allBlocking = $state(false);

  const visibleBlocking = $derived(
    allBlocking
      ? blockingSpans
      : blockingSpans.filter((event) => event.horseIndex === runner?.index)
  );
  const blockingNow = $derived(
    capture.runners.flatMap((r) => {
      const blockerHorseIndex =
        blockerAt(capture, r.index, time, frame?.horses[r.index]?.blockFrontHorseIndex) ?? -1;
      return blockerHorseIndex >= 0 ? [{ horseIndex: r.index, blockerHorseIndex }] : [];
    })
  );

  function reviewBlocking(event: (typeof blockingSpans)[number]) {
    selected = String(event.horseIndex);
    visibility = { ...visibility, [event.horseIndex]: 0, [event.blockerHorseIndex]: 0 };
    toggles = { ...toggles, blocked: true };
    reviewTime(event.startTime);
  }

  const blocker = $derived(
    blockerAt(
      capture,
      runner?.index ?? 0,
      time,
      frame?.horses[runner?.index ?? 0]?.blockFrontHorseIndex
    ) ?? -1
  );
  const blockedRunner = $derived(capture.runners.find((r) => r.index === blocker));
  const reference = $derived(
    activeSpan(diagnostic?.positionKeepReferenceSpans, time)?.referenceHorseIndex
  );
  const pacemaker = $derived(
    activeSpan(capture.detailed?.annotations.paceMakerSpans, time)?.horseIndex
  );
  const modes = $derived(
    Object.entries(capture.detailed?.annotations.flags ?? {})
      .filter(([, flag]) => ((activeSpan(diagnostic?.spans, time)?.mask ?? 0) & flag) !== 0)
      .map(([name]) => diagnosticLabel(name))
  );
  const rushed = $derived(
    diagnostic?.temptationSpans
      ? (activeSpan(diagnostic.temptationSpans, time)?.mode ?? 0)
      : (frame?.horses[runner?.index ?? 0]?.temptationMode ?? 0)
  );
  const targetSpeed = $derived(detailedSample(capture.detailed, diagnostic, time, 'targetSpeeds'));
  const activations = $derived(
    capture.events
      .filter((e) => e.type === 3 && e.params[0] === runner?.index)
      .sort((a, b) => a.frameTime - b.frameTime)
  );
  const currentHorse = $derived(frame?.horses[runner?.index ?? 0]);
  const teamKeys = $derived([
    ...new Set(
      capture.runners.map((r) =>
        String(r.raw.trainer_id ?? r.raw.team_id ?? r.trainerName ?? r.index)
      )
    )
  ]);

  const teamColor = (r: RaceRunner) =>
    typeof r.raw.team_color === 'string' && /^#[0-9a-f]{6}$/i.test(r.raw.team_color)
      ? r.raw.team_color
      : ['#69b7ee', '#e69c72', '#c79be7', '#78bba3'][
          teamKeys.indexOf(String(r.raw.trainer_id ?? r.raw.team_id ?? r.trainerName ?? r.index)) %
            4
        ]!;

  const stageStart = $derived(
    Math.max(0, Math.min(...(frame?.horses.map((h) => h.distance) ?? [0])))
  );
  const positionViewport = $derived.by(() => {
    const width = viewport.max - viewport.min,
      distance = Math.max(0, Math.min(bounds.distanceMax, leader));
    const edge = Math.min(1, distance / width, (bounds.distanceMax - distance) / width);
    // Keep the leader forward during racing; gently center the start and finish.
    const center = distance - width * 0.3 * edge * edge * (3 - 2 * edge);
    return { min: center - width / 2, max: center + width / 2 };
  });
  const stageViewport = $derived(
    mapPrimary ? { min: stageStart, max: Math.max(stageStart + 1, leader) } : positionViewport
  );

  let stageWidth = $state(1000),
    stageHeight = $state(300);

  const crowdedRunners = $derived.by(() => {
    const points = capture.runners.flatMap((r) => {
      const h = frame?.horses[r.index];
      return h && visibility[r.index] !== 2
        ? [
            {
              index: r.index,
              x: (x(h.distance) / 1000) * stageWidth,
              y: (h.lanePosition / displayedLaneMax) * stageHeight
            }
          ]
        : [];
    });
    return new Set(
      points
        .filter((a) =>
          points.some(
            (b) => a.index !== b.index && Math.abs(a.x - b.x) < 74 && Math.abs(a.y - b.y) < 58
          )
        )
        .map((p) => p.index)
    );
  });

  const x = (distance: number) =>
    ((distance - stageViewport.min) / (stageViewport.max - stageViewport.min)) * 1000;

  const racePhase = $derived(
    !frame
      ? 'No telemetry'
      : time >= bounds.endTime
        ? 'Finished'
        : leader >= bounds.distanceMax
          ? 'Finishing'
          : leader < bounds.distanceMax / 6
            ? 'Early race'
            : leader < (bounds.distanceMax * 2) / 3
              ? 'Mid race'
              : leader < (bounds.distanceMax * 5) / 6
                ? 'Late race'
                : 'Final leg'
  );
  const currentSegment = $derived(
    segments.find((s) => leader >= s.start && leader < s.end)?.label ?? racePhase
  );
  const finishTimes = $derived(
    new Map(
      capture.runners.map((r) => {
        const recorded =
          r.result?.finishTimeRaw && r.result.finishTimeRaw > 0
            ? r.result.finishTimeRaw
            : r.result?.finishTime;
        return [
          r.index,
          recorded !== undefined && Number.isFinite(recorded) && recorded > 0
            ? recorded
            : runnerTimeAtDistance(bounds.distanceMax, r.index)
        ];
      })
    )
  );
  const finishOrder = $derived(
    [...capture.runners].sort(
      (a, b) =>
        (a.result?.finishOrder ?? Infinity) - (b.result?.finishOrder ?? Infinity) ||
        (finishTimes.get(a.index) ?? Infinity) - (finishTimes.get(b.index) ?? Infinity) ||
        a.index - b.index
    )
  );
  const finishRanks = $derived(
    new Map(
      finishOrder.map((r, i) => [
        r.index,
        r.result?.finishOrder ?? (finishTimes.get(r.index) !== undefined ? i + 1 : undefined)
      ])
    )
  );
  // Cache the final racing samples once; playback only looks up each runner's HP.
  const finishFrames = $derived(
    new Map(
      capture.runners.map((r) => {
        const finish = finishTimes.get(r.index);
        return [
          r.index,
          finish === undefined ? undefined : capture.frames.findLast((f) => f.time < finish)
        ];
      })
    )
  );
  const hpResults = $derived(
    new Map(capture.runners.map((r) => [r.index, runnerHpResult(capture, r.index)]))
  );

  function fieldHp(index: number, finished: boolean) {
    const result = hpResults.get(index),
      hp = finished ? result?.finish : frame?.horses[index]?.hp;
    return hp !== undefined && result?.max
      ? Math.min(100, Math.max(0, (hp / result.max) * 100))
      : undefined;
  }

  function formatHp(value?: number) {
    if (value === undefined) return '—';
    const percent = Math.round(value * 10) / 10;
    return (percent === 0 || percent === 100 ? String(percent) : percent.toFixed(1)) + '%';
  }

  const hpColor = (value?: number) => hpRemainingColor(value, $theme === 'dark');

  function hasFinished(r: RaceRunner) {
    const finish = finishTimes.get(r.index);
    return finish !== undefined
      ? time >= finish
      : (frame?.horses[r.index]?.distance ?? 0) >= bounds.distanceMax;
  }

  const finishedCount = $derived(capture.runners.filter(hasFinished).length);
  const fieldOrder = $derived(
    [...capture.runners].sort(
      (a, b) =>
        Number(hasFinished(b)) - Number(hasFinished(a)) ||
        (hasFinished(a) && hasFinished(b)
          ? (finishRanks.get(a.index) ?? Infinity) - (finishRanks.get(b.index) ?? Infinity)
          : (frame?.horses[b.index]?.distance ?? 0) - (frame?.horses[a.index]?.distance ?? 0))
    )
  );
  const conditions = $derived(
    [
      capture.track.condition
        ? trackDetailName('condition', capture.track.condition) + ' ground'
        : undefined,
      capture.track.weather ? trackDetailName('weather', capture.track.weather) : undefined,
      capture.track.season ? trackDetailName('season', capture.track.season) : undefined,
      course
        ? course.turn === 1
          ? 'Right-handed'
          : course.turn === 2
            ? 'Left-handed'
            : 'Straight'
        : undefined
    ]
      .filter(Boolean)
      .join(', ') || 'Conditions were not included in this capture'
  );
  const previousHorse = $derived(
    raceFrameAtTime(capture.frames, time - 1)?.horses[runner?.index ?? 0]
  );
  const laneChange = $derived(
    currentHorse && previousHorse
      ? replayLaneMetres(currentHorse.lanePosition - previousHorse.lanePosition, laneWidth)
      : 0
  );
  const runnerState = $derived(
    runner && hasFinished(runner)
      ? ensemble
        ? 'All samples finished'
        : 'Finished' +
          (finishTimes.get(runner.index) === undefined
            ? ''
            : ', ' + formatRaceTime(finishTimes.get(runner.index), 2))
      : Math.abs(laneChange) < 0.05
        ? 'Holding lane'
        : (laneChange > 0 ? 'Outward +' : 'Inward ') + laneChange.toFixed(2) + ' m / last second'
  );

  function pause() {
    if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
    animationFrame = undefined;
    lastTick = undefined;
    playing = false;
  }

  function seek(value: number) {
    pause();
    time = Math.min(bounds.endTime, Math.max(bounds.startTime, value));
  }

  async function reviewTime(value: number) {
    seek(value);
    await flush();
    analysisTarget?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  async function reviewRunner(index: number) {
    selected = String(index);
    await flush();
    jump('replay');
  }

  function jump(section: string) {
    pause();
    report
      ?.querySelector<HTMLElement>('[data-report-section="' + section + '"]')
      ?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  function analyseRunner() {
    pause();
    if (overviewOnly) onanalyse?.({ runner: runner?.index ?? 0, time });
    else jump('runner');
  }

  function seekDistance(distance: number) {
    const value = raceTimeAtDistance(capture.frames, distance);
    if (value !== undefined) seek(value);
  }

  function tick(timestamp: number) {
    if (!playing) return;
    if (lastTick !== undefined)
      time = Math.min(
        bounds.endTime,
        time + Math.min(0.1, (timestamp - lastTick) / 1000) * Number(speed)
      );
    lastTick = timestamp;
    if (time >= bounds.endTime) {
      pause();
      return;
    }
    animationFrame = requestAnimationFrame(tick);
  }

  function play() {
    if (playing) {
      pause();
      return;
    }
    if (time >= bounds.endTime) time = bounds.startTime;
    playing = true;
    lastTick = undefined;
    animationFrame = requestAnimationFrame(tick);
  }

  function cycle(r: RaceRunner, focus = false) {
    if (focus)
      visibility = Object.fromEntries(
        capture.runners.map((item) => [item.index, item.index === r.index ? 0 : 1])
      );
    else visibility = { ...visibility, [r.index]: ((visibility[r.index] ?? 0) + 1) % 3 };
  }

  function acceleration(index: number) {
    const exact = detailedSample(
      capture.detailed,
      diagnosticHorse(capture, index),
      time,
      'accelerationRates'
    );
    if (exact !== undefined) return exact;
    const source = frame?.sourceIndex ?? 0,
      left = capture.frames[source],
      right = capture.frames[source + 1];
    return left && right && right.time > left.time
      ? ((right.horses[index]?.speed ?? 0) - (left.horses[index]?.speed ?? 0)) /
          (right.time - left.time) /
          100
      : 0;
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
      play();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      seek(time + 0.1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      seek(time - 0.1);
    }
  }

  let initialized = false;

  $effect(() => {
    capture;
    if (ensemble && initialized) return;
    initialized = true;
    pause();
    time = capture.frames[0]?.time ?? 0;
    if (!ensemble) selected = String(capture.runners[0]?.index ?? 0);
    trackOverride = '';
    visibility = {};
  });

  $effect(() => {
    const target = focus;
    if (!ensemble) capture;
    untrack(() => {
      if (target && capture.runners.some((r) => r.index === target.runner)) {
        selected = String(target.runner);
        if (target.time !== undefined) seek(target.time);
      }
    });
  });

  $effect(() => {
    capture;
    untrack(() => {
      if (!ensemble) pause();
      time = Math.min(bounds.endTime, Math.max(bounds.startTime, time));
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

  onDestroy(pause);

  const chartRunners = $derived(compare ? capture.runners : runner ? [runner] : []);
  const selectedFinish = $derived(finishTimes.get(runner?.index ?? 0));
  const telemetryEnd = $derived(
    ensemble
      ? bounds.endTime
      : Math.max(
          bounds.startTime,
          Math.min(
            bounds.endTime,
            compare
              ? Math.max(...chartRunners.map((r) => finishTimes.get(r.index) ?? bounds.endTime))
              : (selectedFinish ?? bounds.endTime)
          )
        )
  );
  const telemetryFrame = $derived(
    selectedFinish !== undefined && time >= selectedFinish
      ? (finishFrames.get(runner?.index ?? 0) ?? frame)
      : frame
  );

  function chartData(r: RaceRunner, signal: string) {
    const finish = finishTimes.get(r.index);
    let data: (number | null)[][];
    if (ensemble && (signal === 'hp' || signal === 'gap')) {
      data = capture.frames.map((frame) => [
        frame.time,
        meanTrajectorySignal(ensemble, frame.time, r.index, signal)
      ]);
    } else if (signal === 'target' || signal === 'acceleration') {
      const h = diagnosticHorse(capture, r.index),
        samples = h?.sampleTimes ?? capture.detailed?.annotations.sampleTimes ?? [];
      data = samples.map((t, i) => [
        t,
        (signal === 'target' ? h?.targetSpeeds : h?.accelerationRates)?.[i] ?? null
      ]);
    } else {
      data = capture.frames.map((f) => [
        f.time,
        signal === 'speed'
          ? (f.horses[r.index]?.speed ?? 0) / 100
          : signal === 'hp'
            ? ((f.horses[r.index]?.hp ?? 0) /
                Math.max(1, capture.frames[0]?.horses[r.index]?.hp ?? 1)) *
              100
            : Math.max(...f.horses.map((h) => h.distance)) - (f.horses[r.index]?.distance ?? 0)
      ]);
    }
    if (ensemble || finish === undefined || finish > bounds.endTime) return data;
    data = data.filter((point) => point[0]! < finish);
    // Hold the last racing sample at the line; later frames include deceleration.
    if (data.length) data.push([finish, data.at(-1)![1]!]);
    return data;
  }

  $effect(() => {
    if (!capture.detailed && (metric === 'target' || metric === 'acceleration')) metric = 'speed';
  });

  function runnerTimeAtDistance(distance: number, index = runner?.index ?? 0) {
    const frames = capture.frames;
    if (distance <= (frames[0]?.horses[index]?.distance ?? 0)) return frames[0]?.time;
    const rightIndex = frames.findIndex(
      (frame) => (frame.horses[index]?.distance ?? 0) >= distance
    );
    if (rightIndex < 1) return undefined;
    const left = frames[rightIndex - 1]!,
      right = frames[rightIndex]!,
      start = left.horses[index]!.distance,
      end = right.horses[index]!.distance;
    return (
      left.time +
      ((right.time - left.time) * (distance - start)) / Math.max(Number.EPSILON, end - start)
    );
  }

  const chartPhases = $derived(
    [
      { name: 'Early race', start: 0, end: 1 / 6, color: '#b5b9c2' },
      { name: 'Mid race', start: 1 / 6, end: 2 / 3, color: '#6ab7ee' },
      { name: 'Late race', start: 2 / 3, end: 5 / 6, color: '#dfba72' },
      { name: 'Final leg', start: 5 / 6, end: 1, color: '#bd91d1' }
    ].flatMap((phase) => {
      const start = raceTimeAtDistance(capture.frames, bounds.distanceMax * phase.start),
        end =
          phase.end === 1
            ? telemetryEnd
            : (raceTimeAtDistance(capture.frames, bounds.distanceMax * phase.end) ?? telemetryEnd);
      return start === undefined
        ? []
        : [
            [
              {
                name: phase.name,
                xAxis: start,
                itemStyle: { color: phase.color, opacity: 0.07 },
                label: {
                  show: true,
                  position: 'insideTop',
                  fontSize: 9,
                  color: $theme === 'dark' ? '#abb4c3' : '#566071',
                  formatter: phase.name.replace(' race', '')
                }
              },
              { xAxis: end }
            ]
          ];
    })
  );
  const chartMarkers = $derived([
    ...activations.map((event) => ({
      name: skillNames.get(event.params[1]!) ?? 'Skill ' + event.params[1],
      xAxis: event.frameTime,
      lineStyle: { color: '#e8ad63', opacity: 0.5 }
    })),
    ...[
      runner?.result?.lastSpurtStartDistance
        ? { name: 'Last spurt', distance: runner.result.lastSpurtStartDistance }
        : undefined
    ].flatMap((event) => {
      const time = event && runnerTimeAtDistance(event.distance);
      return time === undefined || !event
        ? []
        : [{ name: event.name, xAxis: time, lineStyle: { color: '#abb4c3', opacity: 0.7 } }];
    })
  ]);
  const chartBlocking = $derived(
    blockingSpans
      .filter((span) => span.horseIndex === runner?.index)
      .map((span) => [
        {
          name:
            'Blocked by ' +
            (capture.runners.find((r) => r.index === span.blockerHorseIndex)?.name ?? 'runner'),
          xAxis: span.startTime,
          itemStyle: { color: '#f07777', opacity: 0.12 }
        },
        { xAxis: span.endTime }
      ])
  );
  const signalDefinitions = $derived([
    {
      value: 'speed',
      label: 'Speed',
      unit: 'm/s',
      color: $theme === 'dark' ? '#69b7ee' : '#176ba0'
    },
    {
      value: 'hp',
      label: 'HP remaining',
      unit: '%',
      color: $theme === 'dark' ? '#70c4a0' : '#247653'
    },
    {
      value: 'gap',
      label: ensemble ? 'Mean gap to leader' : 'To leader',
      unit: 'm',
      color: $theme === 'dark' ? '#e3b56f' : '#986514'
    },
    {
      value: 'target',
      label: 'Target speed',
      unit: 'm/s',
      color: $theme === 'dark' ? '#bb9be6' : '#7243a1'
    },
    {
      value: 'acceleration',
      label: 'Acceleration',
      unit: 'm/s²',
      color: $theme === 'dark' ? '#df8ca1' : '#b33f61'
    }
  ]);
  const chartSignals = $derived(
    signalDefinitions.filter((signal) =>
      metric === 'combined'
        ? ['speed', 'hp', 'gap'].includes(signal.value)
        : signal.value === metric
    )
  );

  function signalValue(signal: string) {
    const sample = telemetryFrame,
      horse = sample?.horses[runner?.index ?? 0];
    if (!sample || !horse) return undefined;
    if (ensemble && (signal === 'hp' || signal === 'gap'))
      return meanTrajectorySignal(ensemble, time, runner?.index ?? 0, signal);
    if (signal === 'speed') return horse.speed / 100;
    if (signal === 'hp')
      return Math.min(
        100,
        Math.max(
          0,
          (horse.hp / Math.max(1, capture.frames[0]?.horses[runner?.index ?? 0]?.hp ?? 1)) * 100
        )
      );
    if (signal === 'gap')
      return Math.max(0, ...sample.horses.map((h) => h.distance)) - horse.distance;
    if (signal === 'target')
      return detailedSample(capture.detailed, diagnostic, sample.time, 'targetSpeeds');
    return (
      detailedSample(capture.detailed, diagnostic, sample.time, 'accelerationRates') ??
      acceleration(runner?.index ?? 0)
    );
  }

  const finishLine: CustomSeriesRenderItem = (params, api) => {
    const area = params.coordSys as unknown as {
        x: number;
        y: number;
        width: number;
        height: number;
      },
      position = api.coord?.([api.value(0), 0]);
    if (!position || position[0]! < area.x || position[0]! > area.x + area.width) return;
    const x = Math.min(position[0]!, area.x + area.width - 8);
    return {
      type: 'group',
      children: Array.from({ length: Math.ceil(area.height / 4) * 2 }, (_, i) => ({
        type: 'rect',
        shape: {
          x: x + (i % 2) * 4,
          y: area.y + Math.floor(i / 2) * 4,
          width: 4,
          height: Math.min(4, area.height - Math.floor(i / 2) * 4)
        },
        style: { fill: (Math.floor(i / 2) + (i % 2)) % 2 ? '#17191d' : '#f5f5f5' }
      }))
    };
  };

  function telemetryOption(expanded: boolean): EChartsCoreOption {
    const multiple = chartSignals.length > 1,
      color = $theme === 'dark' ? '#abb4c3' : '#566071';
    return {
      animation: false,
      textStyle: { color },
      tooltip: {
        trigger: 'axis',
        order: 'seriesAsc',
        backgroundColor: $theme === 'dark' ? '#202226' : '#fff',
        borderColor: $theme === 'dark' ? '#42464c' : '#d2d5da',
        textStyle: { color: $theme === 'dark' ? '#e8edf4' : '#202226' },
        axisPointer: { type: 'line', lineStyle: { color, opacity: 0.45 } }
      },
      // Axis labels use the reserved side columns, keeping the plot aligned with the timeline.
      grid: { left: 0, right: 0, top: 8, bottom: expanded ? 56 : 8, outerBoundsMode: 'none' },
      xAxis: {
        type: 'value',
        min: bounds.startTime,
        max: Math.max(bounds.startTime + 0.001, telemetryEnd),
        show: expanded,
        name: 'Time (s)',
        nameLocation: 'middle',
        nameGap: 24,
        axisLabel: {
          fontSize: 10,
          color,
          formatter: (value: number) => Number(value.toFixed(1)).toString(),
          hideOverlap: true
        },
        nameTextStyle: { fontSize: 10, color },
        splitLine: { lineStyle: { opacity: 0.08 } }
      },
      yAxis: chartSignals.map((signal, i) => ({
        type: 'value',
        position: multiple && signal.value !== 'speed' ? 'right' : 'left',
        offset: multiple && signal.value === 'gap' ? 26 : 0,
        min: signal.value === 'acceleration' ? undefined : 0,
        max: signal.value === 'hp' ? 100 : undefined,
        interval: signal.value === 'hp' ? 25 : undefined,
        splitNumber: 4,
        axisLabel: { fontSize: 10, color: signal.color, margin: 8, hideOverlap: true },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: i === 0, lineStyle: { color, opacity: 0.12 } }
      })),
      dataZoom: expanded
        ? [
            { type: 'inside', xAxisIndex: 0 },
            { type: 'slider', xAxisIndex: 0, height: 14, bottom: 5 }
          ]
        : [],
      visualMap: ensemble
        ? []
        : chartSignals.flatMap((signal, i) =>
            signal.value === 'hp'
              ? [
                  {
                    type: 'continuous',
                    show: false,
                    min: 0,
                    max: 100,
                    dimension: 1,
                    seriesIndex: chartRunners.map((_, index) => i * chartRunners.length + index),
                    inRange: { color: Array.from({ length: 9 }, (_, step) => hpColor(step * 12.5)) }
                  }
                ]
              : []
          ),
      series: [
        ...(ensemble ?? []).flatMap((trajectory) =>
          chartSignals.map((signal, i) => ({
            name: 'Race ' + (trajectory.sample + 1) + ', ' + signal.label,
            type: 'line',
            xAxisIndex: 0,
            yAxisIndex: i,
            showSymbol: false,
            silent: true,
            lineStyle: {
              width: 1,
              opacity: Math.max(0.025, Math.min(0.15, 1 / Math.sqrt(ensemble!.length)))
            },
            itemStyle: { color: signal.color },
            z: 0,
            tooltip: { show: false },
            data: trajectorySeries(trajectory, runner?.index ?? 0, signal.value)
          }))
        ),
        ...chartSignals.flatMap((signal, i) =>
          chartRunners.map((r) => ({
            name:
              (ensemble ? 'Mean · ' : '') +
              (multiple ? signal.label + ', ' : '') +
              'Gate ' +
              (r.index + 1) +
              ', ' +
              r.name,
            type: 'line',
            xAxisIndex: 0,
            yAxisIndex: i,
            showSymbol: false,
            lineStyle: {
              width: r.index === runner?.index ? 2.5 : 1,
              opacity: r.index === runner?.index ? 1 : 0.18,
              type: r.index === runner?.index ? 'solid' : 'dotted'
            },
            itemStyle: { color: signal.color },
            z: r.index === runner?.index ? 3 : 1,
            tooltip: {
              valueFormatter: (value: unknown) =>
                typeof value === 'number'
                  ? value.toFixed(signal.value === 'hp' ? 1 : 2) + ' ' + signal.unit
                  : String(value)
            },
            data: chartData(r, signal.value),
            ...(i === 0 && r.index === runner?.index && chartEvents
              ? {
                  markLine: {
                    silent: false,
                    symbol: ['none', 'none'],
                    label: { show: false },
                    lineStyle: { type: 'dashed', width: 1 },
                    data: chartMarkers.filter((marker) => marker.xAxis <= telemetryEnd)
                  },
                  markArea: {
                    silent: false,
                    label: { show: false },
                    data: [...chartPhases, ...chartBlocking]
                  }
                }
              : {})
          }))
        ),
        ...(selectedFinish === undefined
          ? []
          : [
              {
                id: 'finish-line',
                name: 'Finish',
                type: 'custom',
                renderItem: finishLine,
                data: [[selectedFinish]],
                encode: { x: 0, y: -1 },
                silent: true,
                tooltip: { show: false },
                z: 5
              }
            ])
      ]
    };
  }

  const option = $derived(telemetryOption(telemetryExpanded));

  $effect(() => {
    if (telemetryExpanded || suspended) pause();
  });
</script>

{#snippet movementReadings()}
  <StatStrip
    label="Runner movement"
    presentation="inline"
    items={[
      {
        id: 'lane',
        label: 'From inner rail',
        value: currentHorse ? laneMetres(currentHorse.lanePosition) : '—',
        unit: 'm'
      },
      {
        id: 'acceleration',
        label: 'Acceleration',
        value: currentHorse ? acceleration(runner?.index ?? 0).toFixed(2) : '—',
        unit: 'm/s²'
      },
      ...(!ensemble
        ? [
            {
              id: 'procs',
              label: 'Skill triggers',
              value: activations.filter((e) => e.frameTime <= time).length
            }
          ]
        : [])
    ]}
  />
{/snippet}
{#snippet telemetryActions()}
  <SegmentedControl
    compact
    options={[
      { value: 'combined', label: 'Combined' },
      { value: 'speed', label: 'Speed' },
      { value: 'hp', label: 'HP' },
      { value: 'gap', label: 'Gap' },
      ...(capture.detailed
        ? [
            { value: 'target', label: 'Target speed' },
            { value: 'acceleration', label: 'Acceleration' }
          ]
        : [])
    ]}
    bind:value={metric}
    label="Telemetry metric"
  />
  <span class="desktop-chart-options">
    <ToggleButton
      icon="users"
      label="Compare runners"
      pressed={compare}
      onclick={() => (compare = !compare)}
    />{#if !ensemble}
      <ToggleButton
        icon="activity"
        label="Race events"
        pressed={chartEvents}
        onclick={() => (chartEvents = !chartEvents)}
      />
    {/if}
  </span>
  <span class="mobile-chart-options">
    <InspectPopover
      label="Telemetry display options"
      align="end"
    >
      {#snippet trigger()}
        <span class="guide-trigger">
          <Icon
            name="tune"
            size={16}
          />
        </span>
      {/snippet}
      <h3>Telemetry display</h3>
      <ToggleButton
        icon="users"
        label="Compare runners"
        pressed={compare}
        onclick={() => (compare = !compare)}
      />{#if !ensemble}
        <ToggleButton
          icon="activity"
          label="Race events"
          pressed={chartEvents}
          onclick={() => (chartEvents = !chartEvents)}
        />
      {/if}
    </InspectPopover>
  </span>
{/snippet}
{#snippet telemetryHelp()}
  <InspectPopover label="How to read race telemetry">
    {#snippet trigger()}
      <span class="guide-trigger">
        <Icon
          name="info"
          size={15}
        />
      </span>
    {/snippet}
    <h3>Race telemetry</h3>
    {#if ensemble}
      <p>
        Faint curves show every sampled race; the solid curve is their arithmetic mean at the same
        elapsed time. Select an Uma to follow its spread on the track and graph. Finishers stay at
        the line.
      </p>
      <p>
        Click the chart to seek, or use the Replay time slider. Compare runners adds each Uma’s mean
        curve.
      </p>
    {:else}
      <p>
        Combined overlays speed, remaining HP and distance behind the leader in one chart. Live
        values are shown on the left. The speed scale is on the left of the graph; HP and distance
        scales are on the right. The curves, course lanes and skill icons share one replay time
        axis. Click the chart to seek, or use the Replay time slider with the keyboard.
      </p>
      <p>
        Choose a single signal to focus on it, or enable Compare runners to add faint dotted traces
        for the rest of the field. Race events show skill activation lines and front blocking
        intervals. Expand the graph to zoom and pan.
      </p>
    {/if}
  </InspectPopover>
{/snippet}
<svelte:document
  onvisibilitychange={() => {
    if (document.hidden) pause();
  }}
/>
<svelte:window
  onkeydown={keydown}
  onfullscreenchange={() => (fullscreen = !!document.fullscreenElement)}
/>
<section
  class="replay"
  class:overview={overviewOnly}
  class:ensemble-view={!!ensemble}
  bind:this={report}
>
  {#if !overviewOnly}
    <header class="replay-header">
      <div class="replay-title">
        <span class="replay-icon">
          <Icon
            name="race"
            size={22}
          />
        </span>
        <div>
          <div class="course-heading">
            <h2>
              {(course ? (courses?.names[course.raceTrackId] ?? 'Track') : 'Race capture') +
                ', ' +
                Math.round(bounds.distanceMax).toLocaleString() +
                ' m' +
                (course ? ', ' + (course.surface === 1 ? 'Turf' : 'Dirt') : '')}
            </h2>
            <div class="capture-summary">
              <span>{capture.runners.length} runners, {formatRaceTime(bounds.endTime)}</span>
              <strong>{capture.detailed ? 'Detailed resimulation' : 'Recorded race'}</strong>
            </div>
          </div>
          <p>
            {conditions}
            <span class="course-source">
              {trackOverride
                ? 'Manual course'
                : capture.courseId
                  ? 'Course detected'
                  : 'Select a course in Display options'}
            </span>
          </p>
        </div>
      </div>
      {#if headerActions}
        <div class="header-actions">{@render headerActions()}</div>
      {/if}
    </header>
    <nav
      class="report-navigation"
      aria-label="Jump to analysis section"
    >
      <div class="report-links">
        <Button
          variant="secondary"
          size="sm"
          icon="race"
          onclick={() => jump('replay')}
        >
          Race replay
        </Button><Button
          variant="secondary"
          size="sm"
          icon="rankings"
          onclick={() => jump('results')}
        >
          Race results
        </Button><Button
          variant="secondary"
          size="sm"
          icon="chart"
          onclick={() => jump('runner')}
        >
          Runner analysis
        </Button>{#if hasSession}
          <Button
            variant="secondary"
            size="sm"
            icon="users"
            onclick={() => jump('session')}
          >
            Session analysis
          </Button>
        {/if}
      </div>
    </nav>
  {/if}
  <Dialog
    bind:open={settingsOpen}
    title="Display options"
    maxWidth="620px"
    contentPadding="16px"
    mobileContentPadding="12px"
  >
    <div
      class="replay-toolbar"
      id="replay-settings"
    >
      <section class="course-controls">
        <h3>Course & precision</h3>
        <SelectField
          id="replay-track"
          label="Track"
          bind:value={trackOverride}
          options={[
            {
              value: '',
              label: capture.courseId
                ? 'Auto, Course ' + capture.courseId
                : 'Auto-detect from replay'
            },
            ...Object.entries(courses?.courses ?? {}).map(([id, c]) => ({
              value: id,
              label:
                (courses?.names[c.raceTrackId] ?? id) +
                ', ' +
                c.distance +
                'm, ' +
                (c.surface === 1 ? 'Turf' : 'Dirt') +
                (c.turn === 1 ? ', Right' : ', Left')
            }))
          ]}
        />
        <div class="precision-fields">
          <label>
            View window <span>
              <input
                aria-label="View window metres"
                type="number"
                min="20"
                max="400"
                step="10"
                bind:value={windowMeters}
              />
              m
            </span>
          </label>
          <label>
            Replay frame <span>
              <input
                aria-label="Replay frame"
                type="number"
                min="0"
                max={Math.max(0, capture.frames.length - 1)}
                value={frame?.sourceIndex ?? 0}
                onchange={(e) => seek(capture.frames[Number(e.currentTarget.value)]?.time ?? time)}
              />
              / {capture.frames.length}
            </span>
          </label>
        </div>
      </section>
      {#each [{ title: 'Runner overlays', keys: ['skills', 'blocked', 'speed', 'accel'] }, { title: 'Course overlays', keys: ['course', 'slopes', 'positionKeep', 'cone'] }] as group}
        <section>
          <h3>{group.title}</h3>
          <div class="options">
            {#each group.keys as option}
              <ToggleButton
                icon="eye"
                label={toggleLabels[option as keyof typeof toggleLabels]}
                pressed={toggles[option as keyof typeof toggles]}
                onclick={() =>
                  (toggles[option as keyof typeof toggles] =
                    !toggles[option as keyof typeof toggles])}
              />
            {/each}
          </div>
        </section>
      {/each}
    </div>
    {#snippet actions()}
      <Button
        size="sm"
        variant="secondary"
        onclick={() => {
          toggles = {
            skills: true,
            blocked: true,
            slopes: true,
            speed: false,
            accel: false,
            course: true,
            positionKeep: false,
            cone: true
          };
          windowMeters = 80;
        }}
      >
        Reset display
      </Button><Button
        size="sm"
        onclick={() => (settingsOpen = false)}
      >
        Done
      </Button>
    {/snippet}
  </Dialog>
  {#if courseError}
    <p
      class="notice"
      role="status"
    >
      {courseError}
    </p>
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
          <div
            class="stage-tools"
            role="group"
            aria-label="Replay actions"
          >
            <Button
              variant="secondary"
              size="sm"
              icon="tune"
              onclick={() => (settingsOpen = true)}
            >
              Display options
            </Button>
            <span class="replay-guide">
              <InspectPopover
                label="Replay guide"
                align="end"
              >
                {#snippet trigger()}
                  <span class="guide-trigger">
                    <Icon
                      name="info"
                      size={15}
                    />Guide
                  </span>
                {/snippet}
                <div class="course-legend">
                  <strong>Reading the replay</strong>
                  <small>
                    Drag to pan. Ctrl / ⌘ + scroll to zoom. Follow window keeps the racing pack in
                    view. Lanes ×2 expands lane spacing. Portraits and dots share the current race
                    position number; gold marks the leader.
                  </small>
                  <small>
                    Select a runner to follow their speed, HP and skills. Use the timeline to jump
                    to any moment. Select or hover a runner to see crowded labels.
                  </small>
                  {#each [{ label: 'Straight', color: '#64918c' }, { label: 'Final straight', color: '#419168' }, { label: 'Corner', color: '#7b7ea8' }, { label: 'Final corner', color: '#bb9148' }] as item}
                    <span>
                      <i style:background={item.color}></i>
                      {item.label}
                    </span>
                  {/each}
                </div>
              </InspectPopover>
            </span>
            <Button
              variant="secondary"
              size="sm"
              onclick={toggleFullscreen}
            >
              {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            </Button>
          </div>
        {/snippet}
        {#if ensemble}
          <div class="ensemble-views">
            <SegmentedControl
              compact
              label="Progression display"
              bind:value={ensembleView}
              options={[
                { value: 'field', label: 'Field spread' },
                { value: 'course', label: 'Track & course' }
              ]}
            />
            <span>Distributions at the same elapsed time</span>
          </div>
          {#if ensembleView === 'field'}
            <ReplayFieldSpread
              trajectories={ensemble}
              {time}
              runners={capture.runners}
              bind:selected
              {teamColor}
            />
          {:else if runner}
            <ReplayOutcomeCourse
              trajectories={ensemble}
              {time}
              {course}
              courseId={Number(trackId)}
              distance={bounds.distanceMax}
              {runner}
              color={teamColor(runner)}
            />
          {/if}
        {:else}
          {#if !mapPrimary || !shapes}
            <div class="stage-heading">
              {@render replayTitle()}{@render replayTools()}
            </div>
          {/if}
          <div
            class="positions-target"
            class:fullscreen-target={!mapPrimary}
            hidden={mapPrimary}
          >
            <div
              class="race-stage"
              hidden={mapPrimary}
              data-lane-max={displayedLaneMax}
              data-lane-target={viewport.laneMax}
              aria-label="Runner positions by distance and lane"
            >
              <div
                class="lane-axis"
                title="Lateral distance from the inside rail, in metres"
              >
                <small>Lane (m)</small>
                {#each [0, 0.25, 0.5, 0.75, 1] as fraction}
                  <span style:bottom={fraction * 100 + '%'}>
                    {laneMetres(displayedLaneMax * fraction)}
                  </span>
                {/each}
              </div>
              <div
                class="track-plane"
                bind:clientWidth={stageWidth}
                bind:clientHeight={stageHeight}
              >
                <span class="rail-label">INSIDE RAIL</span>
                <svg
                  class="course-background"
                  viewBox="0 0 1000 410"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  {#each [0.25, 0.5, 0.75, 1] as fraction}
                    <line
                      x1="0"
                      x2="1000"
                      y1={410 * (1 - fraction)}
                      y2={410 * (1 - fraction)}
                      class="lane-guide"
                    />
                  {/each}
                  {#if toggles.course}
                    {#each segments as segment}
                      <rect
                        x={x(segment.start)}
                        y="0"
                        width={((segment.end - segment.start) /
                          (stageViewport.max - stageViewport.min)) *
                          1000}
                        height="410"
                        fill={segment.color}
                        fill-opacity=".07"
                      />
                      <line
                        x1={x(segment.start)}
                        x2={x(segment.start)}
                        y1="0"
                        y2="410"
                        stroke={segment.color}
                        stroke-dasharray="4 4"
                      />
                    {/each}
                    {#each [{ distance: bounds.distanceMax / 6, label: 'Mid race' }, { distance: (bounds.distanceMax * 10) / 24, label: 'Position Keep ends' }, { distance: (bounds.distanceMax * 2) / 3, label: 'Late race' }] as marker}
                      <line
                        x1={x(marker.distance)}
                        x2={x(marker.distance)}
                        y1="0"
                        y2="410"
                        class="phase-marker"
                      />
                    {/each}
                  {/if}
                  {#if toggles.slopes}
                    {#each course?.slopes ?? [] as slope}
                      <polygon
                        points={slope.slope > 0
                          ? x(slope.start) +
                            ',410 ' +
                            x(slope.start + slope.length) +
                            ',410 ' +
                            x(slope.start + slope.length) +
                            ',205'
                          : x(slope.start) +
                            ',410 ' +
                            x(slope.start) +
                            ',205 ' +
                            x(slope.start + slope.length) +
                            ',410'}
                        fill={slope.slope > 0 ? '#bd7581' : '#719bdd'}
                        fill-opacity=".07"
                      />
                    {/each}
                  {/if}
                  {#if toggles.positionKeep && leader < (bounds.distanceMax * 10) / 24}
                    {@const factor =
                      1 +
                      (bounds.distanceMax - 1000) *
                        0.0008}{#each [{ min: 3, max: 5 * factor, color: '#be91d4' }, { min: 6.5 * factor, max: 7 * factor, color: '#69b7ee' }, { min: 7.5 * factor, max: 8 * factor, color: '#7bc8a0' }] as zone}
                      <rect
                        x={x(leader - zone.max)}
                        width={((zone.max - zone.min) / (stageViewport.max - stageViewport.min)) *
                          1000}
                        y="0"
                        height="410"
                        fill={zone.color}
                        fill-opacity=".16"
                      />
                    {/each}
                  {/if}
                  {#each [0, bounds.distanceMax] as distance}
                    <line
                      class="race-boundary"
                      data-distance={distance}
                      x1={x(distance)}
                      x2={x(distance)}
                      y1="0"
                      y2="410"
                    />
                  {/each}
                </svg>
                {#each [{ distance: 0, label: 'Start' }, { distance: bounds.distanceMax, label: 'Finish' }].filter((m) => m.distance >= stageViewport.min && m.distance <= stageViewport.max) as marker}
                  <span
                    class="course-label boundary-label"
                    style:left={x(marker.distance) / 10 + '%'}
                  >
                    {marker.label}
                  </span>
                {/each}
                {#if toggles.course}
                  {#each segments.filter((s) => s.start > 0 && s.start >= stageViewport.min && s.start <= stageViewport.max) as segment}
                    <span
                      class="course-label"
                      style:left={x(segment.start) / 10 + '%'}
                    >
                      {segment.label}
                    </span>
                  {/each}{#each [{ distance: bounds.distanceMax / 6, label: 'Mid race' }, { distance: (bounds.distanceMax * 2) / 3, label: 'Late race' }].filter((m) => m.distance >= stageViewport.min && m.distance <= stageViewport.max) as marker}
                    <span
                      class="course-label phase"
                      style:left={x(marker.distance) / 10 + '%'}
                    >
                      {marker.label}
                    </span>
                  {/each}
                {/if}
                {#each capture.runners as r}
                  {@const horse =
                    frame?.horses[
                      r.index
                    ]}{#if horse && visibility[r.index] !== 2 && horse.distance >= stageViewport.min && horse.distance <= stageViewport.max && (mapPrimary || horse.lanePosition <= displayedLaneMax)}
                    <button
                      class="replay-marker"
                      class:crowded={crowdedRunners.has(r.index)}
                      class:dim={visibility[r.index] === 1}
                      class:triggered={toggles.skills &&
                        recentSkills.some((e) => e.params[0] === r.index)}
                      class:selected={r.index === runner?.index}
                      class:front-blocked={toggles.blocked &&
                        blockingNow.some((b) => b.horseIndex === r.index)}
                      style:left={x(horse.distance) / 10 + '%'}
                      style:bottom={(horse.lanePosition / displayedLaneMax) *
                        (mapPrimary ? 30 : 100) +
                        '%'}
                      style:--runner-color={teamColor(r)}
                      aria-label={'Inspect ' + r.name}
                      aria-pressed={r.index === runner?.index}
                      title={r.name +
                        ', ' +
                        (horse.speed / 100).toFixed(2) +
                        ' m/s, HP ' +
                        Math.round(horse.hp) +
                        ', ' +
                        horse.distance.toFixed(1) +
                        'm, Lane ' +
                        Math.round(horse.lanePosition)}
                      onclick={() => (selected = String(r.index))}
                    >
                      {#if toggles.blocked && (blockerAt(capture, r.index, time, horse.blockFrontHorseIndex) ?? -1) >= 0}
                        <span
                          class="blocked"
                          title="Blocked"
                        >
                          !
                        </span>
                      {/if}
                      <span class="portrait">
                        <Artwork
                          src={portrait(r.cardId)}
                          alt=""
                          size="sm"
                          shape="circle"
                        />
                        <b>{r.index + 1}</b>
                      </span>
                      <span class="hp">
                        <i
                          style:width={(fieldHp(r.index, false) ?? 0) + '%'}
                          style:background={hpColor(fieldHp(r.index, false))}
                        ></i>
                      </span>
                      {#if r.index === runner?.index}
                        <span class="marker-name">{r.name}</span>
                      {/if}
                      {#if !mapPrimary && (toggles.speed || toggles.accel)}
                        <span class="marker-telemetry">
                          {#if toggles.speed}
                            <span title="Speed (m/s)">
                              {(horse.speed / 100).toFixed(2)}
                            </span>
                          {/if}{#if toggles.accel}
                            <span title="Acceleration (m/s²)">
                              {acceleration(r.index) > 0 ? '+' : ''}{acceleration(r.index).toFixed(
                                2
                              )}
                            </span>
                          {/if}
                        </span>
                      {/if}
                    </button>
                  {/if}
                {/each}
                <div class="distance-axis">
                  {#each [0, 0.25, 0.5, 0.75, 1] as fraction}
                    <span style:left={fraction * 100 + '%'}>
                      {Math.round(
                        stageViewport.min + (stageViewport.max - stageViewport.min) * fraction
                      )}m
                    </span>
                  {/each}
                </div>
              </div>
            </div>
          </div>
          {#if shapes}
            <ReplayCourseMap
              toolbarStart={replayTitle}
              toolbarEnd={replayTools}
              viewDistance={toggles.cone ? courses?.baseViewDistance : undefined}
              blockerIndex={toggles.blocked ? blocker : -1}
              blocking={toggles.blocked ? blockingNow : []}
              onexpand={() => (focusView = 'map')}
              primary={mapPrimary}
              skillEvents={toggles.skills ? recentSkills : []}
              frames={capture.frames}
              {laneWidth}
              onseekdistance={seekDistance}
              {course}
              shape={shapes[trackId]}
              onselectcourse={() => (settingsOpen = true)}
              {frame}
              runners={capture.runners}
              raceOrder={fieldOrder.map((r) => r.index)}
              bind:selected
              {visibility}
              {teamColor}
              viewport={positionViewport}
              slopes={toggles.slopes}
              showSpeed={toggles.speed}
              showAcceleration={toggles.accel}
              {acceleration}
            />
          {:else}
            <div
              class="map-loading fullscreen-target"
              class:primary={mapPrimary}
              hidden={!mapPrimary}
            >
              {#if geometryError}
                <p
                  class="notice"
                  role="status"
                >
                  {geometryError}
                  <Button
                    variant="secondary"
                    size="sm"
                    onclick={loadGeometry}
                  >
                    Retry course geometry
                  </Button>
                </p>
              {:else}
                <Spinner
                  centered
                  label="Loading course map…"
                />
              {/if}
            </div>
          {/if}
          <aside
            class="live-roster"
            aria-label="Race field"
          >
            <header>
              <div class="field-heading">
                <h3>
                  Race field <span>{capture.runners.length}</span>
                </h3>
                <span class="field-order">
                  {ensemble
                    ? 'Mean position'
                    : finishedCount === capture.runners.length
                      ? 'Finish order'
                      : 'Live order'}
                </span>
                {#if Object.values(visibility).some((value) => value > 0)}
                  <IconButton
                    size="sm"
                    icon="eye"
                    label="Show all runners"
                    onclick={() => (visibility = {})}
                  />
                {/if}
              </div>
              <p>
                {finishedCount
                  ? finishedCount + ' / ' + capture.runners.length + ' finished'
                  : 'Select a runner to follow'}
              </p>
            </header>
            <div class="field-runners">
              {#each fieldOrder as r, index (r.index)}
                {@const horse = frame?.horses[r.index]}
                {@const finished = hasFinished(r)}
                {@const place = finished
                  ? ensemble
                    ? undefined
                    : finishRanks.get(r.index)
                  : frame
                    ? index + 1
                    : undefined}
                {@const gap = horse ? Math.max(0, leader - horse.distance) : undefined}
                {@const finish = finishTimes.get(r.index)}
                <div
                  class="field-runner"
                  class:finished
                  class:chosen={runner?.index === r.index}
                  class:front-blocked={toggles.blocked &&
                    blockingNow.some((b) => b.horseIndex === r.index)}
                  class:dimmed={visibility[r.index] === 1}
                  class:hidden-runner={visibility[r.index] === 2}
                  style:--team-color={teamColor(r)}
                  data-runner-index={r.index}
                >
                  <button
                    class="runner-pick"
                    aria-pressed={runner?.index === r.index}
                    aria-label={'Follow ' + r.name}
                    onclick={() => (selected = String(r.index))}
                  >
                    <span
                      class="field-place"
                      class:podium={place !== undefined && place <= 3}
                      title={finished ? 'Final placing' : 'Current position'}
                    >
                      {place ?? '—'}
                    </span>
                    <Artwork
                      src={portrait(r.cardId)}
                      alt=""
                      size="xs"
                    />
                    <span class="field-name">
                      <strong>{r.name}</strong>
                      <small class="field-meta">
                        <span>Gate {r.index + 1}</span>
                        <span>
                          {runningStyleName(r.result?.runningStyle ?? Number(r.raw.runningStyle))}
                        </span>
                      </small>
                    </span>
                    <span
                      class="field-hp"
                      title="HP remaining relative to maximum HP"
                    >
                      <strong style:color={hpColor(fieldHp(r.index, finished))}>
                        {formatHp(fieldHp(r.index, finished))}
                      </strong>
                      <small>HP</small>
                    </span>
                    <span
                      class="field-gap"
                      title={finished
                        ? ensemble
                          ? 'All samples finished'
                          : 'Finish time'
                        : 'Distance behind the leader'}
                    >
                      {finished
                        ? ensemble
                          ? 'At line'
                          : finish === undefined
                            ? '—'
                            : formatRaceTime(finish, 2)
                        : gap === undefined
                          ? '—'
                          : gap < 0.05
                            ? 'Lead'
                            : gap.toFixed(1) + ' m'}
                      <small class:finish-status={finished}>
                        {#if finished}
                          <Icon
                            name="check"
                            size={10}
                          />{ensemble ? 'All finished' : 'Finished'}
                        {:else}
                          {horse ? (horse.speed / 100).toFixed(1) + ' m/s' : 'No frame'}
                        {/if}
                      </small>
                    </span>
                  </button>
                  <IconButton
                    size="sm"
                    icon={visibility[r.index] === 2 ? 'eye-off' : 'eye'}
                    label={r.name +
                      ': ' +
                      ['visible', 'dimmed', 'hidden'][visibility[r.index] ?? 0] +
                      '. Change visibility'}
                    title="Click to dim, then hide; Shift-click to focus"
                    onclick={(event) => cycle(r, event.shiftKey)}
                  />
                </div>
              {/each}
            </div>
            {#if runner}
              <section
                class="runner-snapshot"
                aria-label="Selected runner telemetry"
              >
                <header>
                  <div class="snapshot-identity">
                    <Artwork
                      src={portrait(runner.cardId)}
                      alt=""
                      size="xs"
                    />
                    <div>
                      <small>{ensemble ? 'Following mean' : 'Following'}</small>
                      <h3>{runner.name}</h3>
                    </div>
                  </div>
                  <div class="snapshot-actions">
                    <InspectPopover
                      label="Following details"
                      align="end"
                    >
                      {#snippet trigger()}
                        <span class="snapshot-details-trigger">
                          <Icon
                            name="info"
                            size={14}
                          />Details
                        </span>
                      {/snippet}
                      <div class="snapshot-details">
                        <h3>{runner.name}</h3>
                        <div class="snapshot-movement">
                          <p>
                            {runnerState}{#if rushed}
                              , rushed
                            {/if}
                          </p>
                          {@render movementReadings()}
                        </div>
                        {#if !ensemble}
                          {#if blockedRunner}
                            <p>
                              Blocked by Gate {blocker + 1}:
                              <button
                                class="diagnostic-link"
                                onclick={() => (selected = String(blocker))}
                              >
                                {blockedRunner.name} ↗
                              </button>
                            </p>
                          {:else}
                            <p>No front blocker at this moment.</p>
                          {/if}
                          <h4>Current skills</h4>
                          {#each activeSkills as event}
                            <div class="snapshot-skill">
                              <RaceSkill
                                id={event.params[1]!}
                                name={skillNames.get(event.params[1]!)}
                              />{#if event.endTime !== undefined}
                                <small>
                                  {Math.max(0, event.endTime - time).toFixed(1)}s left
                                </small>
                              {/if}
                            </div>
                          {:else}
                            <p>No current skill activation.</p>
                          {/each}
                        {/if}
                        {#if diagnostic}
                          <div class="live-diagnostics">
                            <span>
                              Target speed <b>{targetSpeed?.toFixed(2) ?? '—'} m/s</b>
                            </span>
                            <span>
                              HP <b>
                                {currentHorse?.hp.toFixed(0) ?? '—'} / {diagnostic.maxHp?.toFixed(
                                  0
                                ) ?? '—'}
                              </b>
                            </span>
                            <span class="mode-list">{modes.join(', ') || 'No special mode'}</span>
                            {#each [{ label: 'Position-keep reference', index: reference }, { label: 'Pacemaker', index: pacemaker }] as item}
                              {#if item.index !== undefined && item.index >= 0}
                                <button
                                  class="diagnostic-link"
                                  onclick={() => (selected = String(item.index))}
                                >
                                  {item.label}: #{item.index + 1}
                                  {capture.runners.find((r) => r.index === item.index)?.name} ↗
                                </button>
                              {/if}
                            {/each}
                          </div>
                        {/if}
                      </div>
                    </InspectPopover>{#if !ensemble}
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="chart"
                        ariaLabel="Analyse this runner"
                        onclick={analyseRunner}
                      >
                        Analyse
                      </Button>
                    {/if}
                  </div>
                </header>
                <div
                  class="runner-state"
                  class:runner-finished={hasFinished(runner)}
                >
                  <span>{runnerState}</span>
                  {#if rushed}
                    <b>Rushed</b>
                  {/if}
                </div>
                <div class="runner-extra">{@render movementReadings()}</div>
                {#if !ensemble}
                  <div class="snapshot-status">
                    {#if blockedRunner}
                      <button
                        class="blocked-by"
                        title={'Front blocker: Gate ' + (blocker + 1) + ', ' + blockedRunner.name}
                        onclick={() => (selected = String(blocker))}
                      >
                        <Icon
                          name="warning"
                          size={12}
                        />
                        <span>
                          Blocked by <strong>{blockedRunner.name}</strong>
                          ↗
                        </span>
                      </button>
                    {:else}
                      <small class="blocker-clear">No front blocker</small>
                    {/if}
                    <div
                      class="current-skills"
                      aria-label="Current skills"
                    >
                      {#each activeSkills as event}
                        <span class="active-skill">
                          <RaceSkill
                            id={event.params[1]!}
                            name={skillNames.get(event.params[1]!)}
                            iconOnly
                          />
                        </span>
                      {/each}
                    </div>
                  </div>
                {/if}
              </section>
            {/if}
          </aside>
        {/if}
        <div class="replay-timeline">
          <ReplayTimeline
            frames={capture.frames}
            {bounds}
            timelineEnd={telemetryEnd}
            {course}
            bind:time
            bind:speed
            {playing}
            minimal={!!ensemble}
            phase={racePhase}
            {leader}
            onplay={play}
            onseek={seek}
          >
            {#snippet actions()}
              {#if !telemetryExpanded}
                <div class="playback-actions-options">
                  {@render telemetryActions()}
                </div>
                {#if !ensemble}
                  <span id="runner-telemetry-expand">
                    <Button
                      variant="secondary"
                      size="sm"
                      ariaLabel="Expand Race telemetry"
                      onclick={() => (telemetryExpanded = true)}
                    >
                      Expand
                    </Button>
                  </span>
                {/if}
              {/if}
            {/snippet}
            {#snippet telemetry()}
              <div class="telemetry">
                <ChartFrame
                  plain
                  compact
                  expandable
                  maximize
                  id="runner-telemetry"
                  title="Race telemetry"
                  showHeader={false}
                  legend={telemetryExpanded
                    ? chartSignals.map((signal) => ({
                        label: signal.label + ' (' + signal.unit + ')',
                        color: signal.color
                      }))
                    : []}
                  bind:expanded={telemetryExpanded}
                >
                  {#snippet titleActions()}
                    {@render telemetryHelp()}
                  {/snippet}
                  {#snippet actions()}
                    {@render telemetryActions()}
                  {/snippet}

                  <div
                    class="telemetry-columns"
                    class:expanded={telemetryExpanded}
                  >
                    {#if !telemetryExpanded}
                      <div
                        class="telemetry-reading"
                        class:combined={metric === 'combined'}
                        aria-label="Selected runner telemetry"
                      >
                        <div class="telemetry-heading">
                          <h3 class="timeline-label">
                            {ensemble ? 'Mean telemetry' : 'Race telemetry'}
                          </h3>
                          {@render telemetryHelp()}
                        </div>
                        {#each chartSignals as signal}
                          {@const value = signalValue(signal.value)}
                          <div
                            class="signal-reading"
                            style:--signal-color={signal.color}
                          >
                            <span>{signal.label}</span>
                            <strong
                              style:color={signal.value === 'hp' ? hpColor(value) : undefined}
                            >
                              {value === undefined
                                ? '—'
                                : value.toFixed(signal.value === 'hp' ? 1 : 2)}
                              <small>{signal.unit}</small>
                            </strong>
                          </div>
                        {/each}
                      </div>
                    {/if}
                    <div class="telemetry-track">
                      <LazyEChartsSurface
                        {option}
                        label={ensemble
                          ? 'All sampled trajectories and their mean'
                          : 'Runner telemetry over time'}
                        height={220}
                        zoomable={telemetryExpanded}
                        onaxisclick={seek}
                      />{#if !telemetryExpanded}
                        <span
                          class="telemetry-cursor"
                          aria-hidden="true"
                        ></span>
                      {/if}
                    </div>
                  </div>
                </ChartFrame>
              </div>
            {/snippet}
            {#snippet children(ticks)}
              {#if runner && ensemble && ensembleTimeline}
                {@render ensembleTimeline({
                  ticks,
                  time,
                  startTime: bounds.startTime,
                  endTime: telemetryEnd,
                  runner: runner.index,
                  seek,
                  course,
                  timeAt: (distance) => raceTimeAtDistance(capture.frames, distance),
                  distanceMax: bounds.distanceMax
                })}
              {/if}
              {#if runner && !ensemble}
                <SkillActivityTimeline
                  {capture}
                  index={runner.index}
                  {skillNames}
                  {time}
                  {ticks}
                  startTime={bounds.startTime}
                  endTime={telemetryEnd}
                  onseek={seek}
                />
              {/if}
              {#if toggles.skills && !ensemble}
                <div
                  class="skill-feed"
                  aria-label="Recent course skill triggers"
                >
                  <span
                    class="timeline-label"
                    title="Skills activated by the race field in the last 2 seconds"
                  >
                    Race activations
                  </span>
                  <div
                    class="skill-feed-scroll"
                    role="group"
                    aria-label="Recent skill activations (last 2 seconds)"
                  >
                    {#each recentSkills.filter((e) => visibility[e.params[0]!] !== 2) as event}
                      {@const r = capture.runners.find((r) => r.index === event.params[0])}
                      {#if r}
                        <button
                          class="skill-trigger"
                          class:inspected={r.index === runner?.index}
                          title={r.name + ' at ' + event.frameTime.toFixed(2) + ' s'}
                          aria-label={'Inspect ' +
                            r.name +
                            ' skill trigger at ' +
                            event.frameTime.toFixed(2) +
                            ' seconds'}
                          onclick={() => {
                            selected = String(r.index);
                            seek(event.frameTime);
                          }}
                        >
                          <span class="activation-runner">
                            <Artwork
                              src={portrait(r.cardId)}
                              alt={r.name}
                              size="xs"
                            />
                            <b title={'Gate ' + (r.index + 1)}>{r.index + 1}</b>
                          </span>
                          <RaceSkill
                            id={event.params[1]!}
                            name={skillNames.get(event.params[1]!)}
                          />
                        </button>
                      {/if}
                    {:else}
                      <span class="no-triggers">No recent activation</span>
                    {/each}
                  </div>
                </div>
              {/if}
            {/snippet}
          </ReplayTimeline>
        </div>
      </div>
    </section>
    {#if !overviewOnly}
      <section
        class="analysis-section results-panel"
        data-report-section="results"
        aria-label="Race results section"
      >
        <ReplayResults
          capture={{ ...capture, raceDistance: bounds.distanceMax }}
          selectedIndex={runner?.index}
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
        {#if runner}
          <header class="report-heading">
            <h2>Runner analysis</h2>
            <Button
              variant="secondary"
              size="sm"
              icon="clipboard"
              onclick={() => (buildOpen = true)}
            >
              Build details
            </Button>
          </header>
          {#snippet runnerOverview()}
            <article
              class="runner-card"
              style:--runner-color={teamColor(runner)}
            >
              <RunnerBuild
                {runner}
                {skillNames}
                compact
                raceContext={{
                  surface: course?.surface,
                  distance: course?.distance ?? capture.raceDistance
                }}
              >
                {#snippet headerActions()}
                  <Button
                    variant="ghost"
                    size="sm"
                    ariaLabel="Choose runner"
                    onclick={() => (runnerPickerOpen = true)}
                  >
                    <span class="gate-label">
                      Gate {runner.index + 1}<Icon
                        name="chevron"
                        size={14}
                      />
                    </span>
                  </Button>
                {/snippet}
              </RunnerBuild>
            </article>
          {/snippet}
          {#snippet blockingPanel()}
            <section
              class="events blocking-analysis"
              aria-label="Blocking incidents"
            >
              <header>
                <h3>
                  Front blocking <small>
                    {visibleBlocking.length}
                    {visibleBlocking.length === 1 ? 'incident' : 'incidents'}
                  </small>
                </h3>
                <Checkbox
                  id="blocking-scope"
                  label="All runners"
                  bind:checked={allBlocking}
                />
              </header>
              <div class="event-list">
                {#each visibleBlocking as event}
                  {@const blocked = capture.runners.find((r) => r.index === event.horseIndex)}
                  {@const blocker = capture.runners.find(
                    (r) => r.index === event.blockerHorseIndex
                  )}
                  <button
                    class:active={time >= event.startTime &&
                      time < event.endTime &&
                      runner.index === event.horseIndex}
                    aria-label={'Review ' +
                      blocked?.name +
                      ' blocked by ' +
                      blocker?.name +
                      ' at ' +
                      event.startTime.toFixed(2) +
                      ' seconds'}
                    onclick={() => reviewBlocking(event)}
                  >
                    <time>{formatRaceTime(event.startTime)}</time>
                    <Artwork
                      src={portrait(blocked?.cardId)}
                      alt=""
                      size="xs"
                    />
                    <span class="blocking-pair">
                      <strong>{blocked?.name}</strong>
                      <small>Blocked by {blocker?.name}</small>
                    </span>
                    <span>{(event.endTime - event.startTime).toFixed(2)} s ↗</span>
                  </button>
                {:else}
                  <p>
                    No front blocking recorded {allBlocking
                      ? 'in this race'
                      : 'for ' + runner.name}.
                  </p>
                {/each}
              </div>
            </section>
          {/snippet}
          <div class="runner-outcomes">
            <ReplayDiagnostics
              {capture}
              index={runner.index}
              {skillNames}
              distance={bounds.distanceMax}
              blocking={blockingPanel}
              overview={runnerOverview}
              onseek={reviewTime}
              onselect={reviewRunner}
            />
          </div>
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
  <Dialog
    bind:open={runnerPickerOpen}
    title="Choose runner"
    maxWidth="1040px"
    contentPadding="12px"
    mobileContentPadding="8px"
  >
    <div class="runner-choices">
      {#each capture.runners as choice}
        <button
          class="runner-choice"
          class:chosen={choice.index === runner?.index}
          style:--runner-color={teamColor(choice)}
          aria-label={'Gate ' + (choice.index + 1) + ' · ' + choice.name}
          aria-pressed={choice.index === runner?.index}
          onclick={() => {
            selected = String(choice.index);
            runnerPickerOpen = false;
          }}
        >
          <span class="choice-gate">
            Gate {choice.index + 1}{#if choice.index === runner?.index}
              <Icon
                name="check"
                size={14}
              />
            {/if}
          </span>
          <RunnerBuild
            runner={choice}
            {skillNames}
            compact
            raceContext={{
              surface: course?.surface,
              distance: course?.distance ?? capture.raceDistance
            }}
          />
        </button>
      {/each}
    </div>
  </Dialog>
  <div class="runner-build-dialog">
    <Dialog
      bind:open={buildOpen}
      title="Runner build"
      maxWidth="980px"
      maxHeight="92dvh"
      contentPadding="12px"
      mobileContentPadding="8px"
    >
      {#if runner}
        <RunnerBuildGroup single>
          <article class="race-build-card">
            <RunnerBuildDetails
              {runner}
              {skillNames}
              color={teamColor(runner)}
              raceContext={{
                surface: course?.surface,
                distance: course?.distance ?? capture.raceDistance
              }}
            >
              {#snippet metrics()}
                {#if runner.result}
                  <section class="entry-metadata">
                    <h3>Race entry</h3>
                    <dl>
                      {#each [{ label: 'Game finish time', value: formatRaceTime(runner.result.finishTime) }, { label: 'Time behind previous', value: runner.result.finishDiffTime.toFixed(3) + ' s' }, { label: 'Guts / wit rank', value: runner.result.gutsOrder + ' / ' + runner.result.wizOrder }, { label: 'Result reason code', value: runner.result.defeatReason }, { label: 'Popularity', value: diagnostic?.popularity ?? runner.raw.popularity ?? '—' }, { label: 'Mood', value: ['', 'Awful', 'Bad', 'Normal', 'Good', 'Great'][Number(runner.raw.motivation)] ?? '—' }] as fact}
                        <div>
                          <dt>{fact.label}</dt>
                          <dd>{fact.value}</dd>
                        </div>
                      {/each}
                    </dl>
                  </section>
                {/if}
              {/snippet}
            </RunnerBuildDetails>
          </article>
        </RunnerBuildGroup>
      {/if}
      {#snippet actions()}
        <Button
          variant="secondary"
          size="sm"
          onclick={() => (buildOpen = false)}
        >
          Close
        </Button>
      {/snippet}
    </Dialog>
  </div>
</section>

<style>
  @import './race-replay.css';
</style>
