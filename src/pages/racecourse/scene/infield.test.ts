import { describe, expect, it } from 'vitest';
import { infieldFootprint } from './infield';

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

describe('infieldFootprint', () => {
  const footprint = infieldFootprint(ring(200, 60));

  it('calls the middle of the oval inside', () => {
    expect(footprint.inside(0, 0)).toBe(true);
    expect(footprint.inside(30, -20)).toBe(true);
  });

  it('calls the racing surface and the world outside it outside', () => {
    expect(footprint.inside(130, 0)).toBe(false);
    expect(footprint.inside(0, -200)).toBe(false);
    expect(footprint.inside(900, 900)).toBe(false);
  });

  it('does not leak through a gap in the surface points', () => {
    const gappy = ring(200, 60).filter(([x, z]) => !(x > 150 && Math.abs(z) < 6));
    expect(infieldFootprint(gappy).inside(0, 0)).toBe(true);
  });

  it('has no infield when there is no surface', () => {
    expect(infieldFootprint([]).inside(0, 0)).toBe(false);
  });
});
