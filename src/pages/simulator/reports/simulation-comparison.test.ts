import { describe, expect, it } from 'vitest';
import {
  exhaustionDistance,
  finishSecondsToLengths,
  finishTimeAxis,
  histogramCounts,
  marginAxis,
  placeAxis,
  type HeadToHead,
  formatMargin,
  formatMarginValue,
  headToHead,
  leaderPaths,
  lengthPath,
  runnerOutcome,
  signedLengths,
  signedSeconds,
  skillValue,
  spurtVerdict,
  staminaVerdict
} from './simulation-comparison';
import type { MonteCarloResult } from '../simulator-repository';
import type { ReportDiagnostic, SimulationReport } from './simulation-report';

const diagnostic = (exhausted: [number, number] | null): ReportDiagnostic => ({
  start_delay_seconds: 0.05,
  gate: 1,
  start_dash_end_seconds: 1,
  mid_place: 1,
  late_place: 1,
  blocked_seconds: 0,
  rushed_seconds: 0,
  downhill_seconds: 0,
  spot_struggle_seconds: 0,
  duel_seconds: 0,
  mode_seconds_by_phase: [],
  spurt_start_m: 1500,
  spurt_target_speed_mps: 20,
  spurt_acceleration_seconds: 1,
  exhausted_at: exhausted,
  rng_cursor: 0,
  hp_applications: []
});

const band = (value: number): [number, number, number, number, number] => [
  value,
  value,
  value,
  value,
  4
];

/** Four races, two runners on a 2,000 m course. Runner 1 wins three of four. */
function fixture(withReport = true): MonteCarloResult {
  const report: SimulationReport = {
    version: 1,
    clock: 'simulation_elapsed',
    units: ['s', 'm/s', 'm/s', 'm/s²', 'HP', 'm'],
    samples: 4,
    distance_m: [0, 1000, 2000],
    elapsed_seconds: [0, 1],
    runners: [0, 1].map((source) => ({
      source_input_index: source,
      distance: [0, 1, 2].map(() => [band(0), band(20), band(20), band(0), band(500), band(0)]),
      elapsed: [],
      representative_runs: [0, 1, 2],
      diagnostics:
        source === 0
          ? [diagnostic(null), diagnostic(null), diagnostic([100, 1800]), diagnostic(null)]
          : [0, 1, 2, 3].map(() => diagnostic(null))
    })),
    // Runner 1 crosses the line 0.25 s earlier (= 2 lengths at 20 m/s) in three races, 0.125 s later in one.
    crossing_times: [
      [
        [0, 50, 120],
        [0, 50, 119.75]
      ],
      [
        [0, 50, 120],
        [0, 50, 119.75]
      ],
      [
        [0, 50, 120],
        [0, 50, 119.75]
      ],
      [
        [0, 50, 120],
        [0, 50, 120.125]
      ]
    ],
    spatial: [],
    spatial_coverage: 0
  };

  return {
    schema_version: 5,
    engine_build: 'test',
    runs: 4,
    seeds: [1, 2, 3, 4],
    finish_order: [
      [1, 0],
      [1, 0],
      [1, 0],
      [0, 1]
    ],
    finish_times: [
      [120, 119.75],
      [120, 119.75],
      [120, 119.75],
      [120, 120.125]
    ],
    final_hp: [
      [10, 50],
      [10, 50],
      [0, 50],
      [10, 50]
    ],
    last_spurt_decisions: [
      [1, 1],
      [1, 1],
      [2, 1],
      [1, 1]
    ],
    ...(withReport ? { report } : {})
  };
}

describe('verdicts', () => {
  it('grades stamina by survival rate and names where HP runs out', () => {
    expect(staminaVerdict(0)).toMatchObject({ tone: 'good', label: 'Stamina OK' });
    expect(staminaVerdict(5, 2140)).toMatchObject({
      tone: 'warn',
      detail: 'empty in 5.0%, usually from 2,140 m'
    });

    expect(staminaVerdict(25)).toMatchObject({ tone: 'bad', label: 'Runs out of HP' });
    expect(staminaVerdict(null).tone).toBe('neutral');
  });

  it('grades the full spurt rate', () => {
    expect(spurtVerdict(100).tone).toBe('good');
    expect(spurtVerdict(85)).toMatchObject({
      tone: 'warn',
      detail: 'slower spurt in 15.0% of races'
    });

    expect(spurtVerdict(40).tone).toBe('bad');
  });

  it('reads exhaustion distance from either record order', () => {
    expect(exhaustionDistance([100, 1800])).toBe(1800);
    expect(exhaustionDistance(null)).toBeNull();
    // HP running out on or past the line is not running out before the finish.
    expect(exhaustionDistance([150, 2000], 2000)).toBeNull();
    expect(exhaustionDistance([150, 1999], 2000)).toBe(1999);
  });
});

describe('runner outcomes', () => {
  it('uses report diagnostics for exhaustion and the spurt decisions for full spurt', () => {
    const outcome = runnerOutcome(fixture(), 0);
    expect(outcome.winRate).toBe(25);
    expect(outcome.exhaustedRate).toBe(25);
    expect(outcome.exhaustedAt).toBe(1800);
    expect(outcome.fullSpurtRate).toBe(75);
    expect(outcome.stamina.tone).toBe('bad');
    expect(outcome.representatives).toEqual([0, 1, 2]);
  });

  it('falls back to final HP when no report was collected', () => {
    const outcome = runnerOutcome(fixture(false), 0);
    expect(outcome.exhaustedRate).toBe(25);
    expect(outcome.exhaustedAt).toBeNull();
  });
});

describe('head-to-head', () => {
  it('measures paired lengths at the finish on the simulation clock', () => {
    const pair = headToHead(fixture(), 1, 0, 2000);
    expect(pair.ahead).toBe(3);
    expect(pair.rate).toBe(75);
    expect(pair.samples.map((value) => Number(value.toFixed(3)))).toEqual([2, 2, 2, -1]);
    expect(pair.lengths.median).toBeCloseTo(2);
    // Four races cannot separate 75% from 50%.
    expect(pair.call).toBe('close');
  });

  it('formats signed lengths', () => {
    expect(signedLengths(2)).toBe('+2.0 L');
    expect(signedLengths(-0.04)).toBe('±0.0 L');
    expect(signedLengths(-1.26)).toBe('−1.3 L');
  });

  it('builds a lengths path along the course', () => {
    const result = fixture();
    const path = lengthPath(result, result.report!, 0, 1, 2000);
    expect(path).toHaveLength(3);
    expect(path[0]![2]).toBe(0);
    expect(path[2]![2]).toBeCloseTo(2);
  });
});

describe('whole field and skill value', () => {
  it('measures every runner against whoever leads each race', () => {
    const result = fixture();
    const paths = leaderPaths(result, result.report!, 2000);
    expect(paths.get(1)![2]![2]).toBe(0);
    // Runner 0 trails by 0.25 s at 20 m/s in three of four races.
    expect(paths.get(0)![2]![2]).toBeCloseTo(-2);
    expect(paths.get(0)![0]![2]).toBe(0);
  });

  it('rescales finish-clock gaps to the simulation clock before converting to lengths', () => {
    const result = fixture();
    // Both clocks agree in the fixture, so 0.25 s at 20 m/s is two lengths.
    expect(finishSecondsToLengths(result, 1, 0.25, 2000)).toBeCloseTo(2);
    const scaled = {
      ...result,
      finish_times: result.finish_times.map((row) => row.map((time) => time * 1.2))
    };

    expect(finishSecondsToLengths(scaled, 1, 0.3, 2000)).toBeCloseTo(2);
  });

  it('reports a removed skill as the value of having it', () => {
    const value = skillValue(fixture(), 1, 2000, {
      mean: -0.25,
      interval: [-0.3, -0.2],
      winChange: -10,
      spurtChange: -5,
      count: 4
    });

    expect(value.lengths).toBeCloseTo(2);
    expect(value.low!).toBeLessThan(value.high!);
    expect(value.winChange).toBe(10);
    expect(value.preliminary).toBe(false);
  });

  it('shows every margin in both units with the chosen one first', () => {
    // Ahead by 2.1 L means crossing the line 0.21 s earlier: a negative finish-time difference.
    expect(formatMargin(2.1, 0.21, 'lengths')).toBe('+2.1 L (−0.21 s)');
    expect(formatMargin(2.1, 0.21, 'seconds')).toBe('−0.21 s (+2.1 L)');
    expect(formatMargin(-0.4, -0.05, 'lengths')).toBe('−0.4 L (+0.05 s)');
    expect(formatMarginValue(2.1, 0.21, 'seconds')).toBe('−0.21 s');
    expect(signedSeconds(0)).toBe('±0.00 s');
  });
});

describe('margin histogram axis', () => {
  const pair = (samples: number[]) =>
    ({ samples, secondsSamples: samples.map((value) => value / 8) }) as unknown as HeadToHead;

  it('spans both pairs around zero with whole bins and counts every race', () => {
    const pairs = [pair([-3.2, -1, 0.4, 2.6]), pair([-0.6, 0.1, 1.9, 4.4])];
    const axis = marginAxis(pairs, 'lengths');
    expect(axis.min).toBeLessThanOrEqual(-3.2);
    expect(axis.max).toBeGreaterThanOrEqual(4.4);
    expect(axis.ticks).toContain(0);
    // A bin never straddles zero, so each bar belongs to one side.
    expect(Math.abs(-axis.min / axis.width - Math.round(-axis.min / axis.width))).toBeLessThan(
      1e-9
    );
    const bins = histogramCounts([-100, ...pairs[0]!.samples, 100], axis);
    expect(bins.reduce((sum, count) => sum + count, 0)).toBe(6);
    expect(bins[0]).toBeGreaterThan(0);
    expect(bins.at(-1)).toBeGreaterThan(0);
  });

  it('keeps the bins fine: up to 96 of a round width', () => {
    const axis = marginAxis(
      [pair(Array.from({ length: 200 }, (_, index) => -18 + index * 0.2))],
      'lengths'
    );

    expect(axis.bins).toBeGreaterThan(48);
    expect(axis.bins).toBeLessThanOrEqual(96);
    expect([0.05, 0.1, 0.2, 0.25, 0.5, 1]).toContain(axis.width);
  });

  it('gives finish times and places their own axes', () => {
    const time = finishTimeAxis([150.12, 150.4, 151.93, 152.6]);
    expect(time.min).toBeLessThanOrEqual(150.12);
    expect(time.max).toBeGreaterThanOrEqual(152.6);
    expect(time.bins).toBeLessThanOrEqual(96);
    expect(
      histogramCounts([150.12, 150.4, 151.93, 152.6], time).reduce((sum, count) => sum + count, 0)
    ).toBe(4);
    const place = placeAxis(9);
    expect(place.ticks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(histogramCounts([1, 1, 3, 9], place)).toEqual([2, 0, 1, 0, 0, 0, 0, 0, 1]);
  });

  it('bins seconds on their own scale', () => {
    const axis = marginAxis([pair([-3.2, -1, 0.4, 2.6])], 'seconds');
    expect(axis.max - axis.min).toBeLessThan(2);
    expect(axis.width).toBeLessThanOrEqual(0.05);
  });
});
