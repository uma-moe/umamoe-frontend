import type { PlannerGachaEntry, PlannerPickupRate } from '../carat-planner';

/** Published standard Global rates. This is only used when the protected
 * master-data entry is incomplete and the banner is an ordinary type-3 scout. */
export const STANDARD_PREDICTED_GACHA_RATES = Object.freeze({
  pickupRate: 0.0075,
  topRarityRate: 0.03,
  srRarityRate: 0.18,
  rRarityRate: 0.79,
  singleSrPickupRate: 0.0225,
  singleRPickupRate: 0.0375,
  multipleSrPickupTotalRate: 0.03,
  multipleRPickupTotalRate: 0.05
});

export interface PlannerGachaRateContext {
  featuredPickupIds: readonly number[];
  gachaType?: number;
  eventType?: string;
}

const RATE_TOLERANCE = 1e-12;

export function resolvePlannerGachaRates(
  entry: PlannerGachaEntry,
  context: PlannerGachaRateContext
): PlannerGachaEntry {
  const featuredPickupIds = [
    ...new Set(context.featuredPickupIds.filter((value) => Number.isInteger(value) && value > 0))
  ];

  if (!featuredPickupIds.length) return entry;

  const sourcePickups = entry.pickups ?? [];
  const sourceFeatured = entry.featured_pickups ?? [];
  const publishedIds = new Set(
    [...sourceFeatured, ...sourcePickups]
      .filter((item) => validRate(item.rate))
      .map((item) => item.pickup_id)
  );

  const identityMismatch =
    publishedIds.size > 0 && !featuredPickupIds.some((pickupId) => publishedIds.has(pickupId));

  const identityValidated = identityMismatch
    ? {
        ...entry,
        pickups: [],
        featured_pickups: [],
        rarity_rates: [],
        rates_confidence: 'unavailable_identity_mismatch'
      }
    : entry;

  const protectedInference =
    entry.provenance === 'jp_fallback' && entry.confidence === 'inferred_standard_rate';

  const tagged =
    protectedInference && !identityMismatch
      ? {
          ...identityValidated,
          rates_provenance: 'standard_inference',
          rates_confidence: 'inferred_standard'
        }
      : identityValidated;

  const rarities = new Map(
    featuredPickupIds.map((pickupId) => [pickupId, pickupRarity(tagged.banner_kind, pickupId)])
  );

  const topRarityCount = [...rarities.values()].filter((rarity) => rarity === 3).length;
  if (!eligible(tagged, context, topRarityCount)) return tagged;

  const usablePickups = identityMismatch ? [] : sourcePickups;
  const usableFeatured = identityMismatch ? [] : sourceFeatured;
  const pickupById = new Map<number, PlannerPickupRate>();
  for (const pickup of [...usableFeatured, ...usablePickups]) {
    if (
      Number.isInteger(pickup.pickup_id) &&
      pickup.pickup_id > 0 &&
      !pickupById.has(pickup.pickup_id)
    )
      pickupById.set(pickup.pickup_id, pickup);
  }

  const featuredCounts = new Map<number, number>();
  for (const rarity of rarities.values())
    featuredCounts.set(rarity, (featuredCounts.get(rarity) ?? 0) + 1);

  let inferred = false;
  const pickups = featuredPickupIds.map((pickupId) => {
    const published = pickupById.get(pickupId);
    if (published && validRate(published.rate)) return published;
    inferred = true;
    const rarity = rarities.get(pickupId) ?? 3;
    return {
      ...published,
      pickup_id: pickupId,
      rate: standardRate(rarity, featuredCounts.get(rarity) ?? 1),
      exchangeable: published?.exchangeable ?? rarity === 3
    };
  });

  for (const pickup of usablePickups)
    if (!featuredPickupIds.includes(pickup.pickup_id)) pickups.push(pickup);

  const sourceRarityRates = identityMismatch ? [] : (entry.rarity_rates ?? []);
  const rarityRates = [...sourceRarityRates];
  const publishedTop = sourceRarityRates.find((rate) => rate.rarity === 3 && validRate(rate.rate));
  const standardRarityRates =
    !publishedTop ||
    Math.abs(publishedTop.rate - STANDARD_PREDICTED_GACHA_RATES.topRarityRate) <= RATE_TOLERANCE
      ? [
          { rarity: 3, rate: STANDARD_PREDICTED_GACHA_RATES.topRarityRate },
          { rarity: 2, rate: STANDARD_PREDICTED_GACHA_RATES.srRarityRate },
          { rarity: 1, rate: STANDARD_PREDICTED_GACHA_RATES.rRarityRate }
        ]
      : [];

  for (const rate of standardRarityRates) {
    if (rarityRates.some((item) => item.rarity === rate.rarity && validRate(item.rate))) continue;
    rarityRates.push(rate);
    inferred = true;
  }

  const topRarityRate = rarityRates.find((rate) => rate.rarity === 3 && validRate(rate.rate))?.rate;
  if (topRarityRate === undefined) return tagged;
  const featuredTopTotal = pickups
    .filter(
      (pickup) =>
        featuredPickupIds.includes(pickup.pickup_id) &&
        rarities.get(pickup.pickup_id) === 3 &&
        validRate(pickup.rate)
    )
    .reduce((sum, pickup) => sum + pickup.rate, 0);

  if (featuredTopTotal > topRarityRate + RATE_TOLERANCE) return tagged;

  const pickupsChanged =
    pickups.length !== sourcePickups.length ||
    pickups.some((pickup, index) => sourcePickups[index] !== pickup);

  if (!inferred) return pickupsChanged ? { ...tagged, pickups } : tagged;
  return {
    ...tagged,
    pickups,
    rarity_rates: rarityRates,
    rates_provenance: 'standard_inference',
    rates_confidence: 'inferred_standard'
  };
}

function eligible(
  entry: PlannerGachaEntry,
  context: PlannerGachaRateContext,
  topRarityCount: number
): boolean {
  if (entry.banner_kind !== 'character' && entry.banner_kind !== 'support') return false;
  const gachaType = context.gachaType ?? entry.gacha_type;
  if (gachaType !== undefined && gachaType !== 3) return false;
  if (topRarityCount < 1 || topRarityCount > 4) return false;
  if (entry.gacha_id >= 50_000 && entry.gacha_id < 60_000) return false;
  return !/paid|select|guaranteed|step.?up|pick.?2/i.test(context.eventType ?? '');
}

function pickupRarity(kind: PlannerGachaEntry['banner_kind'], pickupId: number): 1 | 2 | 3 {
  if (kind !== 'support') return 3;
  const encoded = Math.trunc(pickupId / 10_000);
  return encoded === 1 || encoded === 2 || encoded === 3 ? encoded : 3;
}

function standardRate(rarity: 1 | 2 | 3, count: number): number {
  if (rarity === 2)
    return count <= 1
      ? STANDARD_PREDICTED_GACHA_RATES.singleSrPickupRate
      : STANDARD_PREDICTED_GACHA_RATES.multipleSrPickupTotalRate / count;
  if (rarity === 1)
    return count <= 1
      ? STANDARD_PREDICTED_GACHA_RATES.singleRPickupRate
      : STANDARD_PREDICTED_GACHA_RATES.multipleRPickupTotalRate / count;
  return STANDARD_PREDICTED_GACHA_RATES.pickupRate;
}

function validRate(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 1;
}
