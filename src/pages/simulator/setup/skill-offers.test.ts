import { describe, expect, it } from 'vitest';
import { normalizeSkill } from '@/lib/catalog/skill-catalog';
import { offerCost, offerPurchases, upgradedSkill } from './skill-offers';

const catalog = new Map(
  [
    { skill_id: 200351, name: 'Swinging Maestro', rarity: 2, base_cost: 170 },
    { skill_id: 200352, name: 'Corner Recovery ○', rarity: 1, base_cost: 170 },
    { skill_id: 200011, name: 'Right-Handed ◎', rarity: 1, base_cost: 110 },
    { skill_id: 200012, name: 'Right-Handed ○', rarity: 1, base_cost: 90 },
    { skill_id: 201601, name: 'Groundwork', rarity: 1, base_cost: 160 },
    { skill_id: 900201, name: 'Inherited unique', rarity: 1 },
    { skill_id: 200371, name: 'No cost data', rarity: 2 }
  ].map((entry) => [entry.skill_id, normalizeSkill(entry)])
);

describe('skills on offer', () => {
  it('takes the hint discount off the base cost, and Fast Learner another 10%', () => {
    expect([0, 1, 2, 3, 4, 5].map((hint) => offerCost(170, hint))).toEqual([
      170, 153, 136, 119, 110, 102
    ]);
    expect(offerCost(170, 5, true)).toBe(85);
  });
  it('pairs a gold or ◎ skill with the skill it upgrades', () => {
    expect(upgradedSkill(catalog.get(200351)!, catalog)?.name).toBe('Corner Recovery ○');
    expect(upgradedSkill(catalog.get(200011)!, catalog)?.name).toBe('Right-Handed ○');
    expect(upgradedSkill(catalog.get(201601)!, catalog)).toBeUndefined();
  });
  it('ties upgrades to what they upgrade: owned, on offer, or bought with them', () => {
    const { priced, missing, purchases } = offerPurchases(
      [
        { skillId: 200352, hint: 5 },
        { skillId: 200351, hint: 1 },
        { skillId: 200011, hint: 0 },
        { skillId: 201601, hint: 3 },
        { skillId: 900201, hint: 2 },
        { skillId: 200371, hint: 0 }
      ],
      [],
      catalog
    );
    expect(missing).toEqual([{ skillId: 200371, hint: 0 }]);
    expect(purchases).toEqual([
      { name: 'Corner Recovery ○', cost: 102, skills: [200352] },
      { name: 'Swinging Maestro', cost: 153, skills: [200351], requires: [0], replaces: [0] },
      // ◎ without its ○ on offer: both are bought, at both prices.
      { name: 'Right-Handed ◎', cost: 200, skills: [200011] },
      { name: 'Groundwork', cost: 112, skills: [201601] },
      { name: 'Inherited unique', cost: 160, skills: [900201] }
    ]);
    expect(priced.map((offer) => offer.needs)).toEqual([
      undefined,
      'offered',
      'bundled',
      undefined,
      undefined
    ]);
    // Owning the white makes the gold cost only its own price.
    const owned = offerPurchases([{ skillId: 200351, hint: 1 }], [200352], catalog);
    expect(owned.purchases).toEqual([{ name: 'Swinging Maestro', cost: 153, skills: [200351] }]);
    expect(owned.priced[0]!.needs).toBe('owned');
  });
});
