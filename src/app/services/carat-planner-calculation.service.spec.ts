import {
  CaratPlan,
  CaratPlannerDataBundle,
  FREE_PULL_CAMPAIGN_EXCLUDED_SELECTION,
  PlannerCompetitiveRewardVariant,
  PlannerGachaEntry,
  PlannerGlobalRewardComparison,
  PlannerTarget,
} from '../models/carat-planner.model';
import { CaratPlannerCalculationService } from './carat-planner-calculation.service';

describe('CaratPlannerCalculationService', () => {
  let service: CaratPlannerCalculationService;

  beforeEach(() => {
    service = new CaratPlannerCalculationService();
  });

  it('calculates pickup odds with fractional rates and guaranteed spark copies', () => {
    const oneCopy = service.calculateOdds(100, 1, 0.0075, 200);
    expect(oneCopy.pickupRate).toBe(0.0075);
    expect(oneCopy.exchangeCopies).toBe(0);
    expect(oneCopy.randomCopiesNeeded).toBe(1);
    expect(oneCopy.probability).toBeCloseTo(1 - Math.pow(1 - 0.0075, 100), 12);

    const sparkedCopy = service.calculateOdds(200, 1, 0.0075, 200);
    expect(sparkedCopy.exchangeCopies).toBe(1);
    expect(sparkedCopy.randomCopiesNeeded).toBe(0);
    expect(sparkedCopy.probability).toBe(1);

    const secondCopy = service.calculateOdds(200, 2, 0.0075, 200);
    expect(secondCopy.exchangeCopies).toBe(1);
    expect(secondCopy.randomCopiesNeeded).toBe(1);
    expect(secondCopy.probability).toBeCloseTo(1 - Math.pow(1 - 0.0075, 200), 12);
    expect(service.calculateOdds(200, 2, 0.0075, 200)).toBe(secondCopy);
  });

  it('reports exact marginal and joint odds for multiple pickup goals', () => {
    const target = makeTarget({
      plannedPulls: 2,
      pickupGoals: [
        { pickupId: 1, desiredCopies: 1 },
        { pickupId: 2, desiredCopies: 1 },
      ],
    });
    const gacha = makeGacha({
      spark_pulls: undefined,
      pickups: [
        { pickup_id: 1, rate: 0.2, exchangeable: true },
        { pickup_id: 2, rate: 0.3, exchangeable: true },
      ],
    });

    const odds = service.calculateTargetOdds(2, target, gacha);
    expect(odds.goalOdds?.[0].probability).toBeCloseTo(1 - Math.pow(0.8, 2), 12);
    expect(odds.goalOdds?.[1].probability).toBeCloseTo(1 - Math.pow(0.7, 2), 12);
    expect(odds.jointProbabilityExact).toBeTrue();
    expect(odds.jointProbability).toBeCloseTo(0.12, 12);
    expect(odds.probability).toBeCloseTo(0.12, 12);
  });

  it('shares spark exchanges across pickup goals while respecting non-exchangeable pickups', () => {
    const target = makeTarget({
      pickupGoals: [
        { pickupId: 1, desiredCopies: 1 },
        { pickupId: 2, desiredCopies: 1 },
      ],
    });
    const gacha = makeGacha({
      pickups: [
        { pickup_id: 1, rate: 0.2, exchangeable: false },
        { pickup_id: 2, rate: 0.3, exchangeable: true },
      ],
    });

    const odds = service.calculateTargetOdds(2, target, gacha, 2);
    expect(odds.sparkCopiesAvailable).toBe(1);
    expect(odds.goalOdds?.[0].exchangeCopiesAvailable).toBe(0);
    expect(odds.goalOdds?.[1].exchangeCopiesAvailable).toBe(1);
    expect(odds.jointProbability).toBeCloseTo(1 - Math.pow(0.8, 2), 12);
  });

  it('uses matching Uncap Crystals for copies after the initial support-card copy', () => {
    const ssrTarget = makeTarget({
      bannerKind: 'support',
      rainbowCrystalsPlanned: 4,
      pickupGoals: [{ pickupId: 30031, desiredCopies: 5 }],
    });
    const ssrOdds = service.calculateTargetOdds(1, ssrTarget, makeGacha({
      banner_kind: 'support',
      spark_pulls: undefined,
      pickups: [{ pickup_id: 30031, rate: 0.25, exchangeable: true }],
    }));

    expect(ssrOdds.goalOdds?.[0]).toEqual(jasmine.objectContaining({
      requestedCopies: 5,
      copiesNeededFromPulls: 1,
      crystalCopiesApplied: 4,
      crystalKind: 'rainbow',
      randomCopiesNeeded: 1,
    }));
    expect(ssrOdds.probability).toBeCloseTo(0.25, 12);

    const srTarget = makeTarget({
      bannerKind: 'support',
      goldCrystalsPlanned: 1,
      pickupGoals: [{ pickupId: 20096, desiredCopies: 2 }],
    });
    const srOdds = service.calculateTargetOdds(1, srTarget, makeGacha({
      banner_kind: 'support',
      spark_pulls: undefined,
      pickups: [{ pickup_id: 20096, rate: 0.2, exchangeable: true }],
    }));

    expect(srOdds.goalOdds?.[0]).toEqual(jasmine.objectContaining({
      requestedCopies: 2,
      copiesNeededFromPulls: 1,
      crystalCopiesApplied: 1,
      crystalKind: 'gold',
    }));
    expect(srOdds.probability).toBeCloseTo(0.2, 12);
  });

  it('reports earned spark copies when the selected pickup rate is unavailable', () => {
    const target = makeTarget({
      pickupGoals: [{ pickupId: 99, desiredCopies: 1 }],
    });
    const gacha = makeGacha({ pickups: [] });

    const odds = service.calculateTargetOdds(400, target, gacha, 200);

    expect(odds.goalOdds?.[0].pickupRate).toBeUndefined();
    expect(odds.jointProbabilityExact).toBeFalse();
    expect(odds.sparkCopiesAvailable).toBe(2);
  });

  it('applies income before a target, then spends free pulls, tickets, and jewels in order', () => {
    const plan = makePlan({
      balances: { freeJewels: 150, paidJewels: 300, umaTickets: 2, supportTickets: 0, rainbowCrystals: 0, goldCrystals: 0 },
      enabledIncomeRuleIds: ['daily-jewels'],
      enabledRewardIds: ['ticket-gift'],
      targets: [makeTarget({ plannedPulls: 15 })],
    });
    const data: CaratPlannerDataBundle = {
      core: { jewel_cost_per_pull: 150, default_spark_pulls: 200 },
      income: {
        rules: [{
          id: 'daily-jewels',
          label: 'Daily jewels',
          currency: 'free_jewels',
          amount: 150,
          cadence: 'daily',
          start_date: '2026-01-01',
        }],
      },
      rewards: {
        rewards: [{
          id: 'ticket-gift',
          label: 'Scout ticket',
          currency: 'uma_ticket',
          amount: 1,
          available_at: '2026-01-03',
        }],
      },
    };
    const projection = service.project(plan, data, [makeGacha({ free_pulls: 10 })]);
    const target = projection.targets[0];

    expect(target.income.length).toBe(4);
    expect(target.balanceBefore).toEqual({ freeJewels: 600, paidJewels: 300, umaTickets: 3, supportTickets: 0, rainbowCrystals: 0, goldCrystals: 0, rainbowFullCrystals: 0, goldFullCrystals: 0 });
    expect(target.freePullsUsed).toBe(10);
    expect(target.ticketPullsUsed).toBe(3);
    expect(target.freeJewelPulls).toBe(2);
    expect(target.paidJewelPulls).toBe(0);
    expect(target.fundedPulls).toBe(15);
    expect(target.unfilledPulls).toBe(0);
    expect(target.balanceAfter).toEqual({ freeJewels: 300, paidJewels: 300, umaTickets: 0, supportTickets: 0, rainbowCrystals: 0, goldCrystals: 0, rainbowFullCrystals: 0, goldFullCrystals: 0 });
  });

  it('uses 20 available tickets before Carats for a 200-pull banner', () => {
    const plan = makePlan({
      balances: {
        freeJewels: 27_000,
        paidJewels: 0,
        umaTickets: 20,
        supportTickets: 0,
        rainbowCrystals: 0,
        goldCrystals: 0,
      },
      targets: [makeTarget({ plannedPulls: 200, useTickets: true })],
    });

    const projection = service.project(
      plan,
      { core: { jewel_cost_per_pull: 150 }, income: { rules: [] }, rewards: { rewards: [] } },
      [makeGacha({ free_pulls: 0, ticket_currency: 'uma_ticket' })],
    );
    const target = projection.targets[0];

    expect(target.balanceBefore.umaTickets).toBe(20);
    expect(target.ticketPullsUsed).toBe(20);
    expect(target.freeJewelPulls).toBe(180);
    expect(target.fundedPulls).toBe(200);
    expect(target.balanceAfter.umaTickets).toBe(0);
    expect(target.balanceAfter.freeJewels).toBe(0);
  });

  it('applies CM and LoH assumptions on matching event dates and lets explicit outcomes override them', () => {
    const plan = makePlan({
      scenarioSelections: {
        champions_meeting_result: 'group_b_second',
        league_of_heroes_rank: 'gold_4',
      },
      variableRewardSelections: {
        'champions-meeting-2': {
          optionId: 'specific-result',
          label: 'Specific CM result',
          availableAt: '2026-01-20',
          amounts: { free_jewels: 900, uma_ticket: 2, support_ticket: 2 },
        },
      },
      targets: [makeTarget({ bannerEnd: '2026-02-01', customPullDate: '2026-02-01' })],
    });
    const events = [
      { id: 'champions-meeting-1', title: 'CM 1', type: 'champions_meeting', estimatedEndDate: '2026-01-10' },
      { id: 'champions-meeting-2', title: 'CM 2', type: 'champions_meeting', estimatedEndDate: '2026-01-20' },
      { id: 'league-of-heroes-1', title: 'LoH', type: 'league_of_heroes', estimatedEndDate: '2026-01-25' },
    ];

    const projection = service.project(plan, { core: {}, income: { rules: [] }, rewards: { rewards: [] } }, [], events);
    const target = projection.targets[0];

    expect(target.balanceBefore.freeJewels).toBe(1250 + 900 + 1300);
    expect(target.balanceBefore.umaTickets).toBe(2 + 2 + 2);
    expect(target.balanceBefore.supportTickets).toBe(2 + 2 + 2);
    expect(target.balanceBefore.rainbowCrystals).toBe(1);
    expect(target.balanceBefore.goldCrystals).toBe(2);
    expect(target.income.filter(entry => entry.id.includes('champions-meeting-2')).length).toBe(3);
    expect(target.income.some(entry => entry.id.startsWith('competition-assumption:champions-meeting-2'))).toBeFalse();
  });

  it('projects the full free and premium Training Pass tracks from the linked Global timeline date', () => {
    const events = [{
      id: 'campaign-632',
      title: 'Held "3rd Anniversary Campaign Vol.2"',
      type: 'campaign',
      jpReleaseDate: '2024-02-24T03:00:00Z',
      globalReleaseDate: '2027-08-24T22:00:00Z',
    }];
    const plan = makePlan({
      projectionStartDate: '2027-08-01',
      scenarioSelections: { training_pass: 'free' },
    });
    const data: CaratPlannerDataBundle = {
      ...emptyData(),
      income: { rules: [{
        id: 'premium-training-pass',
        label: 'Legacy Training Pass purchase grant',
        currency: 'paid_jewels',
        amount: 350,
        cadence: 'monthly',
        start_date: '2027-08-01',
      }] },
    };
    plan.enabledIncomeRuleIds = ['premium-training-pass'];

    const freeLedger = service.buildLedger(plan, data, '2027-09-24', events);
    expect(sumCurrency(freeLedger, 'free_jewels')).toBe(1_000);
    expect(sumCurrency(freeLedger, 'paid_jewels')).toBe(0);
    expect(sumCurrency(freeLedger, 'uma_ticket')).toBe(4);
    expect(sumCurrency(freeLedger, 'support_ticket')).toBe(4);
    expect(freeLedger.every(entry => entry.date === '2027-08-24' || entry.date === '2027-09-24')).toBeTrue();

    plan.scenarioSelections = { training_pass: 'premium' };
    const premiumLedger = service.buildLedger(plan, data, '2027-09-24', events);
    expect(sumCurrency(premiumLedger, 'free_jewels')).toBe(3_700);
    expect(sumCurrency(premiumLedger, 'paid_jewels')).toBe(700);
    expect(sumCurrency(premiumLedger, 'uma_ticket')).toBe(8);
    expect(sumCurrency(premiumLedger, 'support_ticket')).toBe(8);
    expect(sumCurrency(premiumLedger, 'rainbow_crystal')).toBe(2);
  });

  it('projects only the selected active-play random income estimate', () => {
    const plan = makePlan({
      projectionStartDate: '2026-08-15',
      scenarioSelections: { random_gameplay_income: 'medium' },
    });

    const ledger = service.buildLedger(plan, emptyData(), '2026-09-05');

    expect(ledger.map(entry => [entry.date, entry.amount, entry.label])).toEqual([
      ['2026-08-15', 90, 'Random gameplay income (Medium commitment)'],
      ['2026-08-22', 90, 'Random gameplay income (Medium commitment)'],
      ['2026-08-29', 90, 'Random gameplay income (Medium commitment)'],
      ['2026-09-05', 90, 'Random gameplay income (Medium commitment)'],
    ]);

    plan.scenarioSelections = {};
    expect(service.buildLedger(plan, emptyData(), '2026-09-05')).toEqual([]);
  });

  it('starts observed speculative uplift after the latest confirmed Global reward', () => {
    const plan = makePlan({
      scenarioSelections: { speculative_income: 'include' },
      enabledRewardIds: ['observed-social-gift'],
    });
    const data: CaratPlannerDataBundle = {
      ...emptyData(),
      rewards: {
        rewards: [{
          id: 'observed-social-gift', label: 'Observed social gift', currency: 'free_jewels',
          amount: 600, available_at: '2026-01-15', provenance: 'global_social',
        }],
        global_reward_comparison: globalComparison({
          observation_end: '2026-01-15',
          speculative_monthly_carats: 1200,
        }),
      },
    };

    const ledger = service.buildLedger(plan, data, '2026-04-15');
    const speculative = ledger.filter(entry => entry.id.startsWith('speculative-income:'));

    expect(speculative.map(entry => [entry.date, entry.amount])).toEqual([
      ['2026-02-15', 1200],
      ['2026-03-15', 1200],
      ['2026-04-15', 1200],
    ]);
    expect(sumCurrency(ledger, 'free_jewels')).toBe(4200);
  });

  it('uses the conservative median when that speculative option is selected', () => {
    const plan = makePlan({ scenarioSelections: { speculative_income: 'median' } });
    const data = emptyData();
    data.rewards.global_reward_comparison = globalComparison({
      observation_end: '2026-01-01',
      speculative_monthly_carats: 1200,
      speculative_recent_median_monthly_carats: 775,
    });

    const ledger = service.buildLedger(plan, data, '2026-02-01');

    expect(sumCurrency(ledger, 'free_jewels')).toBe(775);
  });

  it('reconciles speculative income on pull dates between monthly checkpoints', () => {
    const plan = makePlan({
      scenarioSelections: { speculative_income: 'include' },
      targets: [
        makeTarget({ id: 'mid-month', bannerEnd: '2026-01-15' }),
        makeTarget({ id: 'one-month', bannerEnd: '2026-02-01' }),
      ],
    });

    const data = emptyData();
    data.rewards.global_reward_comparison = globalComparison({
      observation_end: '2026-01-01',
      speculative_monthly_carats: 1460,
    });
    const projection = service.project(plan, data);

    expect(projection.targets[0].balanceBefore.freeJewels).toBe(659);
    expect(projection.targets[1].balanceBefore.freeJewels).toBe(1460);
  });

  it('projects global Strongest Team tiers and Legend Race clear counts across every occurrence', () => {
    const plan = makePlan({
      scenarioSelections: {
        strongest_team_reward_tier: 'tier_2',
        legend_race_clears: 'opponents_3',
      },
      targets: [makeTarget({ bannerEnd: '2026-02-01', customPullDate: '2026-02-01' })],
    });
    const variants = [
      ...strongestTeamVariants('strongest-1', '2026-01-05', 100, 200),
      ...strongestTeamVariants('strongest-2', '2026-01-10', 50, 75),
      ...strongestTeamVariants('strongest-3', '2026-01-12', 25, 30)
        .filter(variant => !variant.id.endsWith('tier-2')),
      ...legendRaceVariants('legend-1', '2026-01-15', 3, 150),
      ...legendRaceVariants('legend-2', '2026-01-20', 2, 150),
    ];
    const data: CaratPlannerDataBundle = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: [], competitive_variants: variants },
    };

    const projection = service.project(plan, data);
    const target = projection.targets[0];

    // Strongest Team tier 2 is cumulative (300 + 125), and an event with
    // fewer tiers stops at its highest tier without including its missions.
    // The requested third Legend clear safely becomes "all" for two opponents.
    expect(target.balanceBefore.freeJewels).toBe(300 + 125 + 25 + 450 + 300);
    expect(target.balanceBefore.umaTickets).toBe(0);
    expect(target.income.filter(entry => entry.id.startsWith('competition-assumption:')).length).toBe(5);

    plan.scenarioSelections['strongest_team_reward_tier'] = 'all';
    const allMilestones = service.project(plan, data).targets[0];
    expect(allMilestones.balanceBefore.freeJewels).toBe(target.balanceBefore.freeJewels);
    expect(allMilestones.balanceBefore.umaTickets).toBe(3);
  });

  it('converts 20 projected crystal shards into one support-card uncap crystal', () => {
    const plan = makePlan({
      balances: {
        freeJewels: 0,
        paidJewels: 0,
        umaTickets: 0,
        supportTickets: 0,
        rainbowCrystals: 18,
        goldCrystals: 39,
      },
      enabledRewardIds: ['anniversary-free_jewels', 'anniversary-items'],
      targets: [makeTarget({
        bannerKind: 'support',
        plannedPulls: 0,
        rainbowCrystalsPlanned: 2,
        goldCrystalsPlanned: 1,
        pickupGoals: [
          { pickupId: 30031, desiredCopies: 3 },
          { pickupId: 20096, desiredCopies: 2 },
        ],
      })],
    });
    const data: CaratPlannerDataBundle = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: [{
        id: 'anniversary-free_jewels',
        label: 'Crystal Shards',
        currency: 'free_jewels',
        amount: 500,
        available_at: '2026-01-02',
        source_items: [
          { item_category: 164, item_id: 149, amount: 2 },
          { item_category: 164, item_id: 150, amount: 1 },
        ],
      }, {
        id: 'anniversary-items',
        label: 'Crystal Shards',
        currency: 'free_jewels',
        amount: null,
        available_at: '2026-01-02',
        source_items: [
          { item_category: 164, item_id: 149, amount: 2 },
          { item_category: 164, item_id: 150, amount: 1 },
        ],
      }] },
    };

    const projection = service.project(plan, data, [makeGacha({
      banner_kind: 'support',
      ticket_currency: 'support_ticket',
      pickups: [
        { pickup_id: 30031, rate: 0.0075, exchangeable: true },
        { pickup_id: 20096, rate: 0.0225, exchangeable: true },
      ],
    })]);
    const target = projection.targets[0];

    expect(target.balanceBefore.rainbowCrystals).toBe(20);
    expect(target.balanceBefore.goldCrystals).toBe(40);
    expect(target.rainbowCrystalsUsed).toBe(1);
    expect(target.goldCrystalsUsed).toBe(1);
    expect(target.balanceAfter.rainbowCrystals).toBe(0);
    expect(target.balanceAfter.goldCrystals).toBe(20);
  });

  it('counts complete Uncap Crystals separately and spends them before craftable shards', () => {
    const plan = makePlan({
      balances: {
        freeJewels: 0,
        paidJewels: 0,
        umaTickets: 0,
        supportTickets: 0,
        rainbowCrystals: 19,
        goldCrystals: 0,
        rainbowFullCrystals: 1,
        goldFullCrystals: 0,
      },
      enabledRewardIds: ['full-crystal', 'crystal-shard'],
      targets: [makeTarget({
        bannerKind: 'support',
        plannedPulls: 0,
        rainbowCrystalsPlanned: 3,
        pickupGoals: [{ pickupId: 30031, desiredCopies: 4 }],
      })],
    });
    const data: CaratPlannerDataBundle = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: [{
        id: 'full-crystal',
        label: 'Rainbow Uncap Crystal gift',
        currency: 'rainbow_full_crystal',
        amount: 1,
        available_at: '2026-01-02',
      }, {
        id: 'crystal-shard',
        label: 'Rainbow Crystal Shard gift',
        currency: 'rainbow_crystal',
        amount: 1,
        available_at: '2026-01-02',
      }] },
    };

    const target = service.project(plan, data, [makeGacha({
      banner_kind: 'support',
      ticket_currency: 'support_ticket',
      pickups: [{ pickup_id: 30031, rate: 0.0075, exchangeable: true }],
    })]).targets[0];

    expect(target.balanceBefore.rainbowFullCrystals).toBe(2);
    expect(target.balanceBefore.rainbowCrystals).toBe(20);
    expect(target.rainbowCrystalsUsed).toBe(3);
    expect(target.balanceAfter.rainbowFullCrystals).toBe(0);
    expect(target.balanceAfter.rainbowCrystals).toBe(0);
  });

  it('projects mission source totals and the competitive outcome selected by the user', () => {
    const plan = makePlan({
      enabledRewardIds: ['mission-rewards'],
      variableRewardSelections: {
        'legend-race-1021': {
          optionId: 'legend-clear',
          label: 'Legend Race: 1 opponent cleared',
          availableAt: '2026-01-04',
          amounts: { free_jewels: 150 },
        },
      },
      targets: [makeTarget({ bannerEnd: '2026-01-10', plannedPulls: 0 })],
    });
    const data: CaratPlannerDataBundle = {
      core: {},
      income: { rules: [] },
      rewards: {
        rewards: [{
          id: 'mission-rewards',
          label: 'Event missions',
          event_id: 'team-event',
          currency: 'free_jewels',
          amount: null,
          available_at: '2026-01-03',
          source_items: [
            { item_category: 90, item_id: 43, amount: 100, mission_count: 2 },
            { item_category: 40, item_id: 41, amount: 1 },
          ],
        }],
        competitive_variants: [
          {
            id: 'legend-clear',
            competition: 'legend_race',
            event_id: 'legend-race-1021',
            master_event_id: 1021,
            label: 'First clear',
            source_items: [{ item_category: 90, item_id: 43, amount: 150 }],
          },
          {
            id: 'champions-result',
            competition: 'champions_meeting',
            event_id: 'champions-1',
            master_event_id: 1,
            label: 'Placement reward',
            source_items: [{ item_category: 90, item_id: 43, amount: 2500 }],
          },
        ],
      },
    };
    const projection = service.project(plan, data, [], [{
      id: 'global-legend-race-1021',
      title: 'Legend Race',
      type: 'legend_race',
      globalReleaseDate: '2026-01-04',
    }]);
    const target = projection.targets[0];

    expect(target.balanceBefore.freeJewels).toBe(250);
    expect(target.balanceBefore.umaTickets).toBe(1);
    expect(target.income.map(entry => entry.id)).toEqual([
      'reward:mission-rewards:free_jewels',
      'reward:mission-rewards:uma_ticket',
      'competitive:legend-race-1021:legend-clear:free_jewels',
    ]);
    expect(target.income.some(entry => entry.id.includes('champions-result'))).toBeFalse();
  });

  it('counts free pulls and tickets toward the spark threshold', () => {
    const plan = makePlan({
      balances: { freeJewels: 25_500, paidJewels: 0, umaTickets: 20, supportTickets: 0, rainbowCrystals: 0, goldCrystals: 0 },
      targets: [makeTarget({ plannedPulls: 200, desiredCopies: 1 })],
    });
    const projection = service.project(plan, emptyData(), [makeGacha({ free_pulls: 10 })]);
    const target = projection.targets[0];

    expect(target.freePullsUsed).toBe(10);
    expect(target.ticketPullsUsed).toBe(20);
    expect(target.freeJewelPulls).toBe(170);
    expect(target.fundedPulls).toBe(200);
    expect(target.odds.exchangeCopies).toBe(1);
    expect(target.odds.probability).toBe(1);
  });

  it('reports cumulative reward Carats separately at each pull target', () => {
    const plan = makePlan({
      enabledRewardIds: ['first-reward', 'second-reward'],
      targets: [
        makeTarget({ id: 'first', bannerEnd: '2026-01-03', plannedPulls: 0 }),
        makeTarget({ id: 'second', bannerEnd: '2026-01-06', plannedPulls: 0 }),
      ],
    });
    const data: CaratPlannerDataBundle = {
      ...emptyData(),
      rewards: { rewards: [
        { id: 'first-reward', label: 'First reward', currency: 'free_jewels', amount: 300, available_at: '2026-01-02' },
        { id: 'second-reward', label: 'Second reward', currency: 'free_jewels', amount: 400, available_at: '2026-01-05' },
      ] },
    };

    const projection = service.project(plan, data);

    expect(projection.targets.map(target => target.rewardCaratsGained)).toEqual([300, 700]);
  });

  it('caps shared free-pull campaigns and can stock the full pool for a later banner', () => {
    const early = makeTarget({
      id: 'early', eventId: 'support-early', gachaId: 30111,
      bannerKind: 'support', bannerEnd: '2026-08-29', plannedPulls: 200,
    });
    const duplicateEarly = makeTarget({
      id: 'early-copy', eventId: 'support-early', gachaId: 30111,
      bannerKind: 'support', bannerEnd: '2026-08-29', plannedPulls: 200,
    });
    const later = makeTarget({
      id: 'later', eventId: 'support-later', gachaId: 30113,
      bannerKind: 'support', bannerEnd: '2026-09-03', plannedPulls: 200,
    });
    const plan = makePlan({ targets: [later, duplicateEarly, early] });
    const data: CaratPlannerDataBundle = {
      ...emptyData(),
      rewards: {
        rewards: [],
        free_pull_campaigns: [{
          id: 'anniversary-100',
          label: 'Anniversary free pulls',
          total_pulls: 100,
          allocation_mode: 'daily_with_one_time_stock',
          pulls_per_day: 10,
          entitlement_days: 10,
          eligible_gacha_ids: [30111, 30113],
          default_allocations: [
            { event_id: 'support-early', gacha_id: 30111, pulls: 60 },
            { event_id: 'support-later', gacha_id: 30113, pulls: 40 },
          ],
        }],
      },
    };
    const gachas = [
      makeGacha({ event_id: 'support-early', gacha_id: 30111, banner_kind: 'support', free_pulls: 60 }),
      makeGacha({ event_id: 'support-later', gacha_id: 30113, banner_kind: 'support', free_pulls: 40 }),
    ];

    const daily = service.project(plan, data, gachas);
    expect(daily.targets.map(target => [target.targetId, target.freePullsAvailable, target.freePullsUsed])).toEqual([
      ['early', 60, 60],
      ['early-copy', 0, 0],
      ['later', 40, 40],
    ]);
    expect(daily.targets.reduce((total, target) => total + target.freePullsAvailable, 0)).toBe(100);

    const stockedPlan = clone(plan);
    stockedPlan.freePullCampaignSelections = { 'anniversary-100': 'support-later' };
    const stocked = service.project(stockedPlan, data, gachas);
    expect(stocked).not.toBe(daily);
    expect(stocked.targets.map(target => [target.targetId, target.freePullsAvailable, target.freePullsUsed])).toEqual([
      ['early', 0, 0],
      ['early-copy', 0, 0],
      ['later', 100, 100],
    ]);
    expect(stocked.targets.reduce((total, target) => total + target.freePullsAvailable, 0)).toBe(100);

    const excludedPlan = clone(plan);
    excludedPlan.freePullCampaignSelections = {
      'anniversary-100': FREE_PULL_CAMPAIGN_EXCLUDED_SELECTION,
    };
    const excluded = service.project(excludedPlan, data, gachas);
    expect(excluded.targets.map(target => target.freePullsAvailable)).toEqual([0, 0, 0]);
  });

  it('uses the first published pickup when a target has not selected one yet', () => {
    const plan = makePlan({
      balances: { freeJewels: 150, paidJewels: 0, umaTickets: 0, supportTickets: 0, rainbowCrystals: 0, goldCrystals: 0 },
      targets: [makeTarget({ plannedPulls: 1 })],
    });
    const projection = service.project(plan, emptyData(), [makeGacha({
      pickups: [
        { pickup_id: 11, label: 'First pickup', rate: 0.01, exchangeable: true },
        { pickup_id: 12, label: 'Second pickup', rate: 0.02, exchangeable: true },
      ],
    })]);

    expect(projection.targets[0].odds.pickupRate).toBe(0.01);
    expect(projection.targets[0].odds.probability).toBeCloseTo(0.01, 12);
  });

  it('prefers an event-scoped gacha when a future event reuses a numeric gacha ID', () => {
    const target = makeTarget({
      eventId: 'future-event',
      gachaId: 30130,
      plannedPulls: 1,
      pickupGoals: [{ pickupId: 104201, desiredCopies: 1 }],
    });
    const plan = makePlan({
      balances: { freeJewels: 150, paidJewels: 0, umaTickets: 0, supportTickets: 0, rainbowCrystals: 0, goldCrystals: 0 },
      targets: [target],
    });
    const reusedOldPool = makeGacha({
      event_id: 'old-event',
      gacha_id: 30130,
      pickups: [{ pickup_id: 100001, rate: 0.003333 }],
    });
    const eventResolved = makeGacha({
      event_id: 'future-event',
      gacha_id: 30130,
      pickups: [{ pickup_id: 104201, rate: 0.0075 }],
    });

    const projection = service.project(plan, emptyData(), [reusedOldPool, eventResolved]);
    expect(projection.targets[0].odds.pickupRate).toBe(0.0075);
  });

  it('expands recurring, scenario, reward, and custom income deterministically', () => {
    const plan = makePlan({
      enabledIncomeRuleIds: ['daily', 'scenario-low', 'scenario-high'],
      enabledRewardIds: ['gift', 'unknown-gift'],
      scenarioSelections: { league: 'high' },
      customIncome: [{
        id: 'custom',
        label: 'Every other day',
        currency: 'free_jewels',
        amount: 7,
        cadence: 'interval',
        startDate: '2026-01-01',
        every: 2,
      }],
    });
    const data: CaratPlannerDataBundle = {
      core: {},
      income: {
        rules: [
          { id: 'daily', label: 'Daily', currency: 'free_jewels', amount: 10, cadence: 'daily', start_date: '2026-01-01' },
          { id: 'scenario-low', label: 'Low league', currency: 'free_jewels', amount: 100, cadence: 'once', start_date: '2026-01-02', scenario_group: 'league', scenario_option: 'low' },
          { id: 'scenario-high', label: 'High league', currency: 'free_jewels', amount: 200, cadence: 'once', start_date: '2026-01-02', scenario_group: 'league', scenario_option: 'high' },
        ],
      },
      rewards: {
        rewards: [
          { id: 'gift', label: 'Gift', currency: 'free_jewels', amount: 50, available_at: '2026-01-03' },
          { id: 'unknown-gift', label: 'Unknown gift', currency: 'free_jewels', amount: null, available_at: '2026-01-03' },
        ],
      },
    };

    const ledger = service.buildLedger(plan, data, '2026-01-03');
    expect(ledger.map(entry => `${entry.date}:${entry.amount}:${entry.source}`)).toEqual([
      '2026-01-01:7:custom',
      '2026-01-01:10:rule',
      '2026-01-02:10:rule',
      '2026-01-02:200:rule',
      '2026-01-03:7:custom',
      '2026-01-03:10:rule',
      '2026-01-03:50:reward',
    ]);
  });

  it('counts Monthly Shop tickets only when its assumption is selected', () => {
    const rules = [
      { id: 'shop-friend-uma', label: 'Friend tickets', currency: 'uma_ticket' as const, amount: 1, cadence: 'monthly' as const, start_date: '2026-01-06', day_of_month: 1, scenario_group: 'monthly_shop_tickets', scenario_option: 'include' },
      { id: 'shop-friend-support', label: 'Friend tickets', currency: 'support_ticket' as const, amount: 1, cadence: 'monthly' as const, start_date: '2026-01-06', day_of_month: 1, scenario_group: 'monthly_shop_tickets', scenario_option: 'include' },
      { id: 'shop-clover-uma', label: 'Clover tickets', currency: 'uma_ticket' as const, amount: 2, cadence: 'monthly' as const, start_date: '2025-06-26', day_of_month: 1, scenario_group: 'monthly_shop_tickets', scenario_option: 'include' },
      { id: 'shop-clover-support', label: 'Clover tickets', currency: 'support_ticket' as const, amount: 2, cadence: 'monthly' as const, start_date: '2025-06-26', day_of_month: 1, scenario_group: 'monthly_shop_tickets', scenario_option: 'include' },
    ];
    const data: CaratPlannerDataBundle = {
      core: {},
      income: { rules },
      rewards: { rewards: [] },
    };
    const enabledIncomeRuleIds = rules.map(rule => rule.id);
    const excluded = makePlan({ enabledIncomeRuleIds });
    const included = makePlan({
      enabledIncomeRuleIds,
      scenarioSelections: { monthly_shop_tickets: 'include' },
    });

    expect(service.buildLedger(excluded, data, '2026-02-28')).toEqual([]);
    const ledger = service.buildLedger(included, data, '2026-02-28');
    expect(ledger
      .filter(entry => entry.currency === 'uma_ticket')
      .reduce((total, entry) => total + entry.amount, 0)).toBe(5);
    expect(ledger
      .filter(entry => entry.currency === 'support_ticket')
      .reduce((total, entry) => total + entry.amount, 0)).toBe(5);
  });

  it('counts player-dependent dated rewards only when their assumptions are selected', () => {
    const rewards = [{
      id: 'temporary-story',
      label: 'Temporary trainee stories',
      currency: 'free_jewels' as const,
      amount: 80,
      available_at: '2026-01-02',
      assumption: 'temporary_character_story_read',
    }, {
      id: 'carnival-mission',
      label: 'Racing Carnival mission',
      currency: 'free_jewels' as const,
      amount: 100,
      available_at: '2026-01-03',
      assumption: 'racing_carnival_bonus_skill_mission',
    }, {
      id: 'masters-challenge',
      label: 'Masters Challenge first-clear rewards',
      currency: 'rainbow_crystal' as const,
      amount: 3,
      available_at: '2026-01-03',
      assumption: 'all_first_clears_high_difficulty',
    }];
    const data: CaratPlannerDataBundle = {
      ...emptyData(),
      rewards: { rewards },
    };
    const enabledRewardIds = rewards.map(reward => reward.id);

    expect(service.buildLedger(
      makePlan({ enabledRewardIds }),
      data,
      '2026-01-03',
    )).toEqual([]);

    const included = service.buildLedger(makePlan({
      enabledRewardIds,
      scenarioSelections: {
        temporary_story_rewards: 'include',
        racing_carnival_mission: 'include',
        masters_challenge_rewards: 'include',
      },
    }), data, '2026-01-03');
    expect(included.map(entry => entry.amount)).toEqual([80, 100, 3]);
  });

  it('counts only the earned portion of progressive event assumptions', () => {
    const rewards = [{
      id: 'skills-score',
      label: 'Trainer Skills Test score rewards',
      currency: 'free_jewels' as const,
      amount: 1_500,
      available_at: '2026-01-02',
      assumption: 'full_score_completion',
    }, {
      id: 'skills-shop',
      label: 'Trainer Skills Test shop exchanges',
      currency: 'free_jewels' as const,
      amount: 500,
      available_at: '2026-01-02',
      assumption: 'full_exchange',
    }, {
      id: 'carnival-clears',
      label: 'Racing Carnival first-clear rewards',
      currency: 'free_jewels' as const,
      amount: 300,
      available_at: '2026-01-03',
      assumption: 'all_first_clears',
    }, {
      id: 'carnival-shop',
      label: 'Racing Carnival shop exchanges',
      currency: 'free_jewels' as const,
      amount: 200,
      available_at: '2026-01-03',
      assumption: 'all_limited_shop_exchanges',
    }];
    const data: CaratPlannerDataBundle = {
      ...emptyData(),
      rewards: { rewards },
    };
    const enabledRewardIds = rewards.map(reward => reward.id);

    const partial = service.buildLedger(makePlan({
      enabledRewardIds,
      scenarioSelections: {
        trainer_skills_test_rewards: 'score_only',
        racing_carnival_rewards: 'clears_only',
      },
    }), data, '2026-01-03');
    expect(partial.map(entry => entry.id)).toEqual([
      'reward:skills-score:free_jewels',
      'reward:carnival-clears:free_jewels',
    ]);

    const complete = service.buildLedger(makePlan({
      enabledRewardIds,
      scenarioSelections: {
        trainer_skills_test_rewards: 'include',
        racing_carnival_rewards: 'include',
      },
    }), data, '2026-01-03');
    expect(complete.reduce((total, entry) => total + entry.amount, 0)).toBe(2_500);
  });

  it('excludes inactive event targets and rewards without deleting their saved configuration', () => {
    const target = makeTarget({ eventId: 'banner-1', plannedPulls: 50 });
    const plan = makePlan({
      enabledRewardIds: ['event-reward'],
      disabledEventIds: ['banner-1'],
      targets: [target],
    });
    const data: CaratPlannerDataBundle = {
      core: {},
      income: { rules: [] },
      rewards: { rewards: [{
        id: 'event-reward',
        label: 'Event reward',
        event_id: 'banner-1',
        currency: 'free_jewels',
        amount: 500,
        available_at: '2026-01-02',
      }] },
    };

    expect(service.project(plan, data).targets).toEqual([]);
    expect(service.buildLedger(plan, data, '2026-01-10')).toEqual([]);
    expect(plan.targets[0]).toBe(target);
    expect(plan.enabledRewardIds).toEqual(['event-reward']);

    const restored = { ...plan, disabledEventIds: [] };
    expect(service.project(restored, data).targets.length).toBe(1);
    expect(service.buildLedger(restored, data, '2026-01-10').map(entry => entry.id)).toEqual(['reward:event-reward:free_jewels']);
  });

  it('keeps saved targets before the plan start out of balances and re-enables them when the start moves back', () => {
    const past = makeTarget({ id: 'past', eventId: 'past', bannerEnd: '2025-12-31', plannedPulls: 200 });
    const boundary = makeTarget({ id: 'boundary', eventId: 'boundary', bannerEnd: '2026-01-01', plannedPulls: 10 });
    const future = makeTarget({ id: 'future', eventId: 'future', bannerEnd: '2026-01-02', plannedPulls: 50 });
    const plan = makePlan({
      balances: { freeJewels: 30_000, paidJewels: 0, umaTickets: 0, supportTickets: 0, rainbowCrystals: 0, goldCrystals: 0 },
      targets: [future, past, boundary],
    });

    const projection = service.project(plan, emptyData());

    expect(projection.targets.map(target => target.targetId)).toEqual(['boundary', 'future']);
    expect(projection.targets[0].balanceBefore.freeJewels).toBe(30_000);
    expect(projection.finalBalances.freeJewels).toBe(21_000);
    expect(plan.targets).toEqual([future, past, boundary]);
    expect(plan.targets[1]).toBe(past);

    const earlierPlan = { ...plan, projectionStartDate: '2025-01-01' };
    expect(service.project(earlierPlan, emptyData()).targets.map(target => target.targetId))
      .toEqual(['past', 'boundary', 'future']);
  });

  it('uses the resolved custom pull date at the plan boundary', () => {
    const oldBannerFuturePull = makeTarget({
      id: 'old-banner-future-pull',
      bannerStart: '2025-01-01',
      bannerEnd: '2025-01-10',
      pullTiming: 'custom',
      customPullDate: '2026-01-01',
    });
    const futureBannerPastPull = makeTarget({
      id: 'future-banner-past-pull',
      bannerStart: '2026-02-01',
      bannerEnd: '2026-02-10',
      pullTiming: 'custom',
      customPullDate: '2025-12-31',
    });

    expect(service.project(makePlan({ targets: [futureBannerPastPull, oldBannerFuturePull] }), emptyData())
      .targets.map(target => target.targetId)).toEqual(['old-banner-future-pull']);
  });

  it('reuses only the unchanged target prefix and fully invalidates for balance, income, or data changes', () => {
    const data = emptyData();
    const gachas = [makeGacha()];
    const plan = makePlan({
      balances: { freeJewels: 90_000, paidJewels: 0, umaTickets: 0, supportTickets: 0, rainbowCrystals: 0, goldCrystals: 0 },
      targets: [
        makeTarget({ id: 'target-1', bannerEnd: '2026-01-10', plannedPulls: 10 }),
        makeTarget({ id: 'target-2', bannerEnd: '2026-01-20', plannedPulls: 20 }),
        makeTarget({ id: 'target-3', bannerEnd: '2026-01-30', plannedPulls: 30 }),
      ],
    });
    const initial = service.project(plan, data, gachas);
    expect(service.project(plan, data, gachas)).toBe(initial);

    const suffixChanged = clone(plan);
    suffixChanged.targets[1].plannedPulls = 25;
    const incremental = service.project(suffixChanged, data, gachas);
    expect(incremental.targets[0]).toBe(initial.targets[0]);
    expect(incremental.targets[1]).not.toBe(initial.targets[1]);
    expect(incremental.targets[2]).not.toBe(initial.targets[2]);
    expect(incremental).toEqual(new CaratPlannerCalculationService().project(suffixChanged, data, gachas));

    const incomeChanged = clone(suffixChanged);
    incomeChanged.customIncome.push({
      id: 'bonus',
      label: 'Bonus',
      currency: 'free_jewels',
      amount: 100,
      cadence: 'once',
      startDate: '2026-01-05',
    });
    const afterIncome = service.project(incomeChanged, data, gachas);
    expect(afterIncome.targets.every((target, index) => target !== incremental.targets[index])).toBeTrue();

    const balanceChanged = clone(incomeChanged);
    balanceChanged.balances.freeJewels++;
    const afterBalance = service.project(balanceChanged, data, gachas);
    expect(afterBalance.targets.every((target, index) => target !== afterIncome.targets[index])).toBeTrue();

    const changedData: CaratPlannerDataBundle = { ...data, core: { ...data.core, jewel_cost_per_pull: 100 } };
    const afterData = service.project(balanceChanged, changedData, gachas);
    expect(afterData.targets.every((target, index) => target !== afterBalance.targets[index])).toBeTrue();
  });
});

function strongestTeamVariants(
  eventId: string,
  availableAt: string,
  firstTier: number,
  secondTier: number,
): PlannerCompetitiveRewardVariant[] {
  return [
    {
      id: `${eventId}-tier-1`, competition: 'strongest_team', event_id: eventId, master_event_id: 1,
      label: 'Team rank 1 (0-999 evaluation points)', available_at: availableAt,
      source_items: [{ item_category: 90, item_id: 43, amount: firstTier }],
    },
    {
      id: `${eventId}-tier-2`, competition: 'strongest_team', event_id: eventId, master_event_id: 1,
      label: 'Team rank 2 (1000-1999 evaluation points)', available_at: availableAt,
      source_items: [{ item_category: 90, item_id: 43, amount: secondTier }],
    },
    {
      id: `${eventId}-missions`, competition: 'strongest_team', event_id: eventId, master_event_id: 1,
      label: 'Event missions (full completion)', available_at: availableAt,
      source_items: [{ item_category: 40, item_id: 41, amount: 1 }],
    },
  ];
}

function legendRaceVariants(
  eventId: string,
  availableAt: string,
  opponents: number,
  caratsPerOpponent: number,
): PlannerCompetitiveRewardVariant[] {
  return Array.from({ length: opponents }, (_, index) => ({
    id: `${eventId}-opponent-${index + 1}`,
    competition: 'legend_race',
    event_id: eventId,
    master_event_id: 1,
    label: `First clear ${index + 1}`,
    available_at: availableAt,
    source_items: [{
      item_category: 90,
      item_id: 43,
      amount: caratsPerOpponent,
      order_min: index + 1,
    }],
  }));
}

function makePlan(overrides: Partial<CaratPlan> = {}): CaratPlan {
  return {
    id: 'plan-1',
    name: 'Plan',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    projectionStartDate: '2026-01-01',
    balances: {
      freeJewels: 0,
      paidJewels: 0,
      umaTickets: 0,
      supportTickets: 0,
      rainbowCrystals: 0,
      goldCrystals: 0,
      rainbowFullCrystals: 0,
      goldFullCrystals: 0,
    },
    enabledIncomeRuleIds: [],
    enabledRewardIds: [],
    enabledRewardEventIds: [],
    disabledEventIds: [],
    scenarioSelections: {},
    customIncome: [],
    targets: [],
    ...overrides,
  };
}

function makeTarget(overrides: Partial<PlannerTarget> = {}): PlannerTarget {
  return {
    id: 'target-1',
    eventId: 'event-1',
    gachaId: 101,
    title: 'Character banner',
    bannerKind: 'character',
    bannerStart: '2026-01-01',
    bannerEnd: '2026-01-03',
    pullTiming: 'end',
    plannedPulls: 0,
    desiredCopies: 1,
    useTickets: true,
    allowPaidJewels: false,
    ...overrides,
  };
}

function makeGacha(overrides: Partial<PlannerGachaEntry> = {}): PlannerGachaEntry {
  return {
    event_id: 'event-1',
    gacha_id: 101,
    banner_kind: 'character',
    start_date: '2026-01-01',
    end_date: '2026-01-03',
    jewel_cost_per_pull: 150,
    spark_pulls: 200,
    free_pulls: 0,
    ticket_currency: 'uma_ticket',
    pickups: [{ pickup_id: 1, rate: 0.0075, exchangeable: true }],
    ...overrides,
  };
}

function emptyData(): CaratPlannerDataBundle {
  return {
    core: { jewel_cost_per_pull: 150, default_spark_pulls: 200 },
    income: { rules: [] },
    rewards: { rewards: [] },
  };
}

function globalComparison(
  overrides: Partial<PlannerGlobalRewardComparison> = {},
): PlannerGlobalRewardComparison {
  return {
    news_match_method: 'same_announce_id',
    observation_start: '2025-06-26',
    observation_end: '2026-01-01',
    observation_days: 190,
    observed_months: 6.24,
    matched_news_global_carats: 0,
    matched_news_jp_carats: 0,
    matched_news_extra_carats: 0,
    en_only_news_carats: 0,
    social_carats: 0,
    social_reward_posts: 0,
    social_news_duplicate_reward_items_removed: 0,
    social_news_duplicate_carats_removed: 0,
    speculative_observed_carats: 0,
    speculative_monthly_carats: 0,
    matched_news: [],
    en_only_news: [],
    ...overrides,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sumCurrency(
  ledger: ReturnType<CaratPlannerCalculationService['buildLedger']>,
  currency: ReturnType<CaratPlannerCalculationService['buildLedger']>[number]['currency'],
): number {
  return ledger
    .filter(entry => entry.currency === currency)
    .reduce((total, entry) => total + entry.amount, 0);
}
