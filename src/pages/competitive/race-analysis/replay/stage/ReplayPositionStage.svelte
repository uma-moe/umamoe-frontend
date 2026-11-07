<script lang="ts">
  import { runningStyleName } from '@/lib/race/replay/race-display';
  import { styleColors } from '@/pages/competitive/analysis-view';
  import {
    positionKeepZones,
    sectionBorders,
    slopeColor,
    type Course,
    type CourseShape
  } from '../replay-course';
  import { courseTerrain } from '../replay-timeline';
  import {
    courseLabelCandidates,
    courseRibbons,
    DISTANCE_STRIP,
    LABEL_ROW,
    phaseMarkers,
    placeCourseLabels,
    SECTION_RIBBON,
    SLOPE_RIBBON,
    stickyLabelX
  } from '../course-ribbons';
  import { gateStalls } from '../replay-gate';
  import type { ReplayState } from '../replay-state.svelte';
  import { stagePixel, type ReplayToggles } from '../replay-display';
  import type { RunnerCallout } from '../replay-callouts';
  import ReplayRunnerMarker, { crowdedRunners } from '../ReplayRunnerMarker.svelte';
  import ReplayBrandMark from '../ReplayBrandMark.svelte';
  import ReplayCourseMinimap from '../map/ReplayCourseMinimap.svelte';
  import ReplayStageGate from './ReplayStageGate.svelte';

  let {
    replay,
    course,
    toggles,
    callouts,
    shape,
    laneMax,
    laneTarget,
    positionViewport,
    finishFocus,
    visibility,
    fieldInset = 0,
    selected = $bindable('0')
  }: {
    replay: ReplayState;
    course?: Course;
    toggles: ReplayToggles;
    callouts: Map<number, RunnerCallout[]>;
    shape?: CourseShape;
    laneMax: number;
    laneTarget: number;
    positionViewport: { min: number; max: number };
    /** 0 to 1 as the camera turns to rest on the finish, centred on the whole stage. */
    finishFocus: number;
    visibility: Record<number, number>;
    /** Width covered by the race field overlay at the right edge, kept clear of runners. */
    fieldInset?: number;
    selected?: string;
  } = $props();

  // Above the outermost lane: the ribbons and course labels, then the keep zone labels.
  const KEEP_LABEL_TOP = LABEL_ROW + 14;
  const LANE_TOP = KEEP_LABEL_TOP + 3;
  const DISTANCE_ROW = 7;
  const START_LINE_INSET = 4;
  const BRAND_ABOVE_RAIL = 6;
  // Lane zero sits half a portrait above the rail, so runners on the rail stay clear of it.
  const RAIL_CLEARANCE = 22;
  const DISTANCE_STEPS = [5, 10, 25, 50, 100, 200, 500];
  const MIN_LABEL_SPACING = 110;
  const LANE_FRACTIONS = [0.25, 0.5, 0.75, 1];
  const PORTRAIT = 44;
  // Portraits are centred on the runner's distance, so the stall reaches half a portrait past
  // the start line to hold them.
  const GATE_DEPTH = PORTRAIT + 14;
  const GATE_FRONT = PORTRAIT / 2 + 6;

  let stageWidth = $state(1000),
    stageHeight = $state(400);

  const ribbons = $derived(
    courseRibbons(course, { sections: toggles.course, slopes: toggles.slopes })
  );
  const borders = $derived(sectionBorders(course));
  const terrain = $derived(course ? courseTerrain(course) : undefined);
  const raceDistance = $derived(replay.bounds.distanceMax);

  // The racing window ends left of the overlay, with the course continuing beneath it, and moves to
  // the stage centre for the finish.
  const display = $derived.by(() => {
    const clearFraction = Math.min(0.5, Math.max(0, fieldInset / Math.max(1, stageWidth)));
    const window = positionViewport.max - positionViewport.min,
      span = window / (1 - clearFraction);

    const min = positionViewport.min - ((span - window) / 2) * finishFocus;
    return { min, max: min + span };
  });

  // Rounded so float noise in the moving window does not rescale the course every frame.
  const viewMetres = $derived(Math.round((display.max - display.min) * 1000) / 1000);
  const pixelsPerMetre = $derived(stageWidth / Math.max(1, viewMetres));
  const railY = $derived(Math.max(LANE_TOP + RAIL_CLEARANCE + 40, stageHeight - DISTANCE_STRIP));
  const laneBottom = $derived(railY - RAIL_CLEARANCE);

  // The course is drawn once into a layer three stages wide that slides under the view, and is
  // redrawn only when the view leaves the layer's middle stage.
  const scroll = $derived(stagePixel(display.min * pixelsPerMetre, replay.playing));
  const layerLeft = $derived((Math.floor(scroll / stageWidth) - 1) * stageWidth);
  const layerWidth = $derived(stageWidth * 3);
  const layerRange = $derived({
    min: layerLeft / pixelsPerMetre,
    max: (layerLeft + layerWidth) / pixelsPerMetre
  });

  const layerX = (distance: number) => distance * pixelsPerMetre - layerLeft;
  const inLayer = (start: number, end = start) => end >= layerRange.min && start <= layerRange.max;
  const inView = (distance: number) => distance >= display.min && distance <= display.max;
  // Thin lines sit on half pixels so they render sharp instead of smeared across two.
  const crisp = (value: number) => Math.round(value) + 0.5;
  const laneY = (fraction: number) => laneBottom - fraction * (laneBottom - LANE_TOP);

  const distanceStep = $derived(
    DISTANCE_STEPS.find((step) => step * pixelsPerMetre >= MIN_LABEL_SPACING) ?? 1000
  );

  const stickyX = (start: number, end: number, text: string) =>
    stickyLabelX({
      left: start * pixelsPerMetre - scroll,
      right: end * pixelsPerMetre - scroll,
      text,
      width: stageWidth
    });

  const ticks = $derived.by(() => {
    const first = Math.floor(layerRange.min / distanceStep) * distanceStep;
    const list: number[] = [];
    for (let distance = first; distance <= layerRange.max; distance += distanceStep)
      list.push(distance);

    return list;
  });

  const distanceLabels = $derived(
    ticks.filter((distance) => distance >= 0 && distance <= raceDistance)
  );

  const poles = $derived.by(() => {
    const list: number[] = [];
    for (
      let distance = Math.ceil(layerRange.min / 100) * 100;
      distance <= layerRange.max;
      distance += 100
    )
      list.push(distance);

    return list;
  });

  const ribbon = $derived(
    ribbons.sections
      .filter((segment) => inLayer(segment.start, segment.end))
      .map((segment) => ({
        ...segment,
        x: layerX(segment.start),
        width: (segment.end - segment.start) * pixelsPerMetre
      }))
  );

  const slopeRibbon = $derived(
    ribbons.slopes
      .filter((run) => inLayer(run.start, run.end))
      .map((run) => ({
        ...run,
        x: layerX(run.start),
        width: (run.end - run.start) * pixelsPerMetre
      }))
  );

  const stickyNames = $derived([
    ...ribbons.sections.map((segment) => ({
      key: 'section-' + segment.start,
      kind: 'section',
      text: segment.label,
      x: stickyX(segment.start, segment.end, segment.label)
    })),
    ...ribbons.slopes.map((run) => ({
      key: 'slope-' + run.start,
      kind: 'slope',
      text: run.text,
      x: stickyX(run.start, run.end, run.text)
    }))
  ]);

  const phases = $derived(
    phaseMarkers(raceDistance, { course: toggles.course, positionKeep: toggles.positionKeep })
  );

  // Each section, phase and slope change gets a dotted line across the track where it starts.
  // Where several start together, the first one listed keeps the line.
  const startLines = $derived.by(() => {
    const lines = new Map<number, { distance: number; color?: string }>();
    const add = (distance: number, color?: string) => {
      const onCourse = distance > 0 && distance < raceDistance;
      if (onCourse && !lines.has(distance)) lines.set(distance, { distance, color });
    };

    if (toggles.course) for (const border of borders) add(border.distance, border.color);
    for (const marker of phases) add(marker.distance, marker.color);
    // Level ground takes the track ink, which reads on both themes' grass.
    for (const run of terrain && toggles.slopes ? terrain.slopes : [])
      add(run.start, run.slope === 0 ? undefined : slopeColor(run.slope));

    return [...lines.values()];
  });

  const shownStartLines = $derived(startLines.filter((line) => inLayer(line.distance)));

  // Labels are placed along the whole course, so each keeps its place as the layer moves.
  const courseLabels = $derived(
    placeCourseLabels(
      courseLabelCandidates({ course, raceDistance, phases, showCourse: toggles.course }),
      (distance) => distance * pixelsPerMetre
    )
  );

  const shownLabels = $derived(courseLabels.filter((label) => inLayer(label.distance)));

  const keepZones = $derived(
    toggles.positionKeep ? positionKeepZones(replay.leader, raceDistance) : []
  );

  const startLanes = $derived(
    replay.capture.frames[0]?.horses.map((horse) => horse.lanePosition) ?? []
  );

  const gateOpen = $derived((replay.frame?.time ?? 0) > (replay.capture.frames[0]?.time ?? 0));

  const gateStallsInLayer = $derived(
    inLayer(0) && startLanes.length
      ? gateStalls(
          startLanes.map((lane) => laneY(lane / laneMax)),
          PORTRAIT / 2
        )
      : []
  );

  const markers = $derived(
    replay.capture.runners.flatMap((runner) => {
      const horse = replay.frame?.horses[runner.index];
      if (!horse || visibility[runner.index] === 2) return [];
      if (!inView(horse.distance) || horse.lanePosition > laneMax) return [];

      return [
        {
          runner,
          x: horse.distance * pixelsPerMetre - scroll,
          y: laneY(horse.lanePosition / laneMax)
        }
      ];
    })
  );

  const crowded = $derived(
    crowdedRunners(
      markers.map((marker) => ({ index: marker.runner.index, x: marker.x, y: marker.y }))
    )
  );
</script>

<div class="positions-target fullscreen-target">
  <div
    class="race-stage"
    data-lane-max={laneMax}
    data-lane-target={laneTarget}
    aria-label="Runner positions by distance and lane"
  >
    <div
      class="track-plane"
      bind:clientWidth={stageWidth}
      bind:clientHeight={stageHeight}
    >
      <div
        class="course-layer"
        style:width={layerWidth + 'px'}
        style:transform={'translate3d(' + (layerLeft - scroll) + 'px, 0, 0)'}
      >
        <svg
          class="course-background"
          width={layerWidth}
          height={stageHeight}
          viewBox={'0 0 ' + layerWidth + ' ' + stageHeight}
          aria-hidden="true"
        >
          <rect
            class="infield"
            x="0"
            y={railY}
            width={layerWidth}
            height={stageHeight - railY}
          />
          {#each ticks as start}
            <rect
              class="mowing-stripe"
              x={layerX(start)}
              y="0"
              width={(distanceStep / 2) * pixelsPerMetre}
              height={railY}
            />
          {/each}
          {#each LANE_FRACTIONS as fraction}
            <line
              class="lane-guide"
              x1="0"
              x2={layerWidth}
              y1={crisp(laneY(fraction))}
              y2={crisp(laneY(fraction))}
            />
          {/each}
          {#each keepZones as zone}
            <rect
              class="keep-zone"
              x={layerX(zone.start)}
              y={SECTION_RIBBON + SLOPE_RIBBON}
              width={(zone.end - zone.start) * pixelsPerMetre}
              height={railY - SECTION_RIBBON - SLOPE_RIBBON}
              fill={styleColors[zone.style]}
            />
          {/each}
          {#each ribbon as band}
            <rect
              class="section-band"
              x={band.x}
              y="0"
              width={band.width}
              height={SECTION_RIBBON}
              fill={band.color}
            />
          {/each}
          {#each slopeRibbon as band}
            <rect
              class="slope-band"
              x={band.x}
              y={SECTION_RIBBON}
              width={band.width}
              height={SLOPE_RIBBON}
              fill={band.color}
            />
          {/each}
          {#each shownStartLines as line}
            <line
              class="start-line"
              x1={Math.round(layerX(line.distance))}
              x2={Math.round(layerX(line.distance))}
              y1={SECTION_RIBBON + SLOPE_RIBBON + START_LINE_INSET}
              y2={railY - START_LINE_INSET}
              style:stroke={line.color}
            />
          {/each}
          {#each [0, raceDistance] as distance}
            <line
              class="race-boundary"
              data-distance={distance}
              x1={layerX(distance)}
              x2={layerX(distance)}
              y1="0"
              y2={railY}
            />
          {/each}
          {#each ticks as distance}
            <line
              class="rail-post"
              x1={crisp(layerX(distance))}
              x2={crisp(layerX(distance))}
              y1={railY - 6}
              y2={railY}
            />
          {/each}
          {#each poles as distance}
            <line
              class="rail-pole"
              x1={layerX(distance)}
              x2={layerX(distance)}
              y1={railY - 14}
              y2={railY + 2}
            />
          {/each}
          <line
            class="inner-rail"
            x1="0"
            x2={layerWidth}
            y1={Math.round(railY) + 0.5}
            y2={Math.round(railY) + 0.5}
          />
          {#if gateStallsInLayer.length}
            <ReplayStageGate
              stalls={gateStallsInLayer}
              front={layerX(0) + GATE_FRONT}
              depth={GATE_DEPTH}
              open={gateOpen}
            />
          {/if}
        </svg>
        {#if inLayer(raceDistance)}
          <span
            class="finish-line"
            style:left={layerX(raceDistance) + 'px'}
            style:bottom={stageHeight - railY + 'px'}
            title="Finish"
          ></span>
        {/if}
        {#each shownLabels as label}
          <span
            class={'course-label ' + label.kind}
            style:left={layerX(label.distance) + 'px'}
            style:top={LABEL_ROW + 'px'}
            style:--label-color={label.color}
          >
            {label.text}
          </span>
        {/each}
        {#each keepZones as zone, row}
          <span
            class="keep-label"
            style:left={layerX(zone.start) + 'px'}
            style:top={KEEP_LABEL_TOP + row * 14 + 'px'}
            style:background={styleColors[zone.style]}
          >
            {runningStyleName(zone.style)}
          </span>
        {/each}
        <div
          class="distance-axis"
          style:top={railY + DISTANCE_ROW + 'px'}
        >
          {#each distanceLabels as distance}
            <span style:left={layerX(distance) + 'px'}>{distance} m</span>
          {/each}
        </div>
      </div>
      <div class="sticky-names">
        {#each stickyNames as name (name.key)}
          {#if name.x !== undefined}
            <span
              class={name.kind + '-name'}
              style:transform={'translateX(' + name.x + 'px)'}
            >
              {name.text}
            </span>
          {/if}
        {/each}
      </div>
      <div
        class="lane-axis"
        style:top={LANE_TOP + 'px'}
        style:bottom={stageHeight - laneBottom + 'px'}
        title="Lateral distance from the inside rail"
      >
        {#each LANE_FRACTIONS as fraction}
          <span style:bottom={fraction * 100 + '%'}>
            {replay.laneMetres(laneMax * fraction)} m
          </span>
        {/each}
      </div>
      <div class="marker-layer">
        {#each markers as marker (marker.runner.index)}
          <ReplayRunnerMarker
            {replay}
            runner={marker.runner}
            {toggles}
            callouts={callouts.get(marker.runner.index)}
            x={marker.x}
            y={marker.y}
            crowded={crowded.has(marker.runner.index)}
            dim={visibility[marker.runner.index] === 1}
            onselect={() => (selected = String(marker.runner.index))}
          />
        {/each}
      </div>
      <ReplayBrandMark bottom={stageHeight - railY + BRAND_ABOVE_RAIL} />
      {#if toggles.minimap && shape}
        <ReplayCourseMinimap
          {shape}
          frame={replay.frame}
          runners={replay.capture.runners}
          viewport={positionViewport}
          selected={replay.runner?.index ?? -1}
          {visibility}
          teamColor={replay.teamColor}
        />
      {/if}
    </div>
  </div>
</div>

<style>
  @import './replay-position-stage.css';
</style>
