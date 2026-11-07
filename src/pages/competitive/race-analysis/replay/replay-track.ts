import type { CourseShape } from './replay-course';

// Adapted from Torena Hub's track-path.ts and canvasMath.ts for our sampled
// course geometry and SVG viewport. Playback continues to use captured frames.
// Original Torena code copyright (c) 2026 jalbarrang; used for the uma.moe merger.
export type TrackPoint = { x: number; y: number; distance: number };

export const TRACK_WIDTH = 1000,
  TRACK_HEIGHT = 340;

export function replayTrack(shape: CourseShape): TrackPoint[] {
  if (shape.points.length < 2 || !Number.isFinite(shape.distance) || shape.distance <= 0) return [];
  if (shape.points.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return [];
  const xs = shape.points.map((p) => -p[0]),
    ys = shape.points.map((p) => p[1]);

  const minX = Math.min(...xs),
    minY = Math.min(...ys);

  const width = Math.max(1, Math.max(...xs) - minX),
    height = Math.max(1, Math.max(...ys) - minY);

  const scale = Math.min((TRACK_WIDTH - 100) / width, (TRACK_HEIGHT - 80) / height);
  return shape.points.map((_, i) => ({
    x: (TRACK_WIDTH - width * scale) / 2 + (xs[i]! - minX) * scale,
    y: (TRACK_HEIGHT - height * scale) / 2 + (ys[i]! - minY) * scale,
    distance: (i * shape.distance) / (shape.points.length - 1)
  }));
}

// Straight track leading away from an end of the course, in the direction from its neighbour.
function straightExtension(
  end: TrackPoint,
  neighbour: TrackPoint,
  { metres, step }: { metres: number; step: number }
): TrackPoint[] {
  const span = Math.abs(end.distance - neighbour.distance);
  if (span === 0) return [];

  const dx = (end.x - neighbour.x) / span,
    dy = (end.y - neighbour.y) / span,
    direction = Math.sign(end.distance - neighbour.distance);

  return Array.from({ length: Math.ceil(metres / step) }, (_, index) => {
    const extra = (index + 1) * step;
    return {
      x: end.x + dx * extra,
      y: end.y + dy * extra,
      distance: end.distance + direction * extra
    };
  });
}

/** Continues the course straight past its last point, where runners pull up after the finish. */
export function withRunOut(points: TrackPoint[], metres: number, step = 5): TrackPoint[] {
  const last = points.at(-1),
    before = points.at(-2);

  if (!last || !before || last.distance <= before.distance) return points;
  return [...points, ...straightExtension(last, before, { metres, step })];
}

/** Continues the course straight back from the start, behind the gate, at negative distances. */
export function withRunIn(points: TrackPoint[], metres: number, step = 5): TrackPoint[] {
  const first = points[0],
    after = points[1];

  if (!first || !after || after.distance <= first.distance) return points;
  return [...straightExtension(first, after, { metres, step }).reverse(), ...points];
}

export function trackPointAtDistance(points: TrackPoint[], distance: number): TrackPoint {
  if (!points.length) return { x: TRACK_WIDTH / 2, y: TRACK_HEIGHT / 2, distance: 0 };

  const d = Math.max(
    points[0]!.distance,
    Math.min(points.at(-1)!.distance, Number.isFinite(distance) ? distance : 0)
  );

  let low = 0,
    high = points.length - 1;

  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle]!.distance <= d) low = middle;
    else high = middle;
  }

  const a = points[low]!,
    b = points[high]!,
    t = b.distance > a.distance ? (d - a.distance) / (b.distance - a.distance) : 0;

  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, distance: d };
}

/** The course line over a distance range, cut exactly at both ends. */
export function trackSectionPoints(points: TrackPoint[], start: number, end: number): TrackPoint[] {
  if (!points.length) return [];

  return [
    trackPointAtDistance(points, start),
    ...points.filter((p) => p.distance > start && p.distance < end),
    trackPointAtDistance(points, end)
  ];
}

/** The closed outline between two lateral edges of the course over a distance range. */
export function trackBandPoints(
  inner: TrackPoint[],
  outer: TrackPoint[],
  start: number,
  end: number
): TrackPoint[] {
  if (!inner.length || !outer.length) return [];

  return [
    ...trackSectionPoints(inner, start, end),
    ...trackSectionPoints(outer, start, end).reverse()
  ];
}

const svgPoints = (points: { x: number; y: number }[]) =>
  points.map((p) => p.x + ',' + p.y).join(' ');

export function trackSection(points: TrackPoint[], start: number, end: number): string {
  return svgPoints(trackSectionPoints(points, start, end));
}

export function trackBand(
  inner: TrackPoint[],
  outer: TrackPoint[],
  start: number,
  end: number
): string {
  return svgPoints(trackBandPoints(inner, outer, start, end));
}

export type TrackCamera = { x: number; y: number; scale: number; angle: number };

/** Space fitTrackCamera keeps between the framed points and the top and bottom of the frame. */
export const FIT_MARGIN_Y = 20;

// Fit the inspected section, including bends between its endpoints. During
// interpolation, constrain the camera so a fast seek cannot lose that section.
export function fitTrackCamera(
  points: TrackPoint[],
  width: number,
  height: number,
  top: number,
  current?: TrackCamera
): TrackCamera {
  const angle = current?.angle ?? 0,
    c = Math.cos(angle),
    s = Math.sin(angle);

  if (!points.length) return { x: TRACK_WIDTH / 2, y: TRACK_HEIGHT / 2, scale: 1, angle };

  const rotated = points.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
  const left = Math.min(...rotated.map((p) => p.x)),
    right = Math.max(...rotated.map((p) => p.x));

  const start = Math.min(...rotated.map((p) => p.y)),
    end = Math.max(...rotated.map((p) => p.y));

  const halfWidth = Math.max(1, width / 2 - 24),
    halfHeight = Math.max(1, (height - top) / 2 - FIT_MARGIN_Y);

  const fit = Math.min(
    32,
    (halfWidth * 2) / Math.max(1, right - left),
    (halfHeight * 2) / Math.max(1, end - start)
  );

  const scale = current ? Math.min(current.scale, fit) : fit * 0.8;
  const x = Math.max(
    right - halfWidth / scale,
    Math.min(left + halfWidth / scale, current ? current.x * c - current.y * s : (left + right) / 2)
  );

  const y = Math.max(
    end - halfHeight / scale,
    Math.min(
      start + halfHeight / scale,
      current ? current.x * s + current.y * c : (start + end) / 2
    )
  );

  return { x: x * c + y * s, y: -x * s + y * c, scale, angle };
}

export function trackUnitsPerMetre(points: TrackPoint[]): number {
  return points.reduce((scale, p, i) => {
    const previous = points[i - 1];
    return previous && p.distance > previous.distance
      ? Math.max(
          scale,
          Math.hypot(p.x - previous.x, p.y - previous.y) / (p.distance - previous.distance)
        )
      : scale;
  }, 0);
}

// Positive lane offsets run from the inner rail toward the outside of the course.
export function trackBasis(points: TrackPoint[], distance: number, turn = 1) {
  const point = trackPointAtDistance(points, distance),
    before = trackPointAtDistance(points, point.distance - 4),
    after = trackPointAtDistance(points, point.distance + 4);

  const dx = after.x - before.x,
    dy = after.y - before.y,
    length = Math.hypot(dx, dy) || 1,
    sign = turn === 2 ? 1 : -1;

  // Captures continue beyond the finish. Extend the endpoint tangent for positions
  // and camera framing; trackSection still draws only the recorded course geometry.
  const extra = Number.isFinite(distance) ? distance - point.distance : 0,
    span = after.distance - before.distance || 1;

  return {
    x: point.x + (dx / span) * extra,
    y: point.y + (dy / span) * extra,
    distance: point.distance + extra,
    tx: dx / length,
    ty: dy / length,
    nx: (-sign * dy) / length,
    ny: (sign * dx) / length
  };
}
