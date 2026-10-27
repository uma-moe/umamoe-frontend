import { expect, it } from 'vitest';
import type { Course, CourseShape } from '../replay/replay-course';
import { trackDisplayLayout } from './track-display-layout';

const LANE_WIDTH = 11.25;

const course: Course = {
  raceTrackId: 10006,
  distance: 2000,
  surface: 1,
  turn: 2,
  laneMax: 11250,
  corners: [
    { start: 500, length: 500 },
    { start: 1500, length: 300 }
  ],
  straights: [
    { start: 0, end: 500 },
    { start: 1800, end: 2000 }
  ],
  slopes: []
};

const shape: CourseShape = {
  distance: 2000,
  points: Array.from({ length: 201 }, (_, index) => {
    const angle = (index / 200) * Math.PI * 2;

    return [Math.cos(angle) * 600, Math.sin(angle) * 200];
  })
};

const display = { shape, course, laneWidth: LANE_WIDTH, width: 800, height: 300, margin: 30 };

function coordinates(polyline: string) {
  return polyline.split(' ').map((pair) => pair.split(',').map(Number));
}

it('fits both rails of the full course inside the display margin', () => {
  const layout = trackDisplayLayout(display)!;

  const railPoints = [...coordinates(layout.innerRail), ...coordinates(layout.outerRail)];
  const xs = railPoints.map(([x]) => x!);
  const ys = railPoints.map(([, y]) => y!);

  expect(Math.min(...xs)).toBeGreaterThanOrEqual(display.margin - 0.01);
  expect(Math.max(...xs)).toBeLessThanOrEqual(display.width - display.margin + 0.01);
  expect(Math.min(...ys)).toBeGreaterThanOrEqual(display.margin - 0.01);
  expect(Math.max(...ys)).toBeLessThanOrEqual(display.height - display.margin + 0.01);
});

it('places the outside lane one drawn road width away from the inner rail', () => {
  const layout = trackDisplayLayout(display)!;

  const rail = layout.place(1000, 0);
  const outside = layout.place(1000, LANE_WIDTH);
  const spread = Math.hypot(outside.x - rail.x, outside.y - rail.y);

  expect(spread).toBeCloseTo(layout.roadWidth, 5);
});

it('tints only the home stretch', () => {
  const layout = trackDisplayLayout(display)!;

  expect(layout.sections.map((section) => section.label)).toEqual([
    'Final corner',
    'Final straight'
  ]);
});

it('has no layout when the display is smaller than its margins', () => {
  expect(trackDisplayLayout({ ...display, width: 50, height: 50 })).toBeUndefined();
});
