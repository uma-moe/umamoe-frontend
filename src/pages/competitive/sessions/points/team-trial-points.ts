import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/capture/race-capture-parser';
import type { TeamTrialScore } from '@/lib/race/capture/team-trial-capture';
import { raceRunnerKey } from '@/lib/race/multi-race-analysis';

export type PointSourceId =
  | 'placing'
  | 'margin'
  | 'skills'
  | 'positioning'
  | 'targetTime'
  | 'rushed'
  | 'opponentBonus'
  | 'otherBonus';

export interface PointSource {
  id: PointSourceId;
  label: string;
  color: string;
  /** A deduction, which the stacked bars leave out and the tooltip lists. */
  penalty?: true;
}

/** Score sources in the order the bars stack them: the race's own items, then the bonuses on top. */
export const POINT_SOURCES: PointSource[] = [
  { id: 'placing', label: 'Placing', color: '#3d8bfd' },
  { id: 'margin', label: 'Margin', color: '#f2a46b' },
  { id: 'skills', label: 'Skills', color: '#e0662f' },
  { id: 'positioning', label: 'Start and positioning', color: '#b4532a' },
  { id: 'targetTime', label: 'Target time', color: '#2fb380' },
  { id: 'rushed', label: 'Rushed', color: '#d65c5c', penalty: true },
  { id: 'opponentBonus', label: 'Opponent rating bonus', color: '#8d96a6' },
  { id: 'otherBonus', label: 'Ace, streak, support', color: '#c3c8d1' }
];

/** `team_stadium_score_bonus.id`; 1 Ace, 2 Opponent Rating, 4–7 streaks, 8 Support. */
const OPPONENT_RATING_BONUS = 2;

/**
 * The source of a `team_stadium_raw_score` item, by id: 1–21 margins, 22 long shot, 23–24 rushed, 25 strong start,
 * 26–57 and 97 skills, 58–59 positioning, 60–71 placings, 72–91 target time.
 */
function rawScoreSource(rawScoreId: number): PointSourceId | undefined {
  if (rawScoreId >= 1 && rawScoreId <= 22) return 'margin';
  if (rawScoreId === 23 || rawScoreId === 24) return 'rushed';
  if (rawScoreId === 25 || rawScoreId === 58 || rawScoreId === 59) return 'positioning';
  if ((rawScoreId >= 26 && rawScoreId <= 57) || rawScoreId === 97) return 'skills';
  if (rawScoreId >= 60 && rawScoreId <= 71) return 'placing';
  if (rawScoreId >= 72 && rawScoreId <= 91) return 'targetTime';
  return undefined;
}

export type PointsBySource = Record<PointSourceId, number>;

function noPoints(): PointsBySource {
  return {
    placing: 0,
    margin: 0,
    skills: 0,
    positioning: 0,
    targetTime: 0,
    rushed: 0,
    opponentBonus: 0,
    otherBonus: 0
  };
}

/** A runner's points in one race by source: each item's own points, and its bonuses apart. */
export function pointsBySource(scores: TeamTrialScore[]): PointsBySource {
  const points = noPoints();

  for (const item of scores) {
    let bonusTotal = 0;
    for (const bonus of item.bonuses) {
      bonusTotal += bonus.score;
      if (bonus.bonusId === OPPONENT_RATING_BONUS) points.opponentBonus += bonus.score;
      else points.otherBonus += bonus.score;
    }

    const source = rawScoreSource(item.rawScoreId);
    if (source !== undefined) points[source] += item.score - bonusTotal;
  }

  return points;
}

export interface BoxSummary {
  min: number;
  lowerQuartile: number;
  median: number;
  upperQuartile: number;
  max: number;
}

export interface RunnerPoints {
  key: string;
  /** The runner as she ran her latest race. */
  runner: RaceRunner;
  /** The distance categories she ran, in game order. */
  distanceTypes: number[];
  races: number;
  /** Mean points per race by source. */
  meanBySource: PointsBySource;
  meanTotal: number;
  /** The spread of her race totals; undefined below three races, which cannot show one. */
  spread?: BoxSummary;
  totals: number[];
}

export interface TeamTrialPoints {
  runners: RunnerPoints[];
  races: number;
  /** Mean race total of the player's runners. */
  runnerAverage: number;
  /** Mean team score per race, team items included. */
  teamAverage?: number;
}

const BOX_MINIMUM_RACES = 3;

function quantile(sorted: number[], fraction: number): number {
  const position = (sorted.length - 1) * fraction;
  const below = Math.floor(position);
  const above = Math.ceil(position);

  return sorted[below]! + (sorted[above]! - sorted[below]!) * (position - below);
}

export function boxSummary(values: number[]): BoxSummary | undefined {
  if (values.length < BOX_MINIMUM_RACES) return undefined;

  const sorted = values.toSorted((a, b) => a - b);
  return {
    min: sorted[0]!,
    lowerQuartile: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    upperQuartile: quantile(sorted, 0.75),
    max: sorted.at(-1)!
  };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** The points of every scoring runner over the Team Trials races, best mean first. */
export function teamTrialPoints(captures: ParsedRaceCapture[]): TeamTrialPoints | undefined {
  const races = captures.filter((capture) => capture.teamTrial !== undefined);
  const byRunner = new Map<
    string,
    { runner: RaceRunner; distanceTypes: Set<number>; races: PointsBySource[] }
  >();

  for (const capture of races) {
    for (const runner of capture.runners) {
      if (!runner.teamTrialScores?.length) continue;

      const key = raceRunnerKey(runner);
      const entry = byRunner.get(key) ?? { runner, distanceTypes: new Set(), races: [] };
      const distanceType = capture.teamTrial?.distanceType;
      entry.runner = runner;
      if (distanceType !== undefined) entry.distanceTypes.add(distanceType);
      entry.races.push(pointsBySource(runner.teamTrialScores));
      byRunner.set(key, entry);
    }
  }

  if (byRunner.size === 0) return undefined;

  const runners = [...byRunner].map(([key, entry]): RunnerPoints => {
    const meanBySource = noPoints();
    for (const source of POINT_SOURCES) {
      meanBySource[source.id] =
        sum(entry.races.map((race) => race[source.id])) / entry.races.length;
    }

    const totals = entry.races.map((race) => sum(Object.values(race)));
    return {
      key,
      runner: entry.runner,
      distanceTypes: [...entry.distanceTypes].sort((a, b) => a - b),
      races: entry.races.length,
      meanBySource,
      meanTotal: sum(totals) / totals.length,
      spread: boxSummary(totals),
      totals
    };
  });

  const allTotals = runners.flatMap((runner) => runner.totals);
  const teamTotals = races.flatMap((capture) => {
    const total = capture.teamTrial?.teamTotalScore;
    return total === undefined ? [] : [total];
  });

  return {
    runners: runners.sort((a, b) => b.meanTotal - a.meanTotal),
    races: races.length,
    runnerAverage: sum(allTotals) / allTotals.length,
    teamAverage: teamTotals.length ? sum(teamTotals) / teamTotals.length : undefined
  };
}

const DISTANCE_NAMES: Record<number, string> = {
  1: 'Sprint',
  2: 'Mile',
  3: 'Medium',
  4: 'Long',
  5: 'Dirt'
};

export function distanceName(distanceType: number | undefined): string | undefined {
  return distanceType === undefined ? undefined : DISTANCE_NAMES[distanceType];
}
