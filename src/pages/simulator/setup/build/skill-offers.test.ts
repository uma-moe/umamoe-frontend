import { describe, expect, it } from 'vitest';
import { normalizeSkill } from '@/lib/game-data/skills/skills';
import {
  isInheritedUnique,
  offerCost,
  offerPurchases,
  skillTier,
  upgradedSkill
} from './skill-offers';

const catalog = new Map(
  [
    { skill_id: 200351, name: 'Swinging Maestro', rarity: 2, base_cost: 170 },
    { skill_id: 200352, name: 'Corner Recovery ○', rarity: 1, base_cost: 170 },
    { skill_id: 200011, name: 'Right-Handed ◎', rarity: 1, base_cost: 110 },
    { skill_id: 200012, name: 'Right-Handed ○', rarity: 1, base_cost: 90 },
    { skill_id: 201601, name: 'Groundwork', rarity: 1, base_cost: 160 },
    // See Ya Later! is the gold of Playtime's Over!, one ID above it.
    { skill_id: 201661, name: "Playtime's Over!", rarity: 1, base_cost: 160 },
    { skill_id: 201662, name: 'See Ya Later!', rarity: 2, base_cost: 160 },
    // Blast Forward is the gold above Long Straightaways ◎, itself the upgrade of ○.
    { skill_id: 201171, name: 'Long Straightaways ◎', rarity: 1, base_cost: 110 },
    { skill_id: 201172, name: 'Long Straightaways ○', rarity: 1, base_cost: 100 },
    { skill_id: 201173, name: 'Blast Forward', rarity: 2, base_cost: 150 },
    // Concentration upgrades Focus; Gatekept is their ×, and Wallflower the × beside Competitive Spirit.
    { skill_id: 200431, name: 'Concentration', rarity: 2, base_cost: 140 },
    { skill_id: 200432, name: 'Focus', rarity: 1, base_cost: 140 },
    { skill_id: 200433, name: 'Gatekept', rarity: 1, base_cost: 70 },
    { skill_id: 200281, name: 'Competitive Spirit ◎', rarity: 1, base_cost: 110 },
    { skill_id: 200282, name: 'Competitive Spirit ○', rarity: 1, base_cost: 90 },
    { skill_id: 200283, name: 'Wallflower', rarity: 1, base_cost: 50 },
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

  it('pairs by rank in the skill group, whichever ID the upgrade has', () => {
    const lower = (id: number) => upgradedSkill(catalog.get(id)!, catalog)?.name;
    expect(lower(201662)).toBe("Playtime's Over!");
    expect(lower(201661)).toBeUndefined();
    expect(lower(201173)).toBe('Long Straightaways ◎');
    expect(lower(201171)).toBe('Long Straightaways ○');
    expect(lower(200431)).toBe('Focus');
    expect(lower(200281)).toBe('Competitive Spirit ○');
    for (const id of [200432, 200433, 200282, 200283]) expect(lower(id)).toBeUndefined();
  });

  it('buys a gold above a ◎ with every rank below it she lacks', () => {
    const alone = offerPurchases([{ skillId: 201173, hint: 0 }], [], catalog);
    expect(alone.purchases).toEqual([{ name: 'Blast Forward', cost: 360, skills: [201173] }]);
    expect(alone.priced[0]!.bundled?.map((skill) => skill.name)).toEqual([
      'Long Straightaways ◎',
      'Long Straightaways ○'
    ]);
    // With the ○ owned, the ◎ comes with it and the gold replaces the ○; with the ○ on offer, it needs it first.
    expect(offerPurchases([{ skillId: 201173, hint: 0 }], [201172], catalog).purchases).toEqual([
      { name: 'Blast Forward', cost: 260, skills: [201173], replaces: [201172] }
    ]);

    expect(
      offerPurchases(
        [
          { skillId: 201172, hint: 0 },
          { skillId: 201173, hint: 0 }
        ],
        [],
        catalog
      ).purchases
    ).toEqual([
      { name: 'Long Straightaways ○', cost: 100, skills: [201172] },
      { name: 'Blast Forward', cost: 260, skills: [201173], requires: [0], replaces: [201172] }
    ]);

    expect(
      offerPurchases(
        [
          { skillId: 201661, hint: 0 },
          { skillId: 201662, hint: 2 }
        ],
        [],
        catalog
      ).purchases
    ).toEqual([
      { name: "Playtime's Over!", cost: 160, skills: [201661] },
      { name: 'See Ya Later!', cost: 128, skills: [201662], requires: [0], replaces: [201661] }
    ]);
  });

  it('locks offers by their purchase index and prices them with what they need', () => {
    const { locked, lockedCost } = offerPurchases(
      [
        { skillId: 200371, hint: 0, locked: true },
        { skillId: 201172, hint: 0 },
        { skillId: 201601, hint: 0 },
        { skillId: 201173, hint: 0, locked: true }
      ],
      [],
      catalog
    );

    // The offer without cost data is left out, so Blast Forward is purchase 2; it needs the ○ (purchase 0) first.
    expect(locked).toEqual([2]);
    expect(lockedCost).toBe(100 + 260);
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
      // The gold replaces the white it upgrades: by skill ID, so she races with the gold alone.
      { name: 'Swinging Maestro', cost: 153, skills: [200351], requires: [0], replaces: [200352] },
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
    // Owning the white makes the gold cost only its own price, and the gold replaces the owned white.
    const owned = offerPurchases([{ skillId: 200351, hint: 1 }], [200352], catalog);
    expect(owned.purchases).toEqual([
      { name: 'Swinging Maestro', cost: 153, skills: [200351], replaces: [200352] }
    ]);

    expect(owned.priced[0]!.needs).toBe('owned');
  });
});

describe('inherited uniques', () => {
  // The catalog flags inherited uniques as unique with a white rarity, as it does for Shooting Star.
  const inherited = normalizeSkill({
    skill_id: 900011,
    name: 'Shooting Star',
    rarity: 1,
    unique: true,
    inherited: true
  });

  it('recognises an inherited unique by its ID', () => {
    expect(isInheritedUnique(inherited)).toBe(true);
    expect(isInheritedUnique(catalog.get(200351)!)).toBe(false);
  });

  it('tints an inherited unique as a unique', () => {
    expect(skillTier(inherited)).toBe('unique');
  });
});
