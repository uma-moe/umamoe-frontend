import { describe, expect, it } from 'vitest';
import { buildOptimizeRequest, type OptimizeScenarioInput } from './optimize-request';
import type { RaceSetupInput } from './stamina-request';
import { createTrainee } from '../setup/trainee';

const SETUP: RaceSetupInput = {
  raceInstanceId: 800023,
  raceType: 0,
  season: 1,
  weather: 1,
  ground: 1,
  startTimeType: 2
};

function scenario(overrides: Partial<OptimizeScenarioInput> = {}): OptimizeScenarioInput {
  return {
    name: 'Arima Kinen',
    weight: 1,
    courseId: 11103,
    seed: 42,
    setup: SETUP,
    runners: [{ trainee: createTrainee() }, { trainee: createTrainee() }],
    ...overrides
  };
}

describe('optimize request', () => {
  it('validates prerequisites against the purchases array and keeps replaced skill IDs', () => {
    const body = buildOptimizeRequest({
      mode: 'cm',
      targetSourceInputIndex: 0,
      spBudget: 1200,
      purchases: [
        {
          name: 'A',
          cost: 100,
          skills: [200011],
          requires: [1, 9, -1, 0],
          replaces: [200012, 200012, -4, 1.5]
        },
        { name: 'B', cost: 0, skills: [200012], replaces: [] }
      ],
      scenarios: [scenario()],
      seed: 5
    });

    const [first, second] = body.purchases;
    expect(first?.requires).toEqual([1, 0]);
    // An upgrade removes the skill it upgrades by its skill ID, not by its place in the purchases.
    expect(first?.replaces).toEqual([200012]);
    expect(Object.hasOwn(second ?? {}, 'replaces')).toBe(false);
  });

  it('clamps the budget and candidate counts', () => {
    const body = buildOptimizeRequest({
      mode: 'cm',
      targetSourceInputIndex: -3,
      spBudget: -50,
      purchases: [],
      scenarios: [scenario()],
      seed: 5,
      maxCandidates: 9999,
      finalists: 0
    });

    expect(body.sp_budget).toBe(0);
    expect(body.target_source_input_index).toBe(0);
    expect(body.max_candidates).toBe(1024);
    expect(body.finalists).toBe(1);
  });

  it('omits optional keys instead of sending null', () => {
    const body = buildOptimizeRequest({
      mode: 'cm',
      targetSourceInputIndex: 0,
      spBudget: 500,
      purchases: [{ name: 'A', cost: 10, skills: [1], excludes: [5] }],
      scenarios: [scenario()],
      seed: 5
    });

    expect(Object.hasOwn(body, 'max_candidates')).toBe(false);
    expect(Object.hasOwn(body, 'finalists')).toBe(false);
    expect(Object.hasOwn(body.purchases[0] ?? {}, 'excludes')).toBe(false);
    expect(Object.hasOwn(body.scenarios[0] ?? {}, 'score_context')).toBe(false);
  });

  it('keeps the finalist count inside the candidate count', () => {
    const body = buildOptimizeRequest({
      mode: 'cm',
      targetSourceInputIndex: 0,
      spBudget: 500,
      purchases: [],
      scenarios: [scenario()],
      seed: 5,
      maxCandidates: 3,
      finalists: 10
    });

    expect(body.max_candidates).toBe(3);
    expect(body.finalists).toBe(3);
  });

  it('maps score context for team trials and defaults a zero weight', () => {
    const body = buildOptimizeRequest({
      mode: 'tt_long',
      targetSourceInputIndex: 0,
      spBudget: 900,
      purchases: [],
      scenarios: [
        scenario({
          weight: 0,
          scoreContext: {
            selfEvaluate: 1.6,
            opponentEvaluate: 2,
            supportCardBonus: 0.4,
            winsBefore: 3
          }
        })
      ],
      seed: 5
    });

    expect(body.scenarios[0]?.weight).toBe(1);
    expect(body.scenarios[0]?.score_context).toEqual({
      self_evaluate: 1.6,
      opponent_evaluate: 2,
      support_card_bonus: 0.4,
      wins_before: 3
    });
  });

  it('keeps at most eight CM scenarios and clamps purchase costs and skill ids', () => {
    const body = buildOptimizeRequest({
      mode: 'cm',
      targetSourceInputIndex: 0,
      spBudget: 900,
      purchases: [{ name: 'A', cost: -20, skills: [200012, 0, -1] }],
      scenarios: Array.from({ length: 10 }, () => scenario()),
      seed: 5
    });

    expect(body.scenarios).toHaveLength(8);
    expect(body.purchases[0]?.cost).toBe(0);
    expect(body.purchases[0]?.skills).toEqual([{ skill_id: 200012, level: 1 }]);
  });

  it('races her alone', () => {
    const body = buildOptimizeRequest({
      mode: 'cm',
      targetSourceInputIndex: 0,
      spBudget: 900,
      purchases: [],
      scenarios: [{ ...scenario(), runners: [{ trainee: createTrainee() }] }],
      seed: 5
    });

    expect(body.scenarios[0]?.input.runners).toHaveLength(1);
    expect(body.scenarios[0]?.input.runners[0]).toMatchObject({ source_input_index: 0, frame_order: 1 });
  });

  it('keeps a Team Trials pool of up to 32 tracks', () => {
    const body = (count: number) =>
      buildOptimizeRequest({
        mode: 'tt_sprint',
        targetSourceInputIndex: 0,
        spBudget: 900,
        purchases: [],
        scenarios: Array.from({ length: count }, () => scenario()),
        seed: 5
      });

    expect(body(16).scenarios).toHaveLength(16);
    expect(body(40).scenarios).toHaveLength(32);
  });

  it('sends HP debuffs as drains somewhere in mid race, and nothing without any', () => {
    const base = { mode: 'cm' as const, targetSourceInputIndex: 0, spBudget: 1200, purchases: [], scenarios: [scenario()], seed: 5 };
    expect(buildOptimizeRequest({ ...base, debuffs: { count: 3, percent: 2 } }).hp_changes).toEqual([
      { count: 3, hp_percent: -2, from: 1 / 6, to: 2 / 3 }
    ]);
    expect(Object.hasOwn(buildOptimizeRequest({ ...base, debuffs: { count: 0, percent: 2 } }), 'hp_changes')).toBe(false);
    expect(Object.hasOwn(buildOptimizeRequest(base), 'hp_changes')).toBe(false);
  });
});
