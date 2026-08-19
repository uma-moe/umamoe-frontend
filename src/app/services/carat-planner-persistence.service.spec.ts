import { CaratPlannerPersistenceService } from './carat-planner-persistence.service';
import { CONDITIONAL_REWARD_DEFAULT_SELECTIONS } from '../utils/carat-planner-income-assumptions';

describe('CaratPlannerPersistenceService', () => {
  beforeEach(() => {
    localStorage.removeItem(CaratPlannerPersistenceService.STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(CaratPlannerPersistenceService.STORAGE_KEY);
  });

  it('enables the rolling speculative estimate on new plans by default', () => {
    const service = createService();

    expect(service.activePlan.scenarioSelections['speculative_income']).toBe('include');
    expect(service.activePlan.scenarioSelections['temporary_story_rewards']).toBe('include');
    expect(service.activePlan.scenarioSelections['racing_carnival_mission']).toBe('include');
    expect(service.activePlan.scenarioSelections['masters_challenge_rewards']).toBe('none');
    expect(service.activePlan.scenarioSelections['story_event_rewards']).toBe('include');
    expect(service.activePlan.scenarioSelections['factor_research_rewards']).toBe('include');
    expect(service.activePlan.scenarioSelections['trainer_skills_test_rewards']).toBe('include');
  });

  it('migrates existing plans without a speculative selection to the rolling mean', () => {
    localStorage.setItem(CaratPlannerPersistenceService.STORAGE_KEY, JSON.stringify({
      version: 1,
      activePlanId: 'existing-plan',
      plans: [{
        id: 'existing-plan',
        name: 'Existing plan',
        projectionStartDate: '2026-08-01',
        scenarioSelections: { league: 'high' },
      }],
    }));

    const service = createService();

    expect(service.activePlan.scenarioSelections).toEqual({
      league: 'high',
      speculative_income: 'include',
      ...CONDITIONAL_REWARD_DEFAULT_SELECTIONS,
    });
  });

  it('preserves an explicit speculative-income opt-out', () => {
    localStorage.setItem(CaratPlannerPersistenceService.STORAGE_KEY, JSON.stringify({
      version: 1,
      activePlanId: 'opted-out-plan',
      plans: [{
        id: 'opted-out-plan',
        name: 'Opted out',
        projectionStartDate: '2026-08-01',
        scenarioSelections: {
          speculative_income: 'none',
          temporary_story_rewards: 'none',
          racing_carnival_mission: 'none',
        },
      }],
    }));

    const service = createService();

    expect(service.activePlan.scenarioSelections['speculative_income']).toBe('none');
    expect(service.activePlan.scenarioSelections['temporary_story_rewards']).toBe('none');
    expect(service.activePlan.scenarioSelections['racing_carnival_mission']).toBe('none');
    expect(service.activePlan.scenarioSelections['masters_challenge_rewards']).toBe('none');
  });

  it('sanitizes imported balances, dates, optional IDs, collections, and numeric limits', () => {
    const service = createService();
    service.importJson(JSON.stringify({
      version: 1,
      plan: {
        id: ' imported-plan ',
        name: `  ${'x'.repeat(100)}  `,
        createdAt: 'not-an-instant',
        updatedAt: '2026-01-01T00:00:00.000Z',
        projectionStartDate: '2026-02-31',
        balances: {
          freeJewels: -100,
          paidJewels: '42.9',
          umaTickets: 'not-a-number',
          supportTickets: 3.8,
          rainbowCrystals: 2.9,
          goldCrystals: -4,
          rainbowFullCrystals: 1.9,
          goldFullCrystals: -2,
        },
        enabledIncomeRuleIds: ['daily', 'daily', 42],
        enabledRewardIds: ['gift', 'gift'],
        enabledRewardEventIds: ['campaign-1', 'campaign-1', 42],
        disabledEventIds: ['campaign-2', 'campaign-2', 42],
        scenarioSelections: { league: 'high', ignored: 4 },
        freePullCampaignSelections: { anniversary: 'later-banner', ignored: 4 },
        resourceDefaultsApplied: 'yes',
        customIncome: [
          {
            id: ' custom ',
            label: '  Bonus  ',
            currency: 'invalid',
            amount: '-12.8',
            cadence: 'invalid',
            startDate: '2026-01-01',
            endDate: '2026-02-31',
            every: 0,
          },
          { id: 'invalid-income', label: '', startDate: '2026-01-01' },
        ],
        targets: [
          {
            id: ' target ',
            eventId: ' event ',
            gachaId: null,
            gachaIds: [-1, 42.9, null, '', false],
            title: '  Banner  ',
            bannerKind: 'character',
            bannerStart: '2026-01-01',
            bannerEnd: '2026-02-31',
            pullTiming: 'custom',
            customPullDate: 'not-a-date',
            plannedPulls: 9000,
            desiredCopies: 99,
            pickupId: -4,
            useTickets: false,
            ticketLimit: null,
            allowPaidJewels: 'true',
            rainbowCrystalsPlanned: 99,
            goldCrystalsPlanned: -1,
          },
          { id: 'invalid-target', eventId: '', title: '', bannerStart: '2026-01-01' },
        ],
      },
    }));

    const plan = service.activePlan;
    expect(plan.id).toBe('imported-plan');
    expect(plan.name).toBe('x'.repeat(80));
    expect(plan.projectionStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(plan.projectionStartDate).not.toBe('2026-02-31');
    expect(plan.balances).toEqual({ freeJewels: 0, paidJewels: 42, umaTickets: 0, supportTickets: 3, rainbowCrystals: 2, goldCrystals: 0, rainbowFullCrystals: 1, goldFullCrystals: 0 });
    expect(plan.enabledIncomeRuleIds).toEqual(['daily']);
    expect(plan.enabledRewardIds).toEqual(['gift']);
    expect(plan.enabledRewardEventIds).toEqual(['campaign-1']);
    expect(plan.disabledEventIds).toEqual(['campaign-2']);
    expect(plan.scenarioSelections).toEqual({
      league: 'high',
      speculative_income: 'include',
      ...CONDITIONAL_REWARD_DEFAULT_SELECTIONS,
    });
    expect(plan.freePullCampaignSelections).toEqual({ anniversary: 'later-banner' });
    expect(plan.resourceDefaultsApplied).toBeFalse();

    expect(plan.customIncome.length).toBe(1);
    expect(plan.customIncome[0]).toEqual({
      id: 'custom',
      label: 'Bonus',
      currency: 'free_jewels',
      amount: -12,
      cadence: 'once',
      startDate: '2026-01-01',
      every: 1,
    });
    expect(plan.customIncome[0].endDate).toBeUndefined();

    expect(plan.targets.length).toBe(1);
    expect(plan.targets[0]).toEqual({
      id: 'target',
      eventId: 'event',
      gachaIds: [42],
      title: 'Banner',
      bannerKind: 'character',
      bannerStart: '2026-01-01',
      bannerEnd: '2026-01-01',
      pullTiming: 'custom',
      plannedPulls: 5000,
      desiredCopies: 20,
      pickupGoals: [],
      useTickets: false,
      allowPaidJewels: false,
      rainbowCrystalsPlanned: 20,
    });
    expect(plan.targets[0].gachaId).toBeUndefined();
    expect(plan.targets[0].imagePath).toBeUndefined();
    expect(plan.targets[0].customPullDate).toBeUndefined();
    expect(plan.targets[0].pickupId).toBeUndefined();
    expect(plan.targets[0].ticketLimit).toBeUndefined();
  });

  it('persists only sanitized state and restores it on the next service instance', () => {
    const service = createService();
    service.importJson(JSON.stringify({
      plan: {
        id: 'saved-plan',
        name: 'Saved plan',
        projectionStartDate: '2026-01-01',
        balances: { freeJewels: 1234.9, paidJewels: -1, umaTickets: 2, supportTickets: 3, rainbowFullCrystals: 2, goldFullCrystals: 1 },
        customIncome: [],
        targets: [{
          id: 'target',
          eventId: 'event',
          title: 'Banner',
          bannerKind: 'support',
          bannerStart: '2026-03-01',
          bannerEnd: '2026-03-10',
          pullTiming: 'end',
          plannedPulls: 200,
          desiredCopies: 1,
        }],
      },
    }));

    const stored = JSON.parse(localStorage.getItem(CaratPlannerPersistenceService.STORAGE_KEY) ?? '{}');
    const storedPlan = stored.plans.find((plan: { id: string }) => plan.id === 'saved-plan');
    expect(storedPlan.balances).toEqual({ freeJewels: 1234, paidJewels: 0, umaTickets: 2, supportTickets: 3, rainbowCrystals: 0, goldCrystals: 0, rainbowFullCrystals: 2, goldFullCrystals: 1 });
    expect(storedPlan.targets[0].bannerStart).toBeUndefined();
    expect(storedPlan.targets[0].bannerEnd).toBeUndefined();

    const restored = createService().activePlan;
    expect(restored.id).toBe('saved-plan');
    expect(restored.balances).toEqual({ freeJewels: 1234, paidJewels: 0, umaTickets: 2, supportTickets: 3, rainbowCrystals: 0, goldCrystals: 0, rainbowFullCrystals: 2, goldFullCrystals: 1 });
    expect(restored.targets[0].bannerKind).toBe('support');
    expect(restored.targets[0].bannerStart).toBeUndefined();
    expect(restored.targets[0].bannerEnd).toBeUndefined();
  });

  it('replaces the local collection with sanitized cloud data', () => {
    const service = createService();

    const replaced = service.replaceCollection({
      version: 1,
      activePlanId: 'cloud-plan',
      plans: [{
        id: 'cloud-plan',
        name: 'Cloud plan',
        projectionStartDate: '2026-08-01',
      }],
    });

    expect(replaced.activePlanId).toBe('cloud-plan');
    expect(service.activePlan.name).toBe('Cloud plan');
    expect(JSON.parse(localStorage.getItem(CaratPlannerPersistenceService.STORAGE_KEY)!).activePlanId)
      .toBe('cloud-plan');
  });

  it('imports the same shared snapshot only once', () => {
    const service = createService();
    const shared = {
      id: 'owner-plan',
      name: 'Public plan',
      projectionStartDate: '2026-08-01',
    };

    const first = service.importSharedPlan(shared, 'AbCd123456');
    const second = service.importSharedPlan(shared, 'AbCd123456');

    expect(first.id).toBe('shared-AbCd123456');
    expect(first.name).toBe('Public plan (shared)');
    expect(second.id).toBe(first.id);
    expect(service.snapshot.plans.filter(plan => plan.id === first.id).length).toBe(1);
  });

  it('purges legacy banner dates from existing local storage', () => {
    localStorage.setItem(CaratPlannerPersistenceService.STORAGE_KEY, JSON.stringify({
      version: 1,
      activePlanId: 'legacy-plan',
      plans: [{
        id: 'legacy-plan',
        name: 'Legacy plan',
        projectionStartDate: '2026-01-01',
        targets: [{
          id: 'target',
          eventId: 'banner',
          title: 'Banner',
          bannerKind: 'support',
          bannerStart: '2026-09-01',
          bannerEnd: '2026-09-06',
          pullTiming: 'end',
          plannedPulls: 200,
          desiredCopies: 1,
        }],
      }],
    }));

    createService();

    const stored = JSON.parse(localStorage.getItem(CaratPlannerPersistenceService.STORAGE_KEY) ?? '{}');
    expect(stored.plans[0].targets[0].bannerStart).toBeUndefined();
    expect(stored.plans[0].targets[0].bannerEnd).toBeUndefined();
  });

  it('soft-removes targets and restores their settings without creating duplicates', () => {
    const service = createService();
    const event = {
      id: 'banner-1',
      title: 'Banner 1',
      type: 'character_banner',
      globalReleaseDate: '2026-03-01',
      estimatedEndDate: '2026-03-10',
      gachaId: 30100,
    };
    service.setEventActive(event, true);
    const configured = service.activePlan;
    configured.targets[0].plannedPulls = 123;
    configured.targets[0].desiredCopies = 4;
    configured.targets[0].pullTiming = 'custom';
    configured.targets[0].customPullDate = '2026-03-05';
    configured.targets[0].pickupId = 77;
    configured.targets[0].pickupGoals = [
      { pickupId: 77, desiredCopies: 4 },
      { pickupId: 88, desiredCopies: 2 },
    ];
    configured.targets[0].useTickets = false;
    configured.targets[0].ticketLimit = 12;
    configured.targets[0].allowPaidJewels = true;
    configured.freePullCampaignSelections = { anniversary: event.id };
    service.savePlan(configured);

    service.setEventActive(event, false);
    expect(service.isEventActive(event.id)).toBeFalse();
    expect(service.activePlan.targets.length).toBe(1);

    service.setEventActive({
      ...event,
      title: 'Banner 1 confirmed',
      estimatedEndDate: '2026-03-12',
      gachaId: 30101,
      imagePath: '/confirmed.webp',
    }, true);
    const restored = service.activePlan.targets[0];
    expect(service.isEventActive(event.id)).toBeTrue();
    expect(service.activePlan.targets.length).toBe(1);
    expect([
      restored.plannedPulls,
      restored.desiredCopies,
      restored.pullTiming,
      restored.customPullDate,
      restored.pickupId,
      restored.useTickets,
      restored.ticketLimit,
      restored.allowPaidJewels,
    ]).toEqual([123, 4, 'custom', '2026-03-05', 77, false, 12, true]);
    expect([restored.title, restored.bannerEnd, restored.gachaId, restored.imagePath])
      .toEqual(['Banner 1 confirmed', '2026-03-12', 30101, '/confirmed.webp']);
    expect(restored.pickupGoals).toEqual([
      { pickupId: 77, desiredCopies: 4 },
      { pickupId: 88, desiredCopies: 2 },
    ]);
    expect(service.activePlan.freePullCampaignSelections).toEqual({ anniversary: event.id });
  });

  it('migrates legacy single-pickup targets and sanitizes duplicate multi-pickup goals', () => {
    const service = createService();
    service.importJson(JSON.stringify({
      plan: {
        id: 'goal-migration',
        name: 'Goals',
        projectionStartDate: '2026-01-01',
        targets: [
          {
            id: 'legacy', eventId: 'legacy-event', title: 'Legacy', bannerKind: 'character',
            bannerStart: '2026-01-01', plannedPulls: 200, pickupId: 11, desiredCopies: 3,
          },
          {
            id: 'multi', eventId: 'multi-event', title: 'Multi', bannerKind: 'support',
            bannerStart: '2026-01-02', plannedPulls: 200, pickupId: 99, desiredCopies: 9,
            pickupGoals: [
              { pickupId: 21, desiredCopies: 2 },
              { pickupId: 22, desiredCopies: 99 },
              { pickupId: 21, desiredCopies: 7 },
              { pickupId: -1, desiredCopies: 1 },
            ],
          },
        ],
      },
    }));

    const [legacy, multi] = service.activePlan.targets;
    expect(legacy.pickupGoals).toEqual([{ pickupId: 11, desiredCopies: 3 }]);
    expect(multi.pickupGoals).toEqual([
      { pickupId: 21, desiredCopies: 2 },
      { pickupId: 22, desiredCopies: 20 },
    ]);
    expect([multi.pickupId, multi.desiredCopies]).toEqual([21, 2]);
  });

  it('preserves reward selections while a reward event is inactive', () => {
    const service = createService();
    const event = {
      id: 'campaign-1',
      title: 'Campaign',
      type: 'campaign',
      plannerRewardAvailable: true,
      globalReleaseDate: '2026-03-01',
    };
    const rewards = [
      { id: 'jewels', label: 'Jewels', event_id: event.id, currency: 'free_jewels' as const, amount: 150, available_at: '2026-03-01' },
      { id: 'ticket', label: 'Ticket', event_id: event.id, currency: 'uma_ticket' as const, amount: 1, available_at: '2026-03-01' },
    ];
    service.setEventActive(event, true, rewards);
    const configured = service.activePlan;
    configured.enabledRewardIds = ['jewels'];
    service.savePlan(configured);

    service.setEventActive(event, false);
    expect(service.activePlan.enabledRewardIds).toEqual(['jewels']);
    expect(service.isEventActive(event.id)).toBeFalse();

    service.setEventActive(event, true, rewards);
    expect(service.activePlan.enabledRewardIds).toEqual([]);
    expect(service.isEventActive(event.id)).toBeTrue();
  });

  it('keeps ticket-only reward events visibly active after re-adding them', () => {
    const service = createService();
    const event = {
      id: 'ticket-campaign',
      title: 'Ticket campaign',
      type: 'campaign',
      plannerRewardAvailable: true,
      globalReleaseDate: '2026-03-01',
    };
    const rewards = [
      { id: 'ticket-only', label: 'Ticket', event_id: event.id, currency: 'uma_ticket' as const, amount: 1, available_at: '2026-03-01' },
    ];

    service.setEventActive(event, true, rewards);
    service.setEventActive(event, false);
    service.setEventActive(event, true, rewards);

    expect(service.activePlan.enabledRewardIds).toEqual([]);
    expect(service.activePlan.enabledRewardEventIds).toEqual(['ticket-campaign']);
    expect(service.isEventActive(event.id)).toBeTrue();
  });

  it('tracks selector-only events without treating the voucher as currency', () => {
    const service = createService();
    const event = {
      id: 'selector-campaign',
      title: 'Anniversary missions',
      type: 'mission_campaign',
      plannerRewardAvailable: true,
      globalReleaseDate: '2026-03-01',
    };
    const rewards = [{
      id: 'selector-details',
      label: '1st Anniversary reward items',
      event_id: event.id,
      currency: 'free_jewels' as const,
      amount: null,
      available_at: '2026-03-01',
      source_items: [{ item_category: 42, item_id: 165, amount: 1 }],
    }];

    service.setEventActive(event, true, rewards);

    expect(service.activePlan.enabledRewardIds).toEqual([]);
    expect(service.activePlan.enabledRewardEventIds).toEqual(['selector-campaign']);
    expect(service.isEventActive(event.id)).toBeTrue();
  });

  it('activates reward events that only contain Crystal Shards in their item breakdown', () => {
    const service = createService();
    const event = {
      id: 'crystal-campaign',
      title: 'Crystal campaign',
      type: 'campaign',
      plannerRewardAvailable: true,
      globalReleaseDate: '2026-03-01',
    };
    const rewards = [{
      id: 'crystal-details',
      label: 'Crystal Shard rewards',
      event_id: event.id,
      currency: 'free_jewels' as const,
      amount: null,
      available_at: '2026-03-01',
      source_items: [{ item_category: 164, item_id: 149, amount: 1 }],
    }];

    service.setEventActive(event, true, rewards);

    expect(service.activePlan.enabledRewardIds).toEqual([]);
    expect(service.activePlan.enabledRewardEventIds).toEqual(['crystal-campaign']);
  });

  it('keeps variable competitive rewards pending until the user selects a result', () => {
    const service = createService();
    const event = {
      id: 'legend-race-1021',
      title: 'Legend Race',
      type: 'legend_race',
      plannerRewardAvailable: true,
      globalReleaseDate: '2026-03-01',
    };
    const variants = [{
      id: 'legend-clear',
      competition: 'legend_race',
      event_id: event.id,
      master_event_id: 1021,
      label: 'First clear',
      source_items: [{ item_category: 90, item_id: 43, amount: 150 }],
    }];

    service.setEventActive(event, true, [], variants);

    expect(service.activePlan.enabledRewardIds).toEqual([]);
    expect(service.activePlan.enabledRewardEventIds).toEqual(['legend-race-1021']);
    expect(service.isEventActive(event.id)).toBeTrue();
  });

  it('rejects malformed or unusable imports', () => {
    const service = createService();
    expect(() => service.importJson('{broken')).toThrowError('Planner import is not valid JSON.');
    expect(() => service.importJson(JSON.stringify({ plans: [null, 42, 'bad'] })))
      .toThrowError('Planner import contains no usable plans.');
  });
});

function createService(): CaratPlannerPersistenceService {
  return new CaratPlannerPersistenceService('browser' as any);
}
