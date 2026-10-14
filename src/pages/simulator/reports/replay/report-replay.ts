import type { ParsedRaceCapture, RaceFrame } from '@/lib/race/race-capture-parser';
import type { CourseCatalogEntry } from '@/lib/catalog/course-catalog';
import { compactRaceTrajectory, meanRaceCapture, trajectoryPreviewSamples, type RaceTrajectory } from '@/lib/race/race-ensemble';
import { telemetrySample } from '../telemetry/report-telemetry';
import { runnerColor } from '../simulation-report';
import { simulatorReplayCapture, type SimulatorReplay } from '../../simulator-results';
import type { MonteCarloResult } from '../../simulator-repository';
import type { SimulatorUma } from '../../simulator-uma';

/** Replay lanes are stored in units of the track width, 0 at the inner rail. */
const LANE_UNITS = 9999;
/** Every race drawn faintly costs a chart series; beyond this the races are spread evenly across the batch. */
export const MEAN_REPLAY_RACES = 200;

/** Whole seconds plus each runner's exact finish, so every finish lands on a frame. */
function frameTimes(finishes: number[]): number[] {
  const times = [...Array.from({ length: Math.floor(Math.max(...finishes)) + 1 }, (_, second) => second), ...finishes].sort((a, b) => a - b);
  return times.filter((time, index) => !index || time - times[index - 1]! > 1e-6);
}

/**
 * One sampled race rebuilt from the report telemetry as a replay with runners in input order.
 * Telemetry holds distance, lane (metres from the inner rail), speed (m/s) and HP once per elapsed second.
 */
export function telemetryReplay(result: MonteCarloResult, run: number, course: CourseCatalogEntry, laneWidth: number, count = result.finish_times[run]?.length ?? 0): SimulatorReplay {
  const report = result.report, t = report?.telemetry;
  if (!report || !t || run < 0 || run >= report.samples) throw new Error('This batch has no telemetry for race ' + (run + 1) + '.');
  const curves = Array.from({ length: count }, (_, source) => source * report.samples + run);
  const finishes = curves.map(curve => t.finish_seconds[curve]!);
  const scale = LANE_UNITS / Math.max(.1, laneWidth), lane = (metres: number) => Math.max(0, Math.min(LANE_UNITS, metres * scale));
  const frames = frameTimes(finishes).map(time => ({ time, runners: curves.map((curve, source) => {
    if (time >= finishes[source]! - 1e-6) {
      const [, sideways = 0, speed = 0, hp = 0] = t.finish_values[curve]!;
      return { distance: course.distance, lane_units: lane(sideways), speed_units: speed * 100, hp_units: Math.max(0, hp), temptation: 0, block_front_index: -1 };
    }
    return { distance: Math.max(0, Math.min(course.distance, telemetrySample(t, curve, time, 0))), lane_units: lane(telemetrySample(t, curve, time, 1)),
      speed_units: telemetrySample(t, curve, time, 2) * 100, hp_units: Math.max(0, telemetrySample(t, curve, time, 3)), temptation: 0, block_front_index: -1 };
  }) }));
  return { schema_version: 3, seed: result.seeds[run] ?? run, course_id: course.course_id, runner_source_indices: curves.map((_, source) => source), frames, events: [] };
}

export interface TelemetryEnsemble { mean: ParsedRaceCapture; trajectories: RaceTrajectory[]; runs: number }

/**
 * The mean race and every sampled race it averages, built from the report alone (no extra requests).
 * Runners stay in input order, so a replay runner index is the report's source index, coloured as everywhere in the report.
 */
export function telemetryEnsemble(result: MonteCarloResult, umas: SimulatorUma[], course: CourseCatalogEntry, laneWidth: number, track: ParsedRaceCapture['track'] = {}, limit = MEAN_REPLAY_RACES): TelemetryEnsemble | undefined {
  const report = result.report;
  if (!report?.telemetry || !report.samples || umas.length < 1) return undefined;
  const runs = trajectoryPreviewSamples(report.samples, limit), sources = umas.map((_, source) => source);
  // Validate one race fully; the others share its runners and only differ in frames.
  const base = simulatorReplayCapture(telemetryReplay(result, runs[0]!, course, laneWidth, umas.length), umas, course, track);
  base.runners.forEach(runner => { runner.raw = { ...runner.raw, team_color: runnerColor(runner.index) }; });
  const trajectories = runs.map((run, index) => {
    const replay = index ? telemetryReplay(result, run, course, laneWidth, umas.length) : undefined;
    const frames: RaceFrame[] = replay ? replay.frames.map(frame => ({ time: frame.time, horses: frame.runners.map(runner => ({ distance: runner.distance, lanePosition: runner.lane_units, speed: runner.speed_units, hp: runner.hp_units, temptationMode: 0, blockFrontHorseIndex: -1 })) })) : base.frames;
    return compactRaceTrajectory({ ...base, randomSeed: result.seeds[run] ?? run, frames }, sources, run, 0);
  });
  const mean = meanRaceCapture(trajectories, base);
  return { mean: { ...mean, fileName: 'Mean of ' + trajectories.length.toLocaleString('en-US') + ' races' }, trajectories, runs: report.samples };
}
