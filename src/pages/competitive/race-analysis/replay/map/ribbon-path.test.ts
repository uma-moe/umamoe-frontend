import { expect, test } from 'vitest';
import { arcAtDistance, pointAtX, ribbonPath, visibleArcs } from './ribbon-path';

// A right angle: 100px right, then 100px down, marking 0 to 20 metres.
const corner = ribbonPath([
  { x: -50, y: 0, distance: 0 },
  { x: 50, y: 0, distance: 10 },
  { x: 50, y: 100, distance: 20 }
]);

test('a ribbon path measures arc length through its bends', () => {
  expect(corner.length).toBe(200);
  expect(arcAtDistance(corner, 15)).toBe(150);
  expect(arcAtDistance(corner, 25)).toBeUndefined();
});

test('the visible part of a ribbon path starts where it crosses the left edge', () => {
  const view = { left: 0, right: 40, top: -10, bottom: 200 };

  const visible = visibleArcs(corner, view);
  const besideMark = visibleArcs(corner, { ...view, left: 10 });

  expect(visible).toEqual({ enter: 50, exit: 90 });
  expect(besideMark).toEqual({ enter: 60, exit: 90 });
});

test('a ribbon path that curves off the bottom leaves the view at that edge', () => {
  const visible = visibleArcs(corner, { left: 0, right: 100, top: -10, bottom: 50 });

  expect(visible).toEqual({ enter: 50, exit: 150 });
});

test('a ribbon path reports where it crosses a line across the map', () => {
  const crossing = pointAtX(corner, 20);

  expect(crossing).toEqual({ arc: 70, x: 20, y: 0 });
  expect(pointAtX(corner, 80)).toBeUndefined();
});
