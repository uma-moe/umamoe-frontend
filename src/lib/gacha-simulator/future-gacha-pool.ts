import type { PlannerGachaEntry, PlannerPickupRate } from '@/lib/carat-planner/carat-planner';
import type { CharacterData } from '@/lib/game-data/characters';
import type { SupportCardData } from '@/lib/game-data/support-cards/support-cards';
import type { GachaKind, GachaPool, GachaPoolEntry, GachaRarity } from './gacha-draw';

export interface FutureGachaCatalog {
  characters: readonly CharacterData[];
  supports: readonly SupportCardData[];
}

interface FuturePoolInput {
  gacha: PlannerGachaEntry;
  kind: GachaKind;
  jpReleaseDate: Date;
  catalog: FutureGachaCatalog;
}

interface Candidate {
  id: number;
  rarity: GachaRarity;
}

const RARITIES = [1, 2, 3] as const;
const TOTAL_ODDS = 1_000_000;

/** Rebuild a future pool from inferred pickup rates and cards released by the JP banner
 * date. Non-featured weights are split evenly as they are in the master data. */
export function createFutureGachaPool({
  gacha,
  kind,
  jpReleaseDate,
  catalog
}: FuturePoolInput): GachaPool {
  if (Number.isNaN(jpReleaseDate.getTime())) throw new Error('The JP banner date is invalid.');

  const candidates = (kind === 'character' ? catalog.characters : catalog.supports)
    .flatMap((card): Candidate[] => {
      const id = Number(card.id);
      const release = Date.parse(card.release_date ?? '');
      if (
        !Number.isSafeInteger(id) ||
        !Number.isFinite(release) ||
        release > jpReleaseDate.getTime() ||
        (card.rarity !== 1 && card.rarity !== 2 && card.rarity !== 3)
      )
        return [];

      return [{ id, rarity: card.rarity }];
    })
    .sort((left, right) => left.id - right.id);
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const featured = featuredRates(gacha).map((pickup) => ({
    cardId: pickup.pickup_id,
    rarity: candidateById.get(pickup.pickup_id)?.rarity ?? pickupRarity(kind, pickup.pickup_id),
    odds: Math.round(pickup.rate * TOTAL_ODDS),
    featured: true
  }));
  const entries: GachaPoolEntry[] = [];

  for (const rarity of RARITIES) {
    const rate = gacha.rarity_rates?.find((item) => item.rarity === rarity)?.rate;
    if (rate === undefined || !Number.isFinite(rate) || rate < 0 || rate > 1)
      throw new Error(`Gacha ${gacha.gacha_id} has no valid rarity-${rarity} rate.`);

    const rarityFeatured = featured.filter((entry) => entry.rarity === rarity);
    const featuredOdds = rarityFeatured.reduce((sum, entry) => sum + entry.odds, 0);
    const remaining = Math.round(rate * TOTAL_ODDS) - featuredOdds;
    if (remaining < 0) throw new Error(`Gacha ${gacha.gacha_id} has oversized pickup rates.`);

    const remainderPool = candidates.filter(
      (candidate) =>
        candidate.rarity === rarity && !featured.some((entry) => entry.cardId === candidate.id)
    );
    if (remaining > 0 && !remainderPool.length)
      throw new Error(`Gacha ${gacha.gacha_id} has no rarity-${rarity} remainder pool.`);

    entries.push(...distributeOdds(remainderPool, remaining), ...rarityFeatured);
  }

  return {
    id: gacha.gacha_id,
    kind,
    cost: gacha.jewel_cost_per_pull ?? 150,
    guaranteedRarity: 2,
    source: 'estimated',
    entries
  };
}

function featuredRates(gacha: PlannerGachaEntry): PlannerPickupRate[] {
  const pickups = new Map<number, PlannerPickupRate>();
  for (const pickup of [...(gacha.featured_pickups ?? []), ...(gacha.pickups ?? [])]) {
    if (
      Number.isSafeInteger(pickup.pickup_id) &&
      pickup.pickup_id > 0 &&
      Number.isFinite(pickup.rate) &&
      pickup.rate > 0 &&
      pickup.rate <= 1 &&
      !pickups.has(pickup.pickup_id)
    )
      pickups.set(pickup.pickup_id, pickup);
  }

  return [...pickups.values()];
}

function pickupRarity(kind: GachaKind, cardId: number): GachaRarity {
  if (kind === 'character') return 3;
  const rarity = Math.trunc(cardId / 10_000);
  return rarity === 1 || rarity === 2 || rarity === 3 ? rarity : 3;
}

function distributeOdds(candidates: readonly Candidate[], total: number): GachaPoolEntry[] {
  if (!candidates.length || total <= 0) return [];

  const base = Math.floor(total / candidates.length);
  const extra = total - base * candidates.length;
  return candidates.map((candidate, index) => ({
    cardId: candidate.id,
    rarity: candidate.rarity,
    odds: base + (index < extra ? 1 : 0),
    featured: false
  }));
}
