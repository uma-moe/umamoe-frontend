import { describe, expect, it } from 'vitest';
import { trajectoryAtTime } from '@/lib/race/race-ensemble';
import { telemetryEnsemble, telemetryReplay } from './report-replay';
import { runnerColor, type ReportTelemetry, type SimulationReport } from '../simulation-report';
import { createSimulatorUma } from '../../simulator-uma';
import type { MonteCarloResult } from '../../simulator-repository';

const course = { course_id: 10601, race_track_id: 10006, distance: 100, distance_type: 2, surface: 1, turn: 2, course: 1 };
// Two runners, two races; curve = source * samples + run. Runner A finishes at 1.5 s / 1.8 s, runner B at 2.5 s / 1.2 s.
const telemetry: ReportTelemetry = {
  interval_seconds: 1, offsets: [0, 2, 4, 7, 9], finish_seconds: [1.5, 1.8, 2.5, 1.2],
  finish_values: [[100, 2, 20, 10], [100, 4, 22, 20], [100, 3, 19, 5], [100, 1, 21, 15]],
  columns: [Float32Array.from([0, 60, 0, 50, 0, 40, 80, 0, 90]), Float32Array.from([1, 2, 3, 4, 2, 2, 3, 1, 1]), Float32Array.from([18, 20, 19, 22, 17, 19, 19, 20, 21]), Float32Array.from([100, 50, 200, 100, 100, 60, 20, 200, 80])]
};
const result = { runs: 2, seeds: [11, 12], finish_order: [[0, 1], [1, 0]], finish_times: [[1.5, 2.5], [1.8, 1.2]],
  report: { version: 2, clock: 'simulation_elapsed', samples: 2, elapsed_seconds: [0, 1, 2], distance_m: [0, 100], runners: [{ source_input_index: 0 }, { source_input_index: 1 }], telemetry } as unknown as SimulationReport } as unknown as MonteCarloResult;

describe('mean replay from report telemetry', () => {
  it('rebuilds one race in input order with every finish on its own frame', () => {
    const replay = telemetryReplay(result, 0, course, 10);
    expect(replay.runner_source_indices).toEqual([0, 1]);
    expect(replay.seed).toBe(11);
    expect(replay.frames.map(frame => frame.time)).toEqual([0, 1, 1.5, 2, 2.5]);
    // Before her finish a runner follows the telemetry; lane metres become track-width units.
    expect(replay.frames[1]!.runners[0]).toMatchObject({ distance: 60, speed_units: 2000, hp_units: 50 });
    expect(replay.frames[1]!.runners[0]!.lane_units).toBeCloseTo(2 * 999.9);
    // From her finish on she holds the line with her finishing values.
    expect(replay.frames[2]!.runners[0]).toMatchObject({ distance: 100, hp_units: 10 });
    expect(replay.frames[3]!.runners[1]).toMatchObject({ distance: 80 });
    expect(replay.frames[4]!.runners[1]).toMatchObject({ distance: 100, speed_units: 1900 });
  });

  it('averages every sampled race at the same elapsed time and colours runners as the report does', () => {
    const umas = ['A', 'B'].map(createSimulatorUma);
    const ensemble = telemetryEnsemble(result, umas, course, 10)!;
    expect(ensemble.trajectories.map(trajectory => trajectory.sample)).toEqual([0, 1]);
    expect(ensemble.trajectories[1]!.finishTimes[1]).toBeCloseTo(1.2);
    expect(trajectoryAtTime(ensemble.trajectories[0]!, 1)[0]).toBeCloseTo(60);
    const second = ensemble.mean.frames.find(frame => frame.time === 1)!;
    expect(second.horses[0]!.distance).toBeCloseTo((60 + 50) / 2);
    expect(second.horses[1]!.distance).toBeCloseTo((40 + 90) / 2);
    expect(ensemble.mean.runners.map(runner => runner.raw.team_color)).toEqual([runnerColor(0), runnerColor(1)]);
    expect(ensemble.mean.runners.every(runner => runner.result === undefined)).toBe(true);
  });

  it('spreads a large batch evenly and needs telemetry', () => {
    const umas = ['A', 'B'].map(createSimulatorUma);
    expect(telemetryEnsemble(result, umas, course, 10, {}, 1)!.trajectories).toHaveLength(1);
    expect(telemetryEnsemble({ ...result, report: { ...result.report!, telemetry: undefined } }, umas, course, 10)).toBeUndefined();
  });
});
