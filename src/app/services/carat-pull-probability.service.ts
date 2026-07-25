import { Injectable } from '@angular/core';

export interface CaratPullProbabilityInput {
  /** Number of funded draws in the banner. */
  pulls: number;
  /** Fractional per-draw rates for every selected pickup (for example 0.0075). */
  rateUpRates: readonly number[];
  /** Every featured pickup rate on the banner, including unselected pickups. */
  allRateUpRates?: readonly number[];
  /** Published total rate for the banner's highest rarity. */
  topRarityRate?: number;
  /** Draws required for one exchange copy. */
  sparkPulls?: number;
  /** Whether the selected pickup group can receive spark exchange copies. */
  sparkExchangeable?: boolean;
}

export interface CaratPullPoolComposition {
  topRarityRate: number;
  selectedRateUpRate: number;
  allFeaturedRate: number;
  unselectedFeaturedRate: number;
  offBannerTopRarityRate: number;
  lowerRarityRate: number;
  expectedTopRarityHits: number;
  expectedSelectedRateUpHits: number;
  expectedUnselectedFeaturedHits: number;
  expectedOffBannerTopRarityHits: number;
  probabilityAtLeastOneTopRarity: number;
}

export interface CaratPullOutcomeBucket {
  /** Total selected rate-up copies, including spark exchanges. */
  hits: number;
  /** Copies obtained randomly before spark exchanges are included. */
  randomHits: number;
  /** P(X = hits). */
  probability: number;
  /** P(X <= hits). */
  cumulativeProbability: number;
  /** P(X >= hits). */
  cumulativeAtLeastProbability: number;
}

export interface CaratPullProbabilityResult {
  pulls: number;
  normalizedRateUpRates: readonly number[];
  /** Chance that one draw is any of the selected, mutually-exclusive rate-ups. */
  combinedRateUpRate: number;
  guaranteedHits: number;
  randomExpectedHits: number;
  /** Arithmetic mean of the total hit-count distribution. */
  expectedHits: number;
  /** Smallest total hit count whose CDF is at least 50%. */
  medianHits: number;
  probabilityAtLeastOneRandomHit: number;
  probabilityAtLeastOneHit: number;
  /** Full-pool context. Selected pickup odds remain based only on rateUpRates. */
  pool?: CaratPullPoolComposition;
  /**
   * First pull by which the cumulative chance of any hit reaches 50%.
   * Undefined when the plan does not reach a 50% chance within its pull count.
   */
  medianFirstHitPull?: number;
  buckets: readonly CaratPullOutcomeBucket[];
}

export interface CaratPickupGoalInput {
  pickupId: number;
  rate: number;
  requestedCopies: number;
  exchangeable?: boolean;
}

export interface CaratPickupGoalProbability {
  pickupId: number;
  requestedCopies: number;
  pickupRate: number;
  exchangeable: boolean;
  exchangeCopiesAvailable: number;
  randomCopiesNeeded: number;
  probability: number;
}

export interface CaratMultiPickupProbabilityResult {
  pulls: number;
  sparkCopiesAvailable: number;
  goals: readonly CaratPickupGoalProbability[];
  /** Exact probability that all goals can be met after optimally allocating exchanges. */
  jointProbability?: number;
  jointProbabilityExact: boolean;
}

/** Exact binomial outcome data for selected carat-planner rate-ups. */
@Injectable({ providedIn: 'root' })
export class CaratPullProbabilityService {
  private static readonly MAX_CACHE_BUCKETS = 50_000;
  private static readonly MAX_JOINT_STATES = 250_000;
  private static readonly MAX_JOINT_WORK = 50_000_000;

  private readonly cache = new Map<string, CaratPullProbabilityResult>();
  private readonly multiGoalCache = new Map<string, CaratMultiPickupProbabilityResult>();
  private cachedBucketCount = 0;

  calculate(input: CaratPullProbabilityInput): CaratPullProbabilityResult {
    const pulls = this.nonNegativeInt(input.pulls);
    const normalizedRateUpRates = input.rateUpRates
      .map(rate => this.normalizeRate(rate))
      .filter((rate): rate is number => rate !== undefined);
    const normalizedAllRateUpRates = this.normalizeRates(input.allRateUpRates);
    const normalizedTopRarityRate = this.normalizeRate(input.topRarityRate ?? Number.NaN);
    const cacheKey = [
      pulls,
      normalizedRateUpRates.join(','),
      normalizedAllRateUpRates?.join(',') ?? 'unknown-pool',
      normalizedTopRarityRate ?? 'unknown-rarity',
      this.nonNegativeInt(input.sparkPulls),
      input.sparkExchangeable !== false ? 1 : 0,
    ].join(':');
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const combinedRateUpRate = Math.min(1, normalizedRateUpRates.reduce((sum, rate) => sum + rate, 0));
    const sparkPulls = this.nonNegativeInt(input.sparkPulls);
    const sparkExchangeable = input.sparkExchangeable !== false;
    const guaranteedHits = sparkExchangeable && sparkPulls > 0
      ? Math.floor(pulls / sparkPulls)
      : 0;
    const randomProbabilities = this.binomialProbabilities(pulls, combinedRateUpRate);
    const probabilityAtLeastOneRandomHit = pulls > 0
      ? -Math.expm1(pulls * Math.log1p(-combinedRateUpRate))
      : 0;
    let cumulativeProbability = 0;
    const buckets = randomProbabilities.map((probability, randomHits) => {
      cumulativeProbability += probability;
      return {
        hits: randomHits + guaranteedHits,
        randomHits,
        probability,
        cumulativeProbability: this.clampProbability(cumulativeProbability),
        cumulativeAtLeastProbability: 0,
      };
    });

    let cumulativeAtLeastProbability = 0;
    for (let index = buckets.length - 1; index >= 0; index--) {
      cumulativeAtLeastProbability += buckets[index].probability;
      buckets[index].cumulativeAtLeastProbability = this.clampProbability(cumulativeAtLeastProbability);
    }

    // Floating-point normalization can leave the final values a few ulps away from 1.
    if (buckets.length > 0) {
      buckets[buckets.length - 1].cumulativeProbability = 1;
      buckets[0].cumulativeAtLeastProbability = 1;
    }

    const medianBucket = buckets.find(bucket => bucket.cumulativeProbability >= 0.5) ?? buckets[buckets.length - 1];
    const probabilityAtLeastOneHit = guaranteedHits > 0 ? 1 : probabilityAtLeastOneRandomHit;

    const result: CaratPullProbabilityResult = {
      pulls,
      normalizedRateUpRates,
      combinedRateUpRate,
      guaranteedHits,
      randomExpectedHits: pulls * combinedRateUpRate,
      expectedHits: pulls * combinedRateUpRate + guaranteedHits,
      medianHits: medianBucket?.hits ?? guaranteedHits,
      probabilityAtLeastOneRandomHit,
      probabilityAtLeastOneHit,
      pool: this.buildPoolComposition(
        pulls,
        combinedRateUpRate,
        normalizedAllRateUpRates,
        normalizedTopRarityRate,
      ),
      medianFirstHitPull: this.medianFirstHitPull(
        pulls,
        combinedRateUpRate,
        guaranteedHits > 0 ? sparkPulls : undefined,
      ),
      buckets,
    };
    if (result.buckets.length <= CaratPullProbabilityService.MAX_CACHE_BUCKETS) {
      while (this.cache.size > 0
        && this.cachedBucketCount + result.buckets.length > CaratPullProbabilityService.MAX_CACHE_BUCKETS) {
        const oldestKey = this.cache.keys().next().value as string;
        const oldest = this.cache.get(oldestKey);
        this.cache.delete(oldestKey);
        this.cachedBucketCount -= oldest?.buckets.length ?? 0;
      }
      this.cache.set(cacheKey, result);
      this.cachedBucketCount += result.buckets.length;
    }
    return result;
  }

  calculateGoals(
    pullsInput: number,
    goalsInput: readonly CaratPickupGoalInput[],
    sparkPullsInput?: number,
  ): CaratMultiPickupProbabilityResult {
    const pulls = this.nonNegativeInt(pullsInput);
    const sparkPulls = this.nonNegativeInt(sparkPullsInput);
    const sparkCopiesAvailable = sparkPulls > 0 ? Math.floor(pulls / sparkPulls) : 0;
    const goals = goalsInput
      .map(goal => {
        const pickupRate = this.normalizeRate(goal.rate);
        if (pickupRate === undefined || !Number.isFinite(goal.pickupId) || goal.pickupId < 0) {
          return undefined;
        }
        const requestedCopies = Math.max(1, this.nonNegativeInt(goal.requestedCopies));
        const exchangeable = goal.exchangeable !== false;
        const exchangeCopiesAvailable = exchangeable ? sparkCopiesAvailable : 0;
        const distribution = this.calculate({
          pulls,
          rateUpRates: [pickupRate],
          sparkPulls,
          sparkExchangeable: exchangeable,
        });
        return {
          pickupId: Math.trunc(goal.pickupId),
          requestedCopies,
          pickupRate,
          exchangeable,
          exchangeCopiesAvailable,
          randomCopiesNeeded: Math.max(0, requestedCopies - exchangeCopiesAvailable),
          probability: distribution.buckets
            .filter(bucket => bucket.hits >= requestedCopies)
            .reduce((sum, bucket) => sum + bucket.probability, 0),
        } satisfies CaratPickupGoalProbability;
      })
      .filter((goal): goal is CaratPickupGoalProbability => goal !== undefined);

    const cacheKey = [
      pulls,
      sparkPulls,
      ...goals.map(goal => [
        goal.pickupId,
        goal.pickupRate,
        goal.requestedCopies,
        goal.exchangeable ? 1 : 0,
      ].join(',')),
      goals.length === goalsInput.length ? 'complete' : 'partial',
    ].join(':');
    const cached = this.multiGoalCache.get(cacheKey);
    if (cached) return cached;

    const jointProbability = goals.length === goalsInput.length
      ? this.multinomialJointProbability(pulls, goals, sparkCopiesAvailable)
      : undefined;
    const result: CaratMultiPickupProbabilityResult = {
      pulls,
      sparkCopiesAvailable,
      goals,
      jointProbability,
      jointProbabilityExact: jointProbability !== undefined,
    };
    if (this.multiGoalCache.size >= 256) {
      this.multiGoalCache.delete(this.multiGoalCache.keys().next().value as string);
    }
    this.multiGoalCache.set(cacheKey, result);
    return result;
  }

  private binomialProbabilities(draws: number, rate: number): number[] {
    if (draws === 0 || rate <= 0) {
      return [1, ...Array.from({ length: draws }, () => 0)];
    }
    if (rate >= 1) {
      return [...Array.from({ length: draws }, () => 0), 1];
    }

    // Start at the mode and expand in both directions. This avoids the underflow
    // caused by starting at P(X = 0) for large draw counts or high rates.
    const probabilities = Array.from({ length: draws + 1 }, () => 0);
    const mode = Math.floor((draws + 1) * rate);
    probabilities[mode] = 1;

    for (let hits = mode; hits > 0; hits--) {
      probabilities[hits - 1] = probabilities[hits]
        * hits / (draws - hits + 1)
        * (1 - rate) / rate;
    }
    for (let hits = mode; hits < draws; hits++) {
      probabilities[hits + 1] = probabilities[hits]
        * (draws - hits) / (hits + 1)
        * rate / (1 - rate);
    }

    const total = probabilities.reduce((sum, probability) => sum + probability, 0);
    return probabilities.map(probability => probability / total);
  }

  private multinomialJointProbability(
    pulls: number,
    goals: readonly CaratPickupGoalProbability[],
    sparkCopiesAvailable: number,
  ): number | undefined {
    if (goals.length === 0) {
      return 1;
    }
    if (new Set(goals.map(goal => goal.pickupId)).size !== goals.length) {
      return undefined;
    }
    const selectedRate = goals.reduce((sum, goal) => sum + goal.pickupRate, 0);
    if (selectedRate > 1 + Number.EPSILON * goals.length) {
      return undefined;
    }

    const radices = goals.map(goal => goal.requestedCopies + 1);
    const multipliers: number[] = [];
    let stateCount = 1;
    for (const radix of radices) {
      multipliers.push(stateCount);
      stateCount *= radix;
      if (!Number.isSafeInteger(stateCount)
        || stateCount > CaratPullProbabilityService.MAX_JOINT_STATES) {
        return undefined;
      }
    }
    const estimatedWork = pulls * stateCount * (goals.length + 1);
    if (estimatedWork > CaratPullProbabilityService.MAX_JOINT_WORK) {
      return undefined;
    }

    const nextStates = goals.map((goal, goalIndex) => {
      const next = new Int32Array(stateCount);
      const multiplier = multipliers[goalIndex];
      const radix = radices[goalIndex];
      for (let state = 0; state < stateCount; state++) {
        const count = Math.floor(state / multiplier) % radix;
        next[state] = count < goal.requestedCopies ? state + multiplier : state;
      }
      return next;
    });
    let distribution = new Float64Array(stateCount);
    distribution[0] = 1;
    const otherRate = Math.max(0, 1 - selectedRate);

    for (let pull = 0; pull < pulls; pull++) {
      const nextDistribution = new Float64Array(stateCount);
      for (let state = 0; state < stateCount; state++) {
        const probability = distribution[state];
        if (probability === 0) continue;
        nextDistribution[state] += probability * otherRate;
        for (let goalIndex = 0; goalIndex < goals.length; goalIndex++) {
          nextDistribution[nextStates[goalIndex][state]] += probability * goals[goalIndex].pickupRate;
        }
      }
      distribution = nextDistribution;
    }

    let successProbability = 0;
    for (let state = 0; state < stateCount; state++) {
      const probability = distribution[state];
      if (probability === 0) continue;
      let exchangeDeficit = 0;
      let satisfiesGoals = true;
      for (let goalIndex = 0; goalIndex < goals.length; goalIndex++) {
        const randomCopies = Math.floor(state / multipliers[goalIndex]) % radices[goalIndex];
        const deficit = Math.max(0, goals[goalIndex].requestedCopies - randomCopies);
        if (!goals[goalIndex].exchangeable && deficit > 0) {
          satisfiesGoals = false;
          break;
        }
        exchangeDeficit += deficit;
      }
      if (satisfiesGoals && exchangeDeficit <= sparkCopiesAvailable) {
        successProbability += probability;
      }
    }
    return this.clampProbability(successProbability);
  }

  private medianFirstHitPull(
    pulls: number,
    rate: number,
    firstGuaranteedHitPull?: number,
  ): number | undefined {
    let randomMedian: number | undefined;
    if (pulls > 0 && rate >= 1) {
      randomMedian = 1;
    } else if (pulls > 0 && rate > 0) {
      const candidate = Math.ceil(Math.log(0.5) / Math.log1p(-rate));
      if (candidate <= pulls) {
        randomMedian = candidate;
      }
    }

    if (firstGuaranteedHitPull !== undefined && firstGuaranteedHitPull <= pulls) {
      return randomMedian === undefined
        ? firstGuaranteedHitPull
        : Math.min(randomMedian, firstGuaranteedHitPull);
    }
    return randomMedian;
  }

  private buildPoolComposition(
    pulls: number,
    selectedRateUpRate: number,
    allRateUpRates: readonly number[] | undefined,
    topRarityRate: number | undefined,
  ): CaratPullPoolComposition | undefined {
    if (topRarityRate === undefined || allRateUpRates === undefined) {
      return undefined;
    }
    const allFeaturedRate = allRateUpRates.reduce((sum, rate) => sum + rate, 0);
    const tolerance = Number.EPSILON * Math.max(8, allRateUpRates.length * 2);
    if (allFeaturedRate > 1 + tolerance
      || selectedRateUpRate > allFeaturedRate + tolerance
      || allFeaturedRate > topRarityRate + tolerance) {
      return undefined;
    }
    const unselectedFeaturedRate = Math.max(0, allFeaturedRate - selectedRateUpRate);
    const offBannerTopRarityRate = Math.max(0, topRarityRate - allFeaturedRate);
    return {
      topRarityRate,
      selectedRateUpRate,
      allFeaturedRate,
      unselectedFeaturedRate,
      offBannerTopRarityRate,
      lowerRarityRate: Math.max(0, 1 - topRarityRate),
      expectedTopRarityHits: pulls * topRarityRate,
      expectedSelectedRateUpHits: pulls * selectedRateUpRate,
      expectedUnselectedFeaturedHits: pulls * unselectedFeaturedRate,
      expectedOffBannerTopRarityHits: pulls * offBannerTopRarityRate,
      probabilityAtLeastOneTopRarity: pulls > 0
        ? -Math.expm1(pulls * Math.log1p(-topRarityRate))
        : 0,
    };
  }

  private normalizeRates(rates: readonly number[] | undefined): number[] | undefined {
    if (rates === undefined) return undefined;
    const normalized = rates.map(rate => this.normalizeRate(rate));
    return normalized.every((rate): rate is number => rate !== undefined)
      ? normalized
      : undefined;
  }

  private normalizeRate(rate: number): number | undefined {
    if (!Number.isFinite(rate) || rate < 0) {
      return undefined;
    }
    const normalized = rate > 1 ? rate / 100 : rate;
    return normalized <= 1 ? normalized : undefined;
  }

  private nonNegativeInt(value: number | undefined): number {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value ?? 0)) : 0;
  }

  private clampProbability(value: number): number {
    return Math.max(0, Math.min(1, value));
  }
}
