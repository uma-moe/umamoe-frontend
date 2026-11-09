import { describe, expect, it } from 'vitest';
import { speedUpCheckRanges, type SpeedUpCheckRunner } from './speed-up-check';

const runner = (index: number, distance: number, extra: Partial<SpeedUpCheckRunner> = {}) => ({
  index,
  distance,
  runningStyle: 2,
  isRunaway: false,
  temptationMode: 0,
  ...extra
});

describe('speedUpCheckRanges', () => {
  it('gives a lone leading Front Runner 12.5 m, several 4.5 m', () => {
    expect(speedUpCheckRanges([runner(0, 100, { runningStyle: 1 }), runner(1, 90)], 2400)).toEqual(
      new Map([[0, 12.5]])
    );
    const two = [runner(0, 100, { runningStyle: 1 }), runner(1, 99, { runningStyle: 1 })];
    expect(speedUpCheckRanges(two, 2400)).toEqual(new Map([[0, 4.5]]));
  });

  it('skips a Front Runner who does not lead, and a rushed leader', () => {
    expect(
      speedUpCheckRanges([runner(0, 90, { runningStyle: 1 }), runner(1, 100)], 2400).size
    ).toBe(0);
    const rushed = [runner(0, 100, { runningStyle: 1, temptationMode: 2 })];
    expect(speedUpCheckRanges(rushed, 2400).size).toBe(0);
  });

  it('marks anyone rushed to the front, and Runaways at 17.5 m', () => {
    const field = [
      runner(0, 100, { runningStyle: 1, isRunaway: true }),
      runner(1, 80, { temptationMode: 3 })
    ];
    expect(speedUpCheckRanges(field, 2400)).toEqual(
      new Map([
        [0, 17.5],
        [1, 4.5]
      ])
    );
  });

  it('ends with position keeping', () => {
    expect(speedUpCheckRanges([runner(0, 1000, { runningStyle: 1 })], 2400).size).toBe(0);
  });
});
