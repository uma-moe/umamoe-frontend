import { describe, expect, it } from 'vitest';
import { applyCourseTransform, buildDistanceField, fitCourseLine } from './course-fit';

/** A square track: surface points filling the band between `inner` and `outer`, every `step` metres. */
function ring(outer: number, inner: number, step = 4): [number, number][] {
  const points: [number, number][] = [];
  for (let x = -outer; x <= outer; x += step)
    for (let z = -outer; z <= outer; z += step) {
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if (edge >= inner && edge <= outer) points.push([x, z]);
    }
  return points;
}

/** The racing line: a lap of the middle of that band. */
function lap(radius: number, count = 240): [number, number][] {
  const points: [number, number][] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }
  return points;
}

describe('buildDistanceField', () => {
  const distance = buildDistanceField(ring(100, 80));

  it('is zero on the surface and grows away from it', () => {
    expect(distance(90, 0)).toBe(0);
    expect(distance(0, 0)).toBeGreaterThan(50);
  });
});

describe('fitCourseLine', () => {
  const surface = ring(100, 80);

  it('recovers a slid and rotated line', () => {
    const truth = { mirror: false, angle: 0.4, tx: 120, tz: -70, error: 0 };
    const moved = applyCourseTransform(lap(90), truth);
    const fit = fitCourseLine(surface, moved);

    expect(fit).toBeDefined();
    // What matters is that the line lands on the track, not that the numbers match the ones used.
    expect(fit!.error).toBeLessThan(6);
  });

  it('recovers a mirrored line', () => {
    const truth = { mirror: true, angle: -1.1, tx: -40, tz: 30, error: 0 };
    const moved = applyCourseTransform(lap(90), truth);
    const fit = fitCourseLine(surface, moved);

    expect(fit).toBeDefined();
    expect(fit!.error).toBeLessThan(6);
  });

  it('recovers a partial lap, whose centre is not the track centre', () => {
    // Three quarters of a lap, so the line's own centre is nowhere near the track's.
    const truth = { mirror: true, angle: 0.9, tx: -60, tz: 140, error: 0 };
    const arc = lap(90).slice(0, 180);
    const moved = applyCourseTransform(arc, truth);
    const fit = fitCourseLine(surface, moved);

    expect(fit).toBeDefined();
    expect(fit!.error).toBeLessThan(6);
  });

  it('prefers the placement that finishes at the goal', () => {
    // A round track fits equally well however it is turned, so the goal is what says which way round the
    // course runs; anchoring must never end further from the marker than an unanchored fit does.
    const truth = { mirror: true, angle: 0, tx: 40, tz: 20, error: 0 };
    const moved = applyCourseTransform(lap(90), truth);
    const goal = moved[moved.length - 1] as [number, number];
    const reach = (transform: ReturnType<typeof fitCourseLine>) => {
      const placed = applyCourseTransform(
        [moved[moved.length - 1] as [number, number]],
        transform!
      )[0]!;
      return Math.hypot(placed[0] - goal[0], placed[1] - goal[1]);
    };

    const plain = fitCourseLine(surface, moved);
    const anchored = fitCourseLine(surface, moved, { anchor: goal });

    expect(anchored).toBeDefined();
    expect(reach(anchored)).toBeLessThanOrEqual(reach(plain) + 1);
  });

  it('gives up rather than guessing when there is nothing to fit', () => {
    expect(fitCourseLine([], lap(90))).toBeUndefined();
    expect(fitCourseLine(surface, [])).toBeUndefined();
  });
});
