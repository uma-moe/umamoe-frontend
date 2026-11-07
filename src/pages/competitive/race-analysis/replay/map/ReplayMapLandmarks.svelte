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
    showCourse,
    showSlopes,
    captions,
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
    showCourse: boolean;
    showSlopes: boolean;
    /** Names each landmark in the infield; the follow view names them along its top edge. */
    captions: boolean;
    onseekdistance: (distance: number) => void;
  } = $props();

  // Captions sit beyond the slope and course-section strips that run beside both rails.
  const CAPTION_CLEARANCE_METRES = 0.8;
  const START_LINE_REACH_METRES = 0.7;
  // Rail marks keep their on-screen size, as in race positions.
  const RAIL_POST_PIXELS = 6;
  const POLE_PIXELS = { inside: 2, outside: 14 };
  const DISTANCE_LABEL_DROP = 16;

  const landmarks = $derived(
    courseLandmarks(course).filter((landmark) => {
      if (landmark.kind === 'slope') return showSlopes;
      if (landmark.kind === 'finish') return true;

      return showCourse;
    })
  );
  const tickStep = $derived(
    [25, 50, 100, 200, 500, 1000].find((step) => step * pixelsPerMetre >= 80) ?? 1000
  );

  // A point beside the rail, the given pixels outwards; negative pixels lead into the infield.
  const besideRail = (distance: number, pixels: number) => {
    const p = offsetAt(distance, 0),
      rail = view.project(p),
      outward = view.rotate(p.nx, p.ny);

    return { x: rail.x + outward.x * pixels, y: rail.y + outward.y * pixels };
  };

  const inDisplay = (distance: number) =>
    distance >= displayRange.min && distance <= displayRange.max;

  const distanceTicks = $derived(
    Array.from({ length: Math.floor(courseLength / tickStep) }, (_, i) => (i + 1) * tickStep)
      .filter(inDisplay)
      .map((distance) => ({
        distance,
        a: besideRail(distance, 0),
        b: besideRail(distance, RAIL_POST_PIXELS),
        label: besideRail(distance, -DISTANCE_LABEL_DROP)
      }))
      .filter((tick) => visible(tick.a))
  );

  const poles = $derived(
    pixelsPerMetre < 1.5
      ? []
      : Array.from({ length: Math.floor(courseLength / 100) + 1 }, (_, i) => i * 100)
          .filter(inDisplay)
          .map((distance) => ({
            from: besideRail(distance, -POLE_PIXELS.inside),
            to: besideRail(distance, POLE_PIXELS.outside)
          }))
          .filter((pole) => visible(pole.from))
  );

  // Where laps pass each other, the later distance keeps its caption.
  const labelledTicks = $derived.by(() => {
    const accepted: (typeof distanceTicks)[number][] = [];
    for (const tick of [...distanceTicks].reverse()) {
      const clear = accepted.every(
        (other) => Math.hypot(other.label.x - tick.label.x, other.label.y - tick.label.y) > 56
      );

      if (clear && clearLabel(tick.label)) accepted.push(tick);
    }

    return new Set(accepted);
  });

  const courseMarks = $derived(
    landmarks
      .map((m) => {
        const p = offsetAt(m.distance, 0),
          a = view.project(p),
          b = view.project(offsetAt(m.distance, laneWidth));

        // Captions sit in the infield beyond the distance labels: the follow camera frames the
        // inner rail but rarely the outer one.
        const normal = view.rotate(p.nx, p.ny),
          edge = view.project(offsetAt(m.distance, -CAPTION_CLEARANCE_METRES));

        // Each section, phase and slope is marked across the whole track where it starts.
        const tick = {
          from: a,
          to: view.project(offsetAt(m.distance, laneWidth + START_LINE_REACH_METRES))
        };

        return {
          ...m,
          a,
          b,
          tick,
          caption: { x: edge.x - normal.x * 26, y: edge.y - normal.y * 26 }
        };
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

  const landmarkCaptions = $derived(
    captions ? separatedCaptions(courseMarks, clearLabel) : new Set<(typeof courseMarks)[number]>()
  );
</script>

{#each distanceTicks as tick}
  <g class="map-distance">
    <path d={'M' + tick.a.x + ' ' + tick.a.y + ' L' + tick.b.x + ' ' + tick.b.y} />
    {#if labelledTicks.has(tick)}
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
{#each poles as pole}
  <path
    class="rail-pole"
    d={'M' + pole.from.x + ' ' + pole.from.y + ' L' + pole.to.x + ' ' + pole.to.y}
  />
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
    <title>{item.label} at {Math.round(item.distance).toLocaleString()} m</title>
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
      <path
        class="start-line"
        d={'M' +
          item.tick.from.x +
          ' ' +
          item.tick.from.y +
          ' L' +
          item.tick.to.x +
          ' ' +
          item.tick.to.y}
      />
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
    stroke: var(--track-rail);
    stroke-width: 1.5;
    opacity: 0.7;
  }
  .rail-pole {
    stroke: var(--track-pole);
    stroke-width: 3;
  }
  .map-distance text,
  .map-landmark text {
    font-size: 9px;
    fill: var(--track-ink);
    paint-order: stroke;
    stroke: var(--track-ground);
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
    stroke-width: 2.5;
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
  .map-landmark > .start-line {
    stroke-dasharray: 0 7;
    stroke-linecap: round;
  }
  /* Course colours are pale on the light theme's grass. */
  :global([data-theme='light']) .map-landmark > .start-line {
    filter: brightness(0.62);
  }
  .map-landmark:hover > path,
  .map-landmark:focus-visible > path {
    stroke-width: 4;
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
