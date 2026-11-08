import { runningStyleName } from '@/lib/race/replay/race-display';
import { styleColors } from '@/pages/competitive/analysis-view';
import {
  courseLabelCandidates,
  courseRibbons,
  DISTANCE_STRIP,
  LABEL_ROW,
  phaseMarkers,
  placeCourseLabels,
  SECTION_RIBBON,
  SLOPE_RIBBON,
  stickyLabelX,
  type CourseLabel
} from '../course-ribbons';
import { gateStalls, type GateStall } from '../replay-gate';
import {
  positionKeepZones,
  sectionBorders,
  slopeColor,
  type Course,
  type PositionKeepZone
} from '../replay-course';
import { snapPixel, type PixelSnap, type ReplayToggles } from '../replay-display';
import { courseTerrain } from '../replay-timeline';

// Above the outermost lane: the ribbons and course labels, then the keep zone labels.
export const KEEP_LABEL_TOP = LABEL_ROW + 14;
const KEEP_LABEL_ROW = 14;
export const LANE_TOP = KEEP_LABEL_TOP + 3;
const DISTANCE_ROW = 7;
export const START_LINE_INSET = 4;
// Lane zero sits half a portrait above the rail, so runners on the rail stay clear of it.
const RAIL_CLEARANCE = 22;
const DISTANCE_STEPS = [5, 10, 25, 50, 100, 200, 500];
const MIN_LABEL_SPACING = 110;
// Half the extent of a distance label such as "3600 m" in its 10px type.
const DISTANCE_LABEL_HALF_WIDTH = 18;
const DISTANCE_LABEL_HALF_HEIGHT = 5;
export const LANE_FRACTIONS = [0.25, 0.5, 0.75, 1];
export const PORTRAIT = 44;
// Portraits are centred on the runner's distance, so the stall reaches half a portrait past
// the start line to hold them.
const GATE_DEPTH = PORTRAIT + 14;
const GATE_FRONT = PORTRAIT / 2 + 6;
const POLE_SPACING = 100;

export interface StageSize {
  width: number;
  height: number;
}

export interface DistanceWindow {
  min: number;
  max: number;
}

/** The stretch of course in view and where the track's rows sit on the stage. */
export interface StageGeometry {
  size: StageSize;
  display: DistanceWindow;
  pixelsPerMetre: number;
  /** The view's left edge along the whole course, in pixels. */
  scroll: number;
  railY: number;
  laneBottom: number;
}

// The racing window ends left of the race field overlay, with the course continuing beneath it,
// and moves to the stage centre for the finish.
export function stageGeometry({
  size,
  viewport,
  finishFocus,
  fieldInset,
  snap
}: {
  size: StageSize;
  viewport: DistanceWindow;
  /** 0 to 1 as the camera turns to rest on the finish, centred on the whole stage. */
  finishFocus: number;
  /** Width covered by the race field overlay at the right edge, kept clear of runners. */
  fieldInset: number;
  snap: PixelSnap;
}): StageGeometry {
  const clearFraction = Math.min(0.5, Math.max(0, fieldInset / Math.max(1, size.width)));
  const racingWindow = viewport.max - viewport.min;
  const span = racingWindow / (1 - clearFraction);
  const min = viewport.min - ((span - racingWindow) / 2) * finishFocus;
  const display = { min, max: min + span };

  // Rounded so float noise in the moving window does not rescale the course every frame.
  const viewMetres = Math.round((display.max - display.min) * 1000) / 1000;
  const pixelsPerMetre = size.width / Math.max(1, viewMetres);
  const railY = Math.max(LANE_TOP + RAIL_CLEARANCE + 40, size.height - DISTANCE_STRIP);

  return {
    size,
    display,
    pixelsPerMetre,
    scroll: snapPixel(display.min * pixelsPerMetre, snap),
    railY,
    laneBottom: railY - RAIL_CLEARANCE
  };
}

/** The lane row's height on the stage, from the outermost lane shown (1) to the rail (0). */
export function laneY(geometry: StageGeometry, fraction: number) {
  return geometry.laneBottom - fraction * (geometry.laneBottom - LANE_TOP);
}

type Ribbon = { start: number; end: number; color: string };

/** What the course shows along its length, in metres, independent of the camera. */
export interface CourseFeatures {
  raceDistance: number;
  sections: (Ribbon & { label: string })[];
  slopes: (Ribbon & { text: string })[];
  startLines: { distance: number; color?: string }[];
  labels: CourseLabel[];
}

export function courseFeatures({
  course,
  raceDistance,
  toggles
}: {
  course: Course | undefined;
  raceDistance: number;
  toggles: Pick<ReplayToggles, 'course' | 'slopes' | 'positionKeep'>;
}): CourseFeatures {
  const ribbons = courseRibbons(course, { sections: toggles.course, slopes: toggles.slopes });
  const phases = phaseMarkers(raceDistance, {
    course: toggles.course,
    positionKeep: toggles.positionKeep
  });

  // Each section, phase and slope change gets a dotted line across the track where it starts.
  // Where several start together, the first one listed keeps the line.
  const lines = new Map<number, { distance: number; color?: string }>();
  const addLine = (distance: number, color?: string) => {
    const onCourse = distance > 0 && distance < raceDistance;
    if (onCourse && !lines.has(distance)) lines.set(distance, { distance, color });
  };

  if (toggles.course)
    for (const border of sectionBorders(course)) addLine(border.distance, border.color);
  for (const marker of phases) addLine(marker.distance, marker.color);

  const slopeRuns = course && toggles.slopes ? courseTerrain(course).slopes : [];
  // Level ground takes the track ink, which reads on both themes' grass.
  for (const run of slopeRuns)
    addLine(run.start, run.slope === 0 ? undefined : slopeColor(run.slope));

  return {
    raceDistance,
    sections: ribbons.sections,
    slopes: ribbons.slopes,
    startLines: [...lines.values()],
    labels: courseLabelCandidates({ course, raceDistance, phases, showCourse: toggles.course })
  };
}

export interface StageBand {
  x: number;
  width: number;
  color: string;
}

export interface StageGate {
  /** Stall edges in stage pixels, top to bottom. */
  stalls: GateStall[];
  front: number;
  depth: number;
  open: boolean;
}

/** The course under the runners, in stage pixels for one camera position. */
export interface CourseScene {
  stripes: { x: number; width: number }[];
  laneGuides: number[];
  keepZones: (StageBand & { label: string; labelTop: number })[];
  sectionBands: StageBand[];
  slopeBands: StageBand[];
  startLines: { x: number; color?: string }[];
  boundaries: number[];
  posts: number[];
  poles: number[];
  gate?: StageGate;
  finishX?: number;
  labels: { x: number; text: string; kind: CourseLabel['kind']; color?: string }[];
  distanceLabels: { x: number; y: number; text: string }[];
  stickyNames: { x: number; text: string; kind: 'section' | 'slope' }[];
  laneLabels: { y: number; text: string }[];
}

function distanceSteps(from: number, to: number, step: number) {
  const steps: number[] = [];
  for (let distance = Math.floor(from / step) * step; distance <= to; distance += step)
    steps.push(distance);

  return steps;
}

export function courseScene({
  features,
  geometry,
  keepZones,
  laneMax,
  laneLabel,
  startLanes,
  gateOpen,
  brand
}: {
  features: CourseFeatures;
  geometry: StageGeometry;
  keepZones: PositionKeepZone[];
  laneMax: number;
  /** The lateral distance from the rail for a lane position, as shown on the lane axis. */
  laneLabel: (lane: number) => string;
  /** Each runner's lane at the gate, in gate order. */
  startLanes: number[];
  gateOpen: boolean;
  /** The uma.moe mark in the lower left corner, which distance labels keep clear of, as on the map. */
  brand: { right: number; top: number; bottom: number };
}): CourseScene {
  const { display, pixelsPerMetre, scroll, size } = geometry;
  const { raceDistance } = features;
  const viewX = (distance: number) => distance * pixelsPerMetre - scroll;
  const band = (ribbon: Ribbon) => ({
    x: viewX(ribbon.start),
    width: (ribbon.end - ribbon.start) * pixelsPerMetre,
    color: ribbon.color
  });

  // One step either side keeps stripes and labels that straddle an edge.
  const step = DISTANCE_STEPS.find((s) => s * pixelsPerMetre >= MIN_LABEL_SPACING) ?? 1000;
  const ticks = distanceSteps(display.min - step, display.max + step, step);
  const inView = (start: number, end = start) =>
    end >= display.min - step && start <= display.max + step;

  const stickyX = (start: number, end: number, text: string) =>
    stickyLabelX({ left: viewX(start), right: viewX(end), text, width: size.width });

  const stickyNames = [
    ...features.sections.map((segment) => ({
      kind: 'section' as const,
      text: segment.label,
      x: stickyX(segment.start, segment.end, segment.label)
    })),
    ...features.slopes.map((run) => ({
      kind: 'slope' as const,
      text: run.text,
      x: stickyX(run.start, run.end, run.text)
    }))
  ].flatMap((name) => (name.x === undefined ? [] : [{ ...name, x: name.x }]));

  // Labels are placed along the whole course, so each keeps its place as the view moves.
  const labels = placeCourseLabels(features.labels, (distance) => distance * pixelsPerMetre)
    .filter((label) => inView(label.distance))
    .map((label) => ({ ...label, x: viewX(label.distance) }));

  const distanceLabelY = geometry.railY + DISTANCE_ROW + 6;
  const besideBrand =
    distanceLabelY + DISTANCE_LABEL_HALF_HEIGHT < brand.top ||
    distanceLabelY - DISTANCE_LABEL_HALF_HEIGHT > brand.bottom;
  const clearOfBrand = (x: number) => besideBrand || x - DISTANCE_LABEL_HALF_WIDTH > brand.right;

  const startLaneYs = startLanes.map((lane) => laneY(geometry, lane / laneMax));
  const gate =
    inView(0) && startLaneYs.length
      ? {
          stalls: gateStalls(startLaneYs, PORTRAIT / 2),
          front: viewX(0) + GATE_FRONT,
          depth: GATE_DEPTH,
          open: gateOpen
        }
      : undefined;

  return {
    stripes: ticks.map((start) => ({ x: viewX(start), width: (step / 2) * pixelsPerMetre })),
    laneGuides: LANE_FRACTIONS.map((fraction) => laneY(geometry, fraction)),
    keepZones: keepZones.map((zone, row) => ({
      x: viewX(zone.start),
      width: (zone.end - zone.start) * pixelsPerMetre,
      color: styleColors[zone.style] ?? 'transparent',
      label: runningStyleName(zone.style),
      labelTop: KEEP_LABEL_TOP + row * KEEP_LABEL_ROW
    })),
    sectionBands: features.sections.filter((s) => inView(s.start, s.end)).map(band),
    slopeBands: features.slopes.filter((s) => inView(s.start, s.end)).map(band),
    startLines: features.startLines
      .filter((line) => inView(line.distance))
      .map((line) => ({ x: viewX(line.distance), color: line.color })),
    boundaries: [0, raceDistance].filter((distance) => inView(distance)).map(viewX),
    posts: ticks.map(viewX),
    poles: distanceSteps(display.min - POLE_SPACING, display.max + POLE_SPACING, POLE_SPACING).map(
      viewX
    ),
    gate,
    finishX: inView(raceDistance) ? viewX(raceDistance) : undefined,
    labels,
    distanceLabels: ticks
      .filter((distance) => distance >= 0 && distance <= raceDistance)
      .map((distance) => ({ x: viewX(distance), y: distanceLabelY, text: distance + ' m' }))
      .filter((label) => clearOfBrand(label.x)),
    stickyNames,
    laneLabels: LANE_FRACTIONS.map((fraction) => ({
      y: laneY(geometry, fraction),
      text: laneLabel(laneMax * fraction) + ' m'
    }))
  };
}

export function keepZonesFor(leader: number, raceDistance: number, shown: boolean) {
  return shown ? positionKeepZones(leader, raceDistance) : [];
}

export const BANDS_BOTTOM = SECTION_RIBBON + SLOPE_RIBBON;
