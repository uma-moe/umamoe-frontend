import { expect, it } from 'vitest';
import { skillDistributions, skillHistogram } from './skill-distributions';
import { binomialProbabilities } from '@/lib/carat-planner/gacha/planner-pull-probability';
import type { MonteCarloResult, SimulatorProc } from '../../simulator-repository';
import type { SimulationReport } from '../simulation-report';

it('clips duration at the runner’s own finish using the simulation clock', () => {
  const report = {
    distance_m: [0, 100],
    crossing_shape: [1, 2, 2],
    crossing_times: Float32Array.from([0, 10, 0, 20])
  } as SimulationReport;

  const result: MonteCarloResult = {
    schema_version: 5,
    engine_build: 'test',
    runs: 1,
    seeds: [1],
    finish_order: [[0, 1]],
    finish_times: [[6, 12]],
    report,
    skill_procs: [{ activations: [[0, 200101, 0, 1, 8, 80, 5, 1, 0, 0]], effects: [] }]
  };

  const row = skillDistributions(result, 0, []).rows[0]!;
  expect(row).toMatchObject({ duration: 2, activePerRace: 2, observedDurations: [2] });
  expect(row.procs[0]!.proc[6]).toBe(5);
});

it('distributes primary activations by time and duration and keeps zero-proc races', () => {
  const proc = (start: number, duration: number, flags = 1): SimulatorProc => [
    0,
    200101,
    0,
    0,
    start,
    start * 20,
    duration,
    flags,
    0,
    0
  ];

  const result: MonteCarloResult = {
    schema_version: 5,
    engine_build: 'test',
    runs: 2,
    seeds: [1, 2],
    finish_order: [
      [0, 1],
      [1, 0]
    ],
    finish_times: [
      [100, 101],
      [101, 100]
    ],
    skill_procs: [
      {
        activations: [proc(0, 4), proc(2, 4), proc(0, 8, 2), [1, 200101, 0, 0, 0, 0, 8, 1, 0, 0]],
        effects: []
      },
      { activations: [], effects: [] }
    ]
  };

  const data = skillDistributions(result, 0, [200101, 200102]);
  const row = data.rows[0]!;
  expect(row).toMatchObject({
    triggered: 1,
    rate: 50,
    total: 2,
    counts: [2, 0],
    duration: 4,
    time: 1,
    distance: 20,
    timing: { mean: 1, median: 1, min: 0, max: 2 },
    durations: { mean: 4, sd: 0 },
    countSummary: { mean: 1, max: 2 },
    activePerRace: 4
  });

  expect(row.interval[0]).toBeLessThan(50);
  expect(row.interval[1]).toBeGreaterThan(50);
  expect(skillHistogram(row, 'time', 8, 4)).toEqual([50, 50, 0, 0]);
  expect(skillHistogram(row, 'distance', 80, 4)).toEqual([50, 0, 50, 0]);
  expect(skillHistogram(row, 'duration', 8, 4)).toEqual([0, 0, 100, 0]);
  expect(skillHistogram(row, 'duration', 5, 4, 3)).toEqual([0, 0, 100, 0]);
  expect(skillHistogram(row, 'counts', 2, 3)).toEqual([50, 0, 50]);
  expect(data.rows[1]).toMatchObject({
    rate: 0,
    counts: [0, 0],
    timing: undefined,
    durations: undefined,
    activePerRace: 0
  });

  const kinds = skillDistributions(
    {
      ...result,
      skill_procs: [
        { activations: [proc(0, -0.0001), proc(1, 0)], effects: [] },
        { activations: [], effects: [] }
      ]
    },
    0,
    []
  ).rows[0]!;

  expect(kinds).toMatchObject({ passive: true, instant: true, duration: undefined });
  expect(skillHistogram(kinds, 'duration', 8, 4)).toEqual([0, 0, 0, 0]);
  expect(skillHistogram(data.rows[1]!, 'counts', 2, 3)).toEqual([100, 0, 0]);
});

it('keeps binomial probabilities normalized at the supported batch size and handles certain outcomes', () => {
  expect(binomialProbabilities(2, 0.5)).toEqual([0.25, 0.5, 0.25]);
  expect(binomialProbabilities(2, 0)).toEqual([1, 0, 0]);
  expect(binomialProbabilities(2, 1)).toEqual([0, 0, 1]);
  const probabilities = binomialProbabilities(1000, 0.9);
  expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
  expect(probabilities.reduce((sum, value, index) => sum + index * value, 0)).toBeCloseTo(900, 8);
  expect(probabilities.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
});
