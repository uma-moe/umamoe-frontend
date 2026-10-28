import { describe, expect, it } from 'vitest';
import type { OptimizeFinalist, RacedWins } from '../../simulator-repository';
import type { TheorizedBuild } from '../../reports/outcomes/build/build-result';
import { bestSummary } from './build-run';

const finalist: OptimizeFinalist = {
  build: { purchases: [0, 1], stats: [] },
  sp_cost: 2965,
  search: { fitness: { samples: 1, mean: 0, standard_error: 0 }, scenarios: [] },
  validation: null
};

const pick = (raced?: RacedWins): TheorizedBuild => ({
  finalist,
  lengths: 5.65,
  raced,
  hpLeft: 120,
  count: 2,
  cells: [],
  skipped: []
});

describe('the run bar’s pick', () => {
  it('names her win rate in the races that ranked the builds', () => {
    const summary = bestSummary(pick({ win_rate: 0.3663, over_pick: 0.0085, error: 0.0056 }));

    expect(summary).toBe('36.6% win rate · 2,965 SP');
  });

  it('names the lengths it gains her where no races ranked the builds', () => {
    expect(bestSummary(pick())).toBe('+5.65 L · 2,965 SP');
  });
});
