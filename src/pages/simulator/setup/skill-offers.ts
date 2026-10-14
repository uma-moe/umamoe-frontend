import type { SkillCatalogEntry } from '@/lib/catalog/skill-catalog';
import type { OptimizePurchaseInput } from '../requests/optimize-request';

/**
 * Skills on offer at the end of a career, priced the way the game prices them: the base cost less the hint discount,
 * with gold and ◎ skills tied to the white or ○ skill they upgrade. These become the optimizer's purchases.
 */

/** A skill she can buy, with the hint level she has for it (0 for none). */
export interface SkillOffer {
  skillId: number;
  hint: number;
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
export function baseCost(skill: SkillCatalogEntry): number | undefined {
  if (String(skill.skill_id).startsWith('9') && skill.skill_id < 1_000_000)
    return INHERITED_UNIQUE_COST;
  return skill.baseCost;
}

/**
 * The white or ○ skill a gold or ◎ skill upgrades: the catalog pairs them by id, the upgrade ending in 1 and the
 * skill it upgrades in 2.
 */
export function upgradedSkill(
  skill: SkillCatalogEntry,
  catalog: Map<number, SkillCatalogEntry>
): SkillCatalogEntry | undefined {
  if (skill.skill_id % 10 !== 1) return undefined;
  const lower = catalog.get(skill.skill_id + 1);
  if (!lower) return undefined;
  const gold = skill.rarity === 2 && lower.rarity === 1;
  const double = /◎\s*$/.test(skill.name) && /○\s*$/.test(lower.name);
  return gold || double ? lower : undefined;
}

/** One offer, priced, with what it needs. */
export interface PricedOffer extends SkillOffer {
  skill: SkillCatalogEntry;
  /** Before the hint discount. */
  base: number;
  /** With the hint discount; includes the skill it upgrades when that is neither owned nor on offer. */
  cost: number;
  /** The skill it upgrades. */
  upgrades?: SkillCatalogEntry;
  /** How the skill it upgrades is covered. */
  needs?: 'owned' | 'offered' | 'bundled';
}

/**
 * Prices the offers and turns them into the optimizer's purchases. An upgrade needs the skill it upgrades: when she
 * owns it, the upgrade costs only its own price; when it is on offer, the upgrade requires and replaces that purchase;
 * otherwise the upgrade is bought together with it, at both prices. Offers without a known cost are left out.
 */
export function offerPurchases(
  offers: SkillOffer[],
  owned: number[],
  catalog: Map<number, SkillCatalogEntry>,
  fastLearner = false
): { priced: PricedOffer[]; missing: SkillOffer[]; purchases: OptimizePurchaseInput[] } {
  const priced: PricedOffer[] = [],
    missing: SkillOffer[] = [];
  const seen = new Set<number>();
  for (const offer of offers) {
    const skill = catalog.get(offer.skillId);
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
    const lower = upgradedSkill(offer.skill, catalog);
    if (!lower) continue;
    offer.upgrades = lower;
    if (owned.includes(lower.skill_id)) offer.needs = 'owned';
    else if (index.has(lower.skill_id)) offer.needs = 'offered';
    else {
      offer.needs = 'bundled';
      const lowerBase = baseCost(lower);
      offer.cost += lowerBase == null ? 0 : offerCost(lowerBase, 0, fastLearner);
    }
  }
  const purchases = priced.map((offer): OptimizePurchaseInput => {
    const lower = offer.needs === 'offered' ? index.get(offer.upgrades!.skill_id) : undefined;
    return {
      name: offer.skill.name,
      cost: offer.cost,
      skills: [offer.skillId],
      ...(lower !== undefined ? { requires: [lower], replaces: [lower] } : {})
    };
  });
  return { priced, missing, purchases };
}
