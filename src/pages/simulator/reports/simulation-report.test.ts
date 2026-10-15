import { describe, it, expect } from 'vitest';
import { encode } from '@msgpack/msgpack';
import { validateSimulatorResponse } from '../simulator-response';
import {
  decodeSimulatorBody,
  createSimulatorRepository,
  type MonteCarloResult
} from '../simulator-repository';
import {
  packReportTraces,
  expandReportTraces,
  DIAGNOSTIC_FIELDS,
  normalizeReportResponse,
  compareOutcomes,
  pairedProgression,
  validateReport,
  type SimulationReport
} from './simulation-report';

const result: MonteCarloResult = {
  schema_version: 5,
  engine_build: 'test',
  runs: 2,
  seeds: [42, 43],
  finish_order: [
    [0, 1],
    [1, 0]
  ],
  finish_times: [
    [10, 12],
    [14, 13]
  ],
  last_spurt_decisions: [
    [1, 8],
    [2, 1]
  ]
};

const report: SimulationReport = {
  version: 1,
  clock: 'simulation_elapsed',
  units: ['s', 'm/s', 'm/s', 'm/s²', 'HP', 'm'],
  samples: 2,
  distance_m: [0, 100],
  elapsed_seconds: [0, 1],
  runners: [0, 1].map((source) => ({
    source_input_index: source,
    distance: Array.from({ length: 2 }, () =>
      Array.from({ length: 6 }, () => [2, 1, 2, 3, 2] as [number, number, number, number, number])
    ),
    elapsed: Array.from({ length: 2 }, () =>
      Array.from({ length: 4 }, () => [2, 1, 2, 3, 2] as [number, number, number, number, number])
    ),
    diagnostics: Array.from({ length: 2 }, () => ({
      start_delay_seconds: 0.05,
      gate: source + 1,
      start_dash_end_seconds: 1,
      mid_place: 1,
      late_place: 1,
      blocked_seconds: 0,
      rushed_seconds: 0,
      downhill_seconds: 0,
      spot_struggle_seconds: 0,
      duel_seconds: 0,
      mode_seconds_by_phase: Array.from({ length: 4 }, () => [0, 0, 0, 0, 0]),
      spurt_start_m: 70,
      spurt_target_speed_mps: 20,
      spurt_acceleration_seconds: 1,
      exhausted_at: null,
      hp_applications: [],
      rng_cursor: 5
    })),
    representative_runs: [0, 0, 1]
  })),
  crossing_times: [
    [
      [0, 10],
      [0, 12]
    ],
    [
      [0, 14],
      [0, 13]
    ]
  ],
  spatial: [{ run_index: 0, trajectories: [[[0, 1, 2, 3]], [[0, 3, 4, 5]]] }],
  spatial_coverage: 1
};

describe('simulation comparison report', () => {
  it('transfers skill columns in two buffers and retains exact numeric records', async () => {
    const proc = [0, 200101, 0, 1, 0.05, 2, -1, 4, 0, 1];
    const value = {
      report: true,
      skill_procs: [
        { activations: [proc], effects: [[0, 9, 1, 0.055]] },
        { activations: [], effects: [] }
      ]
    };

    const buffers = packReportTraces(value);
    expect(buffers).toHaveLength(2);
    await expandReportTraces(value);
    expect(Array.from(value.skill_procs[0]!.activations[0]!)).toEqual(proc);
    expect(Array.from(value.skill_procs[0]!.effects[0]!)).toEqual([0, 9, 1, 0.055]);
    expect(value.skill_procs[1]!.activations).toHaveLength(0);
  });

  it('decodes compact diagnostics and float32 crossings without changing paired results', () => {
    const floats = Float32Array.from([0, 10, 0, 12, 0, 14, 0, 13]);
    const binary = new Uint8Array(floats.buffer);
    const compact = {
      ...report,
      crossing_shape: [2, 2, 2],
      crossing_times: binary,
      diagnostic_fields: DIAGNOSTIC_FIELDS,
      runners: report.runners.map((r) => ({
        ...r,
        diagnostics: r.diagnostics.map((d) => DIAGNOSTIC_FIELDS.map((k) => d[k] ?? null))
      }))
    };

    const decoded = normalizeReportResponse({ report: compact }) as { report: SimulationReport };

    expect(validateReport(decoded.report, 2, 2)).toBe(true);
    expect(pairedProgression(decoded.report, 0, 1)).toEqual(pairedProgression(report, 0, 1));
    expect(() =>
      normalizeReportResponse({ report: { ...compact, crossing_times: binary.slice(1) } })
    ).toThrow(/Truncated/);

    const invalid = {
      ...compact,
      crossing_times: binary,
      runners: compact.runners.map((r) => ({ ...r, diagnostics: [[1]] }))
    };

    expect(() => normalizeReportResponse({ report: invalid })).toThrow(/diagnostic fields/);
  });

  it('pairs course crossings from the same seed instead of subtracting independent quantiles', () => {
    expect(pairedProgression(report, 0, 1)[1]).toEqual([-0.5, -1.7, -0.5, 0.7000000000000001, 2]);
    expect(pairedProgression(report, 0, 0)[1]).toEqual([0, 0, 0, 0, 2]);
  });

  it('validates bounded trajectories, stable input indices and complete populations', () => {
    expect(validateReport(report, 2, 2)).toBe(true);
    expect(validateReport({ ...report, samples: 1 }, 2, 2)).toBe(false);
    expect(validateReport({ ...report, spatial_coverage: 33 }, 2, 2)).toBe(false);
    expect(validateReport({ ...report, crossing_times: [[[0, 10]]] }, 2, 2)).toBe(false);
    expect(validateReport({ ...report, runners: [null, report.runners[1]] }, 2, 2)).toBe(false);
    expect(validateReport({ ...report, spatial: [null] }, 2, 2)).toBe(false);
    expect(
      validateReport(
        {
          ...report,
          runners: report.runners.map((runner) => ({ ...runner, diagnostics: [null, null] }))
        },
        2,
        2
      )
    ).toBe(false);
  });

  it('reuses the prefix of baseline seeds for preliminary build comparisons', () => {
    const alternative = {
      ...result,
      runs: 1,
      seeds: [42],
      finish_order: [[1, 0]],
      finish_times: [[9, 8]],
      last_spurt_decisions: [[8, 1]]
    };

    const delta = compareOutcomes(result, alternative, 0);
    expect(delta.mean).toBe(1);
    expect(delta.count).toBe(1);
    expect(delta.winChange).toBe(-100);
    expect(delta.spurtChange).toBe(-100);
    expect(delta.interval).toBeUndefined();
    expect(() => compareOutcomes(result, { ...alternative, seeds: [43] }, 0)).toThrow(
      /seed mapping/
    );

    expect(() => compareOutcomes(result, { ...alternative, engine_build: 'changed' }, 0)).toThrow(
      /engine/
    );
  });

  it('validates all-run trajectories and initialized HP before worker calculations', async () => {
    const telemetry = {
      interval_seconds: 1,
      offsets: [0, 2, 4, 6, 8],
      finish_seconds: [1.5, 1.5, 1.8, 1.8],
      finish_values: Array.from({ length: 4 }, () => [100, 1, 20, 10]),
      columns: Array.from({ length: 4 }, () => new Float32Array(8))
    };

    const v2 = { ...report, version: 2 as const, telemetry };

    expect(validateReport(v2, 2, 2)).toBe(true);
    expect(validateReport({ ...v2, elapsed_seconds: [0, 0.5] }, 2, 2)).toBe(false);
    expect(
      validateReport({ ...v2, telemetry: { ...telemetry, offsets: [0, 2, 4, 6, 7] } }, 2, 2)
    ).toBe(false);

    expect(() =>
      validateSimulatorResponse(
        '/monte-carlo',
        { input: { runners: [{}, {}] } },
        {
          ...result,
          max_hp: [
            [100, 100],
            [100, 0]
          ],
          report: v2
        }
      )
    ).toThrow();

    expect(() =>
      validateSimulatorResponse(
        '/monte-carlo',
        { input: { runners: [{}, {}] } },
        {
          ...result,
          max_hp: [
            [100, 100],
            [100, 100]
          ],
          report: v2
        }
      )
    ).not.toThrow();
  });

  it('decodes maintained MessagePack and preserves authenticated request options', async () => {
    const packed = encode({ ...result, report });
    expect(
      await decodeSimulatorBody(
        packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength) as ArrayBuffer
      )
    ).toEqual({ ...result, report });

    let options: unknown;
    const repo = createSimulatorRepository(async (_path, value) => {
      options = value;
      return packed.buffer.slice(
        packed.byteOffset,
        packed.byteOffset + packed.byteLength
      ) as ArrayBuffer;
    });

    const decoded = await repo.monteCarlo({
      body: { input: { runners: [{}, {}] }, output_mode: 'report', output_format: 'msgpack' }
    });

    expect(decoded.result.report?.samples).toBe(2);
    expect(options).toMatchObject({ responseType: 'arrayBuffer', method: 'POST' });
  });
});
