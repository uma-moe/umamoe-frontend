import { CaratPullProbabilityService } from './carat-pull-probability.service';

describe('CaratPullProbabilityService', () => {
  let service: CaratPullProbabilityService;

  beforeEach(() => {
    service = new CaratPullProbabilityService();
  });

  it('combines selected rate-ups and returns exact PMF/CDF summary values', () => {
    const result = service.calculate({
      pulls: 100,
      rateUpRates: [0.0075, 0.0075],
    });

    expect(result.combinedRateUpRate).toBeCloseTo(0.015, 12);
    expect(result.randomExpectedHits).toBeCloseTo(1.5, 12);
    expect(result.expectedHits).toBeCloseTo(1.5, 12);
    expect(result.probabilityAtLeastOneHit).toBeCloseTo(1 - Math.pow(0.985, 100), 12);
    expect(result.medianFirstHitPull).toBe(46);
    expect(result.buckets.reduce((sum, bucket) => sum + bucket.probability, 0)).toBeCloseTo(1, 12);
    expect(result.buckets[result.buckets.length - 1].cumulativeProbability).toBe(1);
    expect(result.buckets[0].cumulativeAtLeastProbability).toBe(1);
    expect(result.buckets[1].cumulativeProbability).toBeCloseTo(
      result.buckets[0].probability + result.buckets[1].probability,
      12,
    );
  });

  it('separates a selected pickup from the remaining featured and off-banner top-rarity pool', () => {
    const result = service.calculate({
      pulls: 200,
      rateUpRates: [0.0075],
      allRateUpRates: [0.0075, 0.0075],
      topRarityRate: 0.03,
    });

    expect(result.combinedRateUpRate).toBeCloseTo(0.0075, 12);
    expect(result.randomExpectedHits).toBeCloseTo(1.5, 12);
    expect(result.probabilityAtLeastOneRandomHit).toBeCloseTo(1 - Math.pow(0.9925, 200), 12);
    expect(result.pool).toBeDefined();
    expect(result.pool!.topRarityRate).toBeCloseTo(0.03, 12);
    expect(result.pool!.selectedRateUpRate).toBeCloseTo(0.0075, 12);
    expect(result.pool!.allFeaturedRate).toBeCloseTo(0.015, 12);
    expect(result.pool!.unselectedFeaturedRate).toBeCloseTo(0.0075, 12);
    expect(result.pool!.offBannerTopRarityRate).toBeCloseTo(0.015, 12);
    expect(result.pool!.lowerRarityRate).toBeCloseTo(0.97, 12);
    expect(result.pool!.expectedTopRarityHits).toBeCloseTo(6, 12);
    expect(result.pool!.expectedSelectedRateUpHits).toBeCloseTo(1.5, 12);
    expect(result.pool!.expectedUnselectedFeaturedHits).toBeCloseTo(1.5, 12);
    expect(result.pool!.expectedOffBannerTopRarityHits).toBeCloseTo(3, 12);
    expect(result.pool!.probabilityAtLeastOneTopRarity).toBeCloseTo(1 - Math.pow(0.97, 200), 12);
  });

  it('hides incomplete or invalid pool context without changing selected-target odds', () => {
    const selectedOnly = service.calculate({
      pulls: 200,
      rateUpRates: [0.0075],
    });
    const incompleteOrInvalidInputs = [
      { allRateUpRates: [0.0075, 0.0075] },
      { topRarityRate: 0.03 },
      { allRateUpRates: [0.0075, 0.0075], topRarityRate: 0.01 },
      { allRateUpRates: [0.005], topRarityRate: 0.03 },
      { allRateUpRates: [0.0075, Number.NaN], topRarityRate: 0.03 },
    ];

    for (const poolInput of incompleteOrInvalidInputs) {
      const result = service.calculate({
        pulls: 200,
        rateUpRates: [0.0075],
        ...poolInput,
      });

      expect(result.pool).withContext(JSON.stringify(poolInput)).toBeUndefined();
      expect(result.combinedRateUpRate).toBe(selectedOnly.combinedRateUpRate);
      expect(result.randomExpectedHits).toBe(selectedOnly.randomExpectedHits);
      expect(result.probabilityAtLeastOneRandomHit).toBe(selectedOnly.probabilityAtLeastOneRandomHit);
      expect(result.buckets).toEqual(selectedOnly.buckets);
    }
  });

  it('keys cached selected-target distributions by their full-pool context', () => {
    const input = {
      pulls: 200,
      rateUpRates: [0.0075],
      allRateUpRates: [0.0075, 0.0075],
      topRarityRate: 0.03,
    };
    const standardPool = service.calculate(input);
    const differentTopRarity = service.calculate({ ...input, topRarityRate: 0.04 });
    const differentFeaturedPool = service.calculate({ ...input, allRateUpRates: [0.0075, 0.005] });
    const noPool = service.calculate({ pulls: input.pulls, rateUpRates: input.rateUpRates });

    expect(service.calculate(input)).toBe(standardPool);
    expect(differentTopRarity).not.toBe(standardPool);
    expect(differentFeaturedPool).not.toBe(standardPool);
    expect(noPool).not.toBe(standardPool);
    expect(differentTopRarity.pool!.offBannerTopRarityRate).toBeCloseTo(0.025, 12);
    expect(differentFeaturedPool.pool!.allFeaturedRate).toBeCloseTo(0.0125, 12);
    expect(noPool.pool).toBeUndefined();
    expect([differentTopRarity, differentFeaturedPool, noPool].every(result =>
      result.probabilityAtLeastOneRandomHit === standardPool.probabilityAtLeastOneRandomHit
    )).toBeTrue();
  });

  it('shifts the distribution and first-hit median for guaranteed spark copies', () => {
    const result = service.calculate({
      pulls: 400,
      rateUpRates: [0.0075],
      sparkPulls: 200,
      sparkExchangeable: true,
    });

    expect(result.guaranteedHits).toBe(2);
    expect(result.expectedHits).toBeCloseTo(5, 12);
    expect(result.probabilityAtLeastOneRandomHit).toBeCloseTo(1 - Math.pow(0.9925, 400), 12);
    expect(result.probabilityAtLeastOneHit).toBe(1);
    expect(result.medianFirstHitPull).toBe(93);
    expect(result.buckets[0].hits).toBe(2);
    expect(result.buckets[0].randomHits).toBe(0);
  });

  it('uses the spark threshold as the median first hit when random odds stay below 50%', () => {
    const result = service.calculate({
      pulls: 200,
      rateUpRates: [0.001],
      sparkPulls: 200,
    });

    expect(result.probabilityAtLeastOneHit).toBe(1);
    expect(result.medianFirstHitPull).toBe(200);
    expect(result.medianHits).toBe(1);
  });

  it('does not apply a spark to a non-exchangeable pickup', () => {
    const result = service.calculate({
      pulls: 200,
      rateUpRates: [0.0075],
      sparkPulls: 200,
      sparkExchangeable: false,
    });

    expect(result.guaranteedHits).toBe(0);
    expect(result.probabilityAtLeastOneHit).toBeCloseTo(1 - Math.pow(0.9925, 200), 12);
    expect(result.buckets[0].hits).toBe(0);
  });

  it('handles zero pulls, no selected rates, and percentage-form rates', () => {
    const empty = service.calculate({ pulls: 0, rateUpRates: [] });
    expect(empty.buckets).toEqual([{
      hits: 0,
      randomHits: 0,
      probability: 1,
      cumulativeProbability: 1,
      cumulativeAtLeastProbability: 1,
    }]);
    expect(empty.probabilityAtLeastOneHit).toBe(0);
    expect(empty.medianFirstHitPull).toBeUndefined();

    const percentage = service.calculate({ pulls: 1, rateUpRates: [75, 25] });
    expect(percentage.normalizedRateUpRates).toEqual([0.75, 0.25]);
    expect(percentage.combinedRateUpRate).toBe(1);
    expect(percentage.buckets.map(bucket => bucket.probability)).toEqual([0, 1]);
    expect(percentage.medianFirstHitPull).toBe(1);
  });

  it('keeps a large distribution finite and normalized', () => {
    const result = service.calculate({ pulls: 10_000, rateUpRates: [0.5] });

    expect(result.buckets.length).toBe(10_001);
    expect(result.buckets.every(bucket => Number.isFinite(bucket.probability))).toBeTrue();
    expect(result.buckets.reduce((sum, bucket) => sum + bucket.probability, 0)).toBeCloseTo(1, 10);
    expect(result.medianHits).toBe(5_000);
  });

  it('calculates exact marginal and joint odds for mutually exclusive pickups', () => {
    const result = service.calculateGoals(1, [
      { pickupId: 1, rate: 0.2, requestedCopies: 1 },
      { pickupId: 2, rate: 0.3, requestedCopies: 1 },
    ]);

    expect(result.goals.map(goal => goal.probability)).toEqual([0.2, 0.3]);
    expect(result.jointProbabilityExact).toBeTrue();
    expect(result.jointProbability).toBe(0);

    const twoPulls = service.calculateGoals(2, [
      { pickupId: 1, rate: 0.2, requestedCopies: 1 },
      { pickupId: 2, rate: 0.3, requestedCopies: 1 },
    ]);
    expect(twoPulls.jointProbability).toBeCloseTo(2 * 0.2 * 0.3, 12);
  });

  it('allocates shared spark copies across goal deficits in the joint probability', () => {
    const oneSpark = service.calculateGoals(2, [
      { pickupId: 1, rate: 0.2, requestedCopies: 1 },
      { pickupId: 2, rate: 0.3, requestedCopies: 1 },
    ], 2);

    // One exchange finishes the missing goal whenever at least one selected pickup is drawn.
    expect(oneSpark.sparkCopiesAvailable).toBe(1);
    expect(oneSpark.goals.map(goal => goal.probability)).toEqual([1, 1]);
    expect(oneSpark.jointProbability).toBeCloseTo(1 - Math.pow(0.5, 2), 12);

    const nonExchangeable = service.calculateGoals(2, [
      { pickupId: 1, rate: 0.2, requestedCopies: 1, exchangeable: false },
      { pickupId: 2, rate: 0.3, requestedCopies: 1 },
    ], 2);
    expect(nonExchangeable.goals[0].probability).toBeCloseTo(1 - Math.pow(0.8, 2), 12);
    expect(nonExchangeable.jointProbability).toBeCloseTo(1 - Math.pow(0.8, 2), 12);
  });

  it('reports when a configured joint state space is not feasible to calculate exactly', () => {
    const result = service.calculateGoals(5_000, [
      { pickupId: 1, rate: 0.01, requestedCopies: 20 },
      { pickupId: 2, rate: 0.01, requestedCopies: 20 },
      { pickupId: 3, rate: 0.01, requestedCopies: 20 },
    ]);

    expect(result.goals.length).toBe(3);
    expect(result.jointProbability).toBeUndefined();
    expect(result.jointProbabilityExact).toBeFalse();
  });

  it('guards joint-state memory independently when there are no pulls', () => {
    const result = service.calculateGoals(0, Array.from({ length: 6 }, (_, index) => ({
      pickupId: index + 1,
      rate: 0.01,
      requestedCopies: 20,
    })));

    expect(result.goals.length).toBe(6);
    expect(result.jointProbability).toBeUndefined();
    expect(result.jointProbabilityExact).toBeFalse();
  });

  it('reuses cached multi-goal outcomes for unchanged planner inputs', () => {
    const goals = [
      { pickupId: 1, rate: 0.0075, requestedCopies: 2 },
      { pickupId: 2, rate: 0.0075, requestedCopies: 1 },
    ];

    expect(service.calculateGoals(200, goals, 200))
      .toBe(service.calculateGoals(200, goals, 200));
  });

  it('evicts old distributions by retained bucket weight', () => {
    const firstInput = { pulls: 5_000, rateUpRates: [0.001] };
    const first = service.calculate(firstInput);

    for (let index = 1; index < 10; index++) {
      service.calculate({ pulls: 5_000, rateUpRates: [0.001 + index * 0.0001] });
    }

    expect(service.calculate(firstInput)).not.toBe(first);
  });
});
