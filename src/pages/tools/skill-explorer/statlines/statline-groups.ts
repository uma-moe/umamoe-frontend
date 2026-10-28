import type { RunningStyle, Stats } from './statline-model';
import type { TargetRow, TargetStatlines } from './statlines-data';

/** Styles that share a statline to aim for, or one style that needs its own. */
export interface StatlineGroup {
  styles: RunningStyle[];
  stats: Stats;
  /** Winners' middle half, for a past CM. */
  low?: Stats;
  high?: Stats;
  /** Per stat: it sets this style apart from the shared statline. */
  apart: boolean[];
}

/** A stat's place in `STAT_NAMES` order. */
export type StatIndex = 0 | 1 | 2 | 3 | 4;
export const STAT_INDICES: readonly StatIndex[] = [0, 1, 2, 3, 4];

/** Stats are aimed for in tens: the forecasts miss by 30–100, the winners spread wider still. */
export function roundStat(value: number): number {
  return Math.round(value / 10) * 10;
}

/** The smallest gap, in stat points, that counts as a style needing more or less than the rest. */
const MIN_TOLERANCE = 20;

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function mapStats(map: (stat: StatIndex) => number): Stats {
  return [map(0), map(1), map(2), map(3), map(4)];
}

/**
 * How far a style may stray from the others and still share their statline, per stat: a forecast's typical miss, or
 * for past winners half their middle half's width.
 */
function tolerances(target: TargetStatlines): Stats {
  if (target.kind === 'forecast') {
    return mapStats((stat) => Math.max(MIN_TOLERANCE, target.margin[stat]));
  }

  return mapStats((stat) => {
    const widths = target.rows.flatMap((row) =>
      row.low && row.high ? [row.high[stat] - row.low[stat]] : []
    );
    return Math.max(MIN_TOLERANCE, mean(widths) / 2);
  });
}

function rounded(row: TargetRow, apart: boolean[]): StatlineGroup {
  const { low, high } = row;
  return {
    styles: [row.style],
    stats: mapStats((stat) => roundStat(row.stats[stat])),
    low: low && mapStats((stat) => roundStat(low[stat])),
    high: high && mapStats((stat) => roundStat(high[stat])),
    apart
  };
}

function averaged(rows: TargetRow[]): StatlineGroup {
  const ranges = rows.flatMap((row) =>
    row.low && row.high ? [{ low: row.low, high: row.high }] : []
  );
  const ranged = ranges.length === rows.length;
  const meanOf = (values: (stat: StatIndex) => number[]) =>
    mapStats((stat) => roundStat(mean(values(stat))));
  return {
    styles: rows.map((row) => row.style),
    stats: meanOf((stat) => rows.map((row) => row.stats[stat])),
    low: ranged ? meanOf((stat) => ranges.map((range) => range.low[stat])) : undefined,
    high: ranged ? meanOf((stat) => ranges.map((range) => range.high[stat])) : undefined,
    apart: [false, false, false, false, false]
  };
}

/**
 * The target statlines with the styles that need about the same stats folded into one row, and a row of its own for
 * each style that needs more or less of some stat than the rest (those stats marked). Values are rounded to tens.
 */
export function groupStatlines(target: TargetStatlines): StatlineGroup[] {
  const { rows } = target;
  if (rows.length === 0) return [];

  const tolerance = tolerances(target);
  const consensus = mapStats((stat) => median(rows.map((row) => row.stats[stat])));
  const apartOf = (row: TargetRow, reference: Stats) =>
    STAT_INDICES.map((stat) => Math.abs(row.stats[stat] - reference[stat]) > tolerance[stat]);

  const shared = rows.filter((row) => !apartOf(row, consensus).some(Boolean));
  if (shared.length < 2) return rows.map((row) => rounded(row, apartOf(row, consensus)));

  const group = averaged(shared);
  const sharedStats = mapStats((stat) => mean(shared.map((row) => row.stats[stat])));
  const own = rows
    .filter((row) => !shared.includes(row))
    .map((row) => rounded(row, apartOf(row, sharedStats)));
  return [group, ...own];
}
