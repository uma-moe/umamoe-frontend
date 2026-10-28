import { winRateInterval } from '@/lib/race/win-rate-interval';
import type { SimulatorUma } from '../../../simulator-uma';

export type TeamResult = {
  id: number;
  umas: SimulatorUma[];
  wins: number;
  successes: number;
  errors: number;
  rankTotal: number;
};

export type TeamRaceResult = { seed: number; finish_order?: number[]; error?: string };

export const teamRate = (team: TeamResult) =>
  team.successes ? (team.wins / team.successes) * 100 : 0;

export const teamInterval = (team: TeamResult) => winRateInterval(team.wins, team.successes);
export const teamBestPlace = (team: TeamResult) =>
  team.successes ? team.rankTotal / team.successes : 0;

/** Keep the best 50 teams; the rest are only counted. */
export function rankTeams(top: TeamResult[], record: TeamResult): TeamResult[] {
  return [...top, record]
    .sort(
      (a, b) =>
        b.wins / b.successes - a.wins / a.successes ||
        a.rankTotal / a.successes - b.rankTotal / b.successes ||
        a.id - b.id
    )
    .slice(0, 50);
}

/** Every result answers the race sent at its index with a complete nine-runner finish order. */
export function resultsMatchJobs(results: TeamRaceResult[], jobs: { seed: number }[]): boolean {
  return !(
    results.length !== jobs.length ||
    results.some(
      (result, index) =>
        result.seed !== jobs[index]!.seed ||
        (!result.error &&
          (!result.finish_order ||
            result.finish_order.length !== 9 ||
            new Set(result.finish_order).size !== 9 ||
            result.finish_order.some(
              (source) => !Number.isInteger(source) || source < 0 || source > 8
            )))
    )
  );
}
