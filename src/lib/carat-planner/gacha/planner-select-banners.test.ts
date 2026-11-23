import { describe, expect, it } from 'vitest';
import {
  createPlan,
  projectPlan,
  synchronizePlannerTargets,
  type PlannerDataBundle,
  type PlannerGachaEntry,
  type PlannerTarget
} from '../carat-planner';
import { calculatePullDistribution } from './planner-pull-probability';
import { rateUpPoolRates } from './planner-select-banners';

const candidateIds = Array.from({ length: 10 }, (_, index) => 30100 + index);

function pickTwoBanner(): PlannerGachaEntry {
  const candidates = candidateIds.map((pickup_id) => ({
    pickup_id,
    rate: 0.0075,
    exchangeable: true
  }));

  return {
    event_id: 'pick-two',
    gacha_id: 30500,
    gacha_type: 12,
    banner_kind: 'support',
    start_date: '2026-01-01',
    end_date: '2026-01-10',
    spark_pulls: 200,
    select_count: 2,
    pickups: candidates,
    featured_pickups: candidates,
    rarity_rates: [
      { rarity: 3, rate: 0.03 },
      { rarity: 2, rate: 0.18 },
      { rarity: 1, rate: 0.79 }
    ]
  };
}

function selectTarget(eventId: string, pickupIds: number[], plannedPulls: number): PlannerTarget {
  return {
    id: eventId,
    eventId,
    title: 'Select banner',
    bannerKind: 'support',
    bannerEnd: '2026-01-10',
    pullTiming: 'end',
    plannedPulls,
    desiredCopies: 1,
    pickupId: pickupIds[0],
    pickupGoals: pickupIds.map((pickupId) => ({ pickupId, desiredCopies: 1 })),
    useTickets: false,
    allowPaidJewels: true
  };
}

function bundleWith(gacha: PlannerGachaEntry): PlannerDataBundle {
  return { core: {}, income: { rules: [] }, rewards: { rewards: [] }, gachas: [gacha] };
}

describe('select banner rate-up pool', () => {
  it('counts the picks and unpicked slots, not every candidate', () => {
    const gacha = pickTwoBanner();

    const onePicked = calculatePullDistribution({
      pulls: 100,
      rateUpRates: [0.0075],
      allRateUpRates: rateUpPoolRates(gacha, [candidateIds[3]!]),
      topRarityRate: 0.03
    }).pool;

    expect(onePicked?.allFeaturedRate).toBeCloseTo(0.015, 12);
    expect(onePicked?.selectedRateUpRate).toBeCloseTo(0.0075, 12);
    expect(onePicked?.unselectedFeaturedRate).toBeCloseTo(0.0075, 12);
    expect(onePicked?.offBannerTopRarityRate).toBeCloseTo(0.015, 12);

    const bothPicked = rateUpPoolRates(gacha, [candidateIds[3]!, candidateIds[7]!]);
    expect(bothPicked).toEqual([0.0075, 0.0075]);
  });

  it('keeps every published pickup on an ordinary banner', () => {
    const gacha = { ...pickTwoBanner(), select_count: undefined };

    expect(rateUpPoolRates(gacha, [candidateIds[0]!])).toHaveLength(10);
  });
});

describe('select banner goals', () => {
  it('projects each pick on a pick-2 banner at its slot rate', () => {
    const plan = createPlan();
    plan.projectionStartDate = '2026-01-01';
    plan.balances.freeJewels = 150 * 100;
    plan.targets = [selectTarget('pick-two', [candidateIds[0]!, candidateIds[5]!], 100)];

    const projection = projectPlan(plan, bundleWith(pickTwoBanner())).targets[0]!;
    const bothPicksChance = 1 - 2 * 0.9925 ** 100 + 0.985 ** 100;

    expect(projection.ratesAvailable).toBe(true);
    expect(projection.pickupGoals.map((goal) => goal.pickupRate)).toEqual([0.0075, 0.0075]);
    expect(projection.pickupGoals[0]!.probability).toBeCloseTo(1 - 0.9925 ** 100, 12);
    expect(projection.pickupProbability).toBeCloseTo(bothPicksChance, 12);
  });

  it('keeps the first picks when a saved plan holds more goals than the banner allows', () => {
    const plan = createPlan();
    plan.projectionStartDate = '2026-01-01';
    plan.targets = [
      selectTarget('pick-two', [candidateIds[4]!, candidateIds[1]!, candidateIds[8]!], 200)
    ];

    const gacha = pickTwoBanner();
    const synchronized = synchronizePlannerTargets(plan, [], [gacha]).targets[0]!;
    const projection = projectPlan(plan, bundleWith(gacha)).targets[0]!;

    expect(synchronized.pickupGoals?.map((goal) => goal.pickupId)).toEqual([
      candidateIds[4],
      candidateIds[1]
    ]);

    expect(synchronized.pickupId).toBe(candidateIds[4]);
    expect(projection.pickupGoals.map((goal) => goal.pickupId)).toEqual([
      candidateIds[4],
      candidateIds[1]
    ]);
  });

  it('shares a paid ten-pull guarantee among the picks only', () => {
    const paidIds = Array.from({ length: 15 }, (_, index) => 100100 + index * 100);
    const gacha: PlannerGachaEntry = {
      event_id: 'stamp-select',
      gacha_id: 40500,
      gacha_type: 15,
      banner_kind: 'character',
      start_date: '2026-01-01',
      end_date: '2026-01-10',
      jewel_cost_per_pull: 300,
      select_count: 3,
      paid_draw: { limit: 1, guaranteed_rarity: 3, guaranteed_count: 1 },
      pickups: paidIds.map((pickup_id) => ({ pickup_id, rate: 0.0075, exchangeable: false })),
      rarity_rates: [
        { rarity: 3, rate: 0.03 },
        { rarity: 2, rate: 0.18 },
        { rarity: 1, rate: 0.79 }
      ]
    };

    const plan = createPlan();
    plan.projectionStartDate = '2026-01-01';
    plan.balances.paidJewels = 3000;
    // Counting all five saved goals would hand out 125% of the guaranteed slot.
    plan.targets = [
      { ...selectTarget('stamp-select', paidIds.slice(0, 5), 10), bannerKind: 'paid' }
    ];

    const projection = projectPlan(plan, bundleWith(gacha)).targets[0]!;

    expect(projection.pickupGoals).toHaveLength(3);
    expect(projection.pickupGoals[0]!.probability).toBeCloseTo(1 - 0.9925 ** 9 * 0.75, 12);
    expect(projection.pickupProbability).toBeGreaterThan(0);
  });
});
