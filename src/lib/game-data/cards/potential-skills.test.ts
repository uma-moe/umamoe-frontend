import { describe, expect, it } from 'vitest';
import { parsePotentialSkills, unlockedSkills } from './potential-skills';

const data = {
  cards: [
    {
      card: 100101,
      skills: [
        [1, 200512],
        [1, 201352],
        [2, 200162],
        [3, 201351],
        [5, 200511]
      ]
    }
  ]
};

describe('potential skills', () => {
  it('unlocks the starting skills and each level up to hers', () => {
    const potentialSkills = parsePotentialSkills(data);

    const atLevelThree = unlockedSkills(potentialSkills, { cardId: 100101, potentialLevel: 3 });

    expect(atLevelThree).toEqual([200512, 201352, 200162, 201351]);
  });

  it('unlocks nothing for a card it does not know', () => {
    const potentialSkills = parsePotentialSkills(data);

    expect(unlockedSkills(potentialSkills, { cardId: 999999, potentialLevel: 5 })).toEqual([]);
  });

  it('rejects data of another shape', () => {
    expect(() => parsePotentialSkills({ cards: [{ card: 100101, skills: [[1]] }] })).toThrow(
      'invalid skill'
    );
  });
});
