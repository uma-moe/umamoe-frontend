import { describe, expect, it } from 'vitest';
import type { ParsedRaceCapture, RaceHorseFrame } from '@/lib/race/capture/race-capture-parser';
import { makeDemoRaces } from '@/pages/competitive/demo-races';
import { fullSpurtNeedAt, hpByDistance, timeAtDistance } from './last-spurt-chart';

const base = makeDemoRaces(1)[0]!;

function horse(distance: number, hp: number): RaceHorseFrame {
  return { distance, hp, lanePosition: 0, speed: 20, temptationMode: 0, blockFrontHorseIndex: -1 };
}

function capture(track: [time: number, distance: number, hp: number][]): ParsedRaceCapture {
  return {
    ...base,
    frames: track.map(([time, distance, hp]) => ({ time, horses: [horse(distance, hp)] }))
  };
}

describe('last-spurt HP chart', () => {
  it('follows HP by distance and stops at the finish line', () => {
    const race = capture([
      [0, 0, 2000],
      [50, 1000, 1200],
      [100, 1990, 300],
      [101, 2012, 260],
      [102, 2030, 240]
    ]);

    const points = hpByDistance(race, 0, 2000);

    expect(points.map((point) => [point.distance, point.hp])).toEqual([
      [0, 2000],
      [1000, 1200],
      [1990, 300],
      [2000, 260]
    ]);
    expect(timeAtDistance(points, 1500)).toBe(100);
    expect(timeAtDistance(points, 2500)).toBe(101);
  });

  it('spreads the full-spurt need evenly from the check to the finish', () => {
    const marks = { checkDistance: 1200, needHp: 800 };

    expect(fullSpurtNeedAt(1000, marks, 2000)).toBeUndefined();
    expect(fullSpurtNeedAt(1200, marks, 2000)).toBe(800);
    expect(fullSpurtNeedAt(1600, marks, 2000)).toBe(400);
    expect(fullSpurtNeedAt(2000, marks, 2000)).toBe(0);
  });
});
