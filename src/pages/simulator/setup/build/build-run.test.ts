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
  value: 5.65,
  raced,
  hpLeft: 120,
  count: 2,
  cells: [],
  skipped: []
});

describe('the run bar’s pick', () => {
  it('summarizes the purchases instead of promoting an internal win rate', () => {
    const summary = bestSummary(pick({ win_rate: 0.3663, over_pick: 0.0085, error: 0.0056 }));

    expect(summary).toBe('2 skills · 2,965 SP');
  });

  it('uses the same summary when no comparison races ranked the builds', () => {
    expect(bestSummary(pick())).toBe('2 skills · 2,965 SP');
  });

  it('handles a single recommendation and an empty recommendation', () => {
    expect(bestSummary({ ...pick(), count: 1 })).toBe('1 skill · 2,965 SP');
    expect(bestSummary({ ...pick(), count: 0 })).toBe('No additional skills recommended');
  });
});
