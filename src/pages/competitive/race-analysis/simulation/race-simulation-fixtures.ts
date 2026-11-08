import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/capture/race-capture-parser';
import type { MonteCarloResult } from '@/pages/simulator/simulator-repository';

export function runner(
  index: number,
  options: { sourceIndex?: number; raw?: Record<string, unknown>; trainerName?: string } = {}
) {
  const { sourceIndex, raw = {}, trainerName } = options;

  return {
    index,
    sourceIndex,
    name: 'Runner ' + (index + 1),
    trainerName,
    isPlayer: false,
    cardId: 100101,
    stats: { speed: 1200, stamina: 900, power: 1000, guts: 600, wit: 800 },
    aptitudes: {},
    skillIds: [],
    raw: { running_style: 2, motivation: 4, skill_array: [], ...raw }
  } satisfies RaceRunner;
}

export function capture(runners: RaceRunner[]): ParsedRaceCapture {
  return {
    source: 'api',
    fileName: 'race.json',
    courseId: 10506,
    raceInstanceId: 1101,
    randomSeed: 42,
    track: { condition: '2', weather: '1', season: '5' },
    runners,
    frames: [],
    events: []
  };
}

/** The race once the simulator has raced its upload; each call is a separate simulated race. */
export function simulated(recorded: ParsedRaceCapture): ParsedRaceCapture {
  return {
    ...recorded,
    original: {},
    detailed: {
      engineBuild: 'test',
      seed: 42,
      replay: { data: '' },
      annotations: { schemaVersion: 1, flags: {}, horses: [] }
    }
  };
}

export function monteCarlo(
  finishOrder: number[][],
  seating: { gates?: number[][]; moods?: number[][] } = {}
): MonteCarloResult {
  return {
    schema_version: 5,
    engine_build: 'test',
    runs: finishOrder.length,
    seeds: finishOrder.map((_, run) => 1000 + run),
    ...seating,
    finish_order: finishOrder,
    finish_times: finishOrder.map((order) => order.map(() => 150))
  };
}
