import { PlannerGachaEntry } from '../models/carat-planner.model';
import { CaratPullProbabilityService } from './carat-pull-probability.service';
import {
  resolvePlannerGachaRates,
  STANDARD_PREDICTED_GACHA_RATES,
} from './carat-planner-gacha-rates';

describe('planner gacha rate policy', () => {
  const now = new Date('2030-01-01T00:00:00Z');
  const fallback = (overrides: Partial<PlannerGachaEntry> = {}): PlannerGachaEntry => ({
    event_id: 'future-banner',
    gacha_id: 30104,
    banner_kind: 'character',
    start_date: '2031-01-01T00:00:00Z',
    end_date: '2031-01-10T00:00:00Z',
    provenance: 'jp_fallback',
    confidence: 'timeline_schedule_defaults',
    pickups: [],
    rarity_rates: [],
    ...overrides,
  });
  const resolve = (
    entry: PlannerGachaEntry,
    featuredPickupIds: readonly number[],
    gachaType = 3,
  ) => resolvePlannerGachaRates(entry, {
    featuredPickupIds,
    gachaType,
    eventType: 'character_banner',
    now,
  });

  it('keeps matching published pickup and rarity rates authoritative', () => {
    const exact = fallback({
      provenance: 'global_master',
      confidence: 'exact',
      pickups: [
        { pickup_id: 1001, rate: 0.006, exchangeable: true },
        { pickup_id: 1002, rate: 0.004, exchangeable: true },
      ],
      rarity_rates: [{ rarity: 3, rate: 0.04 }],
    });

    expect(resolve(exact, [1001, 1002])).toBe(exact);
    expect(exact.pickups?.map(pickup => pickup.rate)).toEqual([0.006, 0.004]);
    expect(exact.rarity_rates?.[0].rate).toBe(0.04);
  });

  it('keeps published values and fills a missing standard-banner pickup rate', () => {
    const partial = fallback({
      provenance: 'global_master',
      confidence: 'exact',
      pickups: [{ pickup_id: 1001, rate: 0.006, exchangeable: true }],
      rarity_rates: [{ rarity: 3, rate: 0.03 }],
    });

    const resolved = resolve(partial, [1001, 1002]);
    expect(resolved).not.toBe(partial);
    expect(resolved.pickups).toEqual([
      { pickup_id: 1001, rate: 0.006, exchangeable: true },
      jasmine.objectContaining({ pickup_id: 1002, rate: 0.0075, exchangeable: true }),
    ]);
    expect(resolved.rates_confidence).toBe('inferred_standard');
  });

  it('infers tagged standard rates for a future ordinary banner', () => {
    const source = fallback();
    const resolved = resolve(source, [1001]);

    expect(resolved).not.toBe(source);
    expect(resolved.pickups).toEqual([jasmine.objectContaining({
      pickup_id: 1001,
      rate: STANDARD_PREDICTED_GACHA_RATES.pickupRate,
      exchangeable: true,
    })]);
    expect(resolved.rarity_rates).toContain(jasmine.objectContaining({
      rarity: 3,
      rate: STANDARD_PREDICTED_GACHA_RATES.topRarityRate,
    }));
    expect([resolved.rates_provenance, resolved.rates_confidence]).toEqual([
      'standard_inference', 'inferred_standard',
    ]);
  });

  it('preserves protected inferred rates and exposes their estimated provenance to the UI', () => {
    const protectedInference = fallback({
      confidence: 'inferred_standard_rate',
      pickups: [{ pickup_id: 1001, rate: 0.0075, exchangeable: true }],
      rarity_rates: [{ rarity: 3, rate: 0.03 }],
    });

    const resolved = resolve(protectedInference, [1001]);
    expect(resolved.pickups).toBe(protectedInference.pickups);
    expect(resolved.rarity_rates).toBe(protectedInference.rarity_rates);
    expect([resolved.rates_provenance, resolved.rates_confidence]).toEqual([
      'standard_inference', 'inferred_standard',
    ]);
  });

  it('keeps two inferred pickups separate from the remaining top-rarity pool', () => {
    const resolved = resolve(fallback(), [1001, 1002]);
    const pickupRates = resolved.pickups!.map(pickup => pickup.rate);
    expect(pickupRates).toEqual([0.0075, 0.0075]);

    const result = new CaratPullProbabilityService().calculate({
      pulls: 200,
      rateUpRates: [pickupRates[0]],
      allRateUpRates: pickupRates,
      topRarityRate: resolved.rarity_rates!.find(rate => rate.rarity === 3)!.rate,
    });

    expect(result.pool?.selectedRateUpRate).toBeCloseTo(0.0075, 12);
    expect(result.pool?.unselectedFeaturedRate).toBeCloseTo(0.0075, 12);
    expect(result.pool?.offBannerTopRarityRate).toBeCloseTo(0.015, 12);
    expect(
      result.pool!.selectedRateUpRate
      + result.pool!.unselectedFeaturedRate
      + result.pool!.offBannerTopRarityRate,
    ).toBeCloseTo(0.03, 12);
  });

  it('rejects a reused exact gacha ID whose pickups do not match the future event', () => {
    const colliding = fallback({
      gacha_id: 30130,
      provenance: 'global_master',
      confidence: 'exact',
      pickups: [
        { pickup_id: 100001, rate: 0.003333 },
        { pickup_id: 100101, rate: 0.003333 },
      ],
      rarity_rates: [{ rarity: 3, rate: 0.03 }],
    });

    const resolved = resolve(colliding, [104201]);
    expect(resolved.pickups).toEqual([jasmine.objectContaining({ pickup_id: 104201, rate: 0.0075 })]);
    expect(resolved.pickups?.map(pickup => pickup.pickup_id)).not.toContain(100001);
    expect(resolved.rates_confidence).toBe('inferred_standard');
  });

  it('uses standard fallback rates for past and up-to-four-pickup ordinary banners', () => {
    const past = fallback({ start_date: '2029-12-31T00:00:00Z' });
    const fourPickups = fallback();

    expect(resolve(past, [1001]).pickups?.[0].rate).toBe(0.0075);
    expect(resolve(fourPickups, [1001, 1002, 1003, 1004]).pickups?.map(pickup => pickup.rate))
      .toEqual([0.0075, 0.0075, 0.0075, 0.0075]);
  });

  it('leaves Pick 2, paid-range, and oversized special pools unavailable', () => {
    const pickTwo = fallback();
    const paidRange = fallback({ gacha_id: 50_226 });
    const oversized = fallback();
    expect(resolve(pickTwo, [1001, 1002], 12)).toBe(pickTwo);
    expect(resolve(paidRange, [1001])).toBe(paidRange);
    expect(resolve(oversized, [1001, 1002, 1003, 1004, 1005])).toBe(oversized);
  });

  it('sanitizes a colliding special pool without applying standard rates', () => {
    const colliding = fallback({
      provenance: 'global_master',
      confidence: 'exact',
      pickups: [{ pickup_id: 9999, rate: 0.03 }],
      rarity_rates: [{ rarity: 3, rate: 0.03 }],
    });

    const resolved = resolve(colliding, [1001], 12);
    expect(resolved.pickups).toEqual([]);
    expect(resolved.rarity_rates).toEqual([]);
    expect(resolved.rates_confidence).toBe('unavailable_identity_mismatch');
  });
});
