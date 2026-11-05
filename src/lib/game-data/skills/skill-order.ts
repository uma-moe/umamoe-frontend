import type { SkillData } from './skills';

/** A skill without a display order is not in the live game data yet, so it sorts after every ordered skill. */
function displayOrder(skill: SkillData): number {
  return skill.order ?? Number.MAX_SAFE_INTEGER;
}

/**
 * The order the game lists skills in: `disp_order` ascending, then skill id. Character uniques sit at 10 and inherited
 * (gene) uniques at 30, so an inherited unique lands directly under the owned one instead of down among the golds and
 * whites; the rest of the list starts at 990.
 */
export function compareByGameOrder(a: SkillData, b: SkillData): number {
  return displayOrder(a) - displayOrder(b) || a.skill_id - b.skill_id;
}

/** `items` in the game's skill list order, each read through the skill it buys. */
export function sortByGameOrder<T>(items: readonly T[], skillOf: (item: T) => SkillData): T[] {
  return items.toSorted((a, b) => compareByGameOrder(skillOf(a), skillOf(b)));
}
