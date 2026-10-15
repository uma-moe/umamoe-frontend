import type { MonteCarloResult } from '../../simulator-repository';
import type { ReportBand, ReportTelemetry, SimulationReport } from '../simulation-report';
import { simulatorSampleSummary } from '../../simulator-results';

export interface RunnerTelemetry {
  source: number;
  runs: number;
  seconds: number[];
  bands: ReportBand[][];
  ranges: [number, number][];
  firstFinish: number;
  curves: Float32Array[];
  offsets: number[];
  finish: number[];
}

export function telemetrySample(
  t: ReportTelemetry,
  curve: number,
  time: number,
  metric: number
): number {
  const start = t.offsets[curve]!,
    end = t.offsets[curve + 1]!,
    finish = t.finish_seconds[curve]!;

  if (time >= finish) return t.finish_values[curve]![metric]!;
  const left = Math.min(end - start - 1, Math.floor(time)),
    a = t.columns[metric]![start + left]!;

  const next = left + 1,
    endTime = next < end - start ? next : finish,
    b = next < end - start ? t.columns[metric]![start + next]! : t.finish_values[curve]![metric]!;

  return a + ((b - a) * (time - left)) / Math.max(Number.EPSILON, endTime - left);
}

/** Max each actual field first; independent runner means cannot reconstruct its leader. */
export function telemetryLeaders(report: SimulationReport): Float32Array {
  const t = report.telemetry!,
    length = report.elapsed_seconds.length,
    result = new Float32Array(report.samples * length);

  for (let run = 0; run < report.samples; run++)
    for (let at = 0; at < length; at++)
      for (let source = 0; source < report.runners.length; source++) {
        const distance = telemetrySample(t, source * report.samples + run, at, 0),
          index = run * length + at;

        if (distance > result[index]!) result[index] = distance;
      }

  return result;
}

export function prepareRunnerTelemetry(
  report: SimulationReport,
  source: number,
  maxHp: number[]
): RunnerTelemetry {
  const telemetry = report.telemetry;
  if (!telemetry?.leaders) throw new Error('Runner trajectories need the sampled race leaders.');
  const leaders = telemetry.leaders;
  const runs = report.samples;
  const firstCurve = source * runs;
  const seconds = report.elapsed_seconds;
  const curves: Float32Array[] = [];
  const offsets = [0];
  const finish = telemetry.finish_seconds.slice(firstCurve, firstCurve + runs);
  const values: number[][] = [[], [], []];
  const ranges: [number, number][] = [
    [Infinity, -Infinity],
    [0, 100],
    [0, 0]
  ];

  const hpPercent = (hp: number, run: number) =>
    Math.max(0, Math.min(100, (hp / maxHp[run]!) * 100));

  for (let metric = 0; metric < 3; metric++) {
    const column: number[] = [];
    const range = ranges[metric]!;
    for (let run = 0; run < runs; run++) {
      const curve = firstCurve + run;
      for (let time = 0; time < Math.ceil(finish[run]!); time++) {
        let value: number;
        if (metric === 0) value = telemetrySample(telemetry, curve, time, 2);
        else if (metric === 1) value = hpPercent(telemetrySample(telemetry, curve, time, 3), run);
        else
          value = Math.max(
            0,
            leaders[run * seconds.length + time]! - telemetrySample(telemetry, curve, time, 0)
          );
        column.push(value);
        range[0] = Math.min(range[0], value);
        range[1] = Math.max(range[1], value);
      }

      let endpoint = 0;
      if (metric === 0) endpoint = telemetry.finish_values[curve]![2]!;
      else if (metric === 1) endpoint = hpPercent(telemetry.finish_values[curve]![3]!, run);
      column.push(endpoint);
      if (metric === 0) offsets.push(column.length);
    }

    curves.push(Float32Array.from(column));
  }

  const bands = seconds.map((time) => {
    values.forEach((samples) => (samples.length = 0));
    for (let run = 0; run < runs; run++) {
      if (time > finish[run]!) continue;
      const curve = firstCurve + run;
      values[0]!.push(telemetrySample(telemetry, curve, time, 2));
      values[1]!.push(hpPercent(telemetrySample(telemetry, curve, time, 3), run));
      values[2]!.push(
        Math.max(
          0,
          leaders[run * seconds.length + time]! - telemetrySample(telemetry, curve, time, 0)
        )
      );
    }

    return values.map((samples): ReportBand => {
      const summary = simulatorSampleSummary(samples);
      if (!summary) return [0, 0, 0, 0, 0];
      return [summary.mean, summary.p10, summary.median, summary.p90, summary.count];
    });
  });

  return {
    source,
    runs,
    seconds,
    bands,
    ranges,
    firstFinish: Math.min(...finish),
    curves,
    offsets,
    finish
  };
}

export function subsetTelemetry(report: SimulationReport, source: number): SimulationReport {
  const t = report.telemetry!,
    start = source * report.samples,
    end = start + report.samples,
    low = t.offsets[start]!,
    high = t.offsets[end]!;

  return {
    version: 2,
    clock: report.clock,
    units: report.units,
    samples: report.samples,
    distance_m: [],
    elapsed_seconds: report.elapsed_seconds,
    runners: [],
    crossing_times: [],
    spatial: [],
    spatial_coverage: 0,
    telemetry: {
      interval_seconds: 1,
      offsets: t.offsets.slice(start, end + 1).map((v) => v - low),
      finish_seconds: t.finish_seconds.slice(start, end),
      finish_values: t.finish_values.slice(start, end),
      columns: t.columns.map((c) => c.slice(low, high)),
      leaders: t.leaders
    }
  };
}

export function promptSpurtRate(result: MonteCarloResult, source: number): number | undefined {
  const rows = result.report?.runners.find((r) => r.source_input_index === source)?.diagnostics;
  const decisions = result.last_spurt_decisions;
  if (!rows || !decisions) return;
  const prompt = rows.filter((diagnostic, run) => {
    if (decisions[run]?.[source] !== 1 || diagnostic.spurt_start_m == null) return false;
    const firstCheck = result.spurt_calculation_distances?.[run]?.[source]?.[0];
    return firstCheck != null && diagnostic.spurt_start_m <= firstCheck + 0.001;
  });

  return (prompt.length / result.runs) * 100;
}
