import { PlannerGachaEntry, PlannerPickupRate } from '../models/carat-planner.model';

/**
 * Standard Global character/support scout rates verified against published
 * in-game entries. Special, paid, select, and oversized pickup pools must not
 * use this policy.
 */
export const STANDARD_PREDICTED_GACHA_RATES = Object.freeze({
  pickupRate: 0.0075,
  topRarityRate: 0.03,
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
 * Adds an explicitly tagged standard-rate estimate to a future JP fallback.
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
  const publishedPickupIds = new Set(sourcePickups
    .filter(pickup => isValidRate(pickup.rate))
    .map(pickup => pickup.pickup_id));
  const publishedIdentityMismatch = publishedPickupIds.size > 0
    && !featuredPickupIds.some(pickupId => publishedPickupIds.has(pickupId));
  const identityValidatedEntry = publishedIdentityMismatch
    ? {
        ...entry,
        pickups: [],
        rarity_rates: [],
        rates_confidence: 'unavailable_identity_mismatch' as const,
      }
    : entry;

  const isProtectedStandardInference = entry.provenance === 'jp_fallback'
    && entry.confidence === 'inferred_standard_rate';
  if (isProtectedStandardInference && !publishedIdentityMismatch) {
    return {
      ...entry,
      rates_provenance: 'standard_inference',
      rates_confidence: 'inferred_standard',
    };
  }

  if (!isInferenceEligible(identityValidatedEntry, context, featuredPickupIds.length)) {
    return identityValidatedEntry;
  }

  const isPublishedExact = entry.provenance === 'global_master' && entry.confidence === 'exact';
  const isTimelineFallback = entry.provenance === 'jp_fallback'
    && entry.confidence === 'timeline_schedule_defaults';
  if (!isTimelineFallback && !(isPublishedExact && publishedIdentityMismatch)) return identityValidatedEntry;

  // A reused gacha ID can point at an unrelated old Global pool. Once the
  // event's advertised pickup identity fails validation, none of that pool's
  // pickup or rarity rates are authoritative for this event.
  const usableSourcePickups = publishedIdentityMismatch ? [] : sourcePickups;
  const pickupById = new Map<number, PlannerPickupRate>();
  for (const pickup of usableSourcePickups) {
    if (Number.isInteger(pickup.pickup_id) && pickup.pickup_id > 0 && !pickupById.has(pickup.pickup_id)) {
      pickupById.set(pickup.pickup_id, pickup);
    }
  }

  let inferred = false;
  const pickups = featuredPickupIds.map(pickupId => {
    const published = pickupById.get(pickupId);
    if (published && isValidRate(published.rate)) return published;
    inferred = true;
    return {
      ...published,
      pickup_id: pickupId,
      rate: STANDARD_PREDICTED_GACHA_RATES.pickupRate,
      exchangeable: published?.exchangeable ?? true,
    } satisfies PlannerPickupRate;
  });
  for (const pickup of usableSourcePickups) {
    if (!featuredPickupIds.includes(pickup.pickup_id)) pickups.push(pickup);
  }

  const sourceRarityRates = publishedIdentityMismatch ? [] : entry.rarity_rates ?? [];
  const publishedTopRarity = sourceRarityRates.find(rate => rate.rarity === 3 && isValidRate(rate.rate));
  const topRarityRate = publishedTopRarity?.rate ?? STANDARD_PREDICTED_GACHA_RATES.topRarityRate;
  const rarityRates = publishedTopRarity
    ? sourceRarityRates
    : [...sourceRarityRates, { rarity: 3, rate: topRarityRate }];
  inferred ||= !publishedTopRarity;

  const featuredTotal = pickups
    .filter(pickup => featuredPickupIds.includes(pickup.pickup_id) && isValidRate(pickup.rate))
    .reduce((sum, pickup) => sum + pickup.rate, 0);
  if (!inferred || featuredTotal > topRarityRate + RATE_TOLERANCE) return entry;

  return {
    ...entry,
    pickups,
    rarity_rates: rarityRates,
    rates_provenance: 'standard_inference',
    rates_confidence: 'inferred_standard',
  };
}

function isInferenceEligible(
  entry: PlannerGachaEntry,
  context: PlannerGachaRateInferenceContext,
  featuredPickupCount: number,
): boolean {
  if (entry.banner_kind !== 'character' && entry.banner_kind !== 'support') return false;
  if ((context.gachaType ?? entry.gacha_type) !== STANDARD_GACHA_TYPE) return false;
  if (featuredPickupCount < 1 || featuredPickupCount > 2) return false;
  if (entry.gacha_id >= 50_000 && entry.gacha_id < 60_000) return false;
  if (/paid|select|guaranteed/i.test(context.eventType ?? '')) return false;
  const start = Date.parse(entry.start_date);
  const now = context.now instanceof Date ? context.now.getTime() : context.now ?? Date.now();
  return Number.isFinite(start) && Number.isFinite(now) && start > now;
}

function isValidRate(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 1;
}
