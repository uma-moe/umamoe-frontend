import { describe, expect, it } from 'vitest';
import { resolvePlannerGachaRates } from './planner-gacha-rates';

describe('planner gacha rate policy parity', () => {
  it('fills missing ordinary-banner rates and labels their provenance', () => {
    const result = resolvePlannerGachaRates({ gacha_id: 7, gacha_type: 3, banner_kind: 'character', start_date: '2026-01-01', end_date: '2026-01-10', pickups: [] }, { featuredPickupIds: [1001], eventType: 'character_banner' });
    expect(result.pickups).toEqual([{ pickup_id: 1001, rate: .0075, exchangeable: true }]);
    expect(result.rates_confidence).toBe('inferred_standard');
    expect(result.rarity_rates?.find((item) => item.rarity === 3)?.rate).toBe(.03);
  });
  it('does not copy a reused gacha id whose published pickup identity disagrees', () => {
    const result = resolvePlannerGachaRates({ gacha_id: 7, gacha_type: 3, banner_kind: 'character', start_date: '2026-01-01', end_date: '2026-01-10', pickups: [{ pickup_id: 9999, rate: .0075 }] }, { featuredPickupIds: [1001], eventType: 'character_banner' });
    expect(result.pickups?.some((item) => item.pickup_id === 9999)).toBe(false);
    expect(result.pickups?.find((item) => item.pickup_id === 1001)?.rate).toBe(.0075);
  });
});
