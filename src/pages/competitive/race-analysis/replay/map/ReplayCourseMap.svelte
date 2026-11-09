<script lang="ts">
  import { onDestroy, untrack, type Snippet } from 'svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { raceFrameAtTime, replayLaneMetres } from '@/lib/race/replay/race-replay';
  import { runningStyleName } from '@/lib/race/replay/race-display';
  import Button from '@/components/controls/Button.svelte';
  import { styleColors } from '@/pages/competitive/analysis-view';
  import {
    positionKeepZones,
    trackStatusAt,
    type Course,
    type CourseShape
  } from '../replay-course';
  import {
    replayTrack,
    withRunIn,
    withRunOut,
    fitTrackCamera,
    trackBasis,
    trackSectionPoints,
    trackUnitsPerMetre
  } from '../replay-track';
  import type { ReplayState } from '../replay-state.svelte';
  import type { ReplayToggles } from '../replay-display';
  import type { RunnerCallout } from '../replay-callouts';
  import { finishFocus } from '../replay-finish-camera';
  import ReplayRunnerMarker from '../ReplayRunnerMarker.svelte';
  import { crowdedRunners } from '../runner-crowding';
  import ReplayBrandMark, { BRAND_INSET } from '../ReplayBrandMark.svelte';
  import { CourseMapCamera } from './course-map-camera.svelte';
  import { screenPoints } from './screen-projection';
  import ReplayMapCamera from './ReplayMapCamera.svelte';
  import ReplayMapCourse from './ReplayMapCourse.svelte';
  import ReplayMapLandmarks from './ReplayMapLandmarks.svelte';
  import ReplayCourseMinimap from './ReplayCourseMinimap.svelte';
  import ReplayTrackStatus from './ReplayTrackStatus.svelte';
  import ReplayMapRibbons from './ReplayMapRibbons.svelte';
  import { MAP_LABELS_INSIDE, MAP_RIBBONS_OUTSIDE } from '../course-ribbons';

  let {
    replay,
    toggles,
    callouts,
    course,
    shape,
    viewDistance,
    viewport,
    cameraWindow,
    laneMax,
    visibility,
    fieldInset = 0,
    doubledLanes = true,
    selected = $bindable('0'),
    onseekdistance,
    onselectcourse,
    overlay
  }: {
    replay: ReplayState;
    toggles: ReplayToggles;
    callouts: Map<number, RunnerCallout[]>;
    course?: Course;
    shape?: CourseShape;
    /** The base view distance from resources, drawn as a cone when enabled. */
    viewDistance?: number;
    /** The race window, shared with race positions. */
    viewport: { min: number; max: number };
    /** The follow camera shared with race positions, for a stretch of course of a given length. */
    cameraWindow: (length: number) => { min: number; max: number };
    /** The lane range shown, in capture lane units, shared with race positions. */
    laneMax: number;
    visibility: Record<number, number>;
    /** Width covered by the race field overlay at the right edge, kept clear of runners. */
    fieldInset?: number;
    /** Spreads lanes to twice their width so a packed field stays readable. */
    doubledLanes?: boolean;
    selected?: string;
    onseekdistance: (distance: number) => void;
    onselectcourse: () => void;
    /** Drawn over the stage and left out of clips, such as the clip's crop window. */
    overlay?: Snippet;
  } = $props();

  const BLOCK_STOP_OFFSET = 26;
  const BLOCK_STOP_HALF_WIDTH = 10;
  // Lanes are metres from the inner rail, where the frame begins.
  const FRAMED_OUTER_MARGIN = 1.5;
  const RAIL_CLEARANCE_PIXELS = 22;
  // Narrower maps frame a shorter stretch of the race window, so portraits keep room on the track.
  const FULL_WINDOW_PIXELS = 720;
  const KEEP_LABEL_ROW = 13;
  // Labels are drawn above their baseline point, so they fit closer to the bottom edge.
  const LABEL_EDGE = 24;
  const LABEL_BOTTOM_EDGE = 4;
  const LABEL_HALF_WIDTH = 36;
  const LABEL_ASCENT = 9;
  const LABEL_DESCENT = 3;
  // The camera controls' column in the top-left corner (ReplayMapCamera).
  const CAMERA_CONTROLS = { right: 40, bottom: 112 };

  let brandWidth = $state(0),
    brandHeight = $state(0);

  const view: CourseMapCamera = new CourseMapCamera({
    framing: () => framingPoints,
    inset: () => fieldInset,
    centreShift: () => (fieldInset / 2) * finishProgress,
    infieldEdge: () => infieldEdge
  });

  const helpId = $props.id();

  const frame = $derived(replay.frame);
  const frames = $derived(replay.capture.frames);
  const runners = $derived(replay.capture.runners);
  const laneWidth = $derived(replay.laneWidth);
  const lateralScale = $derived(doubledLanes ? 2 : 1);

  const RUN_OUT_METRES = 80;
  // The camera centres the start like race positions, so track continues behind the gate.
  const RUN_IN_METRES = 80;

  const points = $derived(
    shape ? withRunIn(withRunOut(replayTrack(shape), RUN_OUT_METRES), RUN_IN_METRES) : []
  );
  const units = $derived(trackUnitsPerMetre(points));

  const offsetAt = (distance: number, lane: number) => {
    const p = trackBasis(points, distance, course?.turn);
    return {
      ...p,
      x: p.x + p.nx * lane * units * lateralScale,
      y: p.y + p.ny * lane * units * lateralScale
    };
  };

  const pixelsPerMetre = $derived(Math.max(0.01, units * view.current.scale));

  // Lane zero sits half a portrait off the inner rail, as in race positions. Lanes beyond it are
  // compressed so the outermost lane still meets the outer rail.
  const railClearance = $derived(
    Math.min(laneWidth / 2, RAIL_CLEARANCE_PIXELS / (pixelsPerMetre * lateralScale))
  );

  const runnerLane = (lanePosition: number) =>
    railClearance + replayLaneMetres(lanePosition, laneWidth) * (1 - railClearance / laneWidth);

  const lanePoint = (horse: { distance: number; lanePosition: number }) =>
    offsetAt(horse.distance, runnerLane(horse.lanePosition));

  const roadPoints = $derived(points.map((p) => offsetAt(p.distance, laneWidth / 2)));
  const outerPoints = $derived(points.map((p) => offsetAt(p.distance, laneWidth)));
  const startLanes = $derived(
    frames[0]?.horses.map((horse) => runnerLane(horse.lanePosition)) ?? []
  );

  const seekLimit = $derived(Math.max(0, ...(frames.at(-1)?.horses.map((h) => h.distance) ?? [])));
  const selectedRunner = $derived(runners.find((r) => r.index === Number(selected)));
  const markers = $derived(
    runners.flatMap((runner) => {
      const horse = frame?.horses[runner.index];
      if (!horse || visibility[runner.index] === 2) return [];

      return [{ runner, horse, point: lanePoint(horse) }];
    })
  );

  const cone = $derived.by(() => {
    const horse = frame?.horses[Number(selected)];
    if (!toggles.cone || !horse || !viewDistance || !points.length) return '';

    const lane = runnerLane(horse.lanePosition);
    // ponytail: illustrative base cone; exact skill-adjusted visibility needs engine telemetry.
    const side = (sign: number) =>
      Array.from({ length: 13 }, (_, i) =>
        offsetAt(
          horse.distance + (viewDistance * i) / 12,
          Math.max(0, Math.min(laneWidth, lane + sign * (0.6 + (laneWidth * 0.32 * i) / 12)))
        )
      );

    return screenPoints(view.matrix, [...side(-1), ...side(1).reverse()]);
  });

  const blockLinks = $derived(
    !toggles.blocked
      ? []
      : replay.blockingNow.flatMap((pair) => {
          const horse = frame?.horses[pair.horseIndex],
            other = frame?.horses[pair.blockerHorseIndex];

          if (!horse || !other) return [];
          if (visibility[pair.horseIndex] === 2 || visibility[pair.blockerHorseIndex] === 2)
            return [];

          const a = view.project(lanePoint(horse)),
            b = view.project(lanePoint(other));

          // The stop bar sits at the blocker's portrait edge, facing the blocked runner.
          const length = Math.hypot(a.x - b.x, a.y - b.y) || 1,
            ux = (a.x - b.x) / length,
            uy = (a.y - b.y) / length;

          const stop = { x: b.x + ux * BLOCK_STOP_OFFSET, y: b.y + uy * BLOCK_STOP_OFFSET };
          return [
            {
              ...pair,
              a,
              b,
              stop: {
                x1: stop.x - uy * BLOCK_STOP_HALF_WIDTH,
                y1: stop.y + ux * BLOCK_STOP_HALF_WIDTH,
                x2: stop.x + uy * BLOCK_STOP_HALF_WIDTH,
                y2: stop.y - ux * BLOCK_STOP_HALF_WIDTH
              }
            }
          ];
        })
  );

  const trail = $derived(
    screenPoints(
      view.matrix,
      [
        ...frames.slice(
          raceFrameAtTime(frames, (frame?.time ?? 0) - 3)?.sourceIndex ?? 0,
          (frame?.sourceIndex ?? 0) + 1
        ),
        ...(frame ? [frame] : [])
      ].flatMap((f) => {
        const horse = f.horses[Number(selected)];
        return horse ? [lanePoint(horse)] : [];
      })
    )
  );

  // The follow camera frames the race positions window across the shared lane range, so both views
  // show the same stretch of course and lanes.
  const framedOuterLane = $derived(replayLaneMetres(laneMax, laneWidth) + FRAMED_OUTER_MARGIN);
  const framedLength = $derived(
    (viewport.max - viewport.min) * Math.min(1, view.frameWidth / FULL_WINDOW_PIXELS)
  );

  const framed = $derived(cameraWindow(framedLength));
  const framedCentre = $derived((framed.min + framed.max) / 2);

  // The finish comes to rest at the centre of the whole map, including under the race field.
  const finishProgress = $derived(
    finishFocus(replay.leader, replay.bounds.distanceMax, framedLength)
  );

  const followPoints = $derived(points.map((p) => offsetAt(p.distance, framedOuterLane / 2)));
  const heading = $derived.by(() => {
    const tangent = trackBasis(points, framedCentre, course?.turn);
    const angle = -Math.atan2(tangent.ty, tangent.tx),
      previous = untrack(() => view.motion.target.angle);

    return previous + Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous));
  });

  const framingPoints = $derived(
    [
      framed.min,
      ...points
        .filter((p) => p.distance > framed.min && p.distance < framed.max)
        .map((p) => p.distance),
      framed.max
    ].flatMap((distance) => [offsetAt(distance, 0), offsetAt(distance, framedOuterLane)])
  );

  // The heading turns the course to run left to right, so the outward normal points up or down.
  const infieldEdge = $derived.by(() => {
    const basis = trackBasis(points, framedCentre, course?.turn);
    return view.rotate(basis.nx, basis.ny, heading).y < 0 ? 'bottom' : 'top';
  });

  const fitFramed = (aim: { x: number; y: number }) =>
    fitTrackCamera(framingPoints, view.frameWidth, view.frameHeight, 0, {
      x: aim.x,
      y: aim.y,
      scale: 32,
      angle: heading
    });

  // Aiming a frame's height outside the inner rail lets the fit settle with the rail at the
  // infield edge, so spare height goes to the outer lanes rather than the empty infield.
  const framedAim = $derived.by(() => {
    const { scale } = fitFramed(offsetAt(framedCentre, 0));
    const pixelsPerLane = scale * units * lateralScale;
    const outwardLanes = pixelsPerLane > 0 ? view.frameHeight / pixelsPerLane : 0;

    return offsetAt(framedCentre, outwardLanes);
  });

  const framedCamera = $derived.by(() => {
    const fitted = fitFramed(framedAim);
    return { ...fitted, scale: fitted.scale * view.followZoom };
  });

  const target = $derived(
    view.following
      ? framedCamera
      : (view.manual ??
          fitTrackCamera([...points, ...outerPoints], view.frameWidth, view.frameHeight, 0))
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

    // A clip steps the race faster or slower than real time, which a spring would lag behind.
    const instant =
      prefersReducedMotion.current || replay.recording || !view.following || jumped || seeking;

    void view.motion.set(target, { instant }).catch(() => {});
  });

  onDestroy(() => {
    void view.motion.set(view.motion.current, { instant: true });
  });

  const drawnStart = $derived(points[0]?.distance ?? 0);
  const drawnLength = $derived(points.at(-1)?.distance ?? 0);
  const displayRange = $derived(
    view.following
      ? {
          min: Math.max(
            drawnStart,
            viewport.min - Math.max(view.width, view.height) / pixelsPerMetre / 2
          ),
          max: Math.min(
            drawnLength,
            viewport.max + Math.max(view.width, view.height) / pixelsPerMetre
          )
        }
      : { min: drawnStart, max: drawnLength }
  );

  const keepZones = $derived(
    toggles.positionKeep ? positionKeepZones(replay.paceReference, replay.bounds.distanceMax) : []
  );

  const screenMarkers = $derived(
    markers
      .map((marker) => ({ ...marker, anchor: view.project(marker.point) }))
      .filter(
        (m) =>
          m.anchor.x >= -20 &&
          m.anchor.x <= view.width + 20 &&
          m.anchor.y >= -20 &&
          m.anchor.y <= view.height + 20
      )
  );

  const crowded = $derived(
    crowdedRunners(
      screenMarkers.map((m) => ({ index: m.runner.index, x: m.anchor.x, y: m.anchor.y }))
    )
  );

  const visible = (p: { x: number; y: number }, margin = 20) =>
    p.x >= margin && p.x <= view.width - margin && p.y >= margin && p.y <= view.height - margin;

  const inLabelArea = (p: { x: number; y: number }) => {
    if (p.x < LABEL_EDGE || p.x > view.width - LABEL_EDGE) return false;
    if (p.y < LABEL_EDGE || p.y > view.height - LABEL_BOTTOM_EDGE) return false;

    const belowCamera = p.y - LABEL_ASCENT > CAMERA_CONTROLS.bottom;
    if (p.x <= CAMERA_CONTROLS.right + LABEL_HALF_WIDTH && !belowCamera) return false;

    const besideBrand = p.y + LABEL_DESCENT < brandBox.top || p.y - LABEL_ASCENT > brandBox.bottom;
    return p.x > brandBox.right + LABEL_HALF_WIDTH || besideBrand;
  };

  const clearLabel = (p: { x: number; y: number }) =>
    inLabelArea(p) &&
    screenMarkers.every((m) => Math.hypot(m.anchor.x - p.x, m.anchor.y - p.y) > 32);

  const lateralPixelsPerMetre = $derived(pixelsPerMetre * lateralScale);

  const keepLabels = $derived.by(() =>
    keepZones.flatMap((zone, row) => {
      if (zone.end <= 0) return [];

      // Rows step inwards from the framed outer lanes so neighbouring zones keep their labels.
      const lane = framedOuterLane - (6 + row * KEEP_LABEL_ROW) / lateralPixelsPerMetre;
      const anchor = view.project(offsetAt(Math.max(0, zone.start), lane));
      if (!visible(anchor, 8)) return [];

      return [{ ...anchor, style: zone.style }];
    })
  );

  // While following, the section ribbon runs just outside the outer rail, and the slope ribbon and
  // course labels just inside it.
  const ribbonsShown = $derived(view.following && (toggles.course || toggles.slopes));

  // The field overlay keeps a column at the right clear of runners. Without it, the minimap moves to
  // the outer side of the track, where the frame leaves its spare height.
  const minimapTop = $derived(fieldInset > 0 || !view.infieldBelow ? undefined : 8);

  const brandBox = $derived({
    right: BRAND_INSET.left + brandWidth,
    top: view.height - BRAND_INSET.bottom - brandHeight,
    bottom: view.height - BRAND_INSET.bottom
  });

  // The labels inside the rail stay clear of the framed outer lanes, so they never cover runners.
  const innermostRibbonShift = $derived(
    (framedOuterLane - laneWidth) * lateralPixelsPerMetre + MAP_LABELS_INSIDE
  );

  const railOnMap = (distance: number) => {
    const rail = offsetAt(distance, laneWidth);
    return { at: view.project(rail), outward: view.rotate(rail.nx, rail.ny) };
  };

  // The ribbons stay on the outer rail and curve off the map with it. Only when the rail lies beyond
  // the map edge all along the frame do they move in, together, until the section ribbon shows.
  const ribbonShift = $derived.by(() => {
    let closest = -Infinity;
    for (const point of trackSectionPoints(points, displayRange.min, displayRange.max)) {
      const { at, outward } = railOnMap(point.distance);
      if (at.x < 0 || at.x > view.frameWidth) continue;

      const room = outward.y < 0 ? at.y / -outward.y : (view.height - at.y) / outward.y;
      closest = Math.max(closest, room - MAP_RIBBONS_OUTSIDE);
    }

    if (closest === -Infinity) return 0;

    return Math.max(innermostRibbonShift, Math.min(0, closest));
  });

  // A point the given pixels outside the outer rail, or inside it when negative.
  const ribbonAt = (offset: number, distance: number) => {
    const { at, outward } = railOnMap(distance),
      reach = ribbonShift + offset;

    return { x: at.x + outward.x * reach, y: at.y + outward.y * reach };
  };

  const ribbonLine = (offset: number, start: number, end: number) => {
    const from = Math.max(start, displayRange.min),
      to = Math.min(end, displayRange.max);

    if (from >= to) return [];

    return trackSectionPoints(points, from, to).map((point) => ({
      ...ribbonAt(offset, point.distance),
      distance: point.distance
    }));
  };

  const packPath = $derived(
    view.following
      ? ''
      : screenPoints(view.matrix, trackSectionPoints(followPoints, viewport.min, viewport.max))
  );
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
  <div
    class="map-scene fullscreen-target"
    data-clip-layer="stage"
    bind:clientWidth={view.width}
    bind:clientHeight={view.height}
    onwheel={view.wheel}
  >
    {#if points.length}
      <!-- Runner markers provide keyboard selection; the background supports pan and zoom. -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <svg
        bind:this={view.element}
        class="course-map"
        viewBox={'0 0 ' + view.width + ' ' + view.height}
        role="group"
        aria-label="Race course and runner positions"
        aria-describedby={helpId}
        onpointerdown={view.beginDrag}
        onpointermove={view.moveDrag}
        onpointerup={view.endDrag}
        onpointercancel={view.endDrag}
        ondblclick={view.follow}
      >
        <g>
          <ReplayMapCourse
            matrix={view.matrix}
            {course}
            courseDistance={shape?.distance ?? 0}
            {points}
            {roadPoints}
            {outerPoints}
            {offsetAt}
            {laneWidth}
            unitsPerMetre={units}
            {pixelsPerMetre}
            {displayRange}
            trackWidth={laneWidth * lateralScale * pixelsPerMetre}
            {startLanes}
            gateOpen={(frame?.time ?? 0) > (frames[0]?.time ?? 0)}
            showSpurt={toggles.course && !ribbonsShown}
            showSections={toggles.course && !view.following}
            showSlopes={toggles.slopes && !view.following}
            {keepZones}
            {packPath}
            packWidth={framedOuterLane * lateralScale * pixelsPerMetre}
            {cone}
            {trail}
            trailColor={selectedRunner && visibility[selectedRunner.index] !== 2
              ? replay.teamColor(selectedRunner)
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
            showCourse={toggles.course}
            showSlopes={toggles.slopes}
            captions={!view.following}
            {onseekdistance}
          />
          {#if ribbonsShown}
            <ReplayMapRibbons
              {course}
              raceDistance={replay.bounds.distanceMax}
              width={view.width}
              height={view.height}
              showCourse={toggles.course}
              showSlopes={toggles.slopes}
              showPositionKeep={toggles.positionKeep}
              {ribbonLine}
              {ribbonAt}
              brand={brandBox}
            />
          {/if}
        </g>
        {#each blockLinks as link}
          <g
            class="block-connection"
            class:focused={link.horseIndex === Number(selected) ||
              link.blockerHorseIndex === Number(selected)}
          >
            <path
              class="block-link"
              d={'M' + link.a.x + ' ' + link.a.y + ' L' + link.b.x + ' ' + link.b.y}
            />
            <line
              class="block-stop"
              x1={link.stop.x1}
              y1={link.stop.y1}
              x2={link.stop.x2}
              y2={link.stop.y2}
            />
          </g>
        {/each}
      </svg>
      {#each keepLabels as label}
        <span
          class="keep-label"
          style:left={label.x + 'px'}
          style:top={label.y + 'px'}
          style:background={styleColors[label.style]}
        >
          {runningStyleName(label.style)}
        </span>
      {/each}
      <div class="map-markers">
        {#each screenMarkers as marker (marker.runner.index)}
          <ReplayRunnerMarker
            {replay}
            runner={marker.runner}
            {toggles}
            callouts={callouts.get(marker.runner.index)}
            x={marker.anchor.x}
            y={marker.anchor.y}
            crowded={crowded.has(marker.runner.index)}
            dim={visibility[marker.runner.index] === 1}
            onselect={() => (selected = String(marker.runner.index))}
          />
        {/each}
      </div>
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
    {#if points.length && !view.following && (toggles.course || toggles.slopes)}
      <ReplayTrackStatus
        status={trackStatusAt(course, replay.bounds.distanceMax, replay.leader)}
        showCourse={toggles.course}
        showSlopes={toggles.slopes}
      />
    {/if}
    <ReplayBrandMark
      bind:width={brandWidth}
      bind:height={brandHeight}
    />
    {#if toggles.minimap && shape && view.following}
      <ReplayCourseMinimap
        {shape}
        {frame}
        {runners}
        {viewport}
        selected={Number(selected)}
        {visibility}
        teamColor={replay.teamColor}
        top={minimapTop}
      />
    {/if}
    {#if points.length}
      <ReplayMapCamera
        following={view.following}
        zoomOutDisabled={view.zoomOutDisabled}
        zoomInDisabled={view.zoomInDisabled}
        onfollow={view.follow}
        onfullcourse={view.release}
        onzoom={(factor) => view.zoom(factor)}
      />
    {/if}
    {@render overlay?.()}
  </div>
</section>

<style>
  @import './replay-course-map.css';
</style>
