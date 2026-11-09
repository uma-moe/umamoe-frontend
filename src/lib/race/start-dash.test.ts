import { expect, it } from 'vitest';
import type { ParsedRaceCapture } from './capture/race-capture-parser';
import { startDashEnd } from './start-dash';

/** One runner's recorded speeds, as [race time in s, speed in cm/s]. */
function captureWithSpeeds(speeds: [number, number][]): ParsedRaceCapture {
  return {
    source: 'api',
    fileName: 'race.json',
    track: {},
    events: [],
    runners: [],
    frames: speeds.map(([time, speed]) => ({
      time,
      horses: [
        {
          distance: 0,
          lanePosition: 0,
          speed,
          hp: 1000,
          temptationMode: 0,
          blockFrontHorseIndex: -1
        }
      ]
    }))
  };
}

const gateStart: [number, number][] = [
  [0, 300],
  [0.6, 1650],
  [0.6666, 1720],
  [1.7, 1760]
];

it('ends the start dash one tick after the runner reaches 85% of base speed', () => {
  const capture = captureWithSpeeds(gateStart);

  const dashEnd = startDashEnd(capture, 0, 2000);

  expect(dashEnd).toBeCloseTo(0.7332, 4);
});

it('prefers the base speed the capture records over the distance', () => {
  const capture = captureWithSpeeds(gateStart);
  capture.original = { baseSpeed: 18 };

  const dashEnd = startDashEnd(capture, 0, 2000);

  expect(dashEnd).toBeCloseTo(0.6666, 4);
});

it('marks no start dash without a base speed or for a runner already at dash speed', () => {
  const flyingStart = captureWithSpeeds([
    [0, 1800],
    [1, 1800]
  ]);

  expect(startDashEnd(captureWithSpeeds(gateStart), 0, undefined)).toBe(-Infinity);
  expect(startDashEnd(flyingStart, 0, 2000)).toBe(-Infinity);
});
