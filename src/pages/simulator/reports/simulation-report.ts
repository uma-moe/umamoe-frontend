import type { MonteCarloResult } from '../simulator-repository';
import { simulatorSampleSummary } from '../simulator-results';
import { resolveEncodedSkill, skillRarity, type SkillData } from '@/lib/game-data/skills/skills';
import type { SimulatorUma } from '../simulator-uma';
import type { SkillDistributionRow } from './skills/skill-distributions';

/** Mean, p10, median, p90, sample count. Lateral measurements are metres from the inner rail. */
export type ReportBand = [number, number, number, number, number];
export interface ReportDiagnostic {
  start_delay_seconds: number;
  gate: number;
  start_dash_end_seconds: number | null;
  mid_place: number | null;
  late_place: number | null;
  blocked_seconds: number;
  rushed_seconds: number;
  downhill_seconds: number;
  spot_struggle_seconds: number;
  duel_seconds: number;
  mode_seconds_by_phase: number[][];
  spurt_start_m: number | null;
  spurt_target_speed_mps: number | null;
  spurt_onset_seconds?: number | null;
  full_spurt_target_speed_mps?: number | null;
  spurt_acceleration_seconds: number | null;
  exhausted_at: [number, number] | null;
  rng_cursor: number;
  hp_applications: {
    time: number;
    skillId: number;
    casterHorseIndex: number;
    targetHorseIndex: number;
    requestedHpDelta: number;
    appliedHpDelta: number;
  }[];
  skill_checks?: [number, number, [number, number, number]][];
}

export interface SimulationReport {
  version: 1 | 2;
  clock: 'simulation_elapsed';
  units: string[];
  samples: number;
  distance_m: number[];
  elapsed_seconds: number[];
  runners: {
    source_input_index: number;
    distance: ReportBand[][];
    elapsed: ReportBand[][];
    diagnostics: ReportDiagnostic[];
    skill_checks?: [number, number, [number, number, number]][];
    representative_runs: [number, number, number];
  }[];
  crossing_times: number[][][] | Float32Array;
  crossing_shape?: [number, number, number];
  spatial: { run_index: number; trajectories: number[][][] }[];
  spatial_coverage: number;
  telemetry?: ReportTelemetry;
}

export interface ReportTelemetry {
  interval_seconds: number;
  offsets: number[];
  finish_seconds: number[];
  finish_values: number[][];
  columns: Float32Array[];
  leaders?: Float32Array;
}

export interface BuildComparison {
  version: 1;
  source_input_index: number;
  alternatives: [string, MonteCarloResult][];
}

/**
 * One colour per runner, by input slot. The first eight are distinct hues ordered so neighbours stay apart under colour-blindness,
 * and every one clears 3:1 against both the dark and light chart surfaces (checked with the dataviz palette validator).
 * Slots 9–18 are a second ring of hues; runners always carry their portrait and name as well, so colour is never the only cue.
 */
export const RUNNER_COLORS = [
  '#3a86e0',
  '#e2672d',
  '#17a673',
  '#c08000',
  '#df5f90',
  '#3c9a3c',
  '#8173e6',
  '#e0524f',
  '#1d9db5',
  '#b06a2a',
  '#b259bb',
  '#7d9c18',
  '#5a6fd0',
  '#c25479',
  '#8f8a1c',
  '#3a98cc',
  '#d26f4f',
  '#9a7fd8'
];

export const runnerColor = (source: number) => RUNNER_COLORS[source % RUNNER_COLORS.length]!;
export function reportNumber(value: number | null | undefined, digits = 2) {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
}

export function reportMean(values: (number | null | undefined)[]) {
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  return finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : undefined;
}

/** Positive values mean seconds gained by the compared runner at the same distance. */
export function pairedProgression(
  report: SimulationReport,
  reference: number,
  source: number
): ReportBand[] {
  return report.distance_m.map((_, point) => {
    const s = simulatorSampleSummary(
      Array.from(
        { length: report.samples },
        (_, run) =>
          reportCrossing(report, run, reference, point) - reportCrossing(report, run, source, point)
      )
    );

    return s ? [s.mean, s.p10, s.median, s.p90, s.count] : [0, 0, 0, 0, 0];
  });
}

/** Matched seeds control the setup; native RNG draws may diverge after the build changes. */
export function compareOutcomes(
  baseline: MonteCarloResult,
  alternative: MonteCarloResult,
  source: number
) {
  if (
    baseline.engine_build !== alternative.engine_build ||
    alternative.seeds.some((seed, i) => baseline.seeds[i] !== seed)
  )
    throw new Error(
      'The comparison engine or seed mapping changed. Run the main simulation again.'
    );
  const gains = alternative.finish_times.map(
    (row, i) => baseline.finish_times[i]![source]! - row[source]!
  );

  const s = simulatorSampleSummary(gains)!;
  const win = (r: MonteCarloResult) =>
    (r.finish_order.filter((row) => row[0] === source).length / r.runs) * 100;

  const spurt = (r: MonteCarloResult) =>
    r.last_spurt_decisions?.filter((row) => row[source] === 1).length;

  const margin = s.count > 1 ? (1.96 * s.sd) / Math.sqrt(s.count) : undefined;
  return {
    ...s,
    interval: margin === undefined ? undefined : [s.mean - margin, s.mean + margin],
    winChange:
      win(alternative) -
      win({
        ...baseline,
        runs: alternative.runs,
        finish_order: baseline.finish_order.slice(0, alternative.runs)
      }),
    spurtChange:
      spurt(alternative) == null || spurt(baseline) == null
        ? undefined
        : ((spurt(alternative)! -
            baseline
              .last_spurt_decisions!.slice(0, alternative.runs)
              .filter((row) => row[source] === 1).length) /
            alternative.runs) *
          100
  };
}

export function prioritySkills(
  uma: SimulatorUma,
  rows: SkillDistributionRow[],
  skillLookup: Map<number, SkillData>,
  distance: number,
  result?: MonteCarloResult
) {
  return rows
    .map((row) => {
      const resolved = resolveEncodedSkill(skillLookup, row.id);
      const skill = resolved.skill;
      const rarity = skillRarity(skill, resolved.inherited);
      const unique = rarity === 'unique-main' || rarity === 'unique-inherited';
      const learned = uma.skills.find((learned) => learned.skillId === row.id);
      const owned = rarity === 'unique-main' && learned !== undefined;
      const effects = row.procs.flatMap(
        ({ run, proc }) =>
          result?.skill_procs?.[run]?.effects.slice(proc[8], proc[8] + proc[9]) ?? []
      );

      const importance = () => {
        if (owned) return { reason: 'Owned unique', priority: 100 };

        if (effects.some((effect) => effect[1] === 10 || effect[1] === 14))
          return { reason: 'Start consistency', priority: 90 };

        if (effects.some((effect) => effect[1] === 9 && effect[3] > 0))
          return { reason: 'HP and spurt feasibility', priority: 85 };

        if (effects.some((effect) => effect[3] < 0 && effect[2] !== 0))
          return { reason: 'Opponent interference', priority: 80 };

        if (effects.some((effect) => effect[1] === 31))
          return { reason: 'Acceleration window', priority: 75 };

        if (unique) return { reason: 'Inherited unique', priority: 70 };

        if (skill?.rarity === 2) return { reason: 'Gold skill', priority: 60 };

        return { reason: 'Activation observations', priority: 20 };
      };

      return { ...row, ...importance(), owned, level: learned?.level ?? 1 };
    })
    .sort((a, b) => b.priority - a.priority || b.total - a.total || a.id - b.id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function numbers(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(Number.isFinite);
}

function skillChecks(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 65535) return false;
  return value.every((check) => {
    if (!Array.isArray(check) || check.length !== 3) return false;
    const [skill, alternative, attempts] = check;
    return (
      Number.isSafeInteger(skill) &&
      skill >= 0 &&
      Number.isSafeInteger(alternative) &&
      alternative >= 0 &&
      numbers(attempts) &&
      attempts.length === 3 &&
      attempts.every((attempt) => Number.isSafeInteger(attempt) && attempt >= 0)
    );
  });
}

function reportDiagnostic(value: unknown, count: number): boolean {
  if (!isRecord(value)) return false;
  const required = [
    'start_delay_seconds',
    'blocked_seconds',
    'rushed_seconds',
    'downhill_seconds',
    'spot_struggle_seconds',
    'duel_seconds',
    'gate',
    'rng_cursor'
  ];

  if (!required.every((field) => Number.isFinite(value[field]))) return false;
  const { gate, rng_cursor: cursor, mode_seconds_by_phase: modes } = value;
  if (typeof gate !== 'number' || !Number.isInteger(gate) || gate < 1 || gate > count) return false;
  if (typeof cursor !== 'number' || !Number.isSafeInteger(cursor) || cursor < 0) return false;
  if (
    !Array.isArray(modes) ||
    modes.length !== 4 ||
    !modes.every(
      (phase) => numbers(phase) && phase.length === 5 && phase.every((seconds) => seconds >= 0)
    )
  )
    return false;
  const optional = [
    'start_dash_end_seconds',
    'spurt_start_m',
    'spurt_target_speed_mps',
    'spurt_acceleration_seconds',
    'spurt_onset_seconds',
    'full_spurt_target_speed_mps'
  ];

  if (!optional.every((field) => value[field] == null || Number.isFinite(value[field])))
    return false;
  for (const place of [value.mid_place, value.late_place]) {
    if (
      place !== null &&
      (typeof place !== 'number' || !Number.isInteger(place) || place < 1 || place > count)
    )
      return false;
  }

  const exhausted = value.exhausted_at;
  if (exhausted !== null && (!numbers(exhausted) || exhausted.length !== 2)) return false;
  if (value.skill_checks !== undefined && !skillChecks(value.skill_checks)) return false;
  if (!Array.isArray(value.hp_applications)) return false;
  return value.hp_applications.every((application) => {
    if (!isRecord(application)) return false;
    const fields = [
      'time',
      'skillId',
      'casterHorseIndex',
      'targetHorseIndex',
      'requestedHpDelta',
      'appliedHpDelta'
    ];

    if (!fields.every((field) => Number.isFinite(application[field]))) return false;
    return [application.casterHorseIndex, application.targetHorseIndex].every(
      (source) =>
        typeof source === 'number' && Number.isInteger(source) && source >= 0 && source < count
    );
  });
}

function reportBands(value: unknown, points: number, metrics: number, runs: number): boolean {
  if (!Array.isArray(value) || value.length !== points) return false;
  return value.every(
    (point) =>
      Array.isArray(point) &&
      point.length === metrics &&
      point.every(
        (band) =>
          numbers(band) &&
          band.length === 5 &&
          band[4] !== undefined &&
          band[4] >= 0 &&
          band[4] <= runs
      )
  );
}

function reportTelemetry(value: unknown, curves: number): boolean {
  if (!isRecord(value) || value.interval_seconds !== 1) return false;
  const { offsets, finish_seconds: finishes, finish_values: endpoints, columns } = value;
  if (!numbers(offsets) || offsets.length !== curves + 1 || offsets[0] !== 0) return false;
  if (
    !offsets.every(
      (offset, index) =>
        Number.isSafeInteger(offset) &&
        offset >= 0 &&
        (index === 0 || offset > (offsets[index - 1] ?? Infinity))
    )
  )
    return false;
  if (!numbers(finishes) || finishes.length !== curves) return false;
  if (
    !finishes.every((finish, index) => {
      const start = offsets[index],
        end = offsets[index + 1];

      return (
        finish > 0 &&
        finish <= 1400 &&
        start !== undefined &&
        end !== undefined &&
        end - start === Math.ceil(finish)
      );
    })
  )
    return false;
  if (
    !Array.isArray(endpoints) ||
    endpoints.length !== curves ||
    !endpoints.every((endpoint) => numbers(endpoint) && endpoint.length === 4)
  )
    return false;
  return (
    Array.isArray(columns) &&
    columns.length === 4 &&
    columns.every(
      (column) =>
        column instanceof Float32Array &&
        column.length === offsets.at(-1) &&
        column.every(Number.isFinite)
    )
  );
}

export function validateReport(
  value: unknown,
  runs: number,
  count: number
): value is SimulationReport {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2)) return false;
  if (value.clock !== 'simulation_elapsed' || value.samples !== runs) return false;
  if (!Array.isArray(value.units) || value.units.join('|') !== 's|m/s|m/s|m/s²|HP|m') return false;
  const {
    distance_m: distances,
    elapsed_seconds: seconds,
    runners,
    crossing_times: crossings
  } = value;

  const ordered = (points: number[]) =>
    points.every(
      (point, index) => point >= 0 && (index === 0 || point > (points[index - 1] ?? Infinity))
    );

  if (!numbers(distances) || distances.length < 2 || distances.length > 128 || !ordered(distances))
    return false;
  if (!numbers(seconds) || seconds.length < 1 || seconds.length > 1400 || !ordered(seconds))
    return false;
  if (!Array.isArray(runners) || runners.length !== count) return false;
  const sources = new Set<number>();
  for (const runner of runners) {
    if (!isRecord(runner)) return false;
    const source = runner.source_input_index;
    if (
      typeof source !== 'number' ||
      !Number.isInteger(source) ||
      source < 0 ||
      source >= count ||
      sources.has(source)
    )
      return false;
    sources.add(source);
    if (
      !reportBands(runner.distance, distances.length, 6, runs) ||
      !reportBands(runner.elapsed, seconds.length, 4, runs)
    )
      return false;
    if (
      !Array.isArray(runner.diagnostics) ||
      runner.diagnostics.length !== runs ||
      !runner.diagnostics.every((diagnostic) => reportDiagnostic(diagnostic, count))
    )
      return false;
    if (runner.skill_checks !== undefined && !skillChecks(runner.skill_checks)) return false;
    const samples = runner.representative_runs;
    if (
      !numbers(samples) ||
      samples.length !== 3 ||
      !samples.every((sample) => Number.isInteger(sample) && sample >= 0 && sample < runs)
    )
      return false;
  }

  if (crossings instanceof Float32Array) {
    const shape = value.crossing_shape;
    if (
      !numbers(shape) ||
      shape.length !== 3 ||
      shape[0] !== runs ||
      shape[1] !== count ||
      shape[2] !== distances.length
    )
      return false;
    if (crossings.length !== runs * count * distances.length || !crossings.every(Number.isFinite))
      return false;
  } else {
    if (!Array.isArray(crossings) || crossings.length !== runs) return false;
    if (
      !crossings.every(
        (run) =>
          Array.isArray(run) &&
          run.length === count &&
          run.every((row) => numbers(row) && row.length === distances.length)
      )
    )
      return false;
  }

  if (value.version === 2) {
    if (
      !seconds.every((second, index) => second === index) ||
      !reportTelemetry(value.telemetry, runs * count)
    )
      return false;
  }

  const spatial = value.spatial;
  if (!Array.isArray(spatial) || spatial.length > 32 || spatial.length !== value.spatial_coverage)
    return false;
  return spatial.every((sample) => {
    if (!isRecord(sample)) return false;
    const index = sample.run_index;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= runs)
      return false;
    if (!Array.isArray(sample.trajectories) || sample.trajectories.length !== count) return false;
    return sample.trajectories.every(
      (trajectory) =>
        Array.isArray(trajectory) &&
        trajectory.length > 0 &&
        trajectory.length <= seconds.length &&
        trajectory.every((point) => numbers(point) && point.length === 4)
    );
  });
}

export const DIAGNOSTIC_FIELDS = [
  'start_delay_seconds',
  'gate',
  'start_dash_end_seconds',
  'mid_place',
  'late_place',
  'blocked_seconds',
  'rushed_seconds',
  'downhill_seconds',
  'spot_struggle_seconds',
  'duel_seconds',
  'mode_seconds_by_phase',
  'spurt_start_m',
  'spurt_onset_seconds',
  'spurt_target_speed_mps',
  'full_spurt_target_speed_mps',
  'spurt_acceleration_seconds',
  'exhausted_at',
  'hp_applications',
  'rng_cursor'
] as const;

/** Expand only the small diagnostic records; keep large crossing columns in float32 storage. */
export function normalizeReportResponse(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.report)) return value;
  const r = value.report;
  const shape = r.crossing_shape;
  if (r.crossing_times instanceof Uint8Array || Array.isArray(shape)) {
    if (
      !Array.isArray(shape) ||
      shape.length !== 3 ||
      !shape.every(Number.isInteger) ||
      shape[0] < 1 ||
      shape[0] > 1000 ||
      shape[1] < 2 ||
      shape[1] > 18 ||
      shape[2] < 2 ||
      shape[2] > 128
    )
      throw new Error('Invalid report crossing shape.');
    const size = shape[0] * shape[1] * shape[2],
      raw = r.crossing_times;

    if (raw instanceof Uint8Array) {
      if (raw.byteLength !== size * 4) throw new Error('Truncated report crossing data.');
      const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength),
        points = new Float32Array(size);

      for (let i = 0; i < size; i++) points[i] = view.getFloat32(i * 4, true);
      r.crossing_times = points;
    } else if (Array.isArray(raw) && raw.length === size && raw.every(Number.isFinite))
      r.crossing_times = Float32Array.from(raw);
    else if (!(raw instanceof Float32Array && raw.length === size))
      throw new Error('Invalid report crossing data.');
  }

  const telemetry = r.telemetry;
  if (telemetry != null) {
    if (!isRecord(telemetry)) throw new Error('Invalid trajectory data.');
    if (!Array.isArray(telemetry.columns) || telemetry.columns.length !== 4)
      throw new Error('Invalid trajectory columns.');
    telemetry.columns = telemetry.columns.map((raw) => {
      if (raw instanceof Float32Array) return raw;
      if (raw instanceof Uint8Array) {
        if (raw.byteLength % 4) throw new Error('Truncated trajectory data.');
        const data = new Float32Array(raw.byteLength / 4),
          view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

        for (let i = 0; i < data.length; i++) data[i] = view.getFloat32(i * 4, true);
        return data;
      }

      if (Array.isArray(raw) && raw.every(Number.isFinite)) return Float32Array.from(raw);
      throw new Error('Invalid trajectory data.');
    });
  }

  if (Array.isArray(r.runners))
    for (const runner of r.runners) {
      if (!isRecord(runner)) throw new Error('Invalid report runner.');
      if (!Array.isArray(runner.diagnostics)) continue;
      runner.diagnostics = runner.diagnostics.map((row) => {
        if (!Array.isArray(row)) return row;
        const fields = r.diagnostic_fields;
        if (
          !Array.isArray(fields) ||
          fields.length !== DIAGNOSTIC_FIELDS.length ||
          fields.some((f, i) => f !== DIAGNOSTIC_FIELDS[i]) ||
          row.length !== fields.length
        )
          throw new Error('Incompatible report diagnostic fields.');
        const record = Object.fromEntries(fields.map((field, i) => [field, row[i]]));
        if (!Array.isArray(record.hp_applications)) throw new Error('Invalid report HP records.');
        record.hp_applications = record.hp_applications.map((a: unknown) => {
          if (!Array.isArray(a) || a.length !== 6 || !a.every(Number.isFinite))
            throw new Error('Invalid report HP application.');
          return {
            time: a[0],
            skillId: a[1],
            casterHorseIndex: a[2],
            targetHorseIndex: a[3],
            requestedHpDelta: a[4],
            appliedHpDelta: a[5]
          };
        });

        return record;
      });
    }

  return value;
}

export function reportCrossing(
  report: SimulationReport,
  run: number,
  source: number,
  point: number
): number {
  return report.crossing_times instanceof Float32Array
    ? report.crossing_times[
        (run * report.crossing_shape![1] + source) * report.distance_m.length + point
      ]!
    : report.crossing_times[run]![source]![point]!;
}

/** Transfer proc columns without cloning hundreds of thousands of tiny numeric arrays. */
export function packReportTraces(value: unknown): ArrayBuffer[] {
  const root = value as {
    report?: unknown;
    skill_procs?: { activations: number[][] | Float64Array; effects: number[][] | Float64Array }[];
  };

  if (!root?.report || !root.skill_procs) return [];
  const buffers: ArrayBuffer[] = [];
  for (const [key, width] of [
    ['activations', 10],
    ['effects', 4]
  ] as const) {
    const flat = new Float64Array(
      root.skill_procs.reduce((sum, trace) => sum + (trace[key] as number[][]).length * width, 0)
    );

    let offset = 0;
    for (const trace of root.skill_procs) {
      const rows = trace[key] as number[][],
        end = offset + rows.length * width;

      rows.forEach((row, i) => flat.set(row, offset + i * width));
      trace[key] = flat.subarray(offset, end);
      offset = end;
    }

    buffers.push(flat.buffer as ArrayBuffer);
  }

  return buffers;
}

export async function expandReportTraces(value: unknown): Promise<void> {
  const root = value as {
    report?: unknown;
    skill_procs?: { activations: number[][] | Float64Array; effects: number[][] | Float64Array }[];
  };

  if (!root?.report || !root.skill_procs) return;
  const scheduler = (globalThis as unknown as { scheduler?: { yield: () => Promise<void> } })
    .scheduler;

  for (const [index, trace] of root.skill_procs.entries()) {
    for (const [key, width] of [
      ['activations', 10],
      ['effects', 4]
    ] as const) {
      const flat = trace[key];
      if (!(flat instanceof Float64Array)) continue;
      trace[key] = Array.from(
        { length: flat.length / width },
        (_, i) => flat.subarray(i * width, (i + 1) * width) as unknown as number[]
      );
    }

    if ((index + 1) % 32 === 0)
      await (scheduler
        ? scheduler.yield()
        : new Promise<void>((resolve) => setTimeout(resolve, 0)));
  }
}
