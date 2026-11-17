// Fits a course's racing line onto the track model.
//
// The simulator's course geometry and the racecourse model are not in the same frame: they differ per
// track by a rotation, a slide, and in some cases a mirror. Rather than hardcode a transform per course,
// this searches for the one that lays the line on the racing surface, scoring candidates against a
// distance field built from the surface's own vertices.

/** Grid resolution in metres for the distance field. */
const CELL = 8;
/** Distance beyond which a point is simply "far away", so a bad candidate cannot dominate. */
const CAP = 24;

export interface CourseTransform {
  /** Whether the line had to be mirrored across X first. */
  mirror: boolean;
  /** Rotation in radians about Y. */
  angle: number;
  /** Slide in metres. */
  tx: number;
  tz: number;
  /** Mean distance from the fitted line to the surface, in metres. */
  error: number;
}

type Point = readonly [number, number];

/** Distance from any point on the ground to the nearest bit of surface, in metres, capped at `CAP`. */
export function buildDistanceField(surface: readonly Point[]): (x: number, z: number) => number {
  if (surface.length === 0) return () => CAP * CELL;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of surface) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const pad = CAP + 4;
  const originX = minX - CELL * pad;
  const originZ = minZ - CELL * pad;
  const columns = Math.ceil((maxX - originX) / CELL) + pad;
  const rows = Math.ceil((maxZ - originZ) / CELL) + pad;
  const at = (column: number, row: number) => row * columns + column;

  // Chebyshev distance in cells, which is close enough to Euclidean at this resolution.
  const distance = new Uint8Array(columns * rows).fill(CAP);
  const queue: number[] = [];
  for (const [x, z] of surface) {
    const column = Math.floor((x - originX) / CELL);
    const row = Math.floor((z - originZ) / CELL);
    if (column < 0 || row < 0 || column >= columns || row >= rows) continue;
    const cell = at(column, row);
    if (distance[cell] === 0) continue;
    distance[cell] = 0;
    queue.push(cell);
  }

  for (let head = 0; head < queue.length; head += 1) {
    const cell = queue[head] as number;
    const column = cell % columns;
    const row = (cell - column) / columns;
    const next = (distance[cell] as number) + 1;
    if (next >= CAP) continue;
    for (let dz = -1; dz <= 1; dz += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        const nc = column + dx;
        const nr = row + dz;
        if (nc < 0 || nr < 0 || nc >= columns || nr >= rows) continue;
        const neighbour = at(nc, nr);
        if ((distance[neighbour] as number) <= next) continue;
        distance[neighbour] = next;
        queue.push(neighbour);
      }
  }

  return (x: number, z: number) => {
    const column = Math.floor((x - originX) / CELL);
    const row = Math.floor((z - originZ) / CELL);
    if (column < 0 || row < 0 || column >= columns || row >= rows) return CAP * CELL;
    return (distance[at(column, row)] as number) * CELL;
  };
}

/** Moves the line by a transform. */
export function applyCourseTransform(line: readonly Point[], transform: CourseTransform): Point[] {
  const cos = Math.cos(transform.angle);
  const sin = Math.sin(transform.angle);
  return line.map(([x, z]) => {
    const source = transform.mirror ? -x : x;
    return [source * cos - z * sin + transform.tx, source * sin + z * cos + transform.tz] as Point;
  });
}

function score(
  line: readonly Point[],
  distance: (x: number, z: number) => number,
  transform: CourseTransform
): number {
  let total = 0;
  for (const [x, z] of applyCourseTransform(line, transform)) total += distance(x, z);
  return total / line.length;
}

/**
 * Finds the transform that lays a course's racing line on the surface. A course is only part of a lap, so
 * its centre is not the track's centre: the slide is searched across the whole track rather than matched
 * from centres, coarsely first and then finely around the best candidate.
 */
export function fitCourseLine(
  surface: readonly Point[],
  line: readonly Point[],
  options: { mirror?: boolean } = {}
): CourseTransform | undefined {
  if (surface.length < 8 || line.length < 8) return undefined;
  const distance = buildDistanceField(surface);
  // Coarse passes judge a fit from every sixteenth point, which is plenty and keeps the search quick.
  const coarse = line.filter((_, index) => index % 16 === 0);
  const mirrors = options.mirror === false ? [false] : [false, true];

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of surface) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  let best: CourseTransform | undefined;
  const consider = (candidate: CourseTransform, points: readonly Point[]) => {
    const error = score(points, distance, candidate);
    if (!best || error < best.error) best = { ...candidate, error };
  };

  const COARSE_STEP = CELL * 3;
  for (const mirror of mirrors) {
    for (let step = 0; step < 36; step += 1) {
      const angle = (step * Math.PI) / 18;
      for (let tx = minX - COARSE_STEP; tx <= maxX + COARSE_STEP; tx += COARSE_STEP)
        for (let tz = minZ - COARSE_STEP; tz <= maxZ + COARSE_STEP; tz += COARSE_STEP)
          consider({ mirror, angle, tx, tz, error: 0 }, coarse);
    }
  }
  if (!best) return undefined;

  // Refine rotation and slide around the winner, judging on every fourth point.
  const fine = line.filter((_, index) => index % 4 === 0);
  for (const [angleStep, slideStep] of [
    [Math.PI / 90, COARSE_STEP / 2],
    [Math.PI / 360, COARSE_STEP / 6]
  ] as const) {
    const from = best;
    for (let da = -4; da <= 4; da += 1)
      for (let dx = -3; dx <= 3; dx += 1)
        for (let dz = -3; dz <= 3; dz += 1)
          consider(
            {
              mirror: from.mirror,
              angle: from.angle + da * angleStep,
              tx: from.tx + dx * slideStep,
              tz: from.tz + dz * slideStep,
              error: 0
            },
            fine
          );
  }

  return best;
}
