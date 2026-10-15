import { setupResourceFixtures } from '../../../../tests/fixtures/resource-setup';

import { expect, it } from 'vitest';
import {
  loadSkills,
  normalizeSkill,
  resolveEncodedSkill,
  skillImage,
  skillRarity,
  skillPointTotal,
  sortEncodedSkills,
  type SkillData
} from './skills';

setupResourceFixtures();

it('does not treat the next normal skill ID as a prerequisite for Groundwork', async () => {
  const skillLookup = new Map(await loadSkills());
  // The live skill data also includes this separate skill without a published cost.
  skillLookup.set(201602, { skill_id: 201602, name: 'Solid Preparation', rarity: 1, icon: '' });
  expect(skillPointTotal(skillLookup, [2016011])).toBe(100);
  expect(skillPointTotal(skillLookup, [2016011, 9000111, 2000111])).toBe(500);
  expect(skillPointTotal(skillLookup, [2016021])).toBeNull();
});

it('sorts by rarity, effect type and descending SP cost with stable ties and inherited uniques first', () => {
  const entries: SkillData[] = [
    { skill_id: 100001, name: 'Unique', rarity: 4, icon: '' },
    { skill_id: 200001, name: 'Gold speed', rarity: 2, icon: '', baseCost: 180 },
    { skill_id: 200002, name: 'Recover stamina', rarity: 2, icon: '', baseCost: 300 },
    { skill_id: 200003, name: 'Speed down', rarity: 2, icon: '' },
    { skill_id: 200004, name: 'Other gold', rarity: 2, icon: '' },
    { skill_id: 200005, name: 'Normal speed', rarity: 1, icon: '', baseCost: 500 },
    { skill_id: 200006, name: 'Another gold speed', rarity: 2, icon: '', baseCost: 120 },
    {
      skill_id: 200007,
      name: 'Normal recovery',
      description: 'Restore stamina',
      rarity: 1,
      icon: ''
    },
    { skill_id: 200008, name: 'Same cost gold speed', rarity: 2, icon: '', baseCost: 180 },
    { skill_id: 200009, name: 'Unknown cost gold speed', rarity: 2, icon: '' }
  ];

  const skillLookup = new Map(entries.map((entry) => [entry.skill_id, entry]));
  const ids = [
    2000051, 2000031, 2000021, 9000013, 1000012, 2000091, 2000061, 2000011, 2000041, 99999999,
    2000071, 2000081
  ];

  expect(sortEncodedSkills(skillLookup, ids)).toEqual([
    1000012, 9000013, 2000011, 2000081, 2000061, 2000091, 2000021, 2000031, 2000041, 2000051,
    2000071, 99999999
  ]);
  expect(ids[0]).toBe(2000051);
  expect(resolveEncodedSkill(skillLookup, 9000013)).toMatchObject({
    skill: entries[0],
    inherited: true,
    level: 3
  });
});

it('normalizes legacy boolean flags and metadata-derived unique skills like Angular', async () => {
  expect(
    normalizeSkill({ skill_id: '1', rarity: '3', unique: 'false', inherited: 'false' })
  ).toMatchObject({ skill_id: 1, rarity: 3, unique: false, inherited: false });

  for (const entry of [
    { unique: 'true' },
    { description: 'Rarity: Upgraded Unique' },
    { description: 'Rarity: Special', other_versions: ['When inherited'] }
  ])
    expect(normalizeSkill(entry).unique).toBe(true);
  expect(normalizeSkill({ inherited: 'true' }).inherited).toBe(true);
  const skillLookup = await loadSkills();
  expect(skillLookup.get(100011)).toMatchObject({ name: 'Shooting Star', unique: true });
  expect(skillRarity(skillLookup.get(100011), false)).toBe('unique-main');
  expect(sortEncodedSkills(skillLookup, [200011, 100011])).toEqual([100011, 200011]);
  expect(skillImage(skillLookup.get(100011)?.icon)).toBe(
    '/assets/images/skills/utx_ico_skill_20013.webp'
  );
});
