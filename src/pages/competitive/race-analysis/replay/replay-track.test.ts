import { expect, it } from 'vitest';
import {
  replayTrack,
  trackPointAtDistance,
  fitTrackCamera,
  trackBand,
  trackBasis,
  trackUnitsPerMetre,
  withRunIn,
  withRunOut
} from './replay-track';

it('maps capture distances onto the course without wrapping the finish', () => {
  const track = replayTrack({
    distance: 100,
    points: [
      [0, 0],
      [40, 20],
      [80, 0]
    ]
  });

  const midpoint = trackPointAtDistance(track, 25);
  expect(midpoint.x).toBeCloseTo((track[0]!.x + track[1]!.x) / 2);
  expect(midpoint.y).toBeCloseTo((track[0]!.y + track[1]!.y) / 2);
  expect(trackPointAtDistance(track, -10)).toEqual(track[0]);
  expect(trackPointAtDistance(track, 150)).toEqual(track[2]);
  expect(
    replayTrack({
      distance: 100,
      points: [
        [NaN, 0],
        [1, 1]
      ]
    })
  ).toEqual([]);
});

it('keeps the entire inspected bend visible while easing or seeking, clear of portrait labels', () => {
  const bend = [
    { x: 400, y: 170, distance: 0 },
    { x: 520, y: 40, distance: 40 },
    { x: 640, y: 170, distance: 80 }
  ];

  for (const width of [300, 1100]) {
    const height = 228,
      top = 96;

    const target = fitTrackCamera(bend, width, height, top);
    for (const camera of [
      target,
      fitTrackCamera(bend, width, height, top, { x: -400, y: 1000, scale: 64, angle: 0 })
    ]) {
      for (const p of bend) {
        const x = (p.x - camera.x) * camera.scale + width / 2;
        const y = (p.y - camera.y) * camera.scale + (height + top) / 2;
        expect(x).toBeGreaterThanOrEqual(24 - 1e-6);
        expect(x).toBeLessThanOrEqual(width - 24 + 1e-6);
        expect(y).toBeGreaterThanOrEqual(top + 20 - 1e-6);
        expect(y).toBeLessThanOrEqual(height - 20 + 1e-6);
      }
    }
  }

  expect(fitTrackCamera([{ x: 20, y: 20, distance: 0 }], 300, 186, 54).scale).toBeGreaterThan(0);
});

it('continues runner positions beyond the finish', () => {
  const points = [
    { x: 0, y: 0, distance: 0 },
    { x: 100, y: -100, distance: 100 }
  ];

  expect(trackBasis(points, 120)).toMatchObject({ x: 120, y: -120, distance: 120 });
  expect(trackBasis(points, -20)).toMatchObject({ x: -20, y: 20, distance: -20 });
});

it('fits a rotated bend horizontally while retaining all inspected points', () => {
  const bend = [
    { x: 400, y: 50, distance: 0 },
    { x: 420, y: 100, distance: 40 },
    { x: 400, y: 150, distance: 80 }
  ];

  const camera = fitTrackCamera(bend, 1000, 400, 0, {
    ...trackBasis(bend, 40),
    scale: 32,
    angle: -Math.PI / 2
  });
  const project = (p: (typeof bend)[number]) => ({
    x: (p.x - camera.x) * Math.cos(camera.angle) - (p.y - camera.y) * Math.sin(camera.angle),
    y: (p.x - camera.x) * Math.sin(camera.angle) + (p.y - camera.y) * Math.cos(camera.angle)
  });

  expect(project(bend[2]!).y).toBeCloseTo(project(bend[0]!).y);
  expect(project(bend[2]!).x).toBeGreaterThan(project(bend[0]!).x);
  for (const p of bend) {
    expect(Math.abs(project(p).x * camera.scale)).toBeLessThanOrEqual(500 - 24 + 1e-6);
    expect(Math.abs(project(p).y * camera.scale)).toBeLessThanOrEqual(200 - 20 + 1e-6);
  }
});

it('offsets captured lanes outward from the inner rail on left and right courses', () => {
  const points = [
    { x: 0, y: 0, distance: 0 },
    { x: 100, y: 0, distance: 100 }
  ];

  expect(trackUnitsPerMetre(points)).toBe(1);
  expect(trackBasis(points, 50, 1)).toMatchObject({ x: 50, y: 0, nx: 0, ny: -1 });
  expect(trackBasis(points, 50, 2)).toMatchObject({ x: 50, y: 0, ny: 1 });
  const p = trackBasis(points, 50, 1);
  expect(p.y + p.ny * 4 * trackUnitsPerMetre(points)).toBe(-4);
});

it('continues the course straight past the finish along its last direction', () => {
  const finish = [
    { x: 0, y: 0, distance: 0 },
    { x: 30, y: 40, distance: 50 }
  ];

  const extended = withRunOut(finish, 10, 5);

  expect(extended.slice(0, 2)).toEqual(finish);
  expect(extended.slice(2)).toEqual([
    { x: 33, y: 44, distance: 55 },
    { x: 36, y: 48, distance: 60 }
  ]);
});

it('continues the course straight back from the start at negative distances', () => {
  const start = [
    { x: 30, y: 40, distance: 0 },
    { x: 60, y: 80, distance: 50 }
  ];

  const extended = withRunIn(start, 10, 5);

  expect(extended.slice(0, 2)).toEqual([
    { x: 24, y: 32, distance: -10 },
    { x: 27, y: 36, distance: -5 }
  ]);
  expect(extended.slice(2)).toEqual(start);
  expect(trackPointAtDistance(extended, -7.5)).toEqual({ x: 25.5, y: 34, distance: -7.5 });
});

it('outlines a course band from the inner edge forward and the outer edge back', () => {
  const inner = [
    { x: 0, y: 0, distance: 0 },
    { x: 100, y: 0, distance: 100 }
  ];

  const outer = inner.map((p) => ({ ...p, y: 10 }));

  expect(trackBand(inner, outer, 20, 40)).toBe('20,0 40,0 40,10 20,10');
  expect(trackBand([], outer, 20, 40)).toBe('');
});
