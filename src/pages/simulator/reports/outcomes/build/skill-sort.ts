import { compareByGameOrder } from '@/lib/game-data/skills/skill-order';
import type { SkillData } from '@/lib/game-data/skills/skills';

export type SkillSortKey = 'shop' | 'cost' | 'value';
export type SortDirection = 'ascending' | 'descending';

export interface SkillSort {
  key: SkillSortKey;
  direction: SortDirection;
}

/** What a skill row is sorted by: the skill it buys, its SP and its worth. */
export interface SortableSkill {
  skill: SkillData;
  cost: number;
  value: number | undefined;
}

/** The skill shop's order, so a plan can be bought in one pass. */
export const SHOP_ORDER: SkillSort = { key: 'shop', direction: 'ascending' };

/** The same key flips its direction; SP and worth start with the largest. */
export function nextSkillSort(current: SkillSort, key: SkillSortKey): SkillSort {
  if (current.key === key) {
    return { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' };
  }

  return { key, direction: key === 'shop' ? 'ascending' : 'descending' };
}

/** A sorted copy; ties keep the shop's order, and unscored skills stay last in either direction. */
export function sortSkills<T>(
  items: readonly T[],
  sort: SkillSort,
  read: (item: T) => SortableSkill
): T[] {
  const sign = sort.direction === 'ascending' ? 1 : -1;

  return items.toSorted((a, b) => {
    const left = read(a);
    const right = read(b);

    return compareByKey(sort.key, left, right, sign) || compareByGameOrder(left.skill, right.skill);
  });
}

function compareByKey(
  key: SkillSortKey,
  left: SortableSkill,
  right: SortableSkill,
  sign: number
): number {
  switch (key) {
    case 'shop':
      return sign * compareByGameOrder(left.skill, right.skill);
    case 'cost':
      return sign * (left.cost - right.cost);
    case 'value':
      return compareValues(left.value, right.value, sign);
  }
}

function compareValues(left: number | undefined, right: number | undefined, sign: number): number {
  if (left === undefined && right === undefined) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;

  return sign * (left - right);
}
