<svelte:options namespace="svg" />

<script lang="ts">
  import { courseSegments, type Course } from '../replay-course';
  import { trackSection, type TrackCamera, type TrackPoint } from '../replay-track';
  import { finalSpurtSection, FINAL_SPURT_HELP } from '@/lib/race/final-spurt';

  let {
    camera,
    mapWidth,
    mapHeight,
    course,
    points,
    roadPoints,
    outerPoints,
    displayRange,
    trackWidth,
    slopes,
    packPath,
    packWidth,
    cone,
    trail,
    trailColor
  }: {
    camera: TrackCamera;
    mapWidth: number;
    mapHeight: number;
    course?: Course;
    points: TrackPoint[];
    roadPoints: TrackPoint[];
    outerPoints: TrackPoint[];
    displayRange: { min: number; max: number };
    trackWidth: number;
    slopes: boolean;
    packPath: string;
    packWidth: number;
    cone: string;
    trail: string;
    trailColor?: string;
  } = $props();

  const sections = $derived(
    courseSegments(course)
      .filter((s) => s.end >= displayRange.min && s.start <= displayRange.max)
      .map((s) => ({
        ...s,
        path: trackSection(
          roadPoints,
          Math.max(displayRange.min, s.start),
          Math.min(displayRange.max, s.end)
        )
      }))
  );

  const slopePaths = $derived(
    (course?.slopes ?? [])
      .filter((s) => s.start + s.length >= displayRange.min && s.start <= displayRange.max)
      .map((s) => ({
        ...s,
        path: trackSection(
          roadPoints,
          Math.max(displayRange.min, s.start),
          Math.min(displayRange.max, s.start + s.length)
        )
      }))
  );

  const path = $derived(trackSection(roadPoints, displayRange.min, displayRange.max));
  const innerRail = $derived(trackSection(points, displayRange.min, displayRange.max));
  const outerRail = $derived(trackSection(outerPoints, displayRange.min, displayRange.max));
  const spurt = $derived(finalSpurtSection(course?.distance ?? points.at(-1)?.distance ?? 0));
  const spurtRail = $derived(
    displayRange.max > spurt.start
      ? trackSection(
          outerPoints,
          Math.max(displayRange.min, spurt.start),
          Math.min(displayRange.max, spurt.end)
        )
      : ''
  );
</script>

<g
  class="track-camera"
  transform={'translate(' +
    mapWidth / 2 +
    ' ' +
    mapHeight / 2 +
    ') scale(' +
    camera.scale +
    ') rotate(' +
    (camera.angle * 180) / Math.PI +
    ') translate(' +
    -camera.x +
    ' ' +
    -camera.y +
    ')'}
>
  <polyline
    class="track-base"
    points={path}
    stroke-width={trackWidth}
  />
  {#each sections as segment}
    <polyline
      class="track-section"
      points={segment.path}
      stroke={segment.color}
      stroke-width={trackWidth}
    >
      <title>
        {segment.label}: {Math.round(segment.start)}–{Math.round(segment.end)} m
      </title>
    </polyline>
  {/each}
  {#if slopes}
    {#each slopePaths as slope}
      <polyline
        class="slope"
        points={slope.path}
        stroke={slope.slope > 0 ? '#bd7581' : '#719bdd'}
      >
        <title>
          {slope.slope > 0 ? 'Uphill' : 'Downhill'}: {slope.start}–{slope.start + slope.length} m
        </title>
      </polyline>
    {/each}
  {/if}
  <polyline
    class="pack-range"
    points={packPath}
    stroke-width={packWidth}
  >
    <title>Inspected distance window</title>
  </polyline>
  {#if cone}
    <polygon
      class="view-cone"
      points={cone}
    >
      <title>Base view range before skill modifiers</title>
    </polygon>
  {/if}
  <polyline
    class="track-rail"
    points={innerRail}
  />
  <polyline
    class="track-rail"
    points={outerRail}
  />
  {#if spurtRail}
    <polyline
      class="spurt-window"
      points={spurtRail}
    >
      <title>Final spurt window from {Math.round(spurt.start)} m. {FINAL_SPURT_HELP}</title>
    </polyline>
  {/if}
  {#if trailColor}
    <polyline
      class="runner-trail"
      points={trail}
      stroke={trailColor}
    />
  {/if}
</g>

<style>
  .spurt-window {
    fill: none;
    stroke: var(--accent-warning);
    stroke-width: 2;
    stroke-dasharray: 5 3;
    vector-effect: non-scaling-stroke;
  }
  .track-base,
  .track-rail,
  .track-section,
  .slope,
  .pack-range,
  .runner-trail {
    fill: none;
    stroke-linejoin: round;
  }
  .track-base {
    stroke: var(--surface-2);
  }
  .track-section {
    opacity: 0.12;
  }
  .track-rail {
    stroke: var(--text-secondary);
    stroke-width: 1;
    opacity: 0.45;
    vector-effect: non-scaling-stroke;
  }
  .slope {
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }
  .pack-range {
    stroke: var(--accent-primary);
    opacity: 0.13;
  }
  .runner-trail {
    stroke-width: 3;
    opacity: 0.85;
    vector-effect: non-scaling-stroke;
  }
  .view-cone {
    fill: var(--accent-primary);
    stroke: var(--accent-primary);
    vector-effect: non-scaling-stroke;
    pointer-events: none;
    fill-opacity: 0.04;
    stroke-opacity: 0.35;
    stroke-width: 1;
  }
  .runner-trail {
    stroke-width: 2;
    opacity: 0.55;
  }
</style>
