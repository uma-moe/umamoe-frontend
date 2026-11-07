<svelte:options namespace="svg" />

<script lang="ts">
  import type { Course } from '../replay-course';
  import {
    courseLabelCandidates,
    courseRibbons,
    LABEL_HEIGHT,
    MAP_LABEL_ROW,
    MAP_LABELS_INSIDE,
    MAP_RAIL_EDGE,
    MAP_RIBBON_GAP,
    phaseMarkers,
    placeCourseLabels,
    SECTION_RIBBON,
    SLOPE_RIBBON,
    stickyLabelX
  } from '../course-ribbons';
  import {
    arcAtDistance,
    pointAtX,
    pointList,
    ribbonPath,
    visibleArcs,
    type PathPoint,
    type RibbonPath
  } from './ribbon-path';

  type Point = { x: number; y: number };
  type Stretch = { start: number; end: number; color: string };

  let {
    course,
    raceDistance,
    width,
    height,
    showCourse,
    showSlopes,
    showPositionKeep,
    ribbonLine,
    ribbonAt,
    brand
  }: {
    course?: Course;
    raceDistance: number;
    width: number;
    height: number;
    showCourse: boolean;
    showSlopes: boolean;
    showPositionKeep: boolean;
    /** A line the given pixels outside the outer rail, or inside it when negative. */
    ribbonLine: (offset: number, start: number, end: number) => PathPoint[];
    ribbonAt: (offset: number, distance: number) => Point;
    /** The brand mark in the bottom-left corner. */
    brand: { right: number; top: number; bottom: number };
  } = $props();

  const id = $props.id();

  const BRAND_CLEARANCE = 6;
  const LABEL_CENTRE = -(MAP_LABEL_ROW + LABEL_HEIGHT / 2);

  const ribbons = $derived(courseRibbons(course, { sections: showCourse, slopes: showSlopes }));
  const phases = $derived(
    phaseMarkers(raceDistance, { course: showCourse, positionKeep: showPositionKeep })
  );

  // Names and labels keep to the visible part of their line, beside the brand mark where it
  // runs behind it.
  const textArcs = (path: RibbonPath) => {
    const behindBrand = pointAtX(path, brand.right);
    const passesBrand =
      behindBrand !== undefined &&
      behindBrand.y > brand.top - BRAND_CLEARANCE &&
      behindBrand.y < brand.bottom + BRAND_CLEARANCE;

    const left = passesBrand ? brand.right + BRAND_CLEARANCE : 0;
    return visibleArcs(path, { left, right: width, top: 0, bottom: height });
  };

  // A name stays on screen along its ribbon until the end of the stretch pushes it out.
  const stickyName = (path: RibbonPath, text: string) => {
    const screen = textArcs(path);
    if (!screen) return undefined;

    const offset = stickyLabelX({
      left: -screen.enter,
      right: path.length - screen.enter,
      text,
      width: screen.exit - screen.enter
    });

    return offset === undefined ? undefined : offset + screen.enter;
  };

  const bands = <T extends Stretch>({
    stretches,
    offset,
    thickness,
    key,
    text
  }: {
    stretches: T[];
    offset: number;
    thickness: number;
    key: string;
    text: (stretch: T) => string;
  }) =>
    stretches.flatMap((stretch, index) => {
      const inner = ribbonLine(offset, stretch.start, stretch.end);
      if (inner.length < 2) return [];

      const outer = ribbonLine(offset + thickness, stretch.start, stretch.end);
      const centre = ribbonPath(ribbonLine(offset + thickness / 2, stretch.start, stretch.end));

      return [
        {
          id: id + '-' + key + index,
          color: stretch.color,
          outline: pointList([...inner, ...outer.reverse()]),
          path: centre.d,
          text: text(stretch),
          offset: stickyName(centre, text(stretch))
        }
      ];
    });

  const sectionBands = $derived(
    bands({
      stretches: ribbons.sections,
      offset: MAP_RIBBON_GAP,
      thickness: SECTION_RIBBON,
      key: 'section',
      text: (section) => section.label
    })
  );

  const slopeBands = $derived(
    bands({
      stretches: ribbons.slopes,
      offset: -(MAP_RAIL_EDGE + SLOPE_RIBBON),
      thickness: SLOPE_RIBBON,
      key: 'slope',
      text: (slope) => slope.text
    })
  );

  const labelPath = $derived(ribbonPath(ribbonLine(LABEL_CENTRE, -Infinity, Infinity)));
  const labelScreen = $derived(textArcs(labelPath));

  // Labels claim the row in arc length along the track, measured from where it comes into view.
  const labels = $derived.by(() => {
    const screen = labelScreen;
    if (!screen) return [];

    const leftOf = (distance: number) => {
      const arc = arcAtDistance(labelPath, distance);
      if (arc === undefined || arc < screen.enter || arc > screen.exit) return undefined;

      return arc - screen.enter;
    };

    return placeCourseLabels(
      courseLabelCandidates({ course, raceDistance, phases, showCourse }),
      leftOf
    ).map((label) => {
      const from = ribbonAt(-MAP_LABEL_ROW, label.distance),
        to = ribbonAt(-MAP_LABELS_INSIDE, label.distance);

      return {
        ...label,
        offset: screen.enter + label.left + (label.kind === 'section' ? 6 : 4),
        mark: 'M' + pointList([from, to])
      };
    });
  });
</script>

<defs>
  {#each [...sectionBands, ...slopeBands] as band (band.id)}
    <path
      id={band.id}
      d={band.path}
    />
  {/each}
  <path
    id={id + '-labels'}
    d={labelPath.d}
  />
</defs>
{#each [...sectionBands, ...slopeBands] as band (band.id)}
  <polygon
    class="ribbon"
    points={band.outline}
    fill={band.color}
  />
{/each}
{#each [...sectionBands, ...slopeBands] as band (band.id)}
  {#if band.offset !== undefined}
    <text class="ribbon-name">
      <textPath
        href={'#' + band.id}
        startOffset={band.offset}
      >
        {band.text}
      </textPath>
    </text>
  {/if}
{/each}
{#each labels as label}
  {#if label.kind === 'section'}
    <path
      class="label-mark"
      d={label.mark}
      stroke={label.color}
    />
  {/if}
  <text class={'course-label ' + label.kind}>
    <textPath
      href={'#' + id + '-labels'}
      startOffset={label.offset}
    >
      {label.text}
    </textPath>
  </text>
{/each}

<style>
  .ribbon {
    opacity: 0.9;
  }
  text {
    dominant-baseline: central;
    pointer-events: none;
  }
  .ribbon-name {
    fill: #10161d;
    font-size: 9px;
    font-weight: 700;
  }
  .label-mark {
    stroke-width: 2;
  }
  .course-label {
    fill: var(--track-ink);
    font-size: 10px;
    paint-order: stroke;
    stroke: var(--track-ground);
    stroke-width: 3px;
    stroke-linejoin: round;
  }
  .course-label.boundary {
    fill: var(--track-rail);
    font-weight: 600;
  }
  .course-label.section {
    font-weight: 600;
  }
</style>
