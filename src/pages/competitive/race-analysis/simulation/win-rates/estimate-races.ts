import type { MonteCarloResult } from '@/pages/simulator/simulator-repository';

/** A runner's place in one of the estimate's races, from 1, or undefined when it did not finish. */
export function placeIn(options: {
  result: MonteCarloResult;
  run: number;
  source: number;
}): number | undefined {
  const { result, run, source } = options;
  const index = result.finish_order[run]?.indexOf(source) ?? -1;

  return index === -1 ? undefined : index + 1;
}

/** The first of the estimate's races the runner won, or undefined when it won none. */
export function firstWin(result: MonteCarloResult, source: number): number | undefined {
  const run = result.finish_order.findIndex((order) => order[0] === source);

  return run === -1 ? undefined : run;
}
