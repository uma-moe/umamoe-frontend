import { describe, expect, it } from 'vitest';
import {
  calculateMultiPickupProbability,
  calculatePullDistribution,
  pullOutcomeSegments
} from './planner-pull-probability';

describe('shared pickup and spark probability', () => {
  it('does not incorrectly give one shared spark to every selected pickup', () => {
    const result = calculateMultiPickupProbability(
      200,
      [
        { pickupId: 1, rate: 0.0075, requestedCopies: 1 },
        { pickupId: 2, rate: 0.0075, requestedCopies: 1 }
      ],
      200
    );

    expect(result.sparkCopiesAvailable).toBe(1);
    expect(result.jointProbabilityExact).toBe(true);
    expect(result.jointProbability).toBeGreaterThan(0.6);
    expect(result.jointProbability).toBeLessThan(1);
  });

  it('honors non-exchangeable goals', () => {
    const result = calculateMultiPickupProbability(
      200,
      [{ pickupId: 1, rate: 0.0075, requestedCopies: 1, exchangeable: false }],
      200
    );

    expect(result.jointProbability).toBeCloseTo(1 - Math.pow(1 - 0.0075, 200), 10);
  });
});

describe('selected pickup outcome distribution', () => {
  it('includes exchanges and exact full-pool context', () => {
    const result = calculatePullDistribution({
      pulls: 200,
      rateUpRates: [0.0075],
      allRateUpRates: [0.0075, 0.0075],
      topRarityRate: 0.03,
      sparkPulls: 200,
      sparkExchangeable: true
    });

    expect(result.guaranteedHits).toBe(1);
    expect(result.expectedHits).toBeCloseTo(2.5, 8);
    expect(result.buckets.reduce((sum, bucket) => sum + bucket.probability, 0)).toBeCloseTo(1, 10);
    expect(result.pool).toMatchObject({
      selectedRateUpRate: 0.0075,
      allFeaturedRate: 0.015,
      offBannerTopRarityRate: 0.015,
      lowerRarityRate: 0.97
    });

    expect(result.pool!.probabilityAtLeastOneTopRarity).toBeGreaterThan(0.99);
  });

  it('groups every outcome into Angular semantic ranges without losing probability', () => {
    const segments = pullOutcomeSegments(
      calculatePullDistribution({ pulls: 200, rateUpRates: [0.0075], sparkPulls: 200 })
    );

    expect(segments.map((segment) => segment.tone)).toContain('expected');
    expect(segments.reduce((sum, segment) => sum + segment.probability, 0)).toBeCloseTo(1, 10);
    expect(pullOutcomeSegments(calculatePullDistribution({ pulls: 0, rateUpRates: [] }))).toEqual([
      {
        tone: 'neutral',
        semanticLabel: 'No chance configured',
        rangeLabel: '0 copies',
        probability: 1,
        width: 100
      }
    ]);
  });
});
