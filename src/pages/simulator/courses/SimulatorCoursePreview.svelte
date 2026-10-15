<script lang="ts">
  import { onMount } from 'svelte';
  import {
    loadReplayGeometry,
    type CourseShape
  } from '@/pages/competitive/race-analysis/replay/replay-course';
  import { trackBasis, trackSection } from '@/pages/competitive/race-analysis/replay/replay-track';
  import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
  import { coursePreviewTrack } from './simulator-course-preview';

  let {
    course,
    compact = false,
    interactive = false,
    highlight
  }: {
    course?: CourseCatalogEntry;
    compact?: boolean;
    interactive?: boolean;
    highlight?: { start: number; end: number; color: string; label: string };
  } = $props();
  const uid = $props.id();

  let shapes = $state.raw<Record<string, CourseShape>>({}),
    unavailable = $state(false);

  onMount(() => {
    let active = true;
    void loadReplayGeometry()
      .then((value) => {
        if (active) shapes = value;
      })
      .catch(() => {
        if (active) unavailable = true;
      });
    return () => {
      active = false;
    };
  });

  const layout = $derived.by(() => {
    const shape = course && shapes[course.course_id];
    return shape ? coursePreviewTrack(shape, !compact) : { points: [], repeated: false };
  });
  const points = $derived(
    layout.points.filter((_, index) => index % 4 === 0 || index === layout.points.length - 1)
  );
  const finish = $derived(trackBasis(points, course?.distance ?? 0, course?.turn));
  const directions = $derived(
    [0.25, 0.6].map((progress) =>
      trackBasis(points, (course?.distance ?? 0) * progress, course?.turn)
    )
  );
  const viewBox = $derived.by(() => {
    const xs = points.map((point) => point.x),
      ys = points.map((point) => point.y);
    const left = Math.min(...xs),
      top = Math.min(...ys);
    return points.length
      ? [left - 32, top - 32, Math.max(...xs) - left + 64, Math.max(...ys) - top + 64].join(' ')
      : '0 0 1000 340';
  });
  const path = $derived(points.map((point) => point.x + ',' + point.y).join(' '));
  const lastThird = $derived(
    trackSection(points, ((course?.distance ?? 0) * 2) / 3, course?.distance ?? 0)
  );
  const highlighted = $derived(
    highlight ? trackSection(points, highlight.start, highlight.end) : ''
  );
  const boundaries = $derived(
    highlight
      ? [
          trackBasis(points, highlight.start, course?.turn),
          trackBasis(points, highlight.end, course?.turn)
        ]
      : []
  );
</script>

<figure
  class:compact
  class:dirt={course?.surface === 2}
  class:repeated={layout.repeated}
>
  {#if points.length}
    <svg
      {viewBox}
      role="img"
      aria-hidden={compact}
      aria-label={highlight
        ? highlight.label +
          ': ' +
          Math.round(highlight.start) +
          '–' +
          Math.round(highlight.end) +
          ' m highlighted on the selected course.'
        : 'Selected course outline. The final third is highlighted.'}
    >
      <defs>
        <pattern
          id={uid + '-finish'}
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
        >
          <rect
            width="8"
            height="8"
            fill="var(--text-primary)"
          />
          <path
            d="M0 0h4v4H0zM4 4h4v4H4z"
            fill="var(--surface-1)"
          />
        </pattern>
      </defs>
      <polyline
        points={path}
        class="track-edge"
      />
      <polyline
        points={path}
        class="track"
      />
      <polyline
        points={path}
        class="lane"
      />
      <polyline
        points={lastThird}
        class="final-third"
      />
      {#if highlight && highlighted}
        <g
          class="highlight"
          style:--highlight-color={highlight.color}
          data-start={highlight.start}
          data-end={highlight.end}
        >
          <polyline
            points={highlighted}
            class="highlight-halo"
          />
          <polyline
            points={highlighted}
            class="highlight-section"
          />
          {#each boundaries as point}
            <circle
              class="range-boundary"
              cx={point.x}
              cy={point.y}
              r="11"
            />
          {/each}
          <title>
            {highlight.label}: {Math.round(highlight.start)}–{Math.round(highlight.end)} m
          </title>
        </g>
      {/if}
      {#if !compact}
        {#each directions as point}
          <g
            class="travel-arrow"
            transform={'translate(' +
              point.x +
              ',' +
              point.y +
              ') rotate(' +
              (Math.atan2(point.ty, point.tx) * 180) / Math.PI +
              ')'}
          >
            <path d="M-9-8 2 0-9 8" />
            <title>Direction of travel</title>
          </g>
        {/each}
      {/if}
      <circle
        cx={points[0]!.x}
        cy={points[0]!.y}
        r="14"
        class="start"
      >
        <title>Start</title>
      </circle>
      <g
        class="finish-line"
        transform={'translate(' +
          finish.x +
          ',' +
          finish.y +
          ') rotate(' +
          (Math.atan2(finish.ty, finish.tx) * 180) / Math.PI +
          ')'}
      >
        <rect
          x="-4"
          y="-14"
          width="8"
          height="28"
          fill={'url(#' + uid + '-finish)'}
          stroke="var(--surface-1)"
          stroke-width="1"
          vector-effect="non-scaling-stroke"
        />
        <title>Finish line</title>
      </g>
      {#if interactive}
        <text
          class="map-label"
          x={points[0]!.x}
          y={points[0]!.y - 24}
        >
          Start
        </text>
        <text
          class="map-label"
          x={finish.x}
          y={finish.y + 32}
        >
          Finish
        </text>
      {/if}
    </svg>
    {#if !compact && !interactive}
      <figcaption>
        <span>
          <i class="start-key"></i>
          Start
        </span>
        <span>
          <i class="spurt-key"></i>
          Final third
        </span>
        <span>
          <i class="finish-key"></i>
          Finish
        </span>
        {#if layout.repeated}
          <span
            class="repeat-key"
            title="Repeated sections are drawn lower on later passes. Course distances are unchanged."
          >
            Later passes ↓
          </span>
        {/if}
      </figcaption>
    {/if}
  {:else}
    <div class="unavailable">
      {compact
        ? '…'
        : unavailable
          ? 'Track outline unavailable'
          : course
            ? 'Loading track outline…'
            : 'Select a course'}
    </div>
  {/if}
</figure>

<style>
  figure {
    --track-color: var(--accent-secondary);
    margin: 0;
    min-width: 0;
    padding: 12px 12px 10px;
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--accent-secondary) 6%, var(--surface-1));
    border: 1px solid color-mix(in srgb, var(--accent-secondary) 14%, transparent);
  }
  figure.dirt {
    --track-color: var(--accent-warning);
  }
  svg {
    width: 100%;
    height: 112px;
    display: block;
    overflow: visible;
  }
  polyline {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .track-edge {
    stroke: color-mix(in srgb, var(--track-color) 15%, var(--surface-1));
    stroke-width: 14;
  }
  .track {
    stroke: var(--track-color);
    stroke-opacity: 0.7;
    stroke-width: 8;
  }
  .lane {
    stroke: var(--surface-1);
    stroke-width: 1;
    stroke-dasharray: 2 3;
    stroke-opacity: 0.75;
  }
  .final-third {
    stroke: var(--accent-warning);
    stroke-width: 3;
  }
  .highlight-halo {
    stroke: var(--surface-1);
    stroke-width: 12;
    stroke-opacity: 0.85;
  }
  .highlight-section {
    stroke: var(--highlight-color);
    stroke-width: 7;
  }
  .range-boundary {
    fill: var(--surface-1);
    stroke: var(--highlight-color);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }
  .start {
    fill: var(--accent-secondary);
    stroke: var(--surface-1);
    stroke-width: 7;
  }
  figcaption {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 6px 14px;
    font-size: 10px;
    color: var(--text-secondary);
  }
  figcaption span {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .travel-arrow path {
    fill: none;
    stroke: var(--text-primary);
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .map-label {
    fill: var(--text-secondary);
    font-size: 22px;
    text-anchor: middle;
  }
  i {
    width: 10px;
    height: 3px;
    border-radius: 2px;
    display: inline-block;
  }
  .start-key {
    background: var(--accent-secondary);
  }
  .spurt-key {
    background: var(--accent-warning);
  }
  .finish-key {
    background: var(--text-secondary);
  }
  .unavailable {
    display: grid;
    place-items: center;
    min-height: 134px;
    font-size: 11px;
    color: var(--text-secondary);
  }
  figure.compact {
    width: 44px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    flex: none;
  }
  .compact svg {
    height: 28px;
  }
  .compact .track-edge {
    stroke-width: 4;
  }
  .compact .track {
    stroke-width: 2;
  }
  .compact .lane {
    display: none;
  }
  .compact .final-third {
    stroke-width: 1.5;
  }
  .compact .unavailable {
    min-height: 28px;
  }
  @media (max-width: 600px) {
    figure {
      padding: 6px 10px 8px;
    }
    svg {
      height: 116px;
    }
    .unavailable {
      min-height: 116px;
    }
  }
</style>
