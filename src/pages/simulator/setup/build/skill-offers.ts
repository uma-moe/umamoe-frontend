import type { SkillData } from '@/lib/game-data/skills/skills';
import type { OptimizePurchaseInput } from '../../requests/optimize-request';

/**
 * Skills on offer at the end of a career, priced the way the game prices them: the base cost less the hint discount,
 * with gold and ◎ skills tied to the skill they upgrade. These become the optimizer's purchases.
 */

/** A skill she can buy, with the hint level she has for it (0 for none). */
export interface SkillOffer {
  skillId: number;
  hint: number;
  /** A non-negotiable: every build the search considers buys it. */
  locked?: boolean;
}

/** The game's tier of a skill, for its tint: a unique, a gold skill, or a white one. */
export function skillTier(skill: SkillData): 'unique' | 'gold' | 'white' {
  if (skill.rarity >= 3) return 'unique';
  if (skill.rarity === 2) return 'gold';

  return 'white';
}

/** Percent of the base cost taken off by each hint level, 0 to 5. */
export const HINT_DISCOUNT = [0, 10, 20, 30, 35, 40] as const;
/** Fast Learner takes another 10% off every skill, added to the hint discount. */
export const FAST_LEARNER_DISCOUNT = 10;
/** Inherited uniques cost 200 SP before discounts. */
export const INHERITED_UNIQUE_COST = 200;
export const MAX_HINT = 5;

/** What one skill costs at a hint level, rounded down as the game shows it. */
export function offerCost(base: number, hint: number, fastLearner = false): number {
  const discount =
    HINT_DISCOUNT[Math.min(MAX_HINT, Math.max(0, Math.round(hint)))]! +
    (fastLearner ? FAST_LEARNER_DISCOUNT : 0);

  // Whole percents keep the arithmetic exact: 170 at 30% off is 119, not 118.99….
  return Math.floor((base * (100 - discount)) / 100);
}

/** A skill's base cost: its catalog cost, or the inherited unique cost. */
export function baseCost(skill: SkillData): number | undefined {
  if (String(skill.skill_id).startsWith('9') && skill.skill_id < 1_000_000)
    return INHERITED_UNIQUE_COST;
  return skill.baseCost;
}

/**
 * A skill's rank in its group, from the catalog: a gold above a ◎ above a ○ or plain white; a × is below them all, as
 * is a plain white beside a ○ or ◎ (Wallflower) or beside a plain white of a lower ID (Gatekept beside Focus).
 * Undefined for uniques. The game's groups are the skill ID without its last digit.
 */
function groupRank(skill: SkillData, group: SkillData[]): number | undefined {
  if (skill.rarity === 2) return 3;
  if (skill.rarity !== 1) return undefined;
  const name = skill.name.trimEnd();
  if (name.endsWith('◎')) return 2;
  if (name.endsWith('○')) return 1;
  if (name.endsWith('×')) return -1;
  const whites = group.filter((other) => other !== skill && other.rarity === 1);
  if (whites.some((other) => /[○◎]$/.test(other.name.trimEnd()))) return -1;
  if (
    whites.some((other) => other.skill_id < skill.skill_id && !/[○◎×]$/.test(other.name.trimEnd()))
  )
    return -1;
  return 1;
}

/**
 * The skill a gold or ◎ skill is learned on: the next rank down of its group that is not a × (Swinging Maestro on
 * Corner Recovery ○, See Ya Later! on Playtime's Over!, Blast Forward on Long Straightaways ◎), whichever ID it has.
 */
export function upgradedSkill(
  skill: SkillData,
  skillLookup: Map<number, SkillData>
): SkillData | undefined {
  const first = Math.floor(skill.skill_id / 10) * 10;
  const group = Array.from({ length: 10 }, (_, digit) => skillLookup.get(first + digit)).filter(
    (other): other is SkillData => Boolean(other)
  );

  const rank = groupRank(skill, group);
  if (rank === undefined) return undefined;
  let lower: SkillData | undefined,
    lowerRank = 0;

  for (const other of group) {
    const otherRank = other === skill ? undefined : groupRank(other, group);
    if (otherRank === undefined || otherRank <= 0 || otherRank >= rank) continue;
    if (otherRank > lowerRank) [lower, lowerRank] = [other, otherRank];
  }

  return lower;
}

/** One offer, priced, with what it needs. */
export interface PricedOffer extends SkillOffer {
  skill: SkillData;
  /** Before the hint discount. */
  base: number;
  /** With the hint discount; includes the skill it upgrades when that is neither owned nor on offer. */
  cost: number;
  /** The skill it upgrades. */
  upgrades?: SkillData;
  /** How the skill it upgrades is covered. */
  needs?: 'owned' | 'offered' | 'bundled';
  /** The ranks below it she neither owns nor has on offer, bought with it: Blast Forward without either straightaway. */
  bundled?: SkillData[];
  /** The skill down its group it builds on and replaces: one she owns, or one on offer it needs bought first. */
  buildsOn?: { skill: SkillData; owned: boolean };
}

/**
 * Prices the offers and turns them into the optimizer's purchases. An upgrade needs the skill it upgrades and, as in
 * the game, replaces it: when she owns it, the upgrade costs only its own price and removes the owned skill; when it
 * is on offer, the upgrade requires that purchase and removes its skill; otherwise the upgrade is bought together with
 * it, at both prices, and so on down its group (a gold above a ◎ with the ◎ and the ○). `replaces` lists skill IDs.
 * Offers without a known cost are left out.
 */
export function offerPurchases(
  offers: SkillOffer[],
  owned: number[],
  skillLookup: Map<number, SkillData>,
  fastLearner = false
): {
  priced: PricedOffer[];
  missing: SkillOffer[];
  purchases: OptimizePurchaseInput[];
  locked: number[];
  lockedCost: number;
} {
  const priced: PricedOffer[] = [],
    missing: SkillOffer[] = [];

  const seen = new Set<number>();
  for (const offer of offers) {
    const skill = skillLookup.get(offer.skillId);
    const base = skill && baseCost(skill);
    if (!skill || base == null || seen.has(offer.skillId)) {
      if (!seen.has(offer.skillId)) missing.push(offer);
      continue;
    }

    seen.add(offer.skillId);
    priced.push({ ...offer, skill, base, cost: offerCost(base, offer.hint, fastLearner) });
  }

  const index = new Map(priced.map((offer, position) => [offer.skillId, position]));
  for (const offer of priced) {
    const lower = upgradedSkill(offer.skill, skillLookup);
    if (!lower) continue;
    offer.upgrades = lower;
    // Down the group until a skill she owns or one on offer: every rank in between is bought with the upgrade.
    let tier: SkillData | undefined = lower;
    while (tier && !owned.includes(tier.skill_id) && !index.has(tier.skill_id)) {
      (offer.bundled ??= []).push(tier);
      const tierBase = baseCost(tier);
      offer.cost += tierBase == null ? 0 : offerCost(tierBase, 0, fastLearner);
      tier = upgradedSkill(tier, skillLookup);
    }

    if (tier) offer.buildsOn = { skill: tier, owned: owned.includes(tier.skill_id) };

    if (offer.bundled) offer.needs = 'bundled';
    else offer.needs = offer.buildsOn?.owned ? 'owned' : 'offered';
  }

  const purchases = priced.map((offer): OptimizePurchaseInput => {
    const on = offer.buildsOn;
    const lower = on && !on.owned ? index.get(on.skill.skill_id) : undefined;
    const replaced = on?.skill.skill_id;
    return {
      name: offer.skill.name,
      cost: offer.cost,
      skills: [offer.skillId],
      ...(lower !== undefined ? { requires: [lower] } : {}),
      ...(replaced !== undefined ? { replaces: [replaced] } : {})
    };
  });

  const locked = priced.flatMap((offer, position) => (offer.locked ? [position] : []));
  return { priced, missing, purchases, locked, lockedCost: lockedCost(purchases, locked) };
}

/** What the locked purchases cost, each with the purchases it needs, counted once. */
function lockedCost(purchases: OptimizePurchaseInput[], locked: number[]): number {
  const bought = new Set<number>();
  const pending = [...locked];
  for (let index = pending.pop(); index !== undefined; index = pending.pop()) {
    if (bought.has(index)) continue;
    bought.add(index);
    pending.push(...(purchases[index]?.requires ?? []));
  }

  let cost = 0;
  for (const index of bought) cost += purchases[index]?.cost ?? 0;
  return cost;
}
