import { expect, test } from 'vitest';
import {
  courseFeatures,
  courseScene,
  LANE_TOP,
  laneY,
  stageGeometry,
  type CourseFeatures
} from './position-scene';

const size = { width: 1000, height: 400 };
const atRest = { moving: false, pixelRatio: 1 };
const hiddenOverlays = { course: false, slopes: false, positionKeep: false };
const noBrand = { right: 0, top: 0, bottom: 0 };

const geometryFor = (viewport: { min: number; max: number }, extra = {}) =>
  stageGeometry({ size, viewport, finishFocus: 0, fieldInset: 0, snap: atRest, ...extra });

test('the racing window ends at the race field while the course runs on beneath it', () => {
  const clear = geometryFor({ min: 100, max: 200 });
  const inset = geometryFor({ min: 100, max: 200 }, { fieldInset: 250 });

  expect(clear.display).toEqual({ min: 100, max: 200 });
  expect(inset.display.min).toBe(100);
  expect(inset.display.max).toBeCloseTo(100 + 100 / 0.75);
});

test('resting on the finish centres the racing window on the whole stage', () => {
  const geometry = geometryFor({ min: 100, max: 200 }, { fieldInset: 250, finishFocus: 1 });
  const centre = (geometry.display.min + geometry.display.max) / 2;

  expect(centre).toBeCloseTo(150);
});

test('a resting view snaps its scroll to whole device pixels and a moving one keeps fractions', () => {
  const viewport = { min: 10.0003, max: 110.0003 };

  const resting = geometryFor(viewport, { snap: { moving: false, pixelRatio: 2 } });
  const moving = geometryFor(viewport, { snap: { moving: true, pixelRatio: 2 } });

  expect(resting.scroll * 2).toBe(Math.round(resting.scroll * 2));
  expect(moving.scroll).toBeCloseTo(100.003);
});

test('lanes run from the rail clearance up to the outermost lane row', () => {
  const geometry = geometryFor({ min: 0, max: 100 });

  expect(laneY(geometry, 1)).toBe(LANE_TOP);
  expect(laneY(geometry, 0)).toBe(geometry.laneBottom);
  expect(geometry.laneBottom).toBeLessThan(geometry.railY);
});

test('only the phase changes inside the race draw start lines, each distance once', () => {
  const features = courseFeatures({
    course: undefined,
    raceDistance: 2400,
    toggles: { course: true, slopes: false, positionKeep: true }
  });
  const distances = features.startLines.map((line) => line.distance);

  expect(new Set(distances).size).toBe(distances.length);
  expect(distances.every((distance) => distance > 0 && distance < 2400)).toBe(true);
  expect(features.labels.slice(0, 2).map((label) => label.text)).toEqual(['Start', 'Finish']);
});

test('the course scene keeps what is in view, at view pixels', () => {
  const features: CourseFeatures = {
    ...courseFeatures({ course: undefined, raceDistance: 1000, toggles: hiddenOverlays }),
    startLines: [{ distance: 150, color: '#ff0000' }, { distance: 900 }]
  };
  const geometry = geometryFor({ min: 100, max: 200 });

  const scene = courseScene({
    features,
    geometry,
    keepZones: [],
    laneMax: 1000,
    laneLabel: (lane) => (lane / 100).toFixed(1),
    startLanes: [],
    gateOpen: false,
    brand: noBrand
  });

  expect(scene.startLines).toEqual([{ x: 500, color: '#ff0000' }]);
  expect(scene.boundaries).toEqual([]);
  expect(scene.finishX).toBeUndefined();
  expect(scene.gate).toBeUndefined();
  expect(scene.laneLabels.map((label) => label.text)).toEqual([
    '2.5 m',
    '5.0 m',
    '7.5 m',
    '10.0 m'
  ]);
});

test('the start gate holds every starting lane while the start is in view', () => {
  const features = courseFeatures({
    course: undefined,
    raceDistance: 1000,
    toggles: hiddenOverlays
  });
  const geometry = geometryFor({ min: -20, max: 80 });

  const scene = courseScene({
    features,
    geometry,
    keepZones: [],
    laneMax: 1000,
    laneLabel: String,
    startLanes: [200, 0, 400],
    gateOpen: true,
    brand: noBrand
  });

  expect(scene.gate?.stalls.map((stall) => stall.gate).sort()).toEqual([1, 2, 3]);
  expect(scene.gate?.open).toBe(true);
  expect(scene.boundaries).toEqual([200]);
});

test('distance labels under the brand mark give way to it, as on the course map', () => {
  const features = courseFeatures({
    course: undefined,
    raceDistance: 1000,
    toggles: hiddenOverlays
  });
  const geometry = geometryFor({ min: 0, max: 100 });
  const sceneBeside = (brand: { right: number; top: number; bottom: number }) =>
    courseScene({
      features,
      geometry,
      keepZones: [],
      laneMax: 1000,
      laneLabel: String,
      startLanes: [],
      gateOpen: false,
      brand
    });

  const markOnTheStrip = sceneBeside({ right: 132, top: 366, bottom: 392 });
  const markAboveTheStrip = sceneBeside({ right: 132, top: 200, bottom: 226 });

  expect(markOnTheStrip.distanceLabels[0]?.text).toBe('25 m');
  expect(markAboveTheStrip.distanceLabels[0]?.text).toBe('0 m');
});
