import { afterEach, describe, expect, it, vi } from 'vitest';
import { SkillImpactStore } from './skill-impact.svelte';
import { simulatorRepository, type MonteCarloResult } from '../../simulator-repository';
import type { MonteCarloInput } from '../../requests/race-sim-request';

const baseline: MonteCarloResult = { schema_version: 5, engine_build: 'test', runs: 2, seeds: [1, 2], finish_order: [[0, 1], [0, 1]], finish_times: [[100, 101], [100, 101]], last_spurt_decisions: [[1, 1], [1, 1]] };
afterEach(() => vi.restoreAllMocks());

describe('skill impact store', () => {
  it('sends at most four effect suppressions per request and records each skill', async () => {
    const calls: number[][] = [];
    vi.spyOn(simulatorRepository, 'comparison').mockImplementation(async ({ body }) => {
      const alternatives = body.alternatives as { name: string; suppress_skill: number }[];
      expect(alternatives.every(alt => !('remove_skill' in alt))).toBe(true);
      calls.push(alternatives.map(alt => alt.suppress_skill));
      return { raw: '', result: { version: 1, source_input_index: 0, alternatives: alternatives.map(alt => [alt.name, { ...baseline, finish_times: [[100.2, 101], [100.2, 101]] }]) } };
    });
    const store = new SkillImpactStore({ ...baseline, report: {} as MonteCarloResult['report'] }, {} as MonteCarloInput);
    await store.measure([{ source: 0, ids: [1, 2, 3, 4, 5, 6] }], 32);
    expect(calls).toEqual([[1, 2, 3, 4], [5, 6]]);
    expect(store.get(0, 6)?.mean).toBeCloseTo(-.2);
    expect(store.busy).toBe(false);
    // Measured skills are not requested again at the same sample size.
    await store.measure([{ source: 0, ids: [1, 7] }], 32);
    expect(calls.at(-1)).toEqual([7]);
  });
});
