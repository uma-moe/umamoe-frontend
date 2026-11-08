import { describe, expect, it } from 'vitest';
import { firstWin, placeIn } from './estimate-races';
import { monteCarlo } from '../race-simulation-fixtures';

describe('the estimate’s races', () => {
  const result = monteCarlo([
    [2, 0, 1],
    [0, 2, 1],
    [1, 2, 0]
  ]);

  it('places a runner in a race', () => {
    const places = [
      placeIn({ result, run: 0, source: 2 }),
      placeIn({ result, run: 0, source: 1 }),
      placeIn({ result, run: 0, source: 7 })
    ];

    expect(places).toEqual([1, 3, undefined]);
  });

  it('finds the first race each runner won', () => {
    const wins = [
      firstWin(result, 0),
      firstWin(result, 1),
      firstWin(result, 2),
      firstWin(result, 5)
    ];

    expect(wins).toEqual([1, 2, 0, undefined]);
  });
});
