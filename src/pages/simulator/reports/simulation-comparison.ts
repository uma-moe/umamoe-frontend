/**
 * Plain-language comparison model for the "Run simulation" results.
 *
 * Every number here is derived from the paired Monte Carlo batch: each sampled
 * race contains every runner, so differences are measured inside the same race
 * rather than between independent universes.
 */
import type { MonteCarloResult } from '../simulator-repository';
import { simulatorSampleSummary, winRateInterval } from '../simulator-results';
import { pairedProgression, reportCrossing, type ReportBand, type SimulationReport } from './simulation-report';

/** One horse length (バ身) in metres. */
export const LENGTH_METRES = 2.5;
export type VerdictTone = 'good' | 'warn' | 'bad' | 'neutral';
export interface Verdict { tone: VerdictTone; label: string; detail: string; }

/** Thresholds are deliberately coarse so the verdict reads at a glance; the raw rate is always shown beside it. */
export const STAMINA_THRESHOLDS = { safe: 99, marginal: 90 } as const;
export const SPURT_THRESHOLDS = { safe: 95, marginal: 80 } as const;

const percent = (value: number) => (value >= 99.95 || value <= .05 ? value.toFixed(0) : value.toFixed(1)) + '%';
const metres = (value: number) => Math.round(value).toLocaleString('en-US') + ' m';

export function staminaVerdict(exhaustedRate: number | null | undefined, exhaustedAt?: number | null): Verdict {
  if (exhaustedRate == null || !Number.isFinite(exhaustedRate)) return { tone: 'neutral', label: 'Stamina unknown', detail: 'HP was not collected' };
  const survive = 100 - exhaustedRate;
  if (survive >= STAMINA_THRESHOLDS.safe) return { tone: 'good', label: 'Stamina OK', detail: 'HP left in ' + percent(survive) + ' of races' };
  const where = exhaustedAt == null ? '' : ', usually from ' + metres(exhaustedAt);
  if (survive >= STAMINA_THRESHOLDS.marginal) return { tone: 'warn', label: 'Stamina marginal', detail: 'empty in ' + percent(exhaustedRate) + where };
  return { tone: 'bad', label: 'Runs out of HP', detail: 'empty in ' + percent(exhaustedRate) + where };
}

export function spurtVerdict(rate: number | null | undefined): Verdict {
  if (rate == null || !Number.isFinite(rate)) return { tone: 'neutral', label: 'Spurt unknown', detail: 'spurt decisions were not collected' };
  if (rate >= SPURT_THRESHOLDS.safe) return { tone: 'good', label: 'Full spurt', detail: 'in ' + percent(rate) + ' of races' };
  if (rate >= SPURT_THRESHOLDS.marginal) return { tone: 'warn', label: 'Usually full spurt', detail: 'slower spurt in ' + percent(100 - rate) + ' of races' };
  return { tone: 'bad', label: 'Spurt often reduced', detail: 'full in only ' + percent(rate) + ' of races' };
}

/**
 * Exhaustion records are `[elapsed seconds, course metres]`; metres is always the larger value once a runner has moved.
 * With the course distance, HP that only runs out on or past the finish line does not count.
 */
export function exhaustionDistance(record: [number, number] | null | undefined, finish?: number): number | null {
  const distance = record ? Math.max(record[0], record[1]) : null;
  return distance !== null && finish !== undefined && distance >= finish ? null : distance;
}

export interface RunnerOutcome {
  source: number; runs: number;
  winRate: number; winInterval: [number, number]; top3: number;
  finish: NonNullable<ReturnType<typeof simulatorSampleSummary>>;
  exhaustedRate: number | null; exhaustedAt: number | null;
  fullSpurtRate: number | null; finishHp: ReturnType<typeof simulatorSampleSummary>;
  stamina: Verdict; spurt: Verdict;
  /** Median, fastest and slowest sample index. */
  representatives: [number, number, number];
}

export function runnerOutcome(result: MonteCarloResult, source: number): RunnerOutcome {
  const runs = result.runs;
  const places = result.finish_order.map(order => order.indexOf(source) + 1);
  const wins = places.filter(place => place === 1).length;
  const times = result.finish_times.map(row => row[source]!).filter(Number.isFinite);
  const finish = simulatorSampleSummary(times) ?? { count: 0, min: 0, max: 0, mean: 0, median: 0, p10: 0, p90: 0, sd: 0 };
  const diagnostics = result.report?.runners.find(row => row.source_input_index === source)?.diagnostics;
  const hp = (result.final_hp ?? []).map(row => row[source]!).filter(Number.isFinite);
  let exhaustedRate: number | null = null, exhaustedAt: number | null = null;
  if (diagnostics?.length) {
    const finishLine = result.report?.distance_m.at(-1);
    const points = diagnostics.map(row => exhaustionDistance(row.exhausted_at, finishLine)).filter((value): value is number => value != null);
    exhaustedRate = points.length / diagnostics.length * 100;
    exhaustedAt = simulatorSampleSummary(points)?.median ?? null;
  } else if (hp.length) exhaustedRate = hp.filter(value => value <= 0).length / hp.length * 100;
  const decisions = (result.last_spurt_decisions ?? []).map(row => row[source]!).filter(Number.isFinite);
  const fullSpurtRate = decisions.length ? decisions.filter(value => value === 1).length / decisions.length * 100 : null;
  const recorded = result.report?.runners.find(row => row.source_input_index === source)?.representative_runs;
  const nearest = (target: number) => result.finish_times.reduce((best, row, index) => Math.abs(row[source]! - target) < Math.abs(result.finish_times[best]![source]! - target) ? index : best, 0);
  return {
    source, runs, winRate: runs ? wins / runs * 100 : 0, winInterval: winRateInterval(wins, runs),
    top3: runs ? places.filter(place => place > 0 && place <= 3).length / runs * 100 : 0,
    finish, exhaustedRate, exhaustedAt, fullSpurtRate, finishHp: simulatorSampleSummary(hp),
    stamina: staminaVerdict(exhaustedRate, exhaustedAt), spurt: spurtVerdict(fullSpurtRate),
    representatives: recorded ?? [nearest(finish.median), nearest(finish.min), nearest(finish.max)]
  };
}

/**
 * Reference speed (m/s) used to turn a paired time gap into lengths at each
 * report distance. Uses the reference runner's mean speed band where it exists.
 */
export function referenceSpeeds(result: MonteCarloResult, reference: number, distance: number): number[] | undefined {
  const report = result.report;
  const bands = report?.runners.find(row => row.source_input_index === reference)?.distance;
  if (!report || !bands) return undefined;
  const fallback = distance / Math.max(1, simulatorSampleSummary(result.finish_times.map(row => row[reference]!))?.mean ?? 1);
  return bands.map(point => {
    const speed = point[1]?.[0];
    return speed != null && Number.isFinite(speed) && speed > 1 ? speed : fallback;
  });
}

export interface HeadToHead {
  source: number; reference: number; runs: number;
  /** Races where `source` finished ahead of the reference. */
  ahead: number; rate: number; interval: [number, number];
  /** Lengths ahead of the reference at the finish; positive means ahead. */
  lengths: NonNullable<ReturnType<typeof simulatorSampleSummary>>;
  samples: number[];
  /** Seconds ahead of the reference at the finish line; positive means she crosses it earlier. */
  seconds: NonNullable<ReturnType<typeof simulatorSampleSummary>>;
  secondsSamples: number[];
  call: 'ahead' | 'behind' | 'close';
}

/** Paired finish comparison in lengths, measured on the simulation clock at the finish line where possible. */
export function headToHead(result: MonteCarloResult, source: number, reference: number, distance: number): HeadToHead {
  const runs = result.runs;
  const ahead = result.finish_order.filter(order => order.indexOf(source) < order.indexOf(reference)).length;
  const interval = winRateInterval(ahead, runs);
  const report = result.report, last = (report?.distance_m.length ?? 0) - 1;
  const speeds = referenceSpeeds(result, reference, distance);
  const fallbackSpeed = distance / Math.max(1, simulatorSampleSummary(result.finish_times.map(row => row[reference]!))?.mean ?? 1);
  const secondsSamples = Array.from({ length: runs }, (_, run) => report && last > 0
    ? reportCrossing(report, run, reference, last) - reportCrossing(report, run, source, last)
    : result.finish_times[run]![reference]! - result.finish_times[run]![source]!);
  const samples = secondsSamples.map(seconds => seconds * (speeds?.[last] ?? fallbackSpeed) / LENGTH_METRES);
  const empty = { count: 0, min: 0, max: 0, mean: 0, median: 0, p10: 0, p90: 0, sd: 0 };
  const lengths = simulatorSampleSummary(samples) ?? empty, seconds = simulatorSampleSummary(secondsSamples) ?? empty;
  const call = interval[0] > 50 ? 'ahead' : interval[1] < 50 ? 'behind' : 'close';
  return { source, reference, runs, ahead, rate: runs ? ahead / runs * 100 : 0, interval, lengths, samples, seconds, secondsSamples, call };
}

/** Human summary of a head-to-head, e.g. "Ahead in 61% of races · +0.8 L median". */
export function headToHeadLabel(pair: HeadToHead): string {
  if (pair.call === 'close') return 'Too close to call';
  return pair.call === 'ahead' ? 'Usually finishes ahead' : 'Usually finishes behind';
}

export function signedLengths(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits));
  return (rounded > 0 ? '+' : rounded < 0 ? '−' : '±') + Math.abs(rounded).toFixed(digits) + ' L';
}

/** A finish-time difference in seconds: negative means she crosses the line earlier. */
export function signedSeconds(value: number, digits = 2): string {
  const rounded = Number(value.toFixed(digits));
  return (rounded > 0 ? '+' : rounded < 0 ? '−' : '±') + Math.abs(rounded).toFixed(digits) + ' s';
}

/** Which unit leads when a margin is shown; the other follows in brackets. */
export type MarginUnit = 'lengths' | 'seconds';

/**
 * One margin in both units, the chosen one first: "+2.1 L (−0.21 s)" or "−0.21 s (+2.1 L)".
 * Both inputs are positive when she is ahead; seconds are shown as the finish-time difference.
 */
export function formatMargin(lengths: number, secondsAhead: number, unit: MarginUnit, digits = 1): string {
  const length = signedLengths(lengths, digits), time = signedSeconds(-secondsAhead);
  return unit === 'seconds' ? time + ' (' + length + ')' : length + ' (' + time + ')';
}

/** Only the leading unit of a margin, for axes, ranges and tight cells. */
export function formatMarginValue(lengths: number, secondsAhead: number, unit: MarginUnit, digits = 1): string {
  return unit === 'seconds' ? signedSeconds(-secondsAhead) : signedLengths(lengths, digits);
}

/** Lengths ahead of the reference at every report distance: mean, p10, median, p90, count. */
export function lengthPath(result: MonteCarloResult, report: SimulationReport, reference: number, source: number, distance: number): ReportBand[] {
  const speeds = referenceSpeeds(result, reference, distance) ?? report.distance_m.map(() => distance / 100);
  return pairedProgression(report, reference, source).map((band, point) => {
    const scale = speeds[point]! / LENGTH_METRES;
    return [band[0] * scale, band[1] * scale, band[2] * scale, band[3] * scale, band[4]];
  });
}

/** Shared-scale histogram of paired lengths, as a percentage of races per bin. */

/** Race phases used to shade distance charts; the last spurt can begin once late race starts. */
export function racePhases(distance: number) {
  return [
    { label: 'Early race', start: 0, end: distance / 6 },
    { label: 'Mid race', start: distance / 6, end: distance * 2 / 3 },
    { label: 'Late race', start: distance * 2 / 3, end: distance }
  ];
}

/** Mean speed of the whole field at each report distance (m/s), from the report speed bands. */
function fieldSpeeds(report: SimulationReport, fallback: number): number[] {
  return report.distance_m.map((_, point) => {
    const speeds = report.runners.map(runner => runner.distance[point]?.[1]?.[0]).filter((value): value is number => value != null && Number.isFinite(value) && value > 1);
    return speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : fallback;
  });
}

/**
 * Lengths behind whoever leads that race at each distance (0 = leading, negative = behind),
 * for every runner. Measured per race, then summarised, so it shows each runner's real race shape.
 */
export function leaderPaths(result: MonteCarloResult, report: SimulationReport, distance: number): Map<number, ReportBand[]> {
  const runs = report.samples, points = report.distance_m.length, sources = report.runners.map(runner => runner.source_input_index);
  const speeds = fieldSpeeds(report, distance / Math.max(1, simulatorSampleSummary(result.finish_times.map(row => Math.min(...row)))?.mean ?? 1));
  const values = new Map(sources.map(source => [source, Array.from({ length: points }, () => new Float64Array(runs))]));
  for (let run = 0; run < runs; run++) for (let point = 0; point < points; point++) {
    let leader = Infinity;
    for (const source of sources) leader = Math.min(leader, reportCrossing(report, run, source, point));
    const scale = speeds[point]! / LENGTH_METRES;
    for (const source of sources) values.get(source)![point]![run] = (leader - reportCrossing(report, run, source, point)) * scale;
  }
  return new Map([...values].map(([source, rows]) => [source, rows.map(row => {
    const summary = simulatorSampleSummary(Array.from(row))!;
    return [summary.mean, summary.p10, summary.median, summary.p90, summary.count] as ReportBand;
  })]));
}

/**
 * Converts a finish-clock time difference into lengths at the runner's finishing speed.
 * The finish clock may be scaled against the simulation clock, so the gap is first rescaled by
 * the ratio of both clocks' median finish times.
 */
export function finishSecondsToLengths(result: MonteCarloResult, source: number, seconds: number, distance: number): number {
  const official = simulatorSampleSummary(result.finish_times.map(row => row[source]!))?.median ?? 0;
  const report = result.report, last = (report?.distance_m.length ?? 0) - 1;
  if (!report || last < 1 || !official) return seconds * distance / Math.max(1, official) / LENGTH_METRES;
  const simulated = simulatorSampleSummary(Array.from({ length: report.samples }, (_, run) => reportCrossing(report, run, source, last)))?.median ?? official;
  const speed = report.runners.find(row => row.source_input_index === source)?.distance[last]?.[1]?.[0];
  const finishSpeed = speed != null && Number.isFinite(speed) && speed > 1 ? speed : distance / Math.max(1, simulated);
  return seconds * (simulated / official) * finishSpeed / LENGTH_METRES;
}

/** A paired remove-skill comparison, expressed as what the skill is worth to the runner who owns it. */
export interface SkillValue { lengths: number; low?: number; high?: number; seconds: number; lowSeconds?: number; highSeconds?: number; winChange: number; spurtChange?: number; count: number; preliminary: boolean; }
export function skillValue(result: MonteCarloResult, source: number, distance: number, outcome: { mean: number; interval?: number[]; winChange: number; spurtChange?: number; count: number }): SkillValue {
  // The comparison reports alternative-minus-baseline gains; removing a useful skill makes the alternative slower.
  const toLengths = (seconds: number) => finishSecondsToLengths(result, source, seconds, distance);
  return {
    seconds: -outcome.mean, lengths: toLengths(-outcome.mean),
    ...(outcome.interval ? { low: toLengths(-outcome.interval[1]!), high: toLengths(-outcome.interval[0]!), lowSeconds: -outcome.interval[1]!, highSeconds: -outcome.interval[0]! } : {}),
    winChange: -outcome.winChange, ...(outcome.spurtChange == null ? {} : { spurtChange: -outcome.spurtChange }),
    count: outcome.count, preliminary: outcome.count < result.runs
  };
}

export interface HistogramAxis { min: number; max: number; width: number; bins: number; ticks: number[] }
const MAX_BINS = 96;
/**
 * A histogram axis over 99% of the values, in whole bins of a round width (up to 96 bins, so the shape stays fine-grained).
 * The rarest outliers fall into the end bins, so every race is still counted. With `zero`, zero is always on the axis
 * and always a bin edge, so no bar straddles it.
 */
export function histogramAxis(values: number[], options: { steps: number[]; tickSteps: number[]; minSpan: number; zero?: boolean }): HistogramAxis {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const quantile = (p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))]! : 0;
  let low = quantile(.005), high = quantile(.995);
  if (options.zero) { low = Math.min(0, low); high = Math.max(0, high); }
  if (high - low < options.minSpan) { const pad = (options.minSpan - (high - low)) / 2; low -= pad; high += pad; }
  const width = options.steps.find(step => (high - low) / step <= MAX_BINS) ?? options.steps.at(-1)!;
  const min = Math.floor(low / width + 1e-9) * width, max = Math.ceil(high / width - 1e-9) * width, bins = Math.max(1, Math.round((max - min) / width));
  const tickStep = options.tickSteps.find(step => (max - min) / step <= 8) ?? options.tickSteps.at(-1)!;
  const ticks = Array.from({ length: Math.max(0, Math.floor(max / tickStep + 1e-9) - Math.ceil(min / tickStep - 1e-9) + 1) }, (_, index) => Number(((Math.ceil(min / tickStep - 1e-9) + index) * tickStep).toFixed(6)));
  return { min, max, width, bins, ticks };
}
/** One axis for every pair's margin, in the leading unit and measured as "ahead" (right is ahead). */
export function marginAxis(pairs: HeadToHead[], unit: MarginUnit): HistogramAxis {
  const values = pairs.flatMap(pair => unit === 'seconds' ? pair.secondsSamples : pair.samples);
  return unit === 'seconds'
    ? histogramAxis(values, { steps: [.005, .01, .02, .025, .05, .1, .2, .25, .5, 1], tickSteps: [.05, .1, .2, .25, .5, 1, 2], minSpan: .1, zero: true })
    : histogramAxis(values, { steps: [.05, .1, .2, .25, .5, 1, 2, 2.5, 5, 10], tickSteps: [.5, 1, 2, 2.5, 5, 10, 20], minSpan: 1, zero: true });
}
/** One finish-time axis (seconds) for every runner shown. */
export function finishTimeAxis(times: number[]): HistogramAxis {
  return histogramAxis(times, { steps: [.01, .02, .025, .05, .1, .2, .25, .5, 1, 2], tickSteps: [.1, .2, .25, .5, 1, 2, 5, 10], minSpan: .2 });
}
/** Finishing positions 1–N, one bin each. */
export function placeAxis(runners: number): HistogramAxis {
  return { min: .5, max: runners + .5, width: 1, bins: runners, ticks: Array.from({ length: runners }, (_, index) => index + 1) };
}
/** Races per bin of an axis; values beyond either end are counted in the end bins. */
export function histogramCounts(samples: number[], axis: HistogramAxis): number[] {
  const counts = Array<number>(axis.bins).fill(0);
  for (const value of samples) if (Number.isFinite(value)) counts[Math.min(axis.bins - 1, Math.max(0, Math.floor((value - axis.min) / axis.width + 1e-9)))]!++;
  return counts;
}
