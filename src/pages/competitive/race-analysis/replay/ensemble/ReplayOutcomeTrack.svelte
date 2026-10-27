<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '@/components/controls/Button.svelte';
  import { portrait } from '@/pages/competitive/analysis-view';
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import type { raceDistanceSpread } from '@/lib/race/replay/race-ensemble';
  import {
    loadReplayGeometry,
    courseSegments,
    type Course,
    type CourseShape
  } from '../replay-course';
  import { replayTrack, trackPointAtDistance, trackSection, fitTrackCamera } from '../replay-track';
  import { finalSpurtSection, FINAL_SPURT_HELP } from '@/lib/race/final-spurt';

  let {
    uid,
    spread,
    low,
    high,
    course,
    courseId,
    distance,
    runner
  }: {
    uid: string;
    spread: ReturnType<typeof raceDistanceSpread>;
    low: number;
    high: number;
    course?: Course;
    courseId: number;
    distance: number;
    runner: RaceRunner;
  } = $props();

  let shapes = $state.raw<Record<string, CourseShape>>(),
    error = $state(''),
    whole = $state(false);

  onMount(() => {
    let active = true;
    void loadReplayGeometry()
      .then((data) => {
        if (active) shapes = data;
      })
      .catch((reason) => {
        if (active)
          error = reason instanceof Error ? reason.message : 'Course geometry unavailable.';
      });

    return () => {
      active = false;
    };
  });

  const points = $derived(shapes?.[courseId] ? replayTrack(shapes[courseId]!) : []);
  const camera = $derived(
    fitTrackCamera(
      whole
        ? points
        : [
            trackPointAtDistance(points, low),
            ...points.filter((p) => p.distance > low && p.distance < high),
            trackPointAtDistance(points, high)
          ],
      520,
      230,
      0
    )
  );

  const project = (point: { x: number; y: number }) => ({
    x: (point.x - camera.x) * camera.scale + 260,
    y: (point.y - camera.y) * camera.scale + 115
  });

  const meanPoint = $derived(project(trackPointAtDistance(points, spread.mean)));
  const startPoint = $derived(project(trackPointAtDistance(points, 0))),
    finishPoint = $derived(project(trackPointAtDistance(points, distance)));

  const sections = $derived(courseSegments(course));
  const spurt = $derived(finalSpurtSection(distance));
  const spurtPoint = $derived(project(trackPointAtDistance(points, spurt.start)));
</script>

<div class="track">
  <div class="view-heading">
    <h3>Track ribbon</h3>
    <Button
      size="sm"
      variant="secondary"
      onclick={() => (whole = !whole)}
    >
      {whole ? 'Follow spread' : 'Show whole track'}
    </Button>
  </div>
  {#if points.length}
    <svg
      class="track-map"
      viewBox="0 0 520 230"
      role="img"
      aria-label={runner.name +
        ' mean position ' +
        spread.mean.toFixed(1) +
        ' metres with middle 50% and 80% of sampled positions'}
    >
      <defs>
        <clipPath id={uid + '-portrait'}>
          <circle
            cx={meanPoint.x}
            cy={meanPoint.y - 30}
            r="14"
          />
        </clipPath>
      </defs>
      <g
        transform={'translate(260 115) scale(' +
          camera.scale +
          ') translate(' +
          -camera.x +
          ' ' +
          -camera.y +
          ')'}
      >
        <polyline
          class="track-base"
          points={trackSection(points, 0, distance)}
        />
        {#each sections as section}
          <polyline
            class="track-section"
            points={trackSection(points, section.start, section.end)}
            style:stroke={section.color}
          />
        {/each}
        <polyline
          class="track-rail"
          points={trackSection(points, 0, distance)}
        />
        <polyline
          class="spurt-window"
          points={trackSection(points, spurt.start, distance)}
        >
          <title>{FINAL_SPURT_HELP}</title>
        </polyline>
        <polyline
          class="ribbon outer"
          points={trackSection(points, spread.p10, spread.p90)}
        />
        <polyline
          class="ribbon inner"
          points={trackSection(points, spread.p25, spread.p75)}
        />
      </g>
      <circle
        cx={spurtPoint.x}
        cy={spurtPoint.y}
        r="4"
        fill={spurt.color}
      >
        <title>Final spurt window from {Math.round(spurt.start)} m. {FINAL_SPURT_HELP}</title>
      </circle>
      <circle
        cx={startPoint.x}
        cy={startPoint.y}
        r="4"
        class="start"
      />
      <text
        x={startPoint.x}
        y={startPoint.y + 21}
        text-anchor="middle"
        class="boundary"
      >
        Start
      </text>
      <path
        d={'M' + finishPoint.x + ',' + (finishPoint.y - 12) + 'v24'}
        class="finish"
      />
      <text
        x={finishPoint.x}
        y={finishPoint.y + 25}
        text-anchor="middle"
        class="boundary"
      >
        Finish
      </text>
      <path
        d={'M' + meanPoint.x + ',' + (meanPoint.y - 16) + 'v16'}
        class="mean-link"
      />
      <circle
        cx={meanPoint.x}
        cy={meanPoint.y}
        r="5"
        class="mean-dot"
      />
      <circle
        cx={meanPoint.x}
        cy={meanPoint.y - 30}
        r="15"
        class="portrait-ring"
      />
      <image
        href={portrait(runner.cardId)}
        x={meanPoint.x - 14}
        y={meanPoint.y - 44}
        width="28"
        height="28"
        clip-path={'url(#' + uid + '-portrait)'}
        preserveAspectRatio="xMidYMid slice"
      />
    </svg>
  {:else}
    <p
      class="map-status"
      role="status"
    >
      {error ||
        (shapes
          ? 'No track outline for this course. The distance profile remains available.'
          : 'Loading course geometry…')}
    </p>
  {/if}
  <div class="map-caption">
    <span>
      {whole ? 'Whole course' : 'Following ' + Math.round(low) + '–' + Math.round(high) + ' m'}
    </span>
    <span>Final spurt from {Math.round(spurt.start)} m · Mean marker</span>
  </div>
</div>

<style>
  @import './replay-outcome-track.css';
</style>
