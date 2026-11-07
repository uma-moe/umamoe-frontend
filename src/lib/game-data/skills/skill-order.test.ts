import { expect, it } from 'vitest';
import { compareByGameOrder, sortByGameOrder } from './skill-order';
import type { SkillData } from './skills';

const skill = (skill_id: number, order?: number): SkillData => ({
  skill_id,
  name: 'Skill ' + skill_id,
  rarity: 1,
  icon: '',
  order
});

it('lists a skill by its display order, not its id', () => {
  const laterInTheShop = skill(200011, 1005);
  const earlierInTheShop = skill(299999, 990);

  expect([laterInTheShop, earlierInTheShop].sort(compareByGameOrder)).toEqual([
    earlierInTheShop,
    laterInTheShop
  ]);
});

it('puts an inherited unique under the owned one and above the golds', () => {
  const owned = skill(100011, 10);
  const inherited = skill(900011, 30);
  const gold = skill(200351, 1950);

  expect([gold, inherited, owned].sort(compareByGameOrder)).toEqual([owned, inherited, gold]);
});

it('breaks a display order two skills share by skill id', () => {
  const second = skill(900021, 30);
  const first = skill(900011, 30);

  expect([second, first].sort(compareByGameOrder)).toEqual([first, second]);
});

it('sorts a skill with no display order after every ordered one', () => {
  const upcoming = skill(299998);
  const ordered = skill(299999, 120015);

  expect([upcoming, ordered].sort(compareByGameOrder)).toEqual([ordered, upcoming]);
});

it('sorts a list through the skill each item buys', () => {
  const cornerRecovery = { skill: skill(200352, 1960) };
  const swingingMaestro = { skill: skill(200351, 1950) };
  const offers = [cornerRecovery, swingingMaestro];

  expect(sortByGameOrder(offers, (offer) => offer.skill)).toEqual([
    swingingMaestro,
    cornerRecovery
  ]);
});
