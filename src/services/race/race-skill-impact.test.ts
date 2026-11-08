import { describe, expect, it } from 'vitest';
import { parseSkillImpact, type SkillSwitchedOff } from './race-skill-impact';

const requested: SkillSwitchedOff[] = [{ runner: 1, skillId: 200331 }];

function response(overrides: Record<string, unknown> = {}) {
  return {
    finishOrder: [1, 0],
    skills: [
      {
        runner: 1,
        skillId: 200331,
        secondsGained: [0, 0.25],
        lengthsGained: [0, 2.1],
        finishOrder: [0, 1],
        ...overrides
      }
    ]
  };
}

describe('a skill impact response', () => {
  it('keeps each measured skill in request order', () => {
    const impact = parseSkillImpact(response(), requested);

    expect(impact.finishOrder).toEqual([1, 0]);
    expect(impact.skills[0]?.lengthsGained).toEqual([0, 2.1]);
  });

  it('rejects gains that do not cover every runner', () => {
    expect(() => parseSkillImpact(response({ lengthsGained: [2.1] }), requested)).toThrow(
      'incompatible skill impact'
    );
  });

  it('rejects an answer for another skill than requested', () => {
    expect(() => parseSkillImpact(response({ skillId: 200332 }), requested)).toThrow(
      'other skills than requested'
    );
  });

  it('rejects an answer that skips a requested skill', () => {
    const twoRequested = [...requested, { runner: 0, skillId: 201351 }];

    expect(() => parseSkillImpact(response(), twoRequested)).toThrow('different number of skills');
  });
});
