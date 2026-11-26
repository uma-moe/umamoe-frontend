// The marked course: the band laid against the rail for the selected course's racing line.
//
// The pure half turns the simulator's polyline into positions and indices, and is the part a test can
// reach without a GPU. The three.js half wraps that in geometry and a material.

import { BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial } from 'three';

/** The colour a marked course is drawn in: bright against turf and dirt alike. */
const HIGHLIGHT = 0x5ad9ff;
/** How wide the band is, in metres: one lane, which the game puts at 11.25 m across the course. */
const COURSE_LINE_WIDTH = 11.25;
/** How far outside the rail the band starts, in metres: enough to clear the fence's own thickness. */
const RAIL_CLEARANCE = 0.6;
/** How many points either side the band's side and height are smoothed over. */
const RAIL_SMOOTHING = 4;
/** How close the line's two ends have to be for the lap to count as closed on itself, in metres. */
const LAP_SEAM = 3;
/** How solid the marked course is. */
const COURSE_LINE_OPACITY = 0.6;
/** The fewest points a line needs before a band is worth laying. */
const MINIMUM_POINTS = 8;
/** The height the band falls back to when nothing measured the surface under it. */
const NO_HEIGHT = 0.5;

type Point = readonly [number, number];

export interface RibbonInput {
  /** The simulator's polyline, `[x, z]` pairs, in the course model's space. */
  points: readonly Point[];
  /** Height of the racing surface under a point, or undefined where the ray missed it. */
  heightAt: (x: number, z: number) => number | undefined;
  /** The course's centre: the side of the line that faces it is the infield. */
  centre: { x: number; z: number };
}

export interface Ribbon {
  /** Two vertices per point, interpolated by the index list below. */
  positions: number[];
  indices: number[];
  /** Whether the lap closes on itself, and the band therefore takes an end cap. */
  seam: boolean;
}

/** A point that a resolved index always has, so indexing a non-empty loop stays type-safe. */
const ORIGIN: Point = [0, 0];

/** The middle of a set of heights, so one point the ray missed cannot drag the whole band with it. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? NO_HEIGHT;
}

/**
 * Lays a racing line on the track. The simulator's course geometry is not in the model's frame, so the
 * line is fitted onto the racing surface first: the transform that lays it on the track, rather than a
 * hand-kept table of offsets per course. The band hangs off the rail rather than off the line, so its
 * inner edge meets the fence on any course, whichever lane it runs in.
 */
export function buildRibbon({ points, heightAt, centre }: RibbonInput): Ribbon | undefined {
  if (points.length < MINIMUM_POINTS) return undefined;

  // The simulator's line is the game's own lane spline, authored in the course model's space; the model's
  // X axis is the mirror of it, and that is the whole difference. No rotation, no slide, no fit: the
  // polyline is the inner rail, and lane 0 is exactly where the horses run.
  const loop: Point[] = points.map(([x, z]) => [-x, z]);

  // A lap closes on itself at the finish, so its tail repeats its head and the tangent there spins until
  // the ribbon pinches. Drop the repeat and treat the two ends as neighbours from then on.
  const endsMeet = (trail: readonly Point[]): boolean => {
    const head = trail[0];
    const tail = trail[trail.length - 1];
    if (!head || !tail) return false;
    return Math.hypot(head[0] - tail[0], head[1] - tail[1]) <= LAP_SEAM;
  };
  const seam = loop.length > MINIMUM_POINTS && endsMeet(loop);
  if (seam) while (loop.length > MINIMUM_POINTS && endsMeet(loop)) loop.pop();

  // A closed lap wraps around; an open one holds its first and last point.
  const resolve = (index: number): number => {
    if (!seam) return Math.min(Math.max(index, 0), loop.length - 1);
    return ((index % loop.length) + loop.length) % loop.length;
  };
  const pointAt = (index: number): Point => loop[resolve(index)] ?? ORIGIN;
  const normalAt = (index: number): Point => normals[resolve(index)] ?? ORIGIN;

  // One normal per point, and one side for the whole line: the shape's middle is the infield, so a
  // normal that has to turn toward it is the inward one. Both are smoothed, because a single point
  // disagreeing with its neighbours is what folds the band over itself.
  const normals: Point[] = loop.map((_, index) => {
    const [beforeX, beforeZ] = pointAt(index - 1);
    const [afterX, afterZ] = pointAt(index + 1);
    const dx = afterX - beforeX;
    const dz = afterZ - beforeZ;
    const length = Math.hypot(dx, dz) || 1;
    return [-dz / length, dx / length];
  });

  const inwardOf = (index: number): number => {
    const [x, z] = pointAt(index);
    const [nx, nz] = normalAt(index);
    return (centre.x - x) * nx + (centre.z - z) * nz > 0 ? 1 : -1;
  };
  const inwards = loop.map((_, index) => {
    let vote = 0;
    for (let offset = -RAIL_SMOOTHING; offset <= RAIL_SMOOTHING; offset += 1)
      vote += inwardOf(index + offset);
    return vote >= 0 ? 1 : -1;
  });

  // The band's height: the track steps from facet to facet, and a point the ray misses has no height at
  // all, which used to drop the band onto the model's floor for a stretch.
  const raw = loop.map(([x, z]) => heightAt(x, z));
  const known = raw.filter((value): value is number => value !== undefined);
  const floor = known.length > 0 ? median(known) : NO_HEIGHT;
  const heights = raw.map((value) => value ?? floor);
  const smoothed = heights.map((_, index) => {
    const nearby: number[] = [];
    for (let offset = -RAIL_SMOOTHING; offset <= RAIL_SMOOTHING; offset += 1)
      nearby.push(heights[resolve(index + offset)] ?? floor);
    return nearby.reduce((total, value) => total + value, 0) / nearby.length;
  });

  const positions: number[] = [];
  const indices: number[] = [];
  for (const [index, [x, z]] of loop.entries()) {
    const [nx, nz] = normals[index] ?? ORIGIN;
    const inward = inwards[index] ?? 1;
    const ix = nx * inward;
    const iz = nz * inward;
    const y = smoothed[index] ?? floor;
    // The band starts just outside the rail the line already is, and reaches a lane out into the track.
    positions.push(
      x - ix * RAIL_CLEARANCE,
      y,
      z - iz * RAIL_CLEARANCE,
      x - ix * COURSE_LINE_WIDTH,
      y,
      z - iz * COURSE_LINE_WIDTH
    );
    if (index > 0) {
      const previous = (index - 1) * 2;
      indices.push(previous, previous + 1, previous + 2, previous + 1, previous + 3, previous + 2);
    }
  }
  if (seam) {
    const last = (loop.length - 1) * 2;
    indices.push(last, last + 1, 0, last + 1, 1, 0);
  }

  return { positions, indices, seam };
}

/** The geometry and material the scene draws a ribbon with. */
export function createCourseLine(ribbon: Ribbon): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(ribbon.positions, 3));
  geometry.setIndex(ribbon.indices);
  geometry.computeBoundingSphere();

  const line: Mesh<BufferGeometry> = new Mesh(
    geometry,
    new MeshBasicMaterial({
      color: HIGHLIGHT,
      transparent: true,
      opacity: COURSE_LINE_OPACITY,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4
    })
  );
  line.renderOrder = 2;
  return line;
}
