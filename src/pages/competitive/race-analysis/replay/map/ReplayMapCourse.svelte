<svelte:options namespace="svg" />

<script lang="ts">
  import { finalSpurtSection, FINAL_SPURT_HELP } from '@/lib/race/final-spurt';
  import { styleColors } from '@/pages/competitive/analysis-view';
  import { courseSegments, slopeColor, type Course, type PositionKeepZone } from '../replay-course';
  import { towardWhite } from '../team-colors';
  import { gateStalls, OPEN_DOOR_RADIANS } from '../replay-gate';
  import {
    trackBandPoints,
    trackSectionPoints,
    type trackBasis,
    type TrackPoint
  } from '../replay-track';
  import { screenPoints, type ScreenMatrix } from './screen-projection';

  let {
    matrix,
    course,
    courseDistance,
    points,
    roadPoints,
    outerPoints,
    offsetAt,
    laneWidth,
    unitsPerMetre,
    pixelsPerMetre,
    displayRange,
    trackWidth,
    startLanes,
    gateOpen,
    showSpurt,
    showSections,
    showSlopes,
    keepZones,
    speedUpChecks,
    packPath,
    packWidth,
    cone,
    trail,
    trailColor
  }: {
    /** Maps course coordinates onto the map. */
    matrix: ScreenMatrix;
    course?: Course;
    courseDistance: number;
    /** The inner rail, including the run-in behind the start and the run-out past the finish. */
    points: TrackPoint[];
    roadPoints: TrackPoint[];
    outerPoints: TrackPoint[];
    offsetAt: (distance: number, lane: number) => ReturnType<typeof trackBasis>;
    laneWidth: number;
    unitsPerMetre: number;
    pixelsPerMetre: number;
    displayRange: { min: number; max: number };
    /** The track's width on the map, in pixels. */
    trackWidth: number;
    /** Each runner's starting lane in metres, by runner index. */
    startLanes: number[];
    gateOpen: boolean;
    /** Marks the final spurt window beside the outer rail. */
    showSpurt: boolean;
    /** Section and slope strips beside the rails, for the whole-course view. */
    showSections: boolean;
    showSlopes: boolean;
    keepZones: PositionKeepZone[];
    /** Runners that can enter Speed Up mode: position, lane in metres and check range. */
    speedUpChecks: { distance: number; lane: number; range: number; color: string; dim: boolean }[];
    /** In map pixels, like the cone and trail; empty while the camera follows the window it marks. */
    packPath: string;
    packWidth: number;
    cone: string;
    trail: string;
    trailColor?: string;
  } = $props();

  // Narrow stripes turn into noise when the whole course is in view.
  const STRIPE_METRES = 10;
  const WIDE_STRIPE_METRES = 50;
  const NARROW_STRIPE_MIN_PIXELS_PER_METRE = 6;
  // Stalls keep the on-screen size of a portrait whatever the zoom, so runners stand inside them.
  const GATE_DEPTH_PIXELS = 58;
  const GATE_FRONT_PIXELS = 28;
  const GATE_BEAM_PIXELS = 6;
  const GATE_FRAME_PIXELS = 3;
  // Course sections are marked just outside the outer rail and slopes just inside the inner rail,
  // so the racing surface itself stays clear.
  const STRIP_GAP_METRES = 0.25;
  const STRIP_WIDTH_METRES = 0.55;

  const drawnStart = $derived(points[0]?.distance ?? 0);
  const drawnLength = $derived(points.at(-1)?.distance ?? 0);
  const lanePoints = (lane: number) => points.map((p) => offsetAt(p.distance, lane));

  const sectionEdge = $derived({
    inner: lanePoints(laneWidth + STRIP_GAP_METRES),
    outer: lanePoints(laneWidth + STRIP_GAP_METRES + STRIP_WIDTH_METRES)
  });

  const slopeEdge = $derived({
    inner: lanePoints(-STRIP_GAP_METRES),
    outer: lanePoints(-STRIP_GAP_METRES - STRIP_WIDTH_METRES)
  });

  const overlaps = (start: number, end: number) =>
    end >= displayRange.min && start <= displayRange.max;

  // Bands are fixed to the course, so they are traced once and only filtered and projected while
  // following. Stripes keep their places relative to the start, including behind it.
  const stripeBands = (metres: number) => {
    const bands: { start: number; end: number; outline: TrackPoint[] }[] = [];
    const period = metres * 2;
    for (let from = Math.floor(drawnStart / period) * period; from < drawnLength; from += period) {
      const start = Math.max(drawnStart, from),
        end = Math.min(drawnLength, from + metres);

      if (end > start)
        bands.push({ start, end, outline: trackBandPoints(points, outerPoints, start, end) });
    }

    return bands;
  };

  const narrowStripes = $derived(stripeBands(STRIPE_METRES));
  const wideStripes = $derived(stripeBands(WIDE_STRIPE_METRES));
  const stripes = $derived(
    pixelsPerMetre >= NARROW_STRIPE_MIN_PIXELS_PER_METRE ? narrowStripes : wideStripes
  );

  // One path holds every visible stripe: the camera moves every frame, and each SVG element adds
  // to the layout that follows.
  const stripePath = $derived(
    stripes
      .filter((stripe) => overlaps(stripe.start, stripe.end))
      .map((stripe) => 'M' + screenPoints(matrix, stripe.outline) + 'Z')
      .join('')
  );

  const sections = $derived(
    courseSegments(course).map((segment) => ({
      ...segment,
      outline: trackBandPoints(sectionEdge.inner, sectionEdge.outer, segment.start, segment.end)
    }))
  );

  const slopes = $derived(
    (course?.slopes ?? []).map((slope) => ({
      ...slope,
      outline: trackBandPoints(
        slopeEdge.inner,
        slopeEdge.outer,
        slope.start,
        slope.start + slope.length
      )
    }))
  );

  const zones = $derived(
    keepZones
      .filter((zone) => zone.end > 0)
      .map((zone) => ({
        ...zone,
        outline: trackBandPoints(points, outerPoints, Math.max(0, zone.start), zone.end)
      }))
  );

  // As on the race positions stage: a dotted line across the track at the rear end of the range,
  // a solid line along the runner's lane up to the runner and a short tick across it there.
  const CHECK_TICK_PIXELS = 6;
  const CHECK_STEP_METRES = 0.5;
  const checks = $derived(
    speedUpChecks.map((check) => {
      const rear = check.distance - check.range;
      const along: TrackPoint[] = [];
      for (let d = rear; d < check.distance; d += CHECK_STEP_METRES)
        along.push(offsetAt(d, check.lane));
      along.push(offsetAt(check.distance, check.lane));

      const inside = offsetAt(check.distance, 0),
        outside = offsetAt(check.distance, 1);
      const lanePixels =
        (Math.hypot(outside.x - inside.x, outside.y - inside.y) / unitsPerMetre) * pixelsPerMetre;
      const tick = CHECK_TICK_PIXELS / Math.max(0.01, lanePixels);

      return {
        ...check,
        across: screenPoints(matrix, [offsetAt(rear, 0), offsetAt(rear, laneWidth)]),
        path:
          'M' +
          screenPoints(matrix, along) +
          'M' +
          screenPoints(matrix, [
            offsetAt(check.distance, check.lane - tick),
            offsetAt(check.distance, check.lane + tick)
          ])
      };
    })
  );

  const gate = $derived.by(() => {
    if (displayRange.min > 0 || !points.length || !startLanes.length) return undefined;

    // Gate details keep their on-screen size: these convert pixels to metres along and across.
    const alongMetres = (pixels: number) => pixels / pixelsPerMetre;
    const inside = offsetAt(0, 0),
      outside = offsetAt(0, 1);

    const lanePixels =
      (Math.hypot(outside.x - inside.x, outside.y - inside.y) / unitsPerMetre) * pixelsPerMetre;
    const acrossMetres = (pixels: number) => pixels / Math.max(0.01, lanePixels);

    const front = alongMetres(GATE_FRONT_PIXELS),
      back = front - alongMetres(GATE_DEPTH_PIXELS),
      beam = alongMetres(GATE_BEAM_PIXELS);

    const stalls = gateStalls(startLanes, 0.5);
    const inner = stalls[0]?.from ?? 0,
      outer = stalls.at(-1)?.to ?? 0;

    const quad = (from: number, to: number, innerLane: number, outerLane: number) =>
      screenPoints(matrix, [
        offsetAt(from, innerLane),
        offsetAt(to, innerLane),
        offsetAt(to, outerLane),
        offsetAt(from, outerLane)
      ]);

    const segment = (from: TrackPoint, to: TrackPoint) => 'M' + screenPoints(matrix, [from, to]);

    const frame = acrossMetres(GATE_FRAME_PIXELS);
    const chassis = quad(
      back - alongMetres(GATE_FRAME_PIXELS),
      front + alongMetres(GATE_FRAME_PIXELS),
      inner - frame,
      outer + frame
    );

    const cellGap = acrossMetres(1.5);
    const cells = stalls.map((stall) =>
      quad(back + beam / 2, front - beam / 2, stall.from + cellGap, stall.to - cellGap)
    );

    const partitions = stalls
      .slice(1)
      .map((stall) =>
        segment(offsetAt(back + beam / 2, stall.from), offsetAt(front - beam / 2, stall.from))
      )
      .join(' ');

    const beamReach = acrossMetres(GATE_FRAME_PIXELS + 2);
    const beams = [back, front]
      .map((distance) =>
        segment(offsetAt(distance, inner - beamReach), offsetAt(distance, outer + beamReach))
      )
      .join(' ');

    // Open leaves swing forwards from the partitions, as long as half the stall is wide.
    const hinge = front + beam / 2;
    const leaf = (lane: number, towards: number, length: number) => {
      const start = offsetAt(hinge, lane);
      const reach = length * Math.sin(OPEN_DOOR_RADIANS),
        across = length * Math.cos(OPEN_DOOR_RADIANS) * towards;

      return segment(start, {
        ...start,
        x: start.x + start.tx * reach + start.nx * across,
        y: start.y + start.ty * reach + start.ny * across
      });
    };

    const doors = gateOpen
      ? stalls
          .flatMap((stall) => {
            const from = offsetAt(hinge, stall.from),
              centre = offsetAt(hinge, stall.centre);

            const length = Math.hypot(centre.x - from.x, centre.y - from.y) * 0.9;
            return [leaf(stall.from, 1, length), leaf(stall.to, -1, length)];
          })
          .join(' ')
      : '';

    return { chassis, cells, partitions, beams, doors };
  });

  const surface = $derived(trackSectionPoints(roadPoints, displayRange.min, displayRange.max));
  const innerRail = $derived(trackSectionPoints(points, displayRange.min, displayRange.max));
  const outerRail = $derived(trackSectionPoints(outerPoints, displayRange.min, displayRange.max));
  const spurt = $derived(finalSpurtSection(course?.distance ?? courseDistance));
  const spurtRail = $derived(
    showSpurt && displayRange.max > spurt.start
      ? trackSectionPoints(
          sectionEdge.outer,
          Math.max(displayRange.min, spurt.start),
          Math.min(displayRange.max, spurt.end)
        )
      : []
  );
</script>

<polyline
  class="track-surface"
  points={screenPoints(matrix, surface)}
  stroke-width={trackWidth}
/>
<path
  class="mowing-stripe"
  d={stripePath}
/>
{#if showSlopes}
  {#each slopes.filter((slope) => overlaps(slope.start, slope.start + slope.length)) as slope}
    <polygon
      class="slope"
      points={screenPoints(matrix, slope.outline)}
      fill={slopeColor(slope.slope)}
    >
      <title>
        {slope.slope > 0 ? 'Uphill' : 'Downhill'}: {slope.start}–{slope.start + slope.length} m
      </title>
    </polygon>
  {/each}
{/if}
{#each zones as zone}
  <polygon
    class="keep-zone"
    points={screenPoints(matrix, zone.outline)}
    fill={styleColors[zone.style]}
  />
{/each}
{#if showSections}
  {#each sections.filter((section) => overlaps(section.start, section.end)) as section}
    <polygon
      class="section-band"
      points={screenPoints(matrix, section.outline)}
      fill={section.color}
    >
      <title>
        {section.label}: {Math.round(section.start)}–{Math.round(section.end)} m
      </title>
    </polygon>
  {/each}
{/if}
{#if packPath}
  <polyline
    class="pack-range"
    points={packPath}
    stroke-width={packWidth}
  >
    <title>Inspected distance window</title>
  </polyline>
{/if}
{#if cone}
  <polygon
    class="view-cone"
    points={cone}
  >
    <title>Base view range before skill modifiers</title>
  </polygon>
{/if}
{#if gate}
  <g class="start-gate">
    <title>Starting gate</title>
    <polygon
      class="gate-chassis"
      points={gate.chassis}
    />
    {#each gate.cells as cell}
      <polygon
        class="gate-stall"
        points={cell}
      />
    {/each}
    <path
      class="gate-partition"
      d={gate.partitions}
    />
    {#if gate.doors}
      <path
        class="gate-door"
        d={gate.doors}
      />
    {/if}
    <path
      class="gate-beam-edge"
      d={gate.beams}
    />
    <path
      class="gate-beam"
      d={gate.beams}
    />
  </g>
{/if}
<polyline
  class="track-rail outer"
  points={screenPoints(matrix, outerRail)}
/>
<polyline
  class="track-rail inner"
  points={screenPoints(matrix, innerRail)}
/>
{#if spurtRail.length}
  <polyline
    class="spurt-window"
    points={screenPoints(matrix, spurtRail)}
  >
    <title>Final spurt window from {Math.round(spurt.start)} m. {FINAL_SPURT_HELP}</title>
  </polyline>
{/if}
{#each checks as check}
  <g
    class="speed-up-check"
    opacity={check.dim ? 0.25 : 1}
  >
    <polyline
      class="check-rear-edge"
      points={check.across}
    />
    <polyline
      class="check-rear"
      points={check.across}
      stroke={towardWhite(check.color, 0.45)}
    />
    <path
      class="check-line-edge"
      d={check.path}
    />
    <path
      class="check-line"
      d={check.path}
      stroke={check.color}
    />
  </g>
{/each}
{#if trailColor}
  <polyline
    class="runner-trail"
    points={trail}
    stroke={trailColor}
  />
{/if}

<style>
  polyline {
    fill: none;
    stroke-linejoin: round;
  }
  .track-surface {
    stroke: var(--track-surface);
  }
  .mowing-stripe {
    fill: var(--track-stripe);
  }
  .slope {
    opacity: 0.75;
  }
  .keep-zone {
    fill-opacity: 0.2;
  }
  .section-band {
    opacity: 0.8;
  }
  .pack-range {
    stroke: var(--accent-primary);
    opacity: 0.16;
  }
  .view-cone {
    fill: var(--accent-primary);
    fill-opacity: 0.08;
    stroke: var(--accent-primary);
    stroke-opacity: 0.5;
    stroke-width: 1;
    pointer-events: none;
  }
  .gate-chassis {
    fill: #262d33;
    fill-opacity: 0.92;
  }
  .gate-stall {
    fill: #3a434b;
  }
  .start-gate path {
    fill: none;
  }
  .gate-partition {
    stroke: #aeb8c1;
    stroke-width: 1.5;
  }
  .gate-door {
    stroke: #e4e9ed;
    stroke-width: 2.5;
    stroke-linecap: round;
  }
  .gate-beam-edge {
    stroke: #1d2329;
    stroke-width: 8;
    stroke-linecap: round;
  }
  .gate-beam {
    stroke: #e4e9ed;
    stroke-width: 6;
    stroke-linecap: round;
  }
  .track-rail {
    stroke: var(--track-rail);
  }
  .track-rail.inner {
    stroke-width: 2.5;
  }
  /* The course ribbons' MAP_RAIL_EDGE is half this stroke. */
  .track-rail.outer {
    stroke-width: 1.5;
  }
  .spurt-window {
    stroke: var(--accent-warning);
    stroke-width: 2;
    stroke-dasharray: 5 3;
  }
  .speed-up-check {
    pointer-events: none;
  }
  .speed-up-check path {
    fill: none;
  }
  .check-rear-edge,
  .check-rear {
    stroke-dasharray: 1 7;
    stroke-linecap: round;
    opacity: 0.95;
  }
  .check-rear-edge {
    stroke: #07101b;
    stroke-width: 5;
  }
  .check-rear {
    stroke-width: 2.5;
  }
  .check-line-edge {
    stroke: #0b111b;
    stroke-width: 5;
  }
  .check-line {
    stroke-width: 2;
  }
  .runner-trail {
    stroke-width: 2;
    opacity: 0.7;
  }
</style>
