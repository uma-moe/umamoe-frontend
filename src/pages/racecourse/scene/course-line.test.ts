import { describe, expect, it } from 'vitest';
import { buildRibbon } from './course-line';

type Point = [number, number];

/** A 100 m square lap in model space: three points per side, and the tail repeating the head. */
const CORNERS: Point[] = [
  [-50, -50],
  [50, -50],
  [50, 50],
  [-50, 50]
];

const WITHOUT_SEAM = walkSides(3);

/** Walks the square's sides with three points each, without closing the lap. */
function walkSides(count: number): Point[] {
  const walk: Point[] = [];
  for (let side = 0; side < count; side += 1) {
    const [x, z] = CORNERS[side] ?? [0, 0];
    const [nextX, nextZ] = CORNERS[(side + 1) % CORNERS.length] ?? [0, 0];
    for (let step = 0; step < 3; step += 1) {
      const share = step / 3;
      walk.push([x + (nextX - x) * share, z + (nextZ - z) * share]);
    }
  }
  return walk;
}

function squareLap(): Point[] {
  const [firstX, firstZ] = CORNERS[0] ?? [0, 0];
  return [...WITHOUT_SEAM, ...walkSides(4), [firstX, firstZ]];
}

/** The simulator hands the line over mirrored on X, which is the only transform applied. */
function simulatorLine(model: readonly Point[]): Point[] {
  return model.map(([x, z]) => [-x, z]);
}

/** Vertex `index` of point `point`: the rail side, then the lane out into the track. */
function vertexAt(positions: number[], point: number, side: 0 | 1): [number, number, number] {
  const base = point * 6 + side * 3;
  return [positions[base] ?? 0, positions[base + 1] ?? 0, positions[base + 2] ?? 0];
}

const FLAT = () => 1;

describe('buildRibbon', () => {
  it('drops the repeated finish and caps the band when the lap closes on itself', () => {
    const model = squareLap();
    const ribbon = buildRibbon({
      points: simulatorLine(model),
      heightAt: FLAT,
      centre: { x: 0, z: 0 }
    });

    expect(ribbon).toBeDefined();
    if (!ribbon) return;

    expect(ribbon.seam).toBe(true);
    // 13 points in, the head's repeat dropped, two vertices each.
    expect(ribbon.positions).toHaveLength((model.length - 1) * 6);
    // A quad per gap, plus the six indices that close the last gap back onto the first point.
    expect(ribbon.indices).toHaveLength((model.length - 2) * 6 + 6);
  });

  it('keeps an open line open, ends and all', () => {
    const ribbon = buildRibbon({
      points: simulatorLine(WITHOUT_SEAM),
      heightAt: FLAT,
      centre: { x: 0, z: 0 }
    });

    expect(ribbon).toBeDefined();
    if (!ribbon) return;

    expect(ribbon.seam).toBe(false);
    expect(ribbon.positions).toHaveLength(WITHOUT_SEAM.length * 6);
    expect(ribbon.indices).toHaveLength((WITHOUT_SEAM.length - 1) * 6);
  });

  it('lays the band a lane wide, hung just outside the rail, at one height', () => {
    const ribbon = buildRibbon({
      points: simulatorLine(squareLap()),
      heightAt: FLAT,
      centre: { x: 0, z: 0 }
    });
    if (!ribbon) throw new Error('expected a ribbon');

    const points = ribbon.positions.length / 6;
    for (let point = 0; point < points; point += 1) {
      const rail = vertexAt(ribbon.positions, point, 0);
      const lane = vertexAt(ribbon.positions, point, 1);

      expect(Math.hypot(lane[0] - rail[0], lane[2] - rail[2])).toBeCloseTo(11.25 - 0.6, 6);
      expect(rail[1]).toBeCloseTo(1, 6);
      expect(lane[1]).toBeCloseTo(1, 6);
    }
  });

  it('lays the band on the track side of the line, facing the course centre', () => {
    const model = squareLap();
    const ribbon = buildRibbon({
      points: simulatorLine(model),
      heightAt: FLAT,
      centre: { x: 0, z: 0 }
    });
    if (!ribbon) throw new Error('expected a ribbon');

    for (let point = 0; point < ribbon.positions.length / 6; point += 1) {
      const [lineX, lineZ] = model[point] ?? [0, 0];
      const lineFromCentre = Math.hypot(lineX, lineZ);
      const [x, , z] = vertexAt(ribbon.positions, point, 0);

      expect(Math.hypot(x, z)).toBeGreaterThan(lineFromCentre);
    }
  });

  it('fills a missed measurement with the floor instead of dropping the band', () => {
    // The far corner's rays all miss; the rest of the lap measures 2 m.
    const heightAt = (x: number, z: number): number | undefined => (x > 0 && z > 0 ? undefined : 2);

    const ribbon = buildRibbon({
      points: simulatorLine(squareLap()),
      heightAt,
      centre: { x: 0, z: 0 }
    });
    if (!ribbon) throw new Error('expected a ribbon');

    for (let point = 0; point < ribbon.positions.length / 6; point += 1) {
      const [, y] = vertexAt(ribbon.positions, point, 0);
      expect(y).toBeGreaterThan(1.9);
      expect(y).toBeLessThan(2.1);
    }
  });

  it('refuses a line too short to carry a band', () => {
    const ribbon = buildRibbon({
      points: simulatorLine(WITHOUT_SEAM.slice(0, 7)),
      heightAt: FLAT,
      centre: { x: 0, z: 0 }
    });

    expect(ribbon).toBeUndefined();
  });
});
