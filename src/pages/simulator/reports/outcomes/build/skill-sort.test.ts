import { describe, expect, it } from 'vitest';
import type { SkillData } from '@/lib/game-data/skills/skills';
import { nextSkillSort, SHOP_ORDER, sortSkills, type SortableSkill } from './skill-sort';

const skill = (skill_id: number, order: number): SkillData => ({
  skill_id,
  name: 'Skill ' + skill_id,
  rarity: 1,
  icon: '',
  order
});

const row = (name: string, order: number, cost: number, value?: number) => ({
  name,
  sortable: { skill: skill(order, order), cost, value } satisfies SortableSkill
});

type Row = ReturnType<typeof row>;

const names = (rows: Row[]) => rows.map((entry) => entry.name);
const read = (entry: Row) => entry.sortable;

const unique = row('unique', 10, 180, 1.2);
const gold = row('gold', 1950, 306, 2.9);
const white = row('white', 2100, 120, 0.4);
const unscored = row('unscored', 1000, 160);
const plan = [gold, unscored, white, unique];

describe('sortSkills', () => {
  it('lists the plan in the shop’s order by default', () => {
    const inShopOrder = sortSkills(plan, SHOP_ORDER, read);

    expect(names(inShopOrder)).toEqual(['unique', 'unscored', 'gold', 'white']);
  });

  it('sorts by SP in either direction', () => {
    const priciestFirst = sortSkills(plan, { key: 'cost', direction: 'descending' }, read);
    const cheapestFirst = sortSkills(plan, { key: 'cost', direction: 'ascending' }, read);

    expect(names(priciestFirst)).toEqual(['gold', 'unique', 'unscored', 'white']);
    expect(names(cheapestFirst)).toEqual(['white', 'unscored', 'unique', 'gold']);
  });

  it('keeps unscored skills last when sorting by worth in either direction', () => {
    const bestFirst = sortSkills(plan, { key: 'value', direction: 'descending' }, read);
    const worstFirst = sortSkills(plan, { key: 'value', direction: 'ascending' }, read);

    expect(names(bestFirst)).toEqual(['gold', 'unique', 'white', 'unscored']);
    expect(names(worstFirst)).toEqual(['white', 'unique', 'gold', 'unscored']);
  });

  it('breaks ties in the shop’s order', () => {
    const laterInShop = row('later', 1200, 120, 1);
    const earlierInShop = row('earlier', 990, 120, 1);

    const byCost = sortSkills(
      [laterInShop, earlierInShop],
      { key: 'cost', direction: 'descending' },
      read
    );

    expect(names(byCost)).toEqual(['earlier', 'later']);
  });

  it('leaves the given list in its own order', () => {
    sortSkills(plan, SHOP_ORDER, read);

    expect(names(plan)).toEqual(['gold', 'unscored', 'white', 'unique']);
  });
});

describe('nextSkillSort', () => {
  it('starts SP and worth with the largest', () => {
    expect(nextSkillSort(SHOP_ORDER, 'cost')).toEqual({ key: 'cost', direction: 'descending' });
    expect(nextSkillSort(SHOP_ORDER, 'value')).toEqual({ key: 'value', direction: 'descending' });
  });

  it('flips the direction of the key already sorted by', () => {
    expect(nextSkillSort(SHOP_ORDER, 'shop')).toEqual({ key: 'shop', direction: 'descending' });
    expect(nextSkillSort({ key: 'cost', direction: 'descending' }, 'cost')).toEqual({
      key: 'cost',
      direction: 'ascending'
    });
  });

  it('returns to the shop’s order from another key', () => {
    expect(nextSkillSort({ key: 'value', direction: 'ascending' }, 'shop')).toEqual(SHOP_ORDER);
  });
});
