import { describe, expect, it } from 'vitest';
import { buildMonteCarloRequest, type MonteCarloRunnerInput } from './race-sim-request';
import type { RaceSetupInput } from './stamina-request';
import { createTrainee } from './trainee';

const SETUP: RaceSetupInput = {
  raceInstanceId: 800023,
  raceType: 0,
  season: 1,
  weather: 1,
  ground: 1,
  startTimeType: 2
};

function runners(count: number): Array<MonteCarloRunnerInput> {
  return Array.from({ length: count }, () => ({ trainee: createTrainee() }));
}

describe('monte carlo request', () => {
  it('always sends JSON results and defaults to one generated run', () => {
    const body = buildMonteCarloRequest({ courseId: 11103, seed: 42, setup: SETUP, runners: runners(2) });

    expect(body.output_format).toBe('json');
    expect(body.output_mode).toBe('results');
    expect(body.runs).toBe(1);
    expect(body.seeds).toBeUndefined();
  });

  it('omits runs when explicit seeds are supplied', () => {
    const body = buildMonteCarloRequest({
      courseId: 1,
      seed: 1,
      setup: SETUP,
      runners: runners(2),
      runs: 50,
      seeds: [7, 8]
    });

    expect(body.seeds).toEqual([7, 8]);
    expect(body.runs).toBeUndefined();
  });

  it('derives source_input_index from the array and keeps frame_order unique', () => {
    const body = buildMonteCarloRequest({
      courseId: 1,
      seed: 1,
      setup: SETUP,
      runners: [
        { trainee: createTrainee(), frameOrder: 3 },
        { trainee: createTrainee(), frameOrder: 3 },
        { trainee: createTrainee() }
      ]
    });

    expect(body.input.runners.map((runner) => runner.source_input_index)).toEqual([0, 1, 2]);
    expect(body.input.runners.map((runner) => runner.frame_order)).toEqual([3, 1, 2]);
  });

  it('clamps runner fields and drops invalid skills', () => {
    const body = buildMonteCarloRequest({
      courseId: 1,
      seed: 1,
      setup: SETUP,
      runners: [
        {
          trainee: createTrainee(),
          teamId: 999,
          singleModeWinCount: -4,
          hasViewerId: true,
          skills: [
            { skillId: 200012, level: 9 },
            { skillId: 0, level: 3 }
          ]
        },
        { trainee: createTrainee() }
      ]
    });

    const runner = body.input.runners[0];
    expect(runner?.team_id).toBe(255);
    expect(runner?.single_mode_win_count).toBe(0);
    expect(runner?.has_viewer_id).toBe(true);
    expect(runner?.skills).toEqual([{ skill_id: 200012, level: 6 }]);
  });

  it('rejects a field with fewer than two runners', () => {
    expect(() =>
      buildMonteCarloRequest({ courseId: 1, seed: 1, setup: SETUP, runners: runners(1) })
    ).toThrow(/at least 2 runners/);
  });

  it('clamps trainee stats and falls back to a known running style', () => {
    const body = buildMonteCarloRequest({
      courseId: 1,
      seed: 1,
      setup: SETUP,
      runners: [
        { trainee: createTrainee({ speed: '9999', motivation: '9', runningStyle: 'Bogus' }) },
        { trainee: createTrainee() }
      ]
    });

    const runner = body.input.runners[0];
    expect(runner?.stats.speed).toBe(3000);
    expect(runner?.motivation).toBe(5);
    expect(runner?.running_style).toBe('Nige');
  });
});
