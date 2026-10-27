<script lang="ts">
  import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';
  import type { InterpolatedRaceFrame } from '@/lib/race/replay/race-replay';
  import type { CourseShape } from '../replay-course';
  import { replayTrack, trackPointAtDistance, trackSection } from '../replay-track';

  let {
    shape,
    frame,
    runners,
    viewport,
    selected,
    visibility,
    teamColor
  }: {
    shape: CourseShape;
    frame?: InterpolatedRaceFrame;
    runners: RaceRunner[];
    viewport: { min: number; max: number };
    selected: number;
    visibility: Record<number, number>;
    teamColor: (runner: RaceRunner) => string;
  } = $props();

  const points = $derived(replayTrack(shape));
  const bounds = $derived.by(() => {
    const xs = points.map((p) => p.x),
      ys = points.map((p) => p.y);

    const padding = 14;
    const minX = Math.min(...xs) - padding,
      minY = Math.min(...ys) - padding;

    return {
      x: minX,
      y: minY,
      width: Math.max(...xs) + padding - minX,
      height: Math.max(...ys) + padding - minY
    };
  });

  const course = $derived(points.map((p) => p.x + ',' + p.y).join(' '));
  const inView = $derived(trackSection(points, Math.max(0, viewport.min), viewport.max));
  const dots = $derived(
    runners.flatMap((runner) => {
      const horse = frame?.horses[runner.index];
      if (!horse || visibility[runner.index] === 2) return [];

      return [{ runner, point: trackPointAtDistance(points, horse.distance) }];
    })
  );
</script>

{#if points.length}
  <figure
    class="course-minimap"
    aria-label={'Course overview, ' +
      Math.round(Math.max(0, viewport.min)) +
      ' to ' +
      Math.round(viewport.max) +
      ' m in view'}
  >
    <svg
      viewBox={bounds.x + ' ' + bounds.y + ' ' + bounds.width + ' ' + bounds.height}
      aria-hidden="true"
    >
      <polyline
        class="course-line"
        points={course}
      />
      <polyline
        class="view-window"
        points={inView}
      />
      {#each dots as dot (dot.runner.index)}
        <circle
          class:selected={dot.runner.index === selected}
          cx={dot.point.x}
          cy={dot.point.y}
          r={dot.runner.index === selected ? 9 : 6}
          style:--runner-color={teamColor(dot.runner)}
        />
      {/each}
    </svg>
  </figure>
{/if}

<style>
  .course-minimap {
    position: absolute;
    right: 8px;
    bottom: 8px;
    z-index: 6;
    width: 168px;
    margin: 0;
    padding: 4px;
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    background: color-mix(in srgb, var(--surface-1) 88%, transparent);
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
    pointer-events: none;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;
  }
  polyline,
  circle {
    vector-effect: non-scaling-stroke;
  }
  .course-line {
    fill: none;
    stroke: var(--border-primary);
    stroke-width: 3;
    stroke-linejoin: round;
  }
  .view-window {
    fill: none;
    stroke: var(--accent-primary);
    stroke-width: 6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  circle {
    fill: var(--runner-color);
    stroke: var(--surface-1);
    stroke-width: 1;
  }
  circle.selected {
    stroke: var(--text-primary);
    stroke-width: 2;
  }
  @media (max-width: 700px) {
    .course-minimap {
      width: 112px;
      right: 4px;
      bottom: 4px;
    }
  }
</style>
