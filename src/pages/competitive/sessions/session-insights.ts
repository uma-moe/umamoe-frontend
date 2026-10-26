import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/capture/race-capture-parser';
import {
  raceRunnerKey,
  type MultiRaceAnalysis,
  type MultiRaceSkillStats,
  type MultiRaceStrategyStats
} from '@/lib/race/multi-race-analysis';
import { winRateInterval } from '@/lib/race/win-rate-interval';
import type { SaturationBucket } from '../hakuraku-types';
import { rate, score } from '../analysis-view';
import type { SessionComposition, SessionEntry } from './session-statistics';

/**
 * Rates from fewer appearances than this move by 20 points or more on a single result,
 * so the views mark them instead of presenting them as findings.
 */
export const SMALL_SAMPLE = 5;

/** Races a style count needs before the saturation chart plots it; a single race is all noise. */
export const SATURATION_MIN_RACES = 2;

/** Win rates, in percent, that every Uma and every team would share if all were equally strong. */
export interface SessionBaseline {
  uma: number;
  team?: number;
}

export interface PlayerRecord {
  /** Races with at least one of the player's runners. */
  races: number;
  /** Races one of the player's runners won. */
  wins: number;
  /** Races where the player's best runner finished in the top three. */
  podiums: number;
}

export interface StyleShare {
  style: number;
  entries: number;
  wins: number;
  fieldShare: number;
  winShare: number;
}

export interface RaceSummary {
  race: number;
  winner: RaceRunner;
  time: number;
  /** Seconds between the winner and the runner-up. */
  margin?: number;
  /** The best finish among the player's runners, when the capture identifies them. */
  playerBest?: number;
}

export interface GateRecord {
  gate: number;
  starts: number;
  wins: number;
}

/** Training scores of the whole field and of the winners, binned together so their shapes compare. */
export interface ScoreSummary {
  fieldAverage: number;
  winnerAverage: number;
  /** Each bin's centre score. */
  bins: number[];
  /** Percent of rated entries in each bin. */
  field: number[];
  /** Percent of rated winners in each bin. */
  winners: number[];
}

export function isSmallSample(appearances: number) {
  return appearances < SMALL_SAMPLE;
}

export function sessionBaseline(analysis: MultiRaceAnalysis): SessionBaseline {
  const teamRaces = analysis.teams.reduce((total, team) => total + team.appearances, 0);

  return {
    uma: rate(analysis.races, analysis.entries.length),
    team: teamRaces ? rate(analysis.races, teamRaces) : undefined
  };
}

export function playerBestFinish(capture: ParsedRaceCapture) {
  const finishes = capture.runners
    .filter((runner) => runner.isPlayer)
    .map((runner) => runner.result?.finishOrder)
    .filter((order) => order !== undefined);

  return finishes.length ? Math.min(...finishes) : undefined;
}

export function playerRecord(captures: ParsedRaceCapture[]): PlayerRecord | undefined {
  const record: PlayerRecord = { races: 0, wins: 0, podiums: 0 };

  for (const capture of captures) {
    const best = playerBestFinish(capture);
    if (best === undefined) continue;

    record.races++;
    record.wins += Number(best === 1);
    record.podiums += Number(best <= 3);
  }

  return record.races ? record : undefined;
}

export function styleShares(analysis: MultiRaceAnalysis): StyleShare[] {
  return analysis.strategies
    .filter((row) => row.strategy > 0)
    .map((row) => ({
      style: row.strategy,
      entries: row.races,
      wins: row.wins,
      fieldShare: rate(row.races, analysis.entries.length),
      winShare: rate(row.wins, analysis.races)
    }));
}

/** The styles that won furthest above and below their share of the field, among styles with enough entries. */
export function styleStandouts(shares: StyleShare[]) {
  const gap = (row: StyleShare) => row.winShare - row.fieldShare;
  const ranked = shares
    .filter((row) => !isSmallSample(row.entries))
    .sort((a, b) => gap(b) - gap(a));
  const strongest = ranked[0],
    weakest = ranked.at(-1);

  return {
    strongest: strongest && gap(strongest) > 0 ? strongest : undefined,
    weakest: weakest && weakest !== strongest && gap(weakest) < 0 ? weakest : undefined
  };
}

/** The best win rate among Umas entered often enough for the rate to mean something. */
export function standoutUma(analysis: MultiRaceAnalysis) {
  return analysis.characters
    .filter((uma) => uma.wins > 0 && !isSmallSample(uma.races))
    .sort((a, b) => rate(b.wins, b.races) - rate(a.wins, a.races) || b.races - a.races)[0];
}

export function standoutComposition(compositions: SessionComposition[]) {
  return compositions
    .filter((row) => row.wins > 0 && !isSmallSample(row.appearances))
    .sort(
      (a, b) =>
        rate(b.wins, b.appearances) - rate(a.wins, a.appearances) || b.appearances - a.appearances
    )[0];
}

export function raceSummaries(captures: ParsedRaceCapture[]): RaceSummary[] {
  return captures.flatMap((capture, race) => {
    const winner = capture.runners.find((runner) => runner.result?.finishOrder === 1);
    const time = winner?.result?.finishTime;
    if (!winner || time === undefined) return [];

    const runnerUp = capture.runners.find((runner) => runner.result?.finishOrder === 2);
    const runnerUpTime = runnerUp?.result?.finishTime;

    return [
      {
        race,
        winner,
        time,
        margin: runnerUpTime === undefined ? undefined : runnerUpTime - time,
        playerBest: playerBestFinish(capture)
      }
    ];
  });
}

/** A style's per-runner win rate by how many runners in the room shared it, in CM Data's bucket shape. */
export function saturationBuckets(row: MultiRaceStrategyStats): SaturationBucket[] {
  return row.saturation
    .map((bucket) => {
      // Every race with `count` runners of the style adds `count` entries to the bucket.
      const races = bucket.races / bucket.count;
      const [lower, upper] = winRateInterval(bucket.wins, bucket.races);

      return {
        x: bucket.count,
        rate: bucket.wins / bucket.races,
        wins: bucket.wins,
        entries: bucket.races,
        races,
        ci: [lower / 100, upper / 100] satisfies [number, number],
        supported: races >= SATURATION_MIN_RACES
      };
    })
    .filter((bucket) => bucket.supported);
}

/** An opposing Uma that finished ahead of every other opponent: the runner the player had to beat. */
export interface OpponentRecord {
  key: string;
  name: string;
  cardId?: number;
  /** Races where this Uma was the best-placed opponent. */
  races: number;
  /** Of those, races it won outright. */
  wins: number;
  finishTotal: number;
}

/** Hakuraku's "best placing opponent": in each race with player runners, the opponent that finished first among the rest. */
export function bestPlacingOpponents(captures: ParsedRaceCapture[]) {
  const opponents = new Map<string, OpponentRecord>();
  let races = 0;

  for (const capture of captures) {
    if (!capture.runners.some((runner) => runner.isPlayer)) continue;

    const best = capture.runners
      .filter((runner) => !runner.isPlayer && runner.result !== undefined)
      .sort((a, b) => (a.result?.finishOrder ?? 0) - (b.result?.finishOrder ?? 0))[0];
    const finish = best?.result?.finishOrder;
    if (!best || finish === undefined) continue;

    const key = raceRunnerKey(best);
    const record = opponents.get(key) ?? {
      key,
      name: best.name,
      cardId: best.cardId,
      races: 0,
      wins: 0,
      finishTotal: 0
    };

    races++;
    record.races++;
    record.wins += Number(finish === 1);
    record.finishTotal += finish;
    opponents.set(key, record);
  }

  return {
    races,
    rows: [...opponents.values()].sort((a, b) => b.races - a.races || b.wins - a.wins)
  };
}

export interface ScoreAverages {
  player?: number;
  opponents?: number;
  /** The best-placed opponent of each race with player runners. */
  bestOpponents?: number;
}

/** Average training scores of the player's runners, their opponents and the opponent that finished best. */
export function scoreAverages(captures: ParsedRaceCapture[]): ScoreAverages {
  const player: number[] = [],
    opponents: number[] = [],
    bestOpponents: number[] = [];

  for (const capture of captures) {
    if (!capture.runners.some((runner) => runner.isPlayer)) continue;

    const rated = capture.runners.filter((runner) => score(runner) > 0);
    player.push(...rated.filter((runner) => runner.isPlayer).map(score));

    const rivals = rated
      .filter((runner) => !runner.isPlayer)
      .sort((a, b) => (a.result?.finishOrder ?? 99) - (b.result?.finishOrder ?? 99));
    opponents.push(...rivals.map(score));
    if (rivals[0]) bestOpponents.push(score(rivals[0]));
  }

  return {
    player: mean(player),
    opponents: mean(opponents),
    bestOpponents: mean(bestOpponents)
  };
}

function mean(values: number[]) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : undefined;
}

export const FRONT_RUNNER = 1;

/** How many runners of each running style shared a room, how often that mix came up and which style won it. */
export interface RoomComposition {
  key: string;
  /** Runners of each style, in the order of the styles it was built for. */
  counts: number[];
  races: number;
  /** Races won by each style, in the same order. */
  wins: number[];
}

export function roomCompositions(
  captures: ParsedRaceCapture[],
  styles: number[]
): RoomComposition[] {
  const rooms = new Map<string, RoomComposition>();

  for (const capture of captures) {
    const counts = styles.map(
      (style) => capture.runners.filter((runner) => runner.result?.runningStyle === style).length
    );
    const key = counts.join('-');
    const room = rooms.get(key) ?? { key, counts, races: 0, wins: styles.map(() => 0) };
    const winnerStyle = capture.runners.find((runner) => runner.result?.finishOrder === 1)?.result
      ?.runningStyle;
    const winnerIndex = winnerStyle === undefined ? -1 : styles.indexOf(winnerStyle);

    room.races++;
    if (winnerIndex >= 0) room.wins[winnerIndex] = (room.wins[winnerIndex] ?? 0) + 1;
    rooms.set(key, room);
  }

  return [...rooms.values()].sort((a, b) => b.races - a.races || a.key.localeCompare(b.key));
}

/** Runners of each style in the average room, in the order of `styles`. */
export function averageRoom(rooms: RoomComposition[], styles: number[]) {
  const races = rooms.reduce((total, room) => total + room.races, 0);

  return styles.map((_, index) =>
    races
      ? rooms.reduce((total, room) => total + (room.counts[index] ?? 0) * room.races, 0) / races
      : 0
  );
}

/**
 * Races without a Front Runner, where a Pace Chaser takes the lead instead. Hakuraku calls this
 * pace promotion.
 */
export function leaderlessRooms(captures: ParsedRaceCapture[]) {
  return captures.filter(
    (capture) => !capture.runners.some((runner) => runner.result?.runningStyle === FRONT_RUNNER)
  ).length;
}

/** Starts and wins by gate; a runner's index is its gate once the capture is in gate order. */
export function gateRecords(entries: SessionEntry[]): GateRecord[] {
  const gates = Math.max(0, ...entries.map((entry) => entry.runner.index + 1));
  const records = Array.from({ length: gates }, (_, index) => ({
    gate: index + 1,
    starts: 0,
    wins: 0
  }));

  for (const { runner } of entries) {
    const record = records[runner.index];
    if (!record) continue;

    record.starts++;
    record.wins += Number(runner.result?.finishOrder === 1);
  }

  return records;
}

export function scoreSummary(entries: SessionEntry[], binCount = 10): ScoreSummary | undefined {
  const rated = entries
    .map((entry) => ({ score: score(entry.runner), won: entry.runner.result?.finishOrder === 1 }))
    .filter((entry) => entry.score > 0);

  const winners = rated.filter((entry) => entry.won);
  if (!winners.length) return undefined;

  const scores = rated.map((entry) => entry.score);
  const min = Math.min(...scores),
    step = (Math.max(...scores) - min || 1) / binCount;

  const field = Array<number>(binCount).fill(0),
    winnerCounts = Array<number>(binCount).fill(0);

  for (const entry of rated) {
    const bin = Math.min(binCount - 1, Math.floor((entry.score - min) / step));
    field[bin] = (field[bin] ?? 0) + 1;
    if (entry.won) winnerCounts[bin] = (winnerCounts[bin] ?? 0) + 1;
  }

  const average = (values: number[]) =>
    values.reduce((total, value) => total + value, 0) / values.length;

  return {
    fieldAverage: average(scores),
    winnerAverage: average(winners.map((entry) => entry.score)),
    bins: field.map((_, bin) => min + step * (bin + 0.5)),
    field: field.map((count) => rate(count, rated.length)),
    winners: winnerCounts.map((count) => rate(count, winners.length))
  };
}

/** The game splits every course into 24 sections; its four race phases cover 4, 12, 4 and 4 of them. */
export const COURSE_SECTIONS = 24;
export const RACE_PHASES = [
  { name: 'Early race', sections: 4 },
  { name: 'Mid race', sections: 12 },
  { name: 'Late race', sections: 4 },
  { name: 'Final leg', sections: 4 }
] as const;

export interface PhaseCount {
  name: string;
  /** First course section of the phase. */
  start: number;
  /** Course section after the phase's last one. */
  end: number;
  count: number;
}

/** Counts positions along the course by section, so activations line up with the race phases. */
export function sectionCounts(distances: number[], raceDistance: number) {
  const counts = Array<number>(COURSE_SECTIONS).fill(0);
  if (raceDistance <= 0) return counts;

  for (const distance of distances) {
    const section = Math.floor((distance / raceDistance) * COURSE_SECTIONS);
    const clamped = Math.min(COURSE_SECTIONS - 1, Math.max(0, section));
    counts[clamped] = (counts[clamped] ?? 0) + 1;
  }

  return counts;
}

export function phaseCounts(sections: number[]): PhaseCount[] {
  const phases: PhaseCount[] = [];
  let start = 0;

  for (const phase of RACE_PHASES) {
    const end = start + phase.sections;
    const count = sections.slice(start, end).reduce((total, value) => total + value, 0);
    phases.push({ name: phase.name, start, end, count });
    start = end;
  }

  return phases;
}

export const formatRate = (value: number) => value.toFixed(1) + '%';

/** How many times the neutral rate a rate is, so "1.6×" reads the same for styles, Umas and teams. */
export function timesNeutral(value: number, neutral: number) {
  return neutral > 0 ? value / neutral : undefined;
}
