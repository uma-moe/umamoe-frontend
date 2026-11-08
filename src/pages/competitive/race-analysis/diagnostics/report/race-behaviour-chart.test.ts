import { describe, expect, it } from 'vitest';
import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import { makeDemoRaces } from '@/pages/competitive/demo-races';
import { phaseSpans, placement, timeTicks } from './race-behaviour-chart';

const base = makeDemoRaces(1)[0]!;

/** A runner covering 10 m a second for 120 s. */
const steadyRace: ParsedRaceCapture = {
  ...base,
  frames: Array.from({ length: 121 }, (_, time) => ({
    time,
    horses: [
      {
        distance: time * 10,
        hp: 1000,
        lanePosition: 0,
        speed: 10,
        temptationMode: 0,
        blockFrontHorseIndex: -1
      }
    ]
  }))
};

describe('race behaviour chart', () => {
  it('steps time ticks on round seconds that fit the visible range', () => {
    expect(timeTicks(0, 150)).toEqual([0, 30, 60, 90, 120, 150]);
    expect(timeTicks(12, 31)).toEqual([15, 20, 25, 30]);
    expect(timeTicks(0, 150, 3)).toEqual([0, 60, 120]);
    expect(timeTicks(5, 5)).toEqual([]);
  });

  it('places the race phases at the runner’s own times', () => {
    const phases = phaseSpans({ capture: steadyRace, index: 0, distance: 1200, raceEnd: 120 });

    expect(phases.map(({ label, start, end }) => [label, start, end])).toEqual([
      ['Early', 0, 20],
      ['Mid', 20, 80],
      ['Late', 80, 100],
      ['Final leg', 100, 120]
    ]);
  });

  it('clips a period to the visible window and drops one out of view', () => {
    const view = { min: 20, max: 60 };

    expect(placement(30, 40, view)).toEqual({ left: 25, width: 25 });
    expect(placement(10, 30, view)).toEqual({ left: 0, width: 25 });
    expect(placement(70, 80, view)).toBeUndefined();
  });
});
