/** A point on the map with the course distance it marks. */
export type PathPoint = { x: number; y: number; distance: number };

type ArcPoint = PathPoint & { arc: number };

/** A line across the map that text can follow, measured by arc length in pixels. */
export type RibbonPath = { d: string; points: ArcPoint[]; length: number };

const rounded = (value: number) => Math.round(value * 10) / 10;

export function pointList(points: { x: number; y: number }[]) {
  return points.map((p) => rounded(p.x) + ',' + rounded(p.y)).join(' ');
}

export function ribbonPath(points: PathPoint[]): RibbonPath {
  const measured: ArcPoint[] = [];
  let previous: ArcPoint | undefined;

  for (const point of points) {
    const arc = previous
      ? previous.arc + Math.hypot(point.x - previous.x, point.y - previous.y)
      : 0;
    previous = { ...point, arc };
    measured.push(previous);
  }

  return {
    d: points.length ? 'M' + pointList(points) : '',
    points: measured,
    length: previous?.arc ?? 0
  };
}

// Where a value read from each point first reaches a target, interpolated between two points.
function crossing(path: RibbonPath, value: (point: PathPoint) => number, target: number) {
  let previous: ArcPoint | undefined;

  for (const point of path.points) {
    const from = previous && value(previous),
      to = value(point);

    if (previous && from !== undefined && from !== to && (from - target) * (to - target) <= 0) {
      const t = (target - from) / (to - from);
      return {
        arc: previous.arc + t * (point.arc - previous.arc),
        x: previous.x + t * (point.x - previous.x),
        y: previous.y + t * (point.y - previous.y)
      };
    }

    previous = point;
  }

  return undefined;
}

export const arcAtDistance = (path: RibbonPath, distance: number) =>
  crossing(path, (point) => point.distance, distance)?.arc;

export const pointAtX = (path: RibbonPath, x: number) => crossing(path, (point) => point.x, x);

type Bounds = { left: number; right: number; top: number; bottom: number };

// The part of a segment inside the bounds, as fractions along it.
function clipSegment(from: PathPoint, to: PathPoint, bounds: Bounds) {
  const dx = to.x - from.x,
    dy = to.y - from.y;

  const edges = [
    { towards: -dx, room: from.x - bounds.left },
    { towards: dx, room: bounds.right - from.x },
    { towards: -dy, room: from.y - bounds.top },
    { towards: dy, room: bounds.bottom - from.y }
  ];

  let enter = 0,
    exit = 1;

  for (const { towards, room } of edges) {
    if (towards === 0) {
      if (room < 0) return undefined;
      continue;
    }

    const crossing = room / towards;
    if (towards < 0) enter = Math.max(enter, crossing);
    else exit = Math.min(exit, crossing);
  }

  return enter < exit ? { enter, exit } : undefined;
}

/** Where a path first comes into view and last leaves it, as arc lengths along it. */
export function visibleArcs(path: RibbonPath, bounds: Bounds) {
  let enter: number | undefined, exit: number | undefined, previous: ArcPoint | undefined;

  for (const point of path.points) {
    const clip = previous && clipSegment(previous, point, bounds);
    if (previous && clip) {
      const length = point.arc - previous.arc;
      enter ??= previous.arc + clip.enter * length;
      exit = previous.arc + clip.exit * length;
    }

    previous = point;
  }

  return enter === undefined || exit === undefined ? undefined : { enter, exit };
}
