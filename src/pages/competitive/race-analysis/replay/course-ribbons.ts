import { finalSpurtSection } from '@/lib/race/final-spurt';
import { racePhaseBands } from '../race-phase-bands';
import { numberedSegments, sectionBorders, slopeColor, type Course } from './replay-course';
import { courseTerrain, slopeText } from './replay-timeline';

// Race positions and the course map share one layout: section and slope ribbons along the outer
// edge with a row of course labels beneath, and the distance labels in a strip below the inner rail.
export const SECTION_RIBBON = 14;
export const SLOPE_RIBBON = 12;
export const LABEL_ROW = SECTION_RIBBON + SLOPE_RIBBON + 3;
export const LABEL_HEIGHT = 12;
export const DISTANCE_STRIP = 26;
// The course map keeps this order with its outer rail running between the section ribbon just
// outside it and the slope ribbon and course labels inside it.
export const MAP_RIBBON_GAP = 4;
/** Half the outer rail's stroke on the map, where the slope ribbon meets it. */
export const MAP_RAIL_EDGE = 0.75;
export const MAP_RIBBONS_OUTSIDE = MAP_RIBBON_GAP + SECTION_RIBBON;
export const MAP_LABEL_ROW = MAP_RAIL_EDGE + LABEL_ROW - SECTION_RIBBON;
export const MAP_LABELS_INSIDE = MAP_LABEL_ROW + LABEL_HEIGHT;

const LABEL_CHAR_WIDTH = 5.6;
const STICKY_INSET = 6;
const LABEL_GAP = 6;

export type CourseLabel = {
  distance: number;
  text: string;
  kind: 'boundary' | 'phase' | 'section';
  color?: string;
};

export type PhaseMarker = { distance: number; label: string; color?: string };

export const labelWidth = (text: string) => text.length * LABEL_CHAR_WIDTH + 12;

/** Numbered sections, and the uphill and downhill runs; level ground leaves a gap in its ribbon. */
export function courseRibbons(
  course: Course | undefined,
  { sections, slopes }: { sections: boolean; slopes: boolean }
) {
  const hills =
    course && slopes
      ? courseTerrain(course)
          .slopes.filter((run) => run.slope !== 0)
          .map((run) => ({ ...run, color: slopeColor(run.slope), text: slopeText(run.slope) }))
      : [];

  return { sections: sections ? numberedSegments(course) : [], slopes: hills };
}

// Section and slope names stay on screen while their stretch of course is in view, until the
// stretch ends and pushes them out.
export function stickyLabelX({
  left,
  right,
  text,
  width
}: {
  left: number;
  right: number;
  text: string;
  width: number;
}) {
  const textWidth = text.length * LABEL_CHAR_WIDTH;
  const fits = right - left >= textWidth + 2 * STICKY_INSET;
  if (!fits || right < 0 || left > width) return undefined;

  return Math.min(Math.max(left, 0) + STICKY_INSET, right - textWidth - STICKY_INSET);
}

export function phaseMarkers(
  raceDistance: number,
  { course, positionKeep }: { course: boolean; positionKeep: boolean }
): PhaseMarker[] {
  const spurt = finalSpurtSection(raceDistance);
  const markers = [
    {
      distance: raceDistance * racePhaseBands[1].start,
      label: racePhaseBands[1].name,
      color: racePhaseBands[1].color,
      shown: course
    },
    { distance: (raceDistance * 10) / 24, label: 'Position Keep ends', shown: positionKeep },
    { distance: spurt.start, label: spurt.label, color: spurt.color, shown: course },
    {
      distance: raceDistance * racePhaseBands[3].start,
      label: racePhaseBands[3].name,
      color: racePhaseBands[3].color,
      shown: course
    }
  ];

  return markers.filter((marker) => marker.shown);
}

/** Start, finish, section borders and phases, in the order they claim space in the label row. */
export function courseLabelCandidates({
  course,
  raceDistance,
  phases,
  showCourse
}: {
  course: Course | undefined;
  raceDistance: number;
  phases: PhaseMarker[];
  showCourse: boolean;
}): CourseLabel[] {
  const borders = showCourse ? sectionBorders(course) : [];

  return [
    { distance: 0, text: 'Start', kind: 'boundary' },
    { distance: raceDistance, text: 'Finish', kind: 'boundary' },
    ...borders.map((border) => ({
      distance: border.distance,
      text: border.label,
      kind: 'section' as const,
      color: border.color
    })),
    ...phases.map((marker) => ({
      distance: marker.distance,
      text: marker.label,
      kind: 'phase' as const
    }))
  ];
}

/** Labels share one row, so later ones give way where they would overlap earlier ones. */
export function placeCourseLabels(
  candidates: CourseLabel[],
  leftOf: (distance: number) => number | undefined
) {
  const placed: (CourseLabel & { left: number; right: number })[] = [];
  for (const label of candidates) {
    const left = leftOf(label.distance);
    if (left === undefined) continue;

    const right = left + labelWidth(label.text);
    const overlaps = placed.some(
      (other) => left < other.right + LABEL_GAP && other.left < right + LABEL_GAP
    );

    if (!overlaps) placed.push({ ...label, left, right });
  }

  return placed;
}
