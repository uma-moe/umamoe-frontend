import { describe, expect, it } from 'vitest';
import { seededGates } from '@/lib/race/seating/game-seating';
import {
  dealtCmMoods,
  estimatedRace,
  estimateSeating,
  raceHandoff,
  runnerAtSource,
  seatedCapture,
  seatingOnSeed,
  type WinRateEstimate
} from './race-simulation';
import { capture, monteCarlo, runner } from './race-simulation-fixtures';

// Gates 1, 2, 3 listed in the capture as gate 2, gate 3, gate 1, as team-ordered captures do.
const teamOrdered = () =>
  capture([
    runner(0, { sourceIndex: 2 }),
    runner(1, { sourceIndex: 0 }),
    runner(2, { sourceIndex: 1 })
  ]);

/** Nine runners listed in the game's slot order with the gates and moods its seed dealt, in three teams by default. */
function nineRunnerRace(options: {
  seed: number;
  moods: number[];
  raceType?: string;
  teamOf?: (slot: number) => number;
}) {
  const { seed, moods, raceType, teamOf = (slot) => 1 + Math.floor(slot / 3) } = options;
  const gates = seededGates(seed, 9);
  const runners = gates.map((gate, slot) =>
    runner(gate - 1, {
      sourceIndex: slot,
      raw: { frame_order: gate, motivation: moods[slot], team_id: teamOf(slot) }
    })
  );

  return { ...capture(runners), randomSeed: seed, raceType };
}

// A CM20 race from 2026-10-11 as the game dealt it, and the same field in a room where everyone is Great.
const cmMoods = [4, 3, 2, 4, 2, 5, 3, 5, 2];
const cmRace = () => nineRunnerRace({ seed: 575300201, moods: cmMoods });
const roomMatch = () => nineRunnerRace({ seed: 575300201, moods: Array(9).fill(5) });

describe('capture order', () => {
  it('finds the runner the simulator reports by its place in the capture', () => {
    const race = teamOrdered();

    expect(runnerAtSource(race, 0)?.name).toBe('Runner 2');
    expect(runnerAtSource(race, 2)?.name).toBe('Runner 1');
  });
});

describe('a race on a new seed', () => {
  it('seats a room match in the gates the game deals and keeps its moods', () => {
    const seating = seatingOnSeed(roomMatch(), 1498120452);

    expect(seating).toEqual({ gates: [1, 5, 6, 4, 7, 2, 3, 9, 8] });
  });

  it('deals a Champions Meeting race new moods with its gates', () => {
    const seating = seatingOnSeed(cmRace(), 1262192222);

    expect(seating.gates).toEqual(seededGates(1262192222, 9));
    expect(seating.moods).toEqual([2, 5, 3, 2, 2, 4, 5, 3, 2]);
  });
});

describe('a race dealt Champions Meeting moods', () => {
  it('is a race of the Champions type or of no named type', () => {
    expect(
      dealtCmMoods(nineRunnerRace({ seed: 575300201, moods: cmMoods, raceType: 'Champions' }))
    ).toBe(true);
    expect(dealtCmMoods(cmRace())).toBe(true);
  });

  it('is never a race of another type, whatever its moods', () => {
    const roomRace = nineRunnerRace({ seed: 575300201, moods: cmMoods, raceType: 'RoomMatch' });

    expect(dealtCmMoods(roomRace)).toBe(false);
    expect(seatingOnSeed(roomRace, 1262192222).moods).toBeUndefined();
  });

  it('is never a field without three teams of three', () => {
    const noTeams = nineRunnerRace({ seed: 575300201, moods: cmMoods, teamOf: () => 0 });

    expect(dealtCmMoods(noTeams)).toBe(false);
  });
});

describe('a rerun on new gates', () => {
  it('lists the runners by the gates they were seated in', () => {
    const race = teamOrdered();

    const seated = seatedCapture(race, { gates: [3, 1, 2] });

    expect(seated.runners.map((seatedRunner) => seatedRunner.name)).toEqual([
      'Runner 3',
      'Runner 1',
      'Runner 2'
    ]);
    expect(seated.runners.map((seatedRunner) => seatedRunner.index)).toEqual([0, 1, 2]);
    expect(seated.runners.map((seatedRunner) => seatedRunner.raw.frame_order)).toEqual([1, 2, 3]);
    expect(race.runners[0]!.name).toBe('Runner 1');
  });

  it('gives each runner its new mood', () => {
    const race = teamOrdered();

    const seated = seatedCapture(race, { gates: [3, 1, 2], moods: [2, 3, 5] });

    const moodsByName = seated.runners.map((seatedRunner) => [
      seatedRunner.name,
      seatedRunner.raw.motivation
    ]);
    expect(moodsByName).toEqual([
      ['Runner 3', 3],
      ['Runner 1', 5],
      ['Runner 2', 2]
    ]);
  });

  it('keeps the recorded capture when the gates are kept', () => {
    const race = capture([runner(0)]);

    expect(seatedCapture(race, {})).toBe(race);
  });
});

describe('the seating of an estimate', () => {
  it('keeps the recorded gates and moods without random gates', () => {
    expect(estimateSeating(cmRace(), false)).toEqual({ gateOrder: 'sent', cmMoods: false });
  });

  it('deals moods with random gates only to a race that was dealt them', () => {
    expect(estimateSeating(cmRace(), true)).toEqual({ gateOrder: 'randomized', cmMoods: true });
    expect(estimateSeating(roomMatch(), true)).toEqual({ gateOrder: 'randomized', cmMoods: false });
  });
});

describe('a race of the estimate', () => {
  const result = monteCarlo(
    [
      [1, 0, 2],
      [0, 2, 1]
    ],
    {
      gates: [
        [1, 2, 3],
        [2, 3, 1]
      ],
      moods: [
        [5, 5, 5],
        [3, 4, 2]
      ]
    }
  );

  it('races again on its seed and the gates it drew', () => {
    const estimate: WinRateEstimate = { seed: 7, gateOrder: 'randomized', cmMoods: false, result };

    expect(estimatedRace(estimate, 1)).toEqual({ seed: 1001, gates: [2, 3, 1] });
  });

  it('races again on the moods it dealt', () => {
    const estimate: WinRateEstimate = { seed: 7, gateOrder: 'randomized', cmMoods: true, result };

    expect(estimatedRace(estimate, 1)).toEqual({ seed: 1001, gates: [2, 3, 1], moods: [3, 4, 2] });
  });

  it('keeps the recorded gates when the estimate did', () => {
    const estimate: WinRateEstimate = { seed: 7, gateOrder: 'sent', cmMoods: false, result };

    expect(estimatedRace(estimate, 1)).toEqual({ seed: 1001 });
  });
});

describe('the race simulator hand-off', () => {
  const race = capture([runner(0), runner(1)]);

  it('hands over the field on the recorded seed', () => {
    const handoff = raceHandoff(race, { origin: 'race.json', gateOrder: 'sent' });

    expect(handoff.umas).toHaveLength(2);
    expect(handoff).toMatchObject({
      courseId: 10506,
      raceInstanceId: 1101,
      seed: 42,
      gateOrder: 'sent',
      conditions: { ground: '2', weather: '1', season: '5' }
    });
    expect(handoff.run).toBeUndefined();
  });

  it('hands over the estimate with the seed and gates it raced on', () => {
    const result = monteCarlo([[1, 0]]);
    const estimate: WinRateEstimate = { seed: 7, gateOrder: 'randomized', cmMoods: false, result };

    const handoff = raceHandoff(race, { origin: 'race.json', gateOrder: 'sent', estimate });

    expect(handoff).toMatchObject({ seed: 7, gateOrder: 'randomized' });
    expect(handoff.run).toBe(result);
  });
});
