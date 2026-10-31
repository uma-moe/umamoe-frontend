<script lang="ts">
  import { onDestroy, untrack, type Snippet } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import type { RaceEvent, RaceFrame, RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import {
    raceFrameAtTime,
    replayLaneMetres,
    type InterpolatedRaceFrame
  } from '@/lib/race/replay/race-replay';
  import Button from '@/components/controls/Button.svelte';
  import Artwork from '@/components/game/Artwork.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import type { Course, CourseShape } from '../replay-course';
  import {
    replayTrack,
    fitTrackCamera,
    followTrackCamera,
    trackBasis,
    trackSection,
    trackUnitsPerMetre
  } from '../replay-track';
  import { CourseMapCamera } from './course-map-camera.svelte';
  import { TrackLabelMotion } from './track-label-motion.svelte';
  import { dotRadius, placeCallouts } from './course-map-labels';
  import ReplayMapToolbar from './ReplayMapToolbar.svelte';
  import ReplayMapCourse from './ReplayMapCourse.svelte';
  import ReplayMapLandmarks from './ReplayMapLandmarks.svelte';
  import ReplayMapRunners from './ReplayMapRunners.svelte';
  import ReplayCourseMinimap from './ReplayCourseMinimap.svelte';
  import type { RunnerCallout } from '../replay-callouts';

  let {
    course,
    shape,
    frame,
    frames,
    laneWidth,
    viewDistance,
    blockerIndex = -1,
    blocking = [],
    onseekdistance,
    skillEvents = [],
    runnerLabels = new Map(),
    timers = false,
    minimap = false,
    runners,
    raceOrder,
    selected = $bindable('0'),
    visibility,
    teamColor,
    viewport,
    slopes = true,
    showSpeed = false,
    showAcceleration = false,
    acceleration,
    onselectcourse,
    toolbarStart,
    toolbarEnd
  }: {
    blocking?: { horseIndex: number; blockerHorseIndex: number }[];
    viewDistance?: number;
    blockerIndex?: number;
    skillEvents?: RaceEvent[];
    runnerLabels?: Map<number, RunnerCallout[]>;
    timers?: boolean;
    /** Shows the full course beside the following camera. */
    minimap?: boolean;
    course?: Course;
    shape?: CourseShape;
    frame?: InterpolatedRaceFrame;
    frames: RaceFrame[];
    laneWidth: number;
    onseekdistance: (distance: number) => void;
    runners: RaceRunner[];
    raceOrder: number[];
    selected?: string;
    visibility: Record<number, number>;
    teamColor: (runner: RaceRunner) => string;
    viewport: { min: number; max: number };
    slopes?: boolean;
    showSpeed?: boolean;
    showAcceleration?: boolean;
    acceleration?: (index: number) => number;
    onselectcourse: () => void;
    toolbarStart?: Snippet;
    toolbarEnd?: Snippet;
  } = $props();

  let laneDetail = $state(true);

  const view = new CourseMapCamera(() => framingPoints);
  const labels = new TrackLabelMotion();

  const lateralScale = $derived(laneDetail ? 2 : 1);

  const helpId = $props.id();

  const points = $derived(shape ? replayTrack(shape) : []);
  const units = $derived(trackUnitsPerMetre(points));

  const offsetAt = (distance: number, lane: number) => {
    const p = trackBasis(points, distance, course?.turn);
    return {
      ...p,
      x: p.x + p.nx * lane * units * lateralScale,
      y: p.y + p.ny * lane * units * lateralScale
    };
  };

  const roadPoints = $derived(points.map((p) => offsetAt(p.distance, laneWidth / 2)));
  const outerPoints = $derived(points.map((p) => offsetAt(p.distance, laneWidth)));
  const seekLimit = $derived(Math.max(0, ...(frames.at(-1)?.horses.map((h) => h.distance) ?? [])));
  const places = $derived(new Map(raceOrder.map((index, position) => [index, position + 1])));
  const selectedRunner = $derived(runners.find((r) => r.index === Number(selected)));
  const markers = $derived(
    runners
      .filter((r) => visibility[r.index] !== 2 && frame?.horses[r.index])
      .map((r) => {
        const horse = frame!.horses[r.index]!,
          lane = replayLaneMetres(horse.lanePosition, laneWidth);

        return { runner: r, horse, lane, point: offsetAt(horse.distance, lane) };
      })
  );

  const cone = $derived.by(() => {
    const horse = frame?.horses[Number(selected)];
    if (!horse || !viewDistance || !points.length) return '';
    const lane = replayLaneMetres(horse.lanePosition, laneWidth);
    // ponytail: illustrative base cone; exact skill-adjusted visibility needs engine telemetry.
    const side = (sign: number) =>
      Array.from({ length: 13 }, (_, i) =>
        offsetAt(
          horse.distance + (viewDistance * i) / 12,
          Math.max(0, Math.min(laneWidth, lane + sign * (0.6 + (laneWidth * 0.32 * i) / 12)))
        )
      );

    return [...side(-1), ...side(1).reverse()].map((p) => p.x + ',' + p.y).join(' ');
  });

  const blockLinks = $derived(
    blocking.flatMap((pair) => {
      const horse = frame?.horses[pair.horseIndex],
        other = frame?.horses[pair.blockerHorseIndex];

      if (
        !horse ||
        !other ||
        visibility[pair.horseIndex] === 2 ||
        visibility[pair.blockerHorseIndex] === 2
      )
        return [];
      const a = view.project(
          offsetAt(horse.distance, replayLaneMetres(horse.lanePosition, laneWidth))
        ),
        b = view.project(offsetAt(other.distance, replayLaneMetres(other.lanePosition, laneWidth)));

      const basis = trackBasis(points, other.distance, course?.turn);
      const normal = view.rotate(basis.nx, basis.ny);
      return [{ ...pair, a, b, nx: normal.x, ny: normal.y }];
    })
  );

  const trail = $derived(
    [
      ...frames.slice(
        raceFrameAtTime(frames, (frame?.time ?? 0) - 3)?.sourceIndex ?? 0,
        (frame?.sourceIndex ?? 0) + 1
      ),
      ...(frame ? [frame] : [])
    ]
      .flatMap((f) => {
        const h = f.horses[Number(selected)];
        return h ? [offsetAt(h.distance, replayLaneMetres(h.lanePosition, laneWidth))] : [];
      })
      .map((p) => p.x + ',' + p.y)
      .join(' ')
  );

  const labelSize = $derived(view.width < 600 ? 28 : 36);
  const overlayHeight = $derived((Number(showSpeed) + Number(showAcceleration)) * 14);
  const occupiedLane = $derived(
    Math.max(
      0,
      ...markers
        .filter((m) => m.horse.distance >= viewport.min && m.horse.distance <= viewport.max)
        .map((m) => m.lane)
    )
  );

  const occupiedWidth = $derived(occupiedLane + 2);
  const framedLanes = $derived(Math.max(Math.min(laneWidth, 10), occupiedWidth));
  const followPoints = $derived(points.map((p) => offsetAt(p.distance, occupiedWidth / 2)));
  const heading = $derived.by(() => {
    const tangent = trackBasis(points, (viewport.min + viewport.max) / 2, course?.turn);
    const angle = -Math.atan2(tangent.ty, tangent.tx),
      previous = untrack(() => view.motion.target.angle);

    return previous + Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous));
  });

  const followCamera = $derived.by(() => {
    const camera = followTrackCamera(
      roadPoints,
      viewport,
      view.width,
      view.height,
      view.followZoom,
      heading
    );

    // Use the same course basis as the dots and landmarks, including the finish.
    const centre = offsetAt((viewport.min + viewport.max) / 2, framedLanes / 2);
    return { ...camera, x: centre.x, y: centre.y };
  });

  const windowPoints = $derived([
    offsetAt(viewport.min, framedLanes / 2),
    ...roadPoints.filter((p) => p.distance > viewport.min && p.distance < viewport.max),
    offsetAt(viewport.max, framedLanes / 2)
  ]);

  // Reserve a little space at both rails for portraits beside the actual positions.
  const portraitClearance = $derived(
    24 / (Math.max(0.01, units * followCamera.scale) * lateralScale)
  );

  const framingPoints = $derived(
    windowPoints.flatMap((p) => [
      offsetAt(p.distance, -portraitClearance),
      offsetAt(p.distance, framedLanes + portraitClearance)
    ])
  );

  const framedCamera = $derived(
    fitTrackCamera(framingPoints, view.width, view.height, 0, followCamera)
  );

  const target = $derived(
    view.following
      ? framedCamera
      : (view.manual ?? fitTrackCamera([...points, ...outerPoints], view.width, view.height, 0))
  );

  $effect(() => {
    shape;
    view.following = true;
    view.manual = undefined;
  });

  let cameraTime = NaN;

  $effect(() => {
    const now = frame?.time ?? 0,
      seeking = !Number.isFinite(cameraTime) || Math.abs(now - cameraTime) > 0.5;

    cameraTime = now;
    const current = untrack(() => view.motion.current);
    const jumped =
      Math.hypot(target.x - current.x, target.y - current.y) * target.scale >
      Math.min(view.width, view.height) / 2;

    void view.motion
      .set(target, {
        instant: prefersReducedMotion.current || !view.following || jumped || seeking
      })
      .catch(() => {});
  });

  onDestroy(() => {
    void view.motion.set(view.motion.current, { instant: true });
  });

  const pixelsPerMetre = $derived(Math.max(0.01, units * view.current.scale));

  const displayRange = $derived(
    view.following
      ? {
          min: Math.max(0, viewport.min - Math.max(view.width, view.height) / pixelsPerMetre / 2),
          max: Math.min(
            shape?.distance ?? 0,
            viewport.max + Math.max(view.width, view.height) / pixelsPerMetre / 2
          )
        }
      : { min: 0, max: shape?.distance ?? 0 }
  );

  const screenMarkers = $derived(
    markers
      .map((marker) => {
        const inward = marker.lane > laneWidth / 2 ? -1 : 1;
        return {
          ...marker,
          anchor: view.project(marker.point),
          normal: view.rotate(marker.point.nx * inward, marker.point.ny * inward),
          tangent: view.rotate(marker.point.tx, marker.point.ty)
        };
      })
      .filter(
        (m) =>
          m.anchor.x >= 0 &&
          m.anchor.x <= view.width &&
          m.anchor.y >= 0 &&
          m.anchor.y <= view.height
      )
  );

  onDestroy(() => {
    void labels.motion.set(labels.motion.current, { instant: true });
  });

  $effect(() => {
    labels.place({
      anchors: screenMarkers.map((m) => ({
        index: m.runner.index,
        ...m.anchor,
        nx: m.normal.x,
        ny: m.normal.y,
        tx: m.tangent.x,
        ty: m.tangent.y,
        progress: -(places.get(m.runner.index) ?? m.runner.index + 1)
      })),
      runners: runners.map((r) => r.index),
      labelSize,
      overlayHeight,
      width: view.width,
      height: view.height,
      following: view.following,
      time: frame?.time ?? 0
    });
  });

  const callouts = $derived(
    placeCallouts(screenMarkers, labels.motion.current, labelSize, Number(selected))
  );

  const visible = (p: { x: number; y: number }, margin = 20) =>
    p.x >= margin && p.x <= view.width - margin && p.y >= margin && p.y <= view.height - margin;

  const clearLabel = (p: { x: number; y: number }) =>
    visible(p, 24) && callouts.every((c) => Math.hypot(c.x - p.x, c.y - p.y) > 40);

  const packPath = $derived(trackSection(followPoints, viewport.min, viewport.max));
</script>

<section
  class="course-overview"
  aria-label="Course overview"
>
  <span
    class="sr-only"
    id={helpId}
  >
    Select a runner to follow them. Drag to pan. Hold Ctrl or Command and scroll to zoom. Open
    Replay guide for more.
  </span>
  <ReplayMapToolbar
    hasTrack={!!points.length}
    following={view.following}
    bind:laneDetail
    zoomOutDisabled={view.zoomOutDisabled}
    zoomInDisabled={view.zoomInDisabled}
    onfollow={view.follow}
    onfullcourse={view.release}
    onzoom={(factor) => view.zoom(factor)}
    {toolbarStart}
    {toolbarEnd}
  />
  <div
    class="map-scene fullscreen-target"
    bind:clientWidth={view.width}
    bind:clientHeight={view.height}
  >
    <div class="map-caption">
      <strong>Window</strong>
      <span>
        {Math.round(viewport.min).toLocaleString()}–{Math.round(viewport.max).toLocaleString()} m
      </span>
      {#if laneDetail}
        <small>Lane spacing ×2</small>
      {/if}{#if cone}
        <small
          class="cone-label"
          title="Illustrative base view range from resources. Skill modifiers and exact visible identities are not returned by the simulator."
        >
          Base view {viewDistance} m
        </small>
      {/if}
    </div>
    {#if blockerIndex >= 0}
      {@const blocker = runners.find((r) => r.index === blockerIndex)}{#if blocker}
        <button
          class="map-blocker"
          onclick={() => (selected = String(blockerIndex))}
          title="Inspect the reported front blocker"
        >
          <Artwork
            src={portrait(blocker.cardId)}
            alt=""
            size="xs"
          />
          <span>
            <small>BLOCKING {selectedRunner?.name}</small>
            <strong>{blocker.name}</strong>
          </span>
        </button>
      {/if}
    {/if}
    {#if minimap && shape && view.following}
      <ReplayCourseMinimap
        {shape}
        {frame}
        {runners}
        {viewport}
        selected={Number(selected)}
        {visibility}
        {teamColor}
      />
    {/if}
    {#if points.length}
      <!-- Runner callouts provide keyboard selection; the background supports pan and zoom. -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <svg
        bind:this={view.element}
        class="course-map"
        style:--portrait-size={labelSize + 'px'}
        viewBox={'0 0 ' + view.width + ' ' + view.height}
        role="group"
        aria-label="Race course and runner positions"
        aria-describedby={helpId}
        onwheel={view.wheel}
        onpointerdown={view.beginDrag}
        onpointermove={view.moveDrag}
        onpointerup={view.endDrag}
        onpointercancel={view.endDrag}
        ondblclick={view.follow}
      >
        <defs>
          <clipPath id={helpId + '-track'}>
            <rect
              x="0"
              y="0"
              width={view.width}
              height={view.height}
            />
          </clipPath>
        </defs>
        <g clip-path={'url(#' + helpId + '-track)'}>
          <ReplayMapCourse
            camera={view.current}
            mapWidth={view.width}
            mapHeight={view.height}
            {course}
            {points}
            {roadPoints}
            {outerPoints}
            {displayRange}
            trackWidth={laneWidth * units * lateralScale}
            {slopes}
            {packPath}
            packWidth={occupiedWidth * units * lateralScale}
            {cone}
            {trail}
            trailColor={selectedRunner && visibility[selectedRunner.index] !== 2
              ? teamColor(selectedRunner)
              : undefined}
          />
          <ReplayMapLandmarks
            {view}
            {course}
            courseLength={shape?.distance ?? 0}
            {laneWidth}
            {pixelsPerMetre}
            {displayRange}
            {offsetAt}
            {visible}
            {clearLabel}
            {seekLimit}
            {onseekdistance}
          />
        </g>
        {#each blockLinks as link}
          <g
            class="block-connection"
            class:focused={link.horseIndex === Number(selected) ||
              link.blockerHorseIndex === Number(selected)}
            aria-label={(runners.find((r) => r.index === link.horseIndex)?.name ?? 'Runner') +
              ' blocked by ' +
              (runners.find((r) => r.index === link.blockerHorseIndex)?.name ?? 'runner')}
          >
            <path
              class="block-link"
              d={'M' + link.a.x + ' ' + link.a.y + ' L' + link.b.x + ' ' + link.b.y}
            />
            <circle
              cx={link.a.x}
              cy={link.a.y}
              r={dotRadius + 4}
            />
            <path
              class="block-stop"
              d={'M' +
                (link.b.x - link.nx * 10) +
                ' ' +
                (link.b.y - link.ny * 10) +
                ' L' +
                (link.b.x + link.nx * 10) +
                ' ' +
                (link.b.y + link.ny * 10)}
            />
          </g>
        {/each}
        <ReplayMapRunners
          {callouts}
          {places}
          {helpId}
          {labelSize}
          {overlayHeight}
          mapWidth={view.width}
          mapHeight={view.height}
          {blocking}
          {blockerIndex}
          {skillEvents}
          {runnerLabels}
          {timers}
          {visibility}
          {teamColor}
          {showSpeed}
          {showAcceleration}
          {acceleration}
          bind:selected
        />
      </svg>
    {:else}
      <p
        class="unavailable"
        role="status"
      >
        Select the race’s course to show its track map. <Button
          variant="secondary"
          size="sm"
          onclick={onselectcourse}
        >
          Select course
        </Button>
      </p>
    {/if}
  </div>
</section>

<style>
  @import './replay-course-map.css';
</style>
