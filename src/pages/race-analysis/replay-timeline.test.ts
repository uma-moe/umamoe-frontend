import { expect, it } from 'vitest';
import { courseTerrain, replayTimeTicks } from './replay-timeline';

it('keeps level ground and computes elevation in metres across consecutive slopes', () => {
  const terrain = courseTerrain({ raceTrackId: 10008, distance: 1200, surface: 1, turn: 1, corners: [], straights: [], slopes: [{ start: 300, length: 100, slope: 15000 }, { start: 400, length: 100, slope: -10000 }] });
  expect(terrain.elevation).toEqual([{ distance: 0, height: 0 }, { distance: 300, height: 0 }, { distance: 400, height: 1.5 }, { distance: 500, height: .5 }, { distance: 1200, height: .5 }]);
  expect(terrain.slopes).toEqual([{ start: 0, end: 300, slope: 0 }, { start: 300, end: 400, slope: 15000 }, { start: 400, end: 500, slope: -10000 }, { start: 500, end: 1200, slope: 0 }]);
  expect(replayTimeTicks(0, 109.76)).toEqual([0, 30, 60, 90, 109.76]);
  expect(replayTimeTicks(7, 62)).toEqual([7, 20, 30, 40, 50, 62]);
  expect(replayTimeTicks(2, 2)).toEqual([2]);
});
