import { describe, expect, it } from 'vitest';
import { normalizeSkill } from '@/lib/game-data/skills/skills';
import type { OptimizeEvaluation, OptimizeResult } from '../../../simulator-repository';
import { offerPurchases } from '../../../setup/build/skill-offers';
import { theorizedResult } from './build-result';

const catalog = new Map(
  [
    { skill_id: 200351, name: 'Swinging Maestro', rarity: 2, base_cost: 170 },
    { skill_id: 201601, name: 'Groundwork', rarity: 1, base_cost: 160 },
    { skill_id: 200432, name: 'Focus', rarity: 1, base_cost: 140 }
  ].map((s) => [s.skill_id, normalizeSkill(s)])
);
const { priced: offers } = offerPurchases(
  [200351, 201601, 200432].map((skillId) => ({ skillId, hint: 0 })),
  [],
  catalog
);
const estimate = (mean: number) => ({ mean, samples: 8, standard_error: 0.1 });
const evaluation = (winRate: number): OptimizeEvaluation => ({
  fitness: estimate(-58),
  scenarios: [
    {
      name: 'all',
      fitness: estimate(-58),
      win_rate: estimate(winRate),
      team_win_rate: estimate(0),
      finish_time_seconds: estimate(67),
      skill_activations: estimate(3)
    }
  ]
});

// A Team Trials reply: the race search, with neither V5's model nor a theory.
function result(): OptimizeResult {
  return {
    schema_version: 7,
    mode: 'tt_sprint',
    objective: 'finish_time',
    runs_per_variation_per_scenario: 136,
    validation_runs_per_finalist_per_scenario: 136,
    report: {
      schema_version: 5,
      backend: 'cpu',
      candidates_evaluated: 270,
      fully_evaluated_candidates: 23,
      simulations: 14800,
      exhaustive: false,
      search_seeds: [1],
      validation_seeds: [2],
      baseline: evaluation(0.4),
      finalists: [
        {
          build: { purchases: [0, 1], stats: [] },
          sp_cost: 330,
          search: evaluation(1),
          validation: evaluation(0.9),
          gain: estimate(0.36),
          validation_gain: estimate(0.31),
          contributions: [
            { purchases: [1], gain: estimate(0.07) },
            { purchases: [0], gain: estimate(0.02) }
          ]
        },
        {
          build: { purchases: [0, 2], stats: [] },
          sp_cost: 310,
          search: evaluation(1),
          validation: evaluation(0.8),
          gain: estimate(0.35),
          validation_gain: estimate(0.29)
        }
      ],
      impacts: [
        { purchase: 2, alone: estimate(0.09) },
        { purchase: 1, alone: estimate(0.05) }
      ]
    }
  };
}

describe('a race search in the optimizer', () => {
  it('shows both builds by the seconds the check measured, the pick scored skill by skill', () => {
    const view = theorizedResult({ result: result(), offers })!;
    expect(view.skillUnit).toBe('seconds');
    expect(view.builds.map((b) => [b.value, b.winRate])).toEqual([
      [0.31, 0.9],
      [0.29, 0.8]
    ]);
    expect(view.builds[0]!.cells.map((c) => [c.skill.offer.skill.name, c.value])).toEqual([
      ['Groundwork', 0.07],
      ['Swinging Maestro', 0.02]
    ]);
    // Only the pick's skills were raced one by one.
    expect(view.builds[1]!.cells.every((c) => c.value === undefined)).toBe(true);
    expect(view.skills.map((s) => [s.offer.skill.name, s.value, s.bought])).toEqual([
      ['Focus', 0.09, false],
      ['Groundwork', 0.05, true]
    ]);
  });

  it('reads no other objective, whose gains are not seconds', () => {
    const response = result();
    response.objective = 'field_place';
    expect(theorizedResult({ result: response, offers })).toBeUndefined();
  });
});
