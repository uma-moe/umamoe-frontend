import { courseSegments, type Course, type CourseShape } from '../replay/replay-course';
import {
  replayTrack,
  trackBasis,
  trackSection,
  trackUnitsPerMetre,
  type TrackPoint
} from '../replay/replay-track';

/** Lanes are drawn wider than scale so a full field stays readable on a whole course. */
export const LANE_SPREAD = 2;

export interface PlacedPoint {
  x: number;
  y: number;
  /** Unit normal pointing from the inner rail toward the outside of the course. */
  nx: number;
  ny: number;
  /** Direction of travel in degrees, for markers drawn across the track. */
  angle: number;
}

export interface TrackDisplayLayout {
  innerRail: string;
  outerRail: string;
  road: string;
  roadWidth: number;
  sections: { label: string; color: string; path: string }[];
  place: (distance: number, lane: number) => PlacedPoint;
  section: (start: number, end: number) => string;
}

interface LayoutInput {
  shape: CourseShape;
  course: Course;
  laneWidth: number;
  width: number;
  height: number;
  /** Space kept clear around the course for labels and runner markers, in pixels. */
  margin: number;
}

const polyline = (points: { x: number; y: number }[]) =>
  points.map((point) => point.x + ',' + point.y).join(' ');

/** Fits the full course into a pixel box so strokes and labels keep their size. */
export function trackDisplayLayout(input: LayoutInput): TrackDisplayLayout | undefined {
  const { shape, course, laneWidth, width, height, margin } = input;
  const points = replayTrack(shape);

  if (!points.length || width <= 2 * margin || height <= 2 * margin) return undefined;

  const unitsPerMetre = trackUnitsPerMetre(points) * LANE_SPREAD;
  const offset = (distance: number, lane: number) => {
    const basis = trackBasis(points, distance, course.turn);

    return {
      basis,
      x: basis.x + basis.nx * lane * unitsPerMetre,
      y: basis.y + basis.ny * lane * unitsPerMetre
    };
  };

  const outerUnits = points.map((point) => offset(point.distance, laneWidth));
  const xs = [...points, ...outerUnits].map((point) => point.x);
  const ys = [...points, ...outerUnits].map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const courseWidth = Math.max(1, Math.max(...xs) - left);
  const courseHeight = Math.max(1, Math.max(...ys) - top);
  const scale = Math.min((width - 2 * margin) / courseWidth, (height - 2 * margin) / courseHeight);

  const originX = (width - courseWidth * scale) / 2 - left * scale;
  const originY = (height - courseHeight * scale) / 2 - top * scale;
  const project = (point: { x: number; y: number }) => ({
    x: originX + point.x * scale,
    y: originY + point.y * scale
  });

  const roadPoints: TrackPoint[] = points.map((point) => ({
    ...project(offset(point.distance, laneWidth / 2)),
    distance: point.distance
  }));

  // The home stretch carries the decisive moves, so only it is tinted.
  const homeStretch = courseSegments(course).filter(
    (segment) => segment.label === 'Final corner' || segment.label === 'Final straight'
  );

  return {
    innerRail: polyline(points.map(project)),
    outerRail: polyline(outerUnits.map(project)),
    road: polyline(roadPoints),
    roadWidth: laneWidth * unitsPerMetre * scale,
    sections: homeStretch.map((segment) => ({
      label: segment.label,
      color: segment.color,
      path: trackSection(roadPoints, segment.start, segment.end)
    })),
    place: (distance, lane) => {
      const point = offset(distance, lane);

      return {
        ...project(point),
        nx: point.basis.nx,
        ny: point.basis.ny,
        angle: (Math.atan2(point.basis.ty, point.basis.tx) * 180) / Math.PI
      };
    },
    section: (start, end) => trackSection(roadPoints, start, end)
  };
}
