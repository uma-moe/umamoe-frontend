import { describe, expect, it } from 'vitest';
import { normalizeSkill } from '@/lib/game-data/skills/skills';
import {
  isOptimizeModel,
  type OptimizeEvaluation,
  type OptimizeFinalist,
  type OptimizeModel,
  type OptimizeResult,
  type V5PurchaseValue
} from '../../../simulator-repository';
import { offerPurchases } from '../../../setup/build/skill-offers';
import { bestSummary } from '../../../setup/build/build-run';
import {
  fireText,
  leftoverSp,
  theorizedResult,
  valueText,
  v5Tally,
  worthState
} from './build-result';

const catalog = new Map(
  [
    { skill_id: 200352, name: 'Corner Recovery ○', rarity: 1, base_cost: 170 },
    { skill_id: 200351, name: 'Swinging Maestro', rarity: 2, base_cost: 170 },
    { skill_id: 201601, name: 'Groundwork', rarity: 1, base_cost: 160 },
    { skill_id: 200432, name: 'Focus', rarity: 1, base_cost: 140 }
  ].map((s) => [s.skill_id, normalizeSkill(s)])
);
const { priced: offers } = offerPurchases(
  [200352, 200351, 201601, 200432].map((skillId) => ({ skillId, hint: 0 })),
  [],
  catalog
);
const estimate = (mean: number, samples = 2) => ({ mean, samples, standard_error: 0.1 });
function evaluation(): OptimizeEvaluation {
  return {
    fitness: estimate(3),
    scenarios: [
      {
        name: 'A',
        fitness: estimate(3),
        win_rate: estimate(0.2),
        team_win_rate: estimate(0.2),
        finish_time_seconds: estimate(72),
        skill_activations: estimate(4)
      },
      {
        name: 'B',
        fitness: estimate(3, 6),
        win_rate: estimate(0.8, 6),
        team_win_rate: estimate(0.8, 6),
        finish_time_seconds: estimate(68, 6),
        skill_activations: estimate(4, 6)
      }
    ]
  };
}
const finalist = (purchases: number[]): OptimizeFinalist => ({
  build: { purchases, stats: [] },
  sp_cost: 400,
  search: evaluation(),
  validation: evaluation()
});
const skill = (purchase: number, score: number): V5PurchaseValue => ({
  purchase,
  held: true,
  score,
  source: 'ranker',
  win: 0.02,
  fire: { races: 64, rate: 0.75, mean_m: 600 }
});
function result(): OptimizeResult {
  const baseline = evaluation();
  for (const s of baseline.scenarios)
    s.finish_time_seconds = estimate(80, s.finish_time_seconds.samples);
  const model: OptimizeModel = {
    model: 'v5',
    races: 8000,
    budget: 14616,
    lobbies: 2048,
    rooms: 100,
    build: {
      model: 'v5b-wide.v5',
      model_sha256: 'model-hash',
      ranker_sha256: 'ranker-hash',
      course_prior: true,
      seconds: 5,
      first_steps: [{ add: 2, cost: 160, predicted: 1, beaten: 0.1, win: 0.01, time: 0.2 }],
      rounds: [
        {
          races: 8000,
          slope: 0.5,
          trust: 1,
          made: ['swap'],
          tested: [{ move: 'swap', prior: 1, measured: 2, se: 0.5, posterior: 1.5, p: 0.9 }]
        }
      ],
      explanation: {
        phase_bounds: [0, 200, 800, 1000, 1200],
        initial: {
          purchases: [0, 1, 2],
          timing_races: 64,
          skills: [{ ...skill(1, 3), measured: { gain: 3.2, standard_error: 0.4 } }, skill(2, 1)]
        },
        optimized: {
          purchases: [0, 2, 3],
          timing_races: 64,
          skills: [skill(0, 0.4), skill(2, 2), skill(3, 1), { ...skill(1, -0.1), held: false }]
        }
      }
    }
  };
  return {
    schema_version: 11,
    mode: 'cm',
    objective: 'field_place',
    model,
    runs_per_variation_per_scenario: 0,
    validation_runs_per_finalist_per_scenario: 128,
    report: {
      schema_version: 5,
      backend: 'v5',
      candidates_evaluated: 2,
      fully_evaluated_candidates: 2,
      simulations: 384,
      exhaustive: false,
      search_seeds: [],
      validation_seeds: [1, 2],
      baseline,
      // Deliberately reverse the explanation's order and each purchase order.
      finalists: [finalist([2, 1, 0]), finalist([3, 0, 2])]
    }
  };
}

describe('V5 in the existing optimizer', () => {
  it('keeps negative contributions distinct even when every score is a loss', () => {
    const response = result();
    const explanation = response.model!.build!.explanation!;
    for (const report of [explanation.initial, explanation.optimized]) {
      for (const part of report.skills) part.score = -Math.abs(part.score);
    }

    explanation.initial.skills[0]!.score = -12;
    const view = theorizedResult({ result: response, offers })!;

    expect(view.scale).toBe(12);
  });

  it('matches reports by purchases, preserves server order and displays actual validation units', () => {
    const response = result();
    const view = theorizedResult({ result: response, offers })!;
    expect(view.skillUnit).toBe('score');
    expect(view.theory).toBeUndefined();
    expect(view.builds.map((b) => b.finalist)).toEqual(response.report.finalists);
    expect(view.builds[0]!.cells.map((c) => [c.skill.offer.skill.name, c.value])).toEqual([
      ['Swinging Maestro', 3],
      ['Groundwork', 1]
    ]);
    expect(view.builds[0]!.cells[0]!.measurement).toEqual({ gain: 3.2, standard_error: 0.4 });
    expect(view.builds[0]!.winRate).toBeCloseTo(0.65);
    expect(view.builds[0]!.value).toBe(11);
    expect(view.builds[0]!.unit).toBe('seconds');
    expect(bestSummary(view.builds[0]!)).toBe('2 skills · 400 SP');
    expect(valueText(3, 'score')).toBe('+3.00 score');
    expect(v5Tally(response, response.model!)).toContain(
      '8,000 search races + 384 validation races = 8,384 races total'
    );
  });

  it('keeps absent scores and paired evidence unknown instead of claiming zero benefit', () => {
    const response = result();
    response.model!.build!.explanation!.initial.skills.pop();
    const view = theorizedResult({ result: response, offers })!;
    const missing = view.builds[0]!.cells.find((c) => c.skill.offer.skillId === 201601)!;
    expect(missing.value).toBeUndefined();
    expect(missing.measurement).toBeUndefined();
    expect(valueText(missing.value, 'score')).toBe('—');
    expect(fireText({ fire: missing.fire, phaseBounds: view.phaseBounds, countGated: false })).toBe(
      'No activation timing recorded'
    );
    const left = leftoverSp({
      pick: finalist([]),
      budget: 1000,
      offers,
      inert: new Set(),
      skills: [],
      skillUnit: 'score'
    })!;
    expect(left.useless).toEqual([]);
    expect(left.unexplained).toBe(true);
    expect(worthState(0.01, 'score')).toBe('helps');
  });

  it('shows the finalists unscored when the simulator sends no explanation', () => {
    const response = result();
    delete response.model!.build!.explanation;
    expect(isOptimizeModel(response.model)).toBe(true);
    const view = theorizedResult({ result: response, offers })!;
    expect(view.builds.map((b) => b.finalist)).toEqual(response.report.finalists);
    expect(view.builds[0]!.value).toBe(11);
    expect(view.builds[0]!.cells.map((c) => [c.value, c.valuation.source])).toEqual([
      [undefined, 'unknown'],
      [undefined, 'unknown']
    ]);
    expect(view.skills).toEqual([]);
  });

  it('rejects malformed or mismatched V5 explanation data', () => {
    const response = result();
    const model = response.model!;
    expect(isOptimizeModel(model)).toBe(true);
    model.build!.explanation!.initial.skills[0]!.measured!.standard_error = -1;
    expect(isOptimizeModel(model)).toBe(false);
    expect(theorizedResult({ result: response, offers })).toBeUndefined();
    const mismatch = result();
    mismatch.model!.build!.explanation!.initial.purchases = [999];
    expect(theorizedResult({ result: mismatch, offers })).toBeUndefined();
  });
});
