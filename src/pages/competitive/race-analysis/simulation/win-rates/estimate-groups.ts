import {
  runnersInCaptureOrder,
  type ParsedRaceCapture,
  type RaceRunner
} from '@/lib/race/capture/race-capture-parser';
import type { MonteCarloResult } from '@/pages/simulator/simulator-repository';
import { simulatorResults } from '@/pages/simulator/simulator-results';
import { runnerTeam } from '../race-simulation';

export interface RunnerOdds {
  /** The runner's position in the capture, which the simulator reports it by. */
  source: number;
  runner?: RaceRunner;
  wins: number;
  winRate: number;
  /** Races finished in each place, first place first. */
  finishes: number[];
}

export interface TeamOdds {
  kind: 'team';
  team: number;
  label: string;
  /** The team the player raced. */
  own: boolean;
  wins: number;
  winRate: number;
  runners: RunnerOdds[];
}

export type OddsGroup = TeamOdds | { kind: 'field'; runners: RunnerOdds[] };

const PODIUM = 3;

/**
 * The estimate's runners by team: teams best first, each named after its trainer, with its members in the capture's
 * order. A race without teams is one group of the whole field, best first.
 */
export function oddsGroups(capture: ParsedRaceCapture, result: MonteCarloResult): OddsGroup[] {
  const inCaptureOrder = runnersInCaptureOrder(capture.runners);
  const odds = simulatorResults(result, inCaptureOrder.length)
    .map((entry): RunnerOdds => ({
      source: entry.source,
      runner: inCaptureOrder[entry.source],
      wins: entry.wins,
      winRate: entry.winRate,
      finishes: entry.finishes
    }))
    .sort((a, b) => a.source - b.source);

  const teams = new Map<number, RunnerOdds[]>();
  for (const entry of odds) {
    const team = entry.runner ? runnerTeam(entry.runner) : undefined;
    if (team === undefined) continue;

    teams.set(team, [...(teams.get(team) ?? []), entry]);
  }

  if (teams.size < 2) {
    return [{ kind: 'field', runners: odds.toSorted((a, b) => b.winRate - a.winRate) }];
  }

  return [...teams]
    .sort(([a], [b]) => a - b)
    .map(([team, runners], position) => teamOdds({ result, team, runners, position }))
    .sort((a, b) => b.winRate - a.winRate);
}

function teamOdds(options: {
  result: MonteCarloResult;
  team: number;
  runners: RunnerOdds[];
  position: number;
}): TeamOdds {
  const { result, team, runners, position } = options;
  const members = new Set(runners.map((entry) => entry.source));
  const wins = result.finish_order.filter((order) => members.has(order[0]!)).length;

  return {
    kind: 'team',
    team,
    label: runners[0]?.runner?.trainerName ?? 'Team ' + (position + 1),
    own: runners.some((entry) => entry.runner?.isPlayer),
    wins,
    winRate: result.runs ? (wins / result.runs) * 100 : 0,
    runners
  };
}

/** How often the runner finished on the podium, as a percentage of the races. */
export function topThreeRate(odds: RunnerOdds, races: number) {
  if (races === 0) return 0;

  const podiums = odds.finishes.slice(0, PODIUM).reduce((sum, count) => sum + count, 0);
  return (podiums / races) * 100;
}

export function runnerName(odds: RunnerOdds) {
  return odds.runner?.name ?? 'Runner ' + (odds.source + 1);
}
