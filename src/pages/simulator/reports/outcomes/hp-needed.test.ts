import { describe, expect, it } from 'vitest';
import type { StaminaDistribution, StaminaResult } from '../../simulator-repository';
import { goldRecoveryNeeded, hpBill, hpRaces, hpSpread, hpVerdict, quantile } from './hp-needed';

const runner = { stamina: 900, style: 'Nige', motivation: 3 };
const single: StaminaResult = {
  model: 'fixture',
  course_id: 10506,
  seed: 1,
  survived: true,
  full_spurt: true,
  max_hp: 2000,
  remaining_hp: 150,
  hp_deficit: 0,
  minimum_hp: 150,
  consumed_hp: 2050,
  recovered_hp: 300,
  debuff_hp_loss: 100,
  wasted_recovery_hp: 0,
  effects_applied: 3,
  exhausted_at: null,
  finish_time_seconds: 150,
  last_spurt_start_distance_m: 1668,
  last_spurt_decision: 1,
  spurt_calculation_times: [97],
  spurt_calculation_distances: [1668],
  check_hp: [900],
  full_spurt_need_hp: [760],
  spurt_calculation_results: [1]
};

/** Ten races: spare HP at the decision from -90 to +180, one ran out, two rushed; race 5 is the median. */
function sampled(): StaminaResult {
  const spare = [-90, -30, 0, 30, 60, 90, 120, 150, 180, 140];
  const n = spare.length;
  const distribution: StaminaDistribution = {
    seeds: spare.map((_, index) => 1 + index),
    check_hp: spare.map((value) => 760 + value),
    full_spurt_need_hp: spare.map(() => 760),
    check_distance_m: spare.map(() => 1668),
    first_spurt_result: spare.map((value) => (value >= 0 ? 1 : 8)),
    last_spurt_decision: spare.map((value) => (value >= 0 ? 1 : value > -50 ? 2 : 8)),
    remaining_hp: spare.map((value, index) => (index === 0 ? 0 : 20 + value)),
    hp_deficit: spare.map((_, index) => (index === 0 ? 40 : 0)),
    exhausted_distance_m: spare.map((_, index) => (index === 0 ? 2460 : null)),
    finish_time_seconds: spare.map((_, index) => 150 + index / 10),
    recovered_hp: spare.map(() => 300),
    debuff_hp_loss: spare.map(() => 100),
    wasted_recovery_hp: spare.map(() => 0),
    consumed_before_check_hp: spare.map(() => 1300),
    recovered_before_check_hp: spare.map(() => 200),
    debuff_before_check_hp: spare.map(() => 100),
    effect_rate_before_check: spare.map(() => 0.05),
    effect_rate: spare.map(() => 0.1),
    rushed: spare.map((_, index) => index === 2 || index === 7),
    hp_band: { distance_m: [0, 2500], p10: [2000, 0], p50: [2000, 100], p90: [2000, 190] },
    median: 5
  };
  expect(distribution.seeds).toHaveLength(n);
  return { ...single, check_hp: [850], remaining_hp: 110, distribution };
}

describe('HP races', () => {
  it('reads each sampled race, and a single race from the result itself', () => {
    const races = hpRaces(sampled());
    expect(races).toHaveLength(10);
    expect(races[0]).toMatchObject({
      check: 670,
      need: 760,
      decision: 8,
      finish: -40,
      exhaustedAt: 2460,
      rushed: false
    });
    expect(races[2]).toMatchObject({ finish: 20, rushed: true, rateBefore: 0.05, rate: 0.1 });
    expect(hpRaces(single)).toEqual([
      {
        check: 900,
        need: 760,
        at: 1668,
        decision: 1,
        finish: 150,
        exhaustedAt: undefined,
        time: 150,
        rateBefore: 0,
        rate: 0,
        rushed: false
      }
    ]);
  });

  it('interpolates quantiles between neighbours', () => {
    expect(quantile([0, 10, 20, 30, 40], 0.1)).toBe(4);
    expect(quantile([0, 10, 20, 30, 40], 0.5)).toBe(20);
    expect(quantile([], 0.5)).toBeUndefined();
  });
});

describe('HP spread and verdict', () => {
  it('counts how she spurted and how her HP held across the races', () => {
    const spread = hpSpread(sampled(), runner, false);
    expect(spread).toMatchObject({ races: 10, full: 8, reduced: 1, none: 1, out: 1, rushed: 2 });
    expect(spread.spare).toEqual({ p10: -36, p50: 75, p90: 153 });
    expect(spread.finish.p10).toBeCloseTo(-13);
    expect(spread.time).toBeCloseTo(150.45);
    // More spare HP at the decision means less stamina needed: the 90th percentile covers the worst races.
    expect(spread.needed!.p90).toBeGreaterThan(900);
    expect(spread.needed!.p50).toBeLessThan(900);
  });

  it('answers from how she spurted, not from the request', () => {
    const spread = hpSpread(sampled(), runner, false);
    expect(hpVerdict(spread, false)).toEqual({
      tone: 'warn',
      title: 'Full spurt in 80% of races',
      detail:
        'Full speed in 8 of 10 races, slower or later in 1 of 10. Her HP runs out in 1 of 10 races.'
    });
    expect(hpVerdict({ ...spread, full: 10, reduced: 0, none: 0, out: 0 }, false)).toEqual({
      tone: 'good',
      title: 'Holds a full last spurt',
      detail: 'Full speed in all 10 races. Her HP lasts to the finish in all 10 races.'
    });
    expect(hpVerdict({ ...spread, full: 0, reduced: 3, none: 7 }, false).title).toBe(
      'No full last spurt'
    );
    expect(hpVerdict({ ...spread, full: 3 }, false).tone).toBe('bad');
  });

  it('judges a forced full spurt by whether her HP lasts', () => {
    const spread = hpSpread(sampled(), runner, true);
    expect(spread).toMatchObject({ full: 9, reduced: 0, none: 1 });
    expect(hpVerdict(spread, true)).toEqual({
      tone: 'warn',
      title: 'Runs out of HP on a full spurt',
      detail: 'Her HP runs out in 1 of 10 races.'
    });
    expect(hpVerdict({ ...spread, out: 0 }, true).title).toBe('Holds a full spurt to the finish');
    // One race reads without counts.
    expect(hpVerdict(hpSpread(single, runner, false), false).detail).toBe(
      'Full speed. Her HP lasts to the finish.'
    );
  });

  it('turns HP short into gold recovery skills', () => {
    expect(goldRecoveryNeeded(150, 2000)).toBe(2);
    expect(goldRecoveryNeeded(0, 2000)).toBeUndefined();
  });
});

describe('HP bill', () => {
  it('adds up the median race to the spurt decision and then to the finish', () => {
    const bill = hpBill(sampled());
    expect(bill.before).toEqual([
      { label: 'Max HP', hp: 2000, start: true },
      { label: 'Running', hp: -1250 },
      { label: 'Recovery skills', hp: 200 },
      { label: 'HP debuffs', hp: -100 },
      { label: 'At the spurt decision', hp: 850, total: true }
    ]);
    expect(bill.after).toEqual([
      { label: 'At the spurt decision', hp: 850, start: true },
      { label: 'Running', hp: -840 },
      { label: 'Recovery skills', hp: 100 },
      { label: 'Left at the finish', hp: 110, total: true }
    ]);
    expect(bill.decision).toEqual({ at: 1668, need: 760 });
  });

  it('is one part when the result has no split at the decision', () => {
    const bill = hpBill(single);
    expect(bill.after).toEqual([]);
    expect(bill.before.at(-1)).toEqual({ label: 'Left at the finish', hp: 150, total: true });
    expect(bill.before[1]).toEqual({ label: 'Running', hp: -2050 });
  });
});
