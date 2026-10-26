import { describe, expect, it } from 'vitest';
import { makeDemoRaces } from '../../demo-races';
import {
  largestSwing,
  playerUmaRecords,
  RUN_CONDITIONS,
  shareOf,
  splitBy,
  type UmaRun
} from './session-uma-records';

const races = makeDemoRaces(24);
const condition = (id: string) => RUN_CONDITIONS.find((item) => item.id === id)!;

function run(finishOrder: number, changes: Partial<UmaRun> = {}): UmaRun {
  return {
    race: 0,
    runner: races[0]!.runners[0]!,
    finishOrder,
    rushed: false,
    dueled: false,
    spotStruggle: false,
    ...changes
  };
}

describe('player Uma records', () => {
  it('keeps one record per player Uma with every run it raced', () => {
    const records = playerUmaRecords(races);
    const playerEntries = races.flatMap((capture) =>
      capture.runners.filter((runner) => runner.isPlayer)
    );

    const recordedRuns = records.reduce((total, record) => total + record.runs.length, 0);

    expect(recordedRuns).toBe(playerEntries.length);
    expect(records[0]!.runs.length).toBeGreaterThanOrEqual(records.at(-1)!.runs.length);
  });

  it('marks rushed, dueling and spot-struggle runs from the recorded race', () => {
    const race = races[0]!;
    const rushedRace = {
      ...race,
      events: [
        ...race.events,
        { frameTime: 1, type: 4, params: [1] },
        { frameTime: 2, type: 5, params: [2] }
      ],
      frames: race.frames.map((frame, index) => ({
        ...frame,
        horses: frame.horses.map((horse, horseIndex) => ({
          ...horse,
          temptationMode: horseIndex === 0 && index === 10 ? 1 : 0
        }))
      }))
    };

    const runs = playerUmaRecords([rushedRace]).flatMap((record) => record.runs);
    const byGate = (gate: number) => runs.find((item) => item.runner.index === gate)!;

    expect(byGate(0)).toMatchObject({ rushed: true, spotStruggle: false });
    expect(byGate(1).spotStruggle).toBe(true);
    expect(byGate(2).dueled).toBe(true);
    expect(byGate(1).rushed).toBe(false);
  });
});

describe('run conditions', () => {
  it('splits wins by a condition and leaves unmeasured runs out of both groups', () => {
    const runs = [
      run(1, { spurt: 'full' }),
      run(3, { spurt: 'full' }),
      run(1, { spurt: 'short' }),
      run(2)
    ];

    const split = splitBy(runs, condition('spurt'));
    const share = shareOf(runs, condition('spurt'));

    expect(split).toEqual({ with: { runs: 2, wins: 1 }, without: { runs: 1, wins: 1 } });
    expect(share).toEqual({ rate: (2 / 3) * 100, held: 2, measured: 3 });
    expect(shareOf([run(1)], condition('spurt'))).toBeUndefined();
  });

  it('finds the condition whose runs won most differently, once both sides have enough runs', () => {
    const dueling = Array.from({ length: 4 }, () => run(1, { dueled: true }));
    const quiet = Array.from({ length: 4 }, (_, index) => run(index ? 5 : 1));
    const runs = [...dueling, ...quiet, run(4, { rushed: true })];

    const swing = largestSwing(runs, 4);

    expect(swing?.condition.id).toBe('dueled');
    expect(swing?.gap).toBeCloseTo(100 - 20);
    expect(largestSwing(runs, 5)).toBeUndefined();
  });
});
