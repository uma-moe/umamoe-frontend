import { describe, expect, it } from 'vitest';
import { hpByDistance, staminaRaces, staminaReport } from './stamina-report';
import type { ReportDiagnostic, ReportTelemetry, SimulationReport } from '../simulation-report';
import type { MonteCarloResult } from '../../simulator-repository';

const diagnostic = (patch: Partial<ReportDiagnostic>): ReportDiagnostic => ({
  start_delay_seconds: 0,
  gate: 1,
  start_dash_end_seconds: null,
  mid_place: null,
  late_place: null,
  blocked_seconds: 0,
  rushed_seconds: 0,
  downhill_seconds: 0,
  spot_struggle_seconds: 0,
  duel_seconds: 0,
  mode_seconds_by_phase: [],
  spurt_start_m: 80,
  spurt_target_speed_mps: 20,
  full_spurt_target_speed_mps: 20,
  spurt_acceleration_seconds: null,
  exhausted_at: null,
  rng_cursor: 0,
  hp_applications: [],
  ...patch
});

// One runner on a 120 m course, two races. Race 1 is short at the spurt check and spurts slower and later; race 2 affords the full spurt.
const telemetry: ReportTelemetry = {
  interval_seconds: 1,
  offsets: [0, 3, 6],
  finish_seconds: [2.5, 2.5],
  finish_values: [
    [120, 1, 20, 700],
    [120, 1, 20, 40]
  ],
  columns: [
    Float32Array.from([0, 40, 80, 0, 40, 80]),
    Float32Array.from([1, 1, 1, 1, 1, 1]),
    Float32Array.from([20, 20, 20, 20, 20, 20]),
    Float32Array.from([1000, 900, 800, 1000, 900, 800])
  ]
};

const report = {
  version: 2,
  clock: 'simulation_elapsed',
  samples: 2,
  elapsed_seconds: [0, 1, 2],
  distance_m: [0, 120],
  telemetry,
  runners: [
    {
      source_input_index: 0,
      diagnostics: [
        diagnostic({
          spurt_start_m: 90,
          spurt_target_speed_mps: 19.4,
          hp_applications: [
            {
              time: 1,
              skillId: 1,
              casterHorseIndex: 0,
              targetHorseIndex: 0,
              requestedHpDelta: 30,
              appliedHpDelta: 20
            }
          ]
        }),
        diagnostic({
          hp_applications: [
            {
              time: 2.3,
              skillId: 2,
              casterHorseIndex: 1,
              targetHorseIndex: 0,
              requestedHpDelta: -15,
              appliedHpDelta: -15
            }
          ]
        })
      ]
    }
  ]
} as unknown as SimulationReport;

const result = {
  runs: 2,
  seeds: [1, 2],
  finish_order: [[0], [0]],
  finish_times: [[2.5], [2.5]],
  max_hp: [[1000], [1000]],
  final_hp: [[700], [40]],
  hp_deficit: [[0], [0]],
  check_hp: [[[1000]], [[1100]]],
  full_spurt_need_hp: [[[1080]], [[1000]]],
  spurt_calculation_results: [[[2]], [[1]]],
  spurt_calculation_distances: [[[80]], [[80]]],
  last_spurt_decisions: [[2], [1]],
  hp_effect_rate_before_first_spurt: [[0], [0.05]],
  hp_effect_rate: [[0], [0.05]],
  report
} as unknown as MonteCarloResult;

const runner = {
  stats: { speed: 1, stamina: 600, power: 1, guts: 1, wisdom: 1 },
  running_style: 'Sashi',
  motivation: 3
};

describe('stamina report', () => {
  it('estimates the stamina each race needed for a full spurt that still reaches the finish', () => {
    const [short, full] = staminaRaces(result, 0, runner);
    // 80 HP short at the check, at 0.8 HP per stamina point.
    expect(short!.needed).toBeCloseTo(700);
    // 100 HP spare at the check is worth less once recovery scales with maximum HP; 40 HP left at the finish binds first.
    expect(full!.needed).toBeCloseTo(600 - 40 / 0.8 / 1.05);
    const over = staminaRaces(result, 0, {
      ...runner,
      stats: { ...runner.stats, stamina: 1300 }
    })[0]!;

    // Above 1200 raw stamina counts half, so the same 100 extra points need 200 raw.
    expect(over.needed).toBeCloseTo(1500);
  });

  it('sorts races by last spurt and measures what the slower spurt cost', () => {
    const summary = staminaReport(result, 0, runner, 120);
    expect(summary.spurt).toEqual({ full: 50, late: 50, none: 0, recovered: 0 });
    expect(summary.speedLoss).toBeCloseTo(0.6);
    expect(summary.delay).toBeCloseTo(10);
    expect(summary.covered).toBe(50);
    expect(summary.stamina).toBe(600);
  });

  it('accounts for every point of HP by race phase', () => {
    const summary = staminaReport(result, 0, runner, 120);
    // The HP drop across each phase, plus what was recovered in it and minus what was drained:
    // race 1 uses 50 / 150 + 20 / 50 / 50, race 2 uses 50 / 150 / 380 / 380 − 15.
    expect(summary.phases).toEqual([50, 160, 215, 207.5]);
    expect(summary.received).toBe(10);
    expect(summary.drained).toBe(7.5);
    expect(summary.left).toBe(370);
  });

  it('works without the runner input and samples HP by distance', () => {
    const summary = staminaReport(result, 0, undefined, 120);
    expect(summary.stamina).toBeUndefined();
    expect(summary.needed).toBeUndefined();
    const hp = hpByDistance(result, 0, 120, 4)!;
    expect(hp.x).toEqual([0, 40, 80, 120]);
    expect(hp.bands.map((band) => band[2])).toEqual([100, 90, 80, expect.closeTo(37)]);
  });
});
