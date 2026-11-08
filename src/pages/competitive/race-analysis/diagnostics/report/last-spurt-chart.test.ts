import { describe, expect, it } from 'vitest';
import type { ParsedRaceCapture, RaceHorseFrame } from '@/lib/race/capture/race-capture-parser';
import { makeDemoRaces } from '@/pages/competitive/demo-races';
import {
  chartStartDistance,
  fullSpurtNeedAt,
  hpByDistance,
  hpFrom,
  timeAtDistance
} from './last-spurt-chart';

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

  it('opens on a round distance shortly before the check', () => {
    expect(chartStartDistance({ checkDistance: 1200 }, 2000)).toBe(1100);
    expect(chartStartDistance({ checkDistance: 1960 }, 2000)).toBe(1900);
    expect(chartStartDistance({ checkDistance: 20 }, 2000)).toBe(0);
  });

  it('shows the whole race without a check', () => {
    expect(chartStartDistance({}, 2000)).toBe(0);
  });

  it('keeps the HP point before the start so the line reaches the edge', () => {
    const points = [0, 900, 1050, 1150, 2000].map((distance, time) => ({ distance, hp: 0, time }));

    const shown = hpFrom(points, 1100);

    expect(shown.map((point) => point.distance)).toEqual([1050, 1150, 2000]);
    expect(hpFrom(points, 2500)).toEqual([]);
  });
});
