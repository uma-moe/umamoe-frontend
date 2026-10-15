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

export function trackPointAtDistance(points: TrackPoint[], distance: number): TrackPoint {
  if (!points.length) return { x: TRACK_WIDTH / 2, y: TRACK_HEIGHT / 2, distance: 0 };

  const d = Math.max(
    0,
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

export function trackSection(points: TrackPoint[], start: number, end: number): string {
  if (!points.length) return '';
  return [
    trackPointAtDistance(points, start),
    ...points.filter((p) => p.distance > start && p.distance < end),
    trackPointAtDistance(points, end)
  ]
    .map((p) => p.x + ',' + p.y)
    .join(' ');
}

export type TrackCamera = { x: number; y: number; scale: number; angle: number };

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
    halfHeight = Math.max(1, (height - top) / 2 - 20);

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

// Use the viewport's width on straights and its height on bends; the camera spring
// smooths changes as the inspected section turns.
export function followTrackCamera(
  points: TrackPoint[],
  viewport: { min: number; max: number },
  width: number,
  height: number,
  zoom = 1,
  angle = 0
): TrackCamera {
  const window = [
    trackBasis(points, viewport.min),
    ...points.filter((p) => p.distance > viewport.min && p.distance < viewport.max),
    trackBasis(points, viewport.max)
  ];

  const centre = trackBasis(points, (viewport.min + viewport.max) / 2);
  const camera = fitTrackCamera(window, width, height, 0, { ...centre, scale: 32, angle });
  return { ...camera, scale: Math.min(32, camera.scale * 0.8 * zoom) };
}

type LabelAnchor = {
  index: number;
  x: number;
  y: number;
  nx: number;
  ny: number;
  tx: number;
  ty: number;
  progress: number;
};

type LabelOffset = { index: number; dx: number; dy: number; target?: { dx: number; dy: number } };

function segmentDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
) {
  const dx = b.x - a.x,
    dy = b.y - a.y;

  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1))
  );

  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

function labelLink(a: { x: number; y: number }, b: { x: number; y: number }, radius: number) {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1,
    scale = Math.max(0, 1 - radius / length);

  return { x: a.x + (b.x - a.x) * scale, y: a.y + (b.y - a.y) * scale };
}

function linksCross(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number }
) {
  const side = (p: typeof a, q: typeof a, r: typeof a) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);

  return side(a, b, c) * side(a, b, d) < -1e-6 && side(c, d, a) * side(c, d, b) < -1e-6;
}

// ponytail: at most three bounded passes on a seek; playback only adjusts nearby candidates.
export function placeTrackLabels(
  anchors: LabelAnchor[],
  size: number,
  bounds: { left: number; top: number; right: number; bottom: number },
  previous: LabelOffset[] = [],
  horizontal = false,
  details: { width: number; height: number; offset?: number } = { width: size, height: 0 }
): LabelOffset[] {
  const old = new Map(previous.map((p) => [p.index, p]));
  // Recover together when an old arrangement strands portraits behind the pack.
  // Keep the destination until reached, rather than choosing new sides each frame.
  if (horizontal && previous.length && anchors.every((a) => old.has(a.index))) {
    let targets = previous.some((p) => p.target)
      ? new Map(previous.map((p) => [p.index, p.target ?? p]))
      : undefined;

    if (!targets && previous.some((p) => Math.abs(p.dx) > size * 1.5)) {
      const fresh = placeTrackLabels(anchors, size, bounds, [], horizontal, details);
      const displacement = (labels: LabelOffset[]) =>
        labels.reduce((total, p) => total + p.dx * p.dx, 0);

      if (displacement(fresh) < displacement(previous) * 0.5)
        targets = new Map(fresh.map((p) => [p.index, p]));
    }

    if (targets) {
      const settled = anchors.every((a) => {
        const p = old.get(a.index)!,
          target = targets.get(a.index)!;

        return Math.hypot(p.dx - target.dx, p.dy - target.dy) < 0.01;
      });

      if (!settled)
        return anchors.map((a) => {
          const p = old.get(a.index)!,
            target = targets.get(a.index)!;

          const distance = Math.hypot(target.dx - p.dx, target.dy - p.dy),
            step = Math.min(1, 2 / (distance || 1));

          let dx = p.dx + (target.dx - p.dx) * step,
            dy = p.dy + (target.dy - p.dy) * step;

          // Travel around the runner's point when changing sides, never through it.
          const radius = Math.hypot(p.dx, p.dy),
            guard = Math.min(size / 2 + 7, Math.hypot(target.dx, target.dy)) - 0.1;

          if (
            distance > 2 &&
            segmentDistance({ x: 0, y: 0 }, { x: p.dx, y: p.dy }, { x: target.dx, y: target.dy }) <
              guard
          ) {
            const angle = Math.atan2(p.dy, p.dx),
              difference = Math.atan2(
                Math.sin(Math.atan2(target.dy, target.dx) - angle),
                Math.cos(Math.atan2(target.dy, target.dx) - angle)
              );

            const next =
              angle +
              Math.sign(difference) * Math.min(Math.abs(difference), 2 / Math.max(1, radius));

            dx = Math.cos(next) * radius;
            dy = Math.sin(next) * radius;
          }

          return { index: a.index, dx, dy, target: { dx: target.dx, dy: target.dy } };
        });
    }
  }

  const dots = new Map(anchors.map((a) => [a.index, a]));
  const placed = new Map(
    anchors.flatMap((a) => {
      const p = old.get(a.index);
      return p ? [[a.index, { x: a.x + p.dx, y: a.y + p.dy }] as const] : [];
    })
  );

  const half = size / 2,
    halfWidth = Math.max(size, details.width) / 2,
    maxDistance = 96;

  for (let pass = 0; pass < (old.size ? 1 : 3); pass++)
    for (const a of anchors) {
      const prior = old.get(a.index);
      const radius = half + 10;
      const normalY = horizontal ? Math.sign(a.ny) || -1 : a.ny;
      const preferred = { dx: horizontal ? 0 : a.nx * radius, dy: normalY * radius };

      const retained = prior ? { dx: prior.dx, dy: prior.dy } : undefined;
      const distance = prior ? Math.hypot(preferred.dx - prior.dx, preferred.dy - prior.dy) : 0;
      // Return toward the recorded position only when there is extra room. The
      // wider clearance for this candidate prevents repeated in/out corrections.
      const closer =
        prior && distance > 1
          ? {
              dx: prior.dx + (preferred.dx - prior.dx) * Math.min(1, 2 / distance),
              dy: prior.dy + (preferred.dy - prior.dy) * Math.min(1, 2 / distance)
            }
          : undefined;

      const candidates = retained
        ? [preferred, ...(closer ? [closer] : []), retained]
        : [preferred];

      const positioned = placed.get(a.index);
      if (!prior && positioned) candidates.push({ dx: positioned.x - a.x, dy: positioned.y - a.y });
      if (prior) {
        // During playback, correct overlaps locally. Never move a portrait to a
        // different row or exchange it with another runner's callout.
        for (const dx of [-2, 0, 2])
          for (const dy of [-2, 0, 2])
            if (dx || dy) candidates.push({ dx: prior.dx + dx, dy: prior.dy + dy });
      } else {
        for (const radius of [size * 0.75, size, size + 12, size + 24, size * 2, maxDistance])
          for (let step = 0; step < 16; step++) {
            const angle = (step * Math.PI) / 8;
            candidates.push({ dx: Math.sin(angle) * radius, dy: -Math.cos(angle) * radius });
          }
      }

      let best = { index: a.index, ...preferred },
        bestScore = Infinity;

      for (const candidate of candidates) {
        // Extra initial spacing gives moving portraits room before another correction.
        const padding = prior && candidate !== closer ? 12 : 16;
        const x = Math.max(
          bounds.left + halfWidth,
          Math.min(bounds.right - halfWidth, a.x + candidate.dx)
        );

        const y = Math.max(
          bounds.top + half,
          Math.min(bounds.bottom - half - details.height, a.y + candidate.dy)
        );

        const dx = x - a.x,
          dy = y - a.y;

        if (Math.hypot(dx, dy) > maxDistance + 1e-6) continue;
        let penalty = 0;
        // Every recorded point stays exposed, including the portrait's own point.
        for (const dot of anchors) {
          // Leave breathing room around other runners' positions; a technically
          // visible dot beside an unrelated portrait is still hard to identify.
          const clearance =
            dot.index === a.index || details.height
              ? Math.hypot(
                  Math.max(0, Math.abs(x - dot.x) - halfWidth),
                  Math.max(0, y - half - dot.y, dot.y - y - half - details.height)
                )
              : Math.hypot(x - dot.x, y - dot.y) - halfWidth;

          const gap = (dot.index === a.index ? 7 : 12) + (prior && candidate !== closer ? 0 : 2);
          penalty += Math.max(0, gap - clearance) ** 2;
        }

        for (const [index, p] of placed)
          if (index !== a.index)
            penalty += details.height
              ? Math.min(
                  Math.max(0, halfWidth * 2 + padding - Math.abs(x - p.x)),
                  Math.max(0, size + details.height + padding - Math.abs(y - p.y))
                ) ** 2
              : Math.max(0, halfWidth * 2 + padding - Math.hypot(x - p.x, y - p.y)) ** 2;
        const portrait = { x, y },
          end = labelLink(a, portrait, half + 3);

        let connection = 0,
          crossings = 0;

        for (const [index, p] of placed)
          if (index !== a.index) {
            const dot = dots.get(index)!;
            const otherEnd = labelLink(dot, p, half + 3);
            // Neither connection may run through the other runner's portrait.
            connection += Math.max(0, half + 4 - segmentDistance(p, a, end)) ** 2;
            connection += Math.max(0, half + 4 - segmentDistance(portrait, dot, otherEnd)) ** 2;
            if (linksCross(a, end, dot, otherEnd)) crossings++;
          }

        for (const dot of anchors)
          if (dot.index !== a.index && Math.hypot(dot.x - a.x, dot.y - a.y) > 8)
            connection += Math.max(0, 7 - segmentDistance(dot, a, end)) ** 2;
        const drift = prior ? (dx - prior.dx) ** 2 + (dy - prior.dy) ** 2 : 0;
        const unclamped = Math.abs(dx - candidate.dx) + Math.abs(dy - candidate.dy) < 1e-6;
        if (prior && candidate === preferred) {
          const start = { x: a.x + prior.dx, y: a.y + prior.dy };

          // A local overlap penalty can trap a portrait beside an old pack.
          // Take small steps back when the whole portrait can safely pass through.
          const clearPath =
            anchors.every((dot) => segmentDistance(dot, start, portrait) >= half + 5) &&
            [...placed].every(
              ([index, p]) => index === a.index || segmentDistance(p, start, portrait) >= size + 2
            );

          if (penalty < 1e-8 && connection < 1e-8 && !crossings && unclamped && clearPath) {
            const step = Math.min(1, 2 / (distance || 1));
            best = {
              index: a.index,
              dx: prior.dx + (preferred.dx - prior.dx) * step,
              dy: prior.dy + (preferred.dy - prior.dy) * step
            };

            break;
          }

          continue;
        }

        if (
          (candidate === preferred ||
            candidate === closer ||
            (candidate === retained && distance < 8)) &&
          penalty < 1e-8 &&
          connection < 1e-8 &&
          !crossings &&
          unclamped
        ) {
          best = { index: a.index, dx, dy };

          break;
        }

        // Keep longitudinal displacement small so portraits still read in race
        // order; the course-normal direction has more room for separation.
        const along = horizontal ? dx : dx * a.tx + dy * a.ty;
        const outward = horizontal ? dy * normalY : dx * a.nx + dy * a.ny;
        const sideways = Math.max(0, Math.abs(along) - size * 1.5);
        const score =
          (penalty > 1e-8 ? 1e9 : 0) +
          penalty * 1e6 +
          crossings * 1e6 +
          connection * 1e4 +
          (outward < radius ? 2000 : 0) +
          dx * dx +
          dy * dy +
          drift * 4 +
          along * along * 2 +
          sideways * sideways * 40;

        if (score < bestScore) {
          bestScore = score;
          best = { index: a.index, dx, dy };
        }
      }

      placed.set(a.index, { x: a.x + best.dx, y: a.y + best.dy });
    }

  return anchors.map((a) => ({
    index: a.index,
    dx: placed.get(a.index)!.x - a.x,
    dy: placed.get(a.index)!.y - a.y
  }));
}

// Text moves independently of portraits so enabling overlays does not reshuffle the field.
export function placeTrackCaption(
  candidates: { x: number; y: number }[],
  width: number,
  height: number,
  obstacles: { x: number; y: number; radius: number; width?: number; height?: number }[],
  bounds: { width: number; height: number }
) {
  let best = candidates[0]!,
    bestScore = Infinity;

  for (const candidate of candidates) {
    const x = Math.max(width / 2 + 4, Math.min(bounds.width - width / 2 - 4, candidate.x));
    const y = Math.max(4, Math.min(bounds.height - height - 4, candidate.y));
    const overlap = obstacles.reduce((total, p) => {
      const distance = Math.hypot(
        Math.max(0, Math.abs(x - p.x) - (width + (p.width ?? 0)) / 2),
        Math.max(0, Math.abs(y + height / 2 - p.y) - (height + (p.height ?? 0)) / 2)
      );

      return total + Math.max(0, p.radius + 4 - distance) ** 2;
    }, 0);

    if (overlap < 1e-8) return { x, y };

    const score = overlap * 1e4 + (x - candidates[0]!.x) ** 2 + (y - candidates[0]!.y) ** 2;
    if (score < bestScore) {
      best = { x, y };

      bestScore = score;
    }
  }

  return best;
}
