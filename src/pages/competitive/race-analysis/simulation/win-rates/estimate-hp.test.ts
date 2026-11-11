import { describe, expect, it } from 'vitest';
import type { MonteCarloResult } from '@/pages/simulator/simulator-repository';
import { monteCarlo, runner } from '../race-simulation-fixtures';
import {
  formatHpMargin,
  hpCheckSummary,
  spurtMargin,
  staminaForExtraMaxHp,
  survivalMargin
} from './estimate-hp';
import { skillActivationRates } from './estimate-skills';

/** One runner's races, each given as her HP at the spurt check, the full spurt's cost and her HP at the finish. */
function racesOf(races: { check: number; need: number; finalHp: number; deficit?: number }[]) {
  const result: MonteCarloResult = monteCarlo(races.map(() => [0, 1]));
  const perRunner = <T>(value: (race: (typeof races)[number]) => T) =>
    races.map((race) => [value(race), value(race)]);

  result.check_hp = perRunner((race) => [race.check]);
  result.full_spurt_need_hp = perRunner((race) => [race.need]);
  result.final_hp = perRunner((race) => race.finalHp);
  result.hp_deficit = perRunner((race) => race.deficit ?? 0);
  return result;
}

describe('HP margins', () => {
  it('reads the spare HP at the first spurt check', () => {
    const result = racesOf([{ check: 900, need: 931, finalHp: 0, deficit: 117 }]);

    expect(spurtMargin({ result, run: 0, source: 0 })).toBe(-31);
  });

  it('reads the HP left at the finish, or the HP she ran out by', () => {
    const result = racesOf([
      { check: 1500, need: 928, finalHp: 465 },
      { check: 900, need: 931, finalHp: 0, deficit: 117 }
    ]);

    expect(survivalMargin({ result, run: 0, source: 0 })).toBe(465);
    expect(survivalMargin({ result, run: 1, source: 0 })).toBe(-117);
  });

  it('has no margin when the estimate carries no HP', () => {
    const result = monteCarlo([[0, 1]]);

    expect(spurtMargin({ result, run: 0, source: 0 })).toBeUndefined();
    expect(survivalMargin({ result, run: 0, source: 0 })).toBeUndefined();
    expect(hpCheckSummary('spurt', result, 0)).toBeUndefined();
  });

  it('prints margins signed and whole', () => {
    expect([572.4, -30.6, 0.2].map(formatHpMargin)).toEqual(['+572', '−31', '0']);
  });
});

describe('hpCheckSummary', () => {
  it('lists the HP that would pass the spurt check more often', () => {
    const shortfalls = [0, 0, 10, 20, 30, 40, 50, 60, 70, 80];
    const result = racesOf(
      shortfalls.map((short) => ({ check: 1000 - short, need: 1000, finalHp: 100 }))
    );

    const summary = hpCheckSummary('spurt', result, 0);

    expect(summary?.passRate).toBe(0.2);
    expect(summary?.milestones.at(0)).toMatchObject({ rate: 0.7, extraHp: 50 });
    expect(summary?.milestones.at(-1)).toMatchObject({ rate: 1, extraHp: 80 });
  });

  it('has no milestones when every race passed', () => {
    const result = racesOf([{ check: 1200, need: 1000, finalHp: 100 }]);

    expect(hpCheckSummary('spurt', result, 0)).toEqual({ races: 1, passRate: 1, milestones: [] });
  });

  it('counts a finish on empty HP as not survived', () => {
    const result = racesOf([
      { check: 1200, need: 1000, finalHp: 0 },
      { check: 1200, need: 1000, finalHp: 50 }
    ]);

    expect(hpCheckSummary('survival', result, 0)?.passRate).toBe(0.5);
  });

  it('scales the maximum HP by the recovery that comes with it', () => {
    const result = racesOf([{ check: 890, need: 1000, finalHp: 100 }]);
    result.hp_effect_rate_before_first_spurt = [[0.1, 0.1]];

    const milestone = hpCheckSummary('spurt', result, 0)?.milestones.at(-1);

    expect(milestone?.extraHp).toBe(110);
    expect(milestone?.extraMaxHp).toBeCloseTo(100);
  });
});

describe('staminaForExtraMaxHp', () => {
  it('converts maximum HP to raw stamina for her style and mood', () => {
    const paceChaser = runner(0, { raw: { running_style: 2, motivation: 3 } });

    // A pace chaser in normal mood gets 0.8 × 0.89 HP per point.
    expect(staminaForExtraMaxHp(paceChaser, 71.2)).toBe(100);
  });

  it('is unknown for a style it cannot read', () => {
    expect(staminaForExtraMaxHp(runner(0, { raw: { running_style: 0 } }), 50)).toBeUndefined();
  });
});

describe('skillActivationRates', () => {
  it('lists her known skills with the share of races they activated in, most reliable first', () => {
    const result = monteCarlo([
      [0, 1],
      [1, 0]
    ]);
    const activation = {
      trigger_probability: 0,
      total_activations: 0,
      mean_activation_distance_m: null
    };
    result.skills = [
      { ...activation, source_input_index: 0, skill_id: 200, runs_triggered: 1 },
      { ...activation, source_input_index: 1, skill_id: 300, runs_triggered: 2 }
    ];

    const rates = skillActivationRates(result, 0, [100, 200]);

    expect(rates).toEqual([
      { skillId: 200, rate: 50 },
      { skillId: 100, rate: 0 }
    ]);
  });

  it('is undefined when the estimate reports no skills', () => {
    expect(skillActivationRates(monteCarlo([[0, 1]]), 0, [100])).toBeUndefined();
  });
});
