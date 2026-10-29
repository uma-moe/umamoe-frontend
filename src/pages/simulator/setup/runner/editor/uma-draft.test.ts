import { describe, expect, it } from 'vitest';
import { createSimulatorUma } from '../../../simulator-uma';
import {
  characterUniqueSkillId,
  draftProblem,
  fansInvalid,
  gateInvalid,
  statInvalid,
  swapCharacterUnique
} from './uma-draft';

const noEntry = { gate: '', fans: '' };

describe('uma draft', () => {
  it('accepts the default runner', () => {
    const draft = createSimulatorUma('Uma 1');

    expect(draftProblem(draft, noEntry)).toBe('');
  });

  it('names the first stat out of range', () => {
    const draft = createSimulatorUma('Uma 1');
    draft.trainee.power = '3001';
    draft.trainee.guts = '';

    expect(draftProblem(draft, noEntry)).toBe('Power must be a whole number from 1 to 3,000.');
  });

  it('asks for a name before anything else', () => {
    const draft = createSimulatorUma('  ');
    draft.trainee.speed = '0';

    expect(draftProblem(draft, noEntry)).toBe('Give her a name.');
  });

  it('treats an empty gate and fan count as not set', () => {
    expect(gateInvalid('')).toBe(false);
    expect(fansInvalid('')).toBe(false);
  });

  it('rejects gates outside 1 to 18 and fractional fans', () => {
    expect(gateInvalid('0')).toBe(true);
    expect(gateInvalid('19')).toBe(true);
    expect(fansInvalid('1.5')).toBe(true);
  });

  it('rejects stats that are not whole numbers', () => {
    expect(statInvalid('12a')).toBe(true);
    expect(statInvalid(1200)).toBe(false);
  });

  it('reads the unique skill of a card from its character and outfit', () => {
    expect(characterUniqueSkillId(100201)).toBe(100021);
    expect(characterUniqueSkillId(100602)).toBe(110061);
    expect(characterUniqueSkillId(100103)).toBe(120011);
  });

  it('swaps the old unique for the new one at the same level, first in the list', () => {
    const skills = [
      { skillId: 200011, level: 1 },
      { skillId: 100021, level: 5 }
    ];

    const swapped = swapCharacterUnique({
      skills,
      previousCardId: 100201,
      nextCardId: 101101,
      knownSkill: () => true
    });

    expect(swapped).toEqual([
      { skillId: 100111, level: 5 },
      { skillId: 200011, level: 1 }
    ]);
  });

  it('leaves out a unique the skill data does not know', () => {
    const swapped = swapCharacterUnique({
      skills: [{ skillId: 100021, level: 3 }],
      previousCardId: 100201,
      nextCardId: 109901,
      knownSkill: (id) => id !== 100991
    });

    expect(swapped).toEqual([]);
  });
});
