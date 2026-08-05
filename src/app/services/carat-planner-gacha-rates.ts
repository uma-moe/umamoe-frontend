import { PlannerGachaEntry, PlannerPickupRate } from '../models/carat-planner.model';

/**
 * Standard Global character/support scout rates verified against published
 * in-game entries. Special, paid, select, and oversized pickup pools must not
 * use this policy.
 */
export const STANDARD_PREDICTED_GACHA_RATES = Object.freeze({
  pickupRate: 0.0075,
  topRarityRate: 0.03,
  srRarityRate: 0.18,
  rRarityRate: 0.79,
  singleSrPickupRate: 0.0225,
  singleRPickupRate: 0.0375,
  multipleSrPickupTotalRate: 0.03,
  multipleRPickupTotalRate: 0.05,
});

export interface PlannerGachaRateInferenceContext {
  featuredPickupIds: readonly number[];
  gachaType?: number;
  eventType?: string;
  now?: Date | number;
}

const STANDARD_GACHA_TYPE = 3;
const RATE_TOLERANCE = 1e-12;

/**
 * Adds an explicitly tagged standard-rate estimate to an ordinary banner
 * whenever published pickup or top-rarity rates are incomplete.
 * Published values are retained field-by-field and always take precedence.
 */
export function resolvePlannerGachaRates(
  entry: PlannerGachaEntry,
  context: PlannerGachaRateInferenceContext,
): PlannerGachaEntry {
  const featuredPickupIds = [...new Set(context.featuredPickupIds
    .filter(id => Number.isInteger(id) && id > 0))];
  if (featuredPickupIds.length === 0) return entry;

  const sourcePickups = entry.pickups ?? [];
  const sourceFeaturedPickups = entry.featured_pickups ?? [];
  const publishedPickupIds = new Set([...sourceFeaturedPickups, ...sourcePickups]
    .filter(pickup => isValidRate(pickup.rate))
    .map(pickup => pickup.pickup_id));
  const publishedIdentityMismatch = publishedPickupIds.size > 0
    && !featuredPickupIds.some(pickupId => publishedPickupIds.has(pickupId));
  const identityValidatedEntry = publishedIdentityMismatch
    ? {
        ...entry,
        pickups: [],
        featured_pickups: [],
        rarity_rates: [],
        rates_confidence: 'unavailable_identity_mismatch' as const,
      }
    : entry;

  const isProtectedStandardInference = entry.provenance === 'jp_fallback'
    && entry.confidence === 'inferred_standard_rate';
  const rateTaggedEntry = isProtectedStandardInference && !publishedIdentityMismatch
    ? {
      ...identityValidatedEntry,
      rates_provenance: 'standard_inference',
      rates_confidence: 'inferred_standard',
    } satisfies PlannerGachaEntry
    : identityValidatedEntry;

  const pickupRarities = new Map(featuredPickupIds.map(pickupId => [
    pickupId,
    plannerPickupRarity(rateTaggedEntry.banner_kind, pickupId),
  ]));
  const topRarityPickupCount = [...pickupRarities.values()].filter(rarity => rarity === 3).length;

  if (!isInferenceEligible(rateTaggedEntry, context, topRarityPickupCount)) {
    return rateTaggedEntry;
  }

  // A reused gacha ID can point at an unrelated old Global pool. Once the
  // event's advertised pickup identity fails validation, none of that pool's
  // pickup or rarity rates are authoritative for this event.
  const usableSourcePickups = publishedIdentityMismatch ? [] : sourcePickups;
  const usableFeaturedPickups = publishedIdentityMismatch ? [] : sourceFeaturedPickups;
  const pickupById = new Map<number, PlannerPickupRate>();
  for (const pickup of [...usableFeaturedPickups, ...usableSourcePickups]) {
    if (Number.isInteger(pickup.pickup_id) && pickup.pickup_id > 0 && !pickupById.has(pickup.pickup_id)) {
      pickupById.set(pickup.pickup_id, pickup);
    }
  }

  const featuredCountsByRarity = new Map<number, number>();
  for (const rarity of pickupRarities.values()) {
    featuredCountsByRarity.set(rarity, (featuredCountsByRarity.get(rarity) ?? 0) + 1);
  }

  let inferred = false;
  const pickups = featuredPickupIds.map(pickupId => {
    const published = pickupById.get(pickupId);
    if (published && isValidRate(published.rate)) return published;
    inferred = true;
    const rarity = pickupRarities.get(pickupId) ?? 3;
    return {
      ...published,
      pickup_id: pickupId,
      rate: standardFeaturedPickupRate(rarity, featuredCountsByRarity.get(rarity) ?? 1),
      exchangeable: published?.exchangeable ?? rarity === 3,
    } satisfies PlannerPickupRate;
  });
  for (const pickup of usableSourcePickups) {
    if (!featuredPickupIds.includes(pickup.pickup_id)) pickups.push(pickup);
  }


  const sourceRarityRates = publishedIdentityMismatch ? [] : entry.rarity_rates ?? [];
  const rarityRates = [...sourceRarityRates];
  const publishedTopRarity = sourceRarityRates.find(rate => rate.rarity === 3 && isValidRate(rate.rate));
  const canCompleteStandardRarityTable = !publishedTopRarity
    || Math.abs(publishedTopRarity.rate - STANDARD_PREDICTED_GACHA_RATES.topRarityRate) <= RATE_TOLERANCE;
  const standardRarityRates = canCompleteStandardRarityTable
    ? [
      { rarity: 3, rate: STANDARD_PREDICTED_GACHA_RATES.topRarityRate },
      { rarity: 2, rate: STANDARD_PREDICTED_GACHA_RATES.srRarityRate },
      { rarity: 1, rate: STANDARD_PREDICTED_GACHA_RATES.rRarityRate },
    ]
    : [];
  for (const standardRate of standardRarityRates) {
    if (rarityRates.some(rate => rate.rarity === standardRate.rarity && isValidRate(rate.rate))) continue;
    rarityRates.push(standardRate);
    inferred = true;
  }
  const topRarityRate = rarityRates.find(rate => rate.rarity === 3 && isValidRate(rate.rate))!.rate;

  const featuredTopRarityTotal = pickups
    .filter(pickup => featuredPickupIds.includes(pickup.pickup_id)
      && pickupRarities.get(pickup.pickup_id) === 3
      && isValidRate(pickup.rate))
    .reduce((sum, pickup) => sum + pickup.rate, 0);
  if (featuredTopRarityTotal > topRarityRate + RATE_TOLERANCE) return rateTaggedEntry;

  const pickupsChanged = pickups.length !== sourcePickups.length
    || pickups.some((pickup, index) => sourcePickups[index] !== pickup);
  if (!inferred) {
    return pickupsChanged ? { ...rateTaggedEntry, pickups } : rateTaggedEntry;
  }


  return {
    ...rateTaggedEntry,
    pickups,
    rarity_rates: rarityRates,
    rates_provenance: 'standard_inference',
    rates_confidence: 'inferred_standard',
  };
}

function isInferenceEligible(
  entry: PlannerGachaEntry,
  context: PlannerGachaRateInferenceContext,
  topRarityPickupCount: number,
): boolean {
  if (entry.banner_kind !== 'character' && entry.banner_kind !== 'support') return false;
  const gachaType = context.gachaType ?? entry.gacha_type;
  if (gachaType !== undefined && gachaType !== STANDARD_GACHA_TYPE) return false;
  if (topRarityPickupCount < 1 || topRarityPickupCount > 4) return false;
  if (entry.gacha_id >= 50_000 && entry.gacha_id < 60_000) return false;
  return !/paid|select|guaranteed|step.?up|pick.?2/i.test(context.eventType ?? '');
}

function plannerPickupRarity(bannerKind: PlannerGachaEntry['banner_kind'], pickupId: number): 1 | 2 | 3 {
  if (bannerKind !== 'support') return 3;
  const encodedRarity = Math.trunc(pickupId / 10_000);
  return encodedRarity === 1 || encodedRarity === 2 || encodedRarity === 3 ? encodedRarity : 3;
}

function standardFeaturedPickupRate(rarity: 1 | 2 | 3, featuredCount: number): number {
  if (rarity === 2) {
    return featuredCount <= 1
      ? STANDARD_PREDICTED_GACHA_RATES.singleSrPickupRate
      : STANDARD_PREDICTED_GACHA_RATES.multipleSrPickupTotalRate / featuredCount;
  }
  if (rarity === 1) {
    return featuredCount <= 1
      ? STANDARD_PREDICTED_GACHA_RATES.singleRPickupRate
      : STANDARD_PREDICTED_GACHA_RATES.multipleRPickupTotalRate / featuredCount;
  }
  return STANDARD_PREDICTED_GACHA_RATES.pickupRate;
}

function isValidRate(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 1;
}
