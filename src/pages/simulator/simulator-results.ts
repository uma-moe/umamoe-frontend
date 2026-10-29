import type { ParsedRaceCapture } from '@/lib/race/capture/race-capture-parser';
import type { RaceCourse } from '@/lib/game-data/racing/courses';
import { winRateInterval } from '@/lib/race/win-rate-interval';
import type { MonteCarloResult } from './simulator-repository';
import { simulatorUmaSummary, type SimulatorUma } from './simulator-uma';

export interface SimulatorReplay {
  schema_version: number;
  seed: number;
  course_id: number;
  runner_source_indices: number[];
  results?: {
    source_input_index: number;
    finish_order: number;
    finish_time_seconds: number;
    finish_time_raw_seconds: number;
  }[];
  frames: {
    time: number;
    runners: {
      distance: number;
      lane_units: number;
      speed_units: number;
      hp_units: number;
      temptation: number;
      block_front_index: number;
    }[];
  }[];
  events: { time_seconds: number; event_type: number; parameters: number[] }[];
}

const mean = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

/** Observed spread, with interpolated quantiles and sample standard deviation. */
export function simulatorSampleSummary(values: number[]) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b),
    centre = mean(sorted)!;

  const quantile = (p: number) => {
    const position = (sorted.length - 1) * p,
      left = Math.floor(position),
      fraction = position - left;

    return sorted[left]! * (1 - fraction) + sorted[Math.ceil(position)]! * fraction;
  };

  return {
    count: sorted.length,
    min: sorted[0]!,
    max: sorted.at(-1)!,
    mean: centre,
    median: quantile(0.5),
    p10: quantile(0.1),
    p90: quantile(0.9),
    sd:
      sorted.length > 1
        ? Math.sqrt(
            sorted.reduce((sum, value) => sum + (value - centre) ** 2, 0) / (sorted.length - 1)
          )
        : 0
  };
}

function finishDistribution(values: number[], min: number, max: number) {
  const samples = values
    .map((time, sample) => ({ time, sample }))
    .sort((a, b) => a.time - b.time || a.sample - b.sample);

  const binCount = Math.min(64, Math.max(24, Math.ceil(Math.sqrt(values.length)) * 3)),
    bins = Array<number>(binCount).fill(0);

  for (const sample of samples)
    bins[
      Math.min(
        binCount - 1,
        Math.max(0, Math.floor(((sample.time - min) / (max - min)) * binCount))
      )
    ]!++;
  return { ...simulatorSampleSummary(values)!, samples, bins };
}

/** Compare positions within the same race, including races neither runner won. */
export function simulatorMatchups(result: MonteCarloResult, count: number) {
  return Array.from({ length: count }, (_, source) =>
    Array.from({ length: count }, (_, opponent) => {
      if (source === opponent) return undefined;
      const ahead = result.finish_order.filter(
        (order) => order.indexOf(source) < order.indexOf(opponent)
      ).length;

      return {
        ahead,
        rate: (ahead / result.runs) * 100,
        gap: mean(result.finish_times.map((times) => times[source]! - times[opponent]!))!,
        interval: winRateInterval(ahead, result.runs)
      };
    })
  );
}

/** Shared time axis and equal-width bins; every sample contributes once per included runner. */
export function simulatorFinishDistributions(
  result: MonteCarloResult,
  count: number,
  sources = Array.from({ length: count }, (_, source) => source)
) {
  const times = result.finish_times.flatMap((row) => sources.map((source) => row[source]!)),
    low = Math.min(...times),
    high = Math.max(...times);

  const padding = Math.max((high - low) * 0.04, 0.05),
    min = low - padding,
    max = high + padding;

  const runners = sources
    .map((source) => ({
      source,
      ...finishDistribution(
        result.finish_times.map((row) => row[source]!),
        min,
        max
      )
    }))
    .sort((a, b) => a.median - b.median || a.source - b.source);

  return { min, max, runners, peak: Math.max(1, ...runners.flatMap((runner) => runner.bins)) };
}

/** Pair each result with its opponent in the same race, preserving field interactions. */
export function simulatorHeadToHead(result: MonteCarloResult, source: number, opponent: number) {
  const gaps = result.finish_times.map((row) => row[source]! - row[opponent]!);
  const extent = Math.max(0.05, ...gaps.map((gap) => Math.abs(gap) * 1.04));
  const ahead = result.finish_order.filter(
    (order) => order.indexOf(source) < order.indexOf(opponent)
  ).length;

  return {
    ...finishDistribution(gaps, -extent, extent),
    min: -extent,
    max: extent,
    ahead,
    rate: (ahead / result.runs) * 100,
    interval: winRateInterval(ahead, result.runs)
  };
}

/** A rerun may only be shown as a batch sample when its seed, engine and outcome still match. */
export function simulatorSampleReplay(
  batch: MonteCarloResult,
  rerun: MonteCarloResult,
  sample: number
): SimulatorReplay {
  if (
    rerun.runs !== 1 ||
    rerun.engine_build !== batch.engine_build ||
    rerun.seeds[0] !== batch.seeds[sample] ||
    rerun.first_replay?.seed !== batch.seeds[sample] ||
    JSON.stringify(rerun.finish_order[0]) !== JSON.stringify(batch.finish_order[sample]) ||
    rerun.finish_times[0]?.length !== batch.finish_times[sample]?.length ||
    rerun.finish_times[0]!.some(
      (time, source) => Math.abs(time - batch.finish_times[sample]![source]!) > 0.001
    )
  ) {
    throw new Error(
      'This replay no longer matches the sampled result. Run a new batch to use the current simulator engine.'
    );
  }

  return rerun.first_replay!;
}

export function simulatorResults(result: MonteCarloResult, count: number) {
  return Array.from({ length: count }, (_, source) => {
    const places = result.finish_order
      .map((order) => order.indexOf(source) + 1)
      .filter((place) => place > 0);

    const values = (matrix?: number[][]) =>
      (matrix ?? []).map((run) => run[source]!).filter(Number.isFinite);

    const times = values(result.finish_times),
      decisions = values(result.last_spurt_decisions);

    const wins = places.filter((place) => place === 1).length,
      hpValues = values(result.final_hp);

    return {
      source,
      wins,
      winRate: result.runs ? (wins / result.runs) * 100 : 0,
      interval: winRateInterval(wins, result.runs),
      top3: (places.filter((place) => place <= 3).length / result.runs) * 100,
      finishes: Array.from(
        { length: count },
        (_, index) => places.filter((place) => place === index + 1).length
      ),
      place: mean(places),
      time: mean(times),
      best: times.length ? Math.min(...times) : null,
      hp: mean(hpValues),
      hpSummary: simulatorSampleSummary(hpValues),
      depleted: hpValues.length
        ? (hpValues.filter((hp) => hp <= 0).length / hpValues.length) * 100
        : null,
      placeSummary: simulatorSampleSummary(places),
      timeSummary: simulatorSampleSummary(times),
      spurtCounts: [1, 2, 4, 8].map((decision) => ({
        decision,
        count: decisions.filter((value) => value === decision).length
      })),
      fullSpurt: decisions.length
        ? (decisions.filter((value) => value === 1).length / decisions.length) * 100
        : null
    };
  }).sort(
    (a, b) => b.wins - a.wins || (a.time ?? Infinity) - (b.time ?? Infinity) || a.source - b.source
  );
}

export function simulatorTeamResults(result: MonteCarloResult, umas: SimulatorUma[]) {
  const teams = new Map<number, number[]>();
  umas.forEach((uma, source) => {
    if (uma.teamId) teams.set(uma.teamId, [...(teams.get(uma.teamId) ?? []), source]);
  });

  return [...teams]
    .map(([id, sources]) => {
      const wins = result.finish_order.filter((order) => sources.includes(order[0]!)).length;
      const bestPlaces = result.finish_order.map((order) =>
        Math.min(...sources.map((source) => order.indexOf(source) + 1))
      );

      return {
        id,
        sources,
        wins,
        winRate: (wins / result.runs) * 100,
        interval: winRateInterval(wins, result.runs),
        place: mean(bestPlaces)
      };
    })
    .sort(
      (a, b) => b.wins - a.wins || (a.place ?? Infinity) - (b.place ?? Infinity) || a.id - b.id
    );
}

/** Frame arrays and event masks are in gate order, not input or finish order. */
export function simulatorReplayCapture(
  replay: SimulatorReplay,
  umas: SimulatorUma[],
  course: RaceCourse,
  track: ParsedRaceCapture['track'] = {}
): ParsedRaceCapture {
  const sources = replay.runner_source_indices;
  if (
    replay.schema_version !== 3 ||
    replay.course_id !== course.course_id ||
    sources.length !== umas.length ||
    new Set(sources).size !== umas.length ||
    sources.some((source) => !Number.isInteger(source) || !umas[source])
  ) {
    throw new Error('The returned replay does not match this race field or course.');
  }

  if (
    !Array.isArray(replay.frames) ||
    replay.frames.length < 2 ||
    replay.frames.some(
      (frame, index) =>
        !Number.isFinite(frame.time) ||
        (index > 0 && frame.time <= replay.frames[index - 1]!.time) ||
        frame.runners.length !== umas.length ||
        frame.runners.some(
          (runner) =>
            !Object.values(runner).every(Number.isFinite) ||
            runner.distance < 0 ||
            runner.lane_units < 0 ||
            runner.lane_units > 10000
        )
    )
  ) {
    throw new Error('The simulator returned invalid replay frames.');
  }

  if (
    !Array.isArray(replay.events) ||
    replay.events.some(
      (event) =>
        !Number.isFinite(event.time_seconds) ||
        !Number.isInteger(event.event_type) ||
        !Array.isArray(event.parameters) ||
        !event.parameters.every(Number.isInteger)
    )
  ) {
    throw new Error('The simulator returned invalid replay events.');
  }

  const finishes = replay.results;
  if (
    finishes &&
    (finishes.length !== umas.length ||
      new Set(finishes.map((finish) => finish.source_input_index)).size !== umas.length ||
      new Set(finishes.map((finish) => finish.finish_order)).size !== umas.length ||
      finishes.some(
        (finish) =>
          !Number.isInteger(finish.source_input_index) ||
          !umas[finish.source_input_index] ||
          !Number.isInteger(finish.finish_order) ||
          finish.finish_order < 0 ||
          finish.finish_order >= umas.length ||
          !Number.isFinite(finish.finish_time_seconds) ||
          !Number.isFinite(finish.finish_time_raw_seconds)
      ))
  ) {
    throw new Error('The simulator returned invalid replay results.');
  }

  const winnerTime = finishes
    ? Math.min(...finishes.map((finish) => finish.finish_time_seconds))
    : 0;

  return {
    source: 'api',
    fileName: 'Simulated race',
    courseId: course.course_id,
    raceDistance: course.distance,
    randomSeed: replay.seed,
    track,
    runners: sources.map((source, gate) => {
      const runner = simulatorUmaSummary(umas[source]!, gate, course),
        finish = finishes?.find((finish) => finish.source_input_index === source);

      if (finish)
        runner.result = {
          finishOrder: finish.finish_order + 1,
          finishTime: finish.finish_time_seconds,
          finishTimeRaw: finish.finish_time_raw_seconds,
          finishDiffTime: finish.finish_time_seconds - winnerTime,
          runningStyle: Number(runner.raw.runningStyle)
        };

      return runner;
    }),
    frames: replay.frames.map((frame) => ({
      time: frame.time,
      horses: frame.runners.map((runner) => ({
        distance: runner.distance,
        lanePosition: runner.lane_units,
        speed: runner.speed_units,
        hp: runner.hp_units,
        temptationMode: runner.temptation,
        blockFrontHorseIndex: runner.block_front_index
      }))
    })),
    events: replay.events.map((event) => ({
      frameTime: event.time_seconds,
      type: event.event_type,
      params: event.parameters
    }))
  };
}
