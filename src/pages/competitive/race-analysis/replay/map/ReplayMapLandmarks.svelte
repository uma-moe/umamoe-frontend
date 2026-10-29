<svelte:options namespace="svg" />

<script lang="ts">
  import { courseLandmarks, type Course } from '../replay-course';
  import type { trackBasis } from '../replay-track';
  import type { CourseMapCamera } from './course-map-camera.svelte';
  import { separatedCaptions } from './course-map-labels';

  type Point = { x: number; y: number };

  let {
    view,
    course,
    courseLength,
    laneWidth,
    pixelsPerMetre,
    displayRange,
    offsetAt,
    visible,
    clearLabel,
    seekLimit,
    onseekdistance
  }: {
    view: CourseMapCamera;
    course?: Course;
    courseLength: number;
    laneWidth: number;
    pixelsPerMetre: number;
    displayRange: { min: number; max: number };
    offsetAt: (distance: number, lane: number) => ReturnType<typeof trackBasis>;
    visible: (point: Point) => boolean;
    clearLabel: (point: Point) => boolean;
    seekLimit: number;
    onseekdistance: (distance: number) => void;
  } = $props();

  const landmarks = $derived(courseLandmarks(course));
  const tickStep = $derived(
    [25, 50, 100, 200, 500, 1000].find((step) => step * pixelsPerMetre >= 80) ?? 1000
  );

  const distanceTicks = $derived(
    Array.from({ length: Math.floor(courseLength / tickStep) }, (_, i) => (i + 1) * tickStep)
      .map((distance) => {
        const p = offsetAt(distance, 0),
          a = view.project(p),
          b = view.project(offsetAt(distance, laneWidth));

        const normal = view.rotate(p.nx, p.ny);
        return { distance, a, b, label: { x: a.x - normal.x * 16, y: a.y - normal.y * 16 } };
      })
      .filter(
        (t) => visible(t.a) && t.distance >= displayRange.min && t.distance <= displayRange.max
      )
  );

  const courseMarks = $derived(
    landmarks
      .map((m) => {
        const p = offsetAt(m.distance, 0),
          a = view.project(p),
          b = view.project(offsetAt(m.distance, laneWidth));

        const normal = view.rotate(p.nx, p.ny);
        return { ...m, a, b, caption: { x: b.x + normal.x * 18, y: b.y + normal.y * 18 } };
      })
      .filter(
        (m) =>
          Math.max(m.a.x, m.b.x) >= 0 &&
          Math.min(m.a.x, m.b.x) <= view.width &&
          Math.max(m.a.y, m.b.y) >= 0 &&
          Math.min(m.a.y, m.b.y) <= view.height &&
          m.distance >= displayRange.min &&
          m.distance <= displayRange.max
      )
  );

  const landmarkCaptions = $derived(separatedCaptions(courseMarks, clearLabel));
</script>

{#each distanceTicks as tick}
  <g class="map-distance">
    <path d={'M' + tick.a.x + ' ' + tick.a.y + ' L' + tick.b.x + ' ' + tick.b.y} />
    {#if clearLabel(tick.label)}
      <text
        x={tick.label.x}
        y={tick.label.y}
        text-anchor="middle"
      >
        {tick.distance.toLocaleString()} m
      </text>
    {/if}
  </g>
{/each}
{#each courseMarks as item}
  <g
    class="map-landmark"
    role="button"
    tabindex={item.distance <= seekLimit ? 0 : -1}
    aria-disabled={item.distance > seekLimit}
    aria-label={'Jump to ' + item.label + ' at ' + Math.round(item.distance) + ' metres'}
    style:--landmark-color={item.color}
    onclick={() => {
      if (item.distance <= seekLimit) onseekdistance(item.distance);
    }}
    onkeydown={(event) => {
      if ((event.key === 'Enter' || event.key === ' ') && item.distance <= seekLimit) {
        event.preventDefault();
        onseekdistance(item.distance);
      }
    }}
  >
    <title>{item.label} · {Math.round(item.distance).toLocaleString()} m</title>
    <path
      class="landmark-hit"
      d={'M' + item.a.x + ' ' + item.a.y + ' L' + item.b.x + ' ' + item.b.y}
    />
    {#if item.label === 'Finish'}
      {@const length = Math.hypot(item.b.x - item.a.x, item.b.y - item.a.y)}
      {@const rows = Math.max(2, Math.round(length / 6))}
      {@const square = length / rows}
      <g
        class="map-finish"
        aria-hidden="true"
        transform={'translate(' +
          item.a.x +
          ' ' +
          item.a.y +
          ') rotate(' +
          ((Math.atan2(item.b.y - item.a.y, item.b.x - item.a.x) * 180) / Math.PI - 90) +
          ')'}
      >
        {#each Array(rows) as _, row}
          {#each [0, 1] as column}
            <rect
              x={(column - 1) * square}
              y={row * square}
              width={square}
              height={square}
              fill={(row + column) % 2 ? '#151515' : '#f5f5f5'}
            />
          {/each}
        {/each}
      </g>
    {:else}
      <path d={'M' + item.a.x + ' ' + item.a.y + ' L' + item.b.x + ' ' + item.b.y} />
    {/if}
    {#if landmarkCaptions.has(item)}
      <text
        x={item.caption.x}
        y={item.caption.y}
        text-anchor="middle"
      >
        {item.label}
      </text>
    {/if}
  </g>
{/each}

<style>
  .map-distance path {
    stroke: var(--text-secondary);
    stroke-width: 0.7;
    opacity: 0.5;
  }
  .map-distance text,
  .map-landmark text {
    font-size: 9px;
    fill: var(--text-secondary);
    paint-order: stroke;
    stroke: var(--surface-1);
    stroke-width: 4px;
    stroke-linejoin: round;
    pointer-events: none;
  }
  .map-landmark {
    cursor: pointer;
    outline: none;
  }
  .map-landmark > path {
    stroke: var(--landmark-color);
    stroke-width: 1.5;
  }
  .map-landmark > .landmark-hit {
    stroke: transparent;
    stroke-width: 20;
    pointer-events: stroke;
  }
  .map-landmark text {
    fill: var(--landmark-color);
    font-weight: 600;
  }
  .map-landmark:hover > path,
  .map-landmark:focus-visible > path {
    stroke-width: 3;
  }
  .map-landmark:hover > .landmark-hit,
  .map-landmark:focus-visible > .landmark-hit {
    stroke-width: 20;
    stroke: var(--color-accent-soft);
  }
  .map-landmark[aria-disabled='true'] {
    cursor: default;
  }
</style>
