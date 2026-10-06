import { describe, expect, it } from 'vitest';
import { CARAT_PLANNER_STORAGE_KEY, activePlan, createPlan, importPlanCollection, importSharedPlan, loadPlanCollection, probabilityAtLeast, projectPlan, savePlanCollection, setTimelineEvent, type PlannerRewardResource } from './carat-planner';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';

describe('Carat Planner compatibility', () => {
  it('combines shared selector-ticket sparks with Uncap Crystals for the reported support banners', () => {
    for (const scenario of [
      { pulls: 400, ids: [30264], copies: [5], crystals: 1, probability: .8019747439846 },
      { pulls: 600, ids: [30256, 30257], copies: [5, 4], crystals: 2, probability: .9721885652622 }
    ]) {
      const plan = createPlan(); plan.projectionStartDate = '2028-01-01';
      plan.balances.freeJewels = scenario.pulls * 150;
      plan.balances.rainbowFullCrystals = scenario.crystals;
      plan.targets = [{ id: 'spark', eventId: 'spark', title: 'Support banner', bannerKind: 'support', bannerEnd: '2028-02-01', pullTiming: 'end', plannedPulls: scenario.pulls, desiredCopies: 5, useTickets: false, allowPaidJewels: false, rainbowCrystalsPlanned: scenario.crystals,
        pickupGoals: scenario.ids.map((pickupId, index) => ({ pickupId, desiredCopies: scenario.copies[index]! })) }];
      const result = projectPlan(plan, { core: {}, income: { rules: [] }, rewards: { rewards: [] }, gachas: [{
        event_id: 'spark', gacha_id: 30363, banner_kind: 'support', start_date: '2028-01-01', end_date: '2028-02-01', spark_pulls: 200,
        pickups: scenario.ids.map(pickup_id => ({ pickup_id, rate: .0075, exchangeable: true }))
      }] }).targets[0]!;

      expect(result).toMatchObject({ fundedPulls: scenario.pulls, sparkCopies: scenario.pulls / 200, rainbowCrystalsUsed: scenario.crystals, jointProbabilityExact: true });
      expect(result.pickupProbability).toBeCloseTo(scenario.probability, 12);
    }
  });

  it('reopens shared copies without overwriting edits and gives new copies independent names and dates', () => {
    const original = createPlan('Plan'); original.createdAt = original.updatedAt = '2020-01-01T00:00:00Z';
    original.targets = [{ id: 'kept-target', eventId: 'event', title: 'Banner', bannerKind: 'character', pullTiming: 'end', plannedPulls: 200, desiredCopies: 1, useTickets: true, allowPaidJewels: false }];
    const local = createPlan('PLAN (shared)');
    const collection = { version: 1 as const, activePlanId: local.id, plans: [local] };
    const next = importSharedPlan(original, ' ABCD-1234 ', collection);
    const imported = activePlan(next);
    expect(imported).toMatchObject({ id: 'shared-ABCD1234', name: 'Plan (shared) 2', targets: original.targets });
    expect(imported.createdAt).not.toBe(original.createdAt); expect(imported.createdAt).toBe(imported.updatedAt);
    imported.name = 'My local edits'; imported.targets[0]!.plannedPulls = 333;
    imported.updatedAt = '2026-01-02T00:00:00Z';
    next.activePlanId = local.id;
    for (const payload of [{ ...original, name: 'New server snapshot' }, null]) {
      const reopened = importSharedPlan(payload, 'ABCD1234', next);
      expect(reopened.plans).toEqual(next.plans); expect(activePlan(reopened)).toEqual(imported);
    }
    expect(collection.plans).toEqual([local]); expect(original.targets[0]!.plannedPulls).toBe(200);
    expect(() => importSharedPlan(original, '---', collection)).toThrow('link is invalid');
    for (const payload of [null, [], 'invalid']) expect(() => importSharedPlan(payload, 'newshare', collection)).toThrow('no usable planner data');
    const full = { ...collection, plans: Array.from({ length: 50 }, (_, index) => ({ ...local, id: `local-${index}` })) };
    const limited = importSharedPlan(original, 'newshare', full);
    expect(limited.plans).toHaveLength(50); expect(limited.activePlanId).toBe('local-0');
  });
  it('reports cumulative reward Carats without counting income rules, balances or tickets as rewards', () => {
    const plan = createPlan(); plan.projectionStartDate = '2026-01-01'; plan.balances.freeJewels = 10000;
    plan.enabledIncomeRuleIds = ['daily'];
    plan.variableRewardSelections.cm = { optionId: 'chosen', label: 'CM result', availableAt: '2026-01-03', amounts: { free_jewels: 700, paid_jewels: 20, support_ticket: 3 } };
    plan.targets = ['2026-01-02', '2026-01-03', '2026-01-04'].map((date, index) => ({ id: String(index), eventId: String(index), title: 'Banner', bannerKind: 'character', bannerEnd: date, pullTiming: 'end', plannedPulls: 10, desiredCopies: 1, useTickets: false, allowPaidJewels: false }));
    const bundle = { core: {}, income: { rules: [{ id: 'daily', label: 'Daily', currency: 'free_jewels' as const, amount: 100, cadence: 'daily' as const, start_date: '2026-01-01' }] }, rewards: { rewards: [{ id: 'gift', label: 'Gift', currency: 'free_jewels' as const, amount: 500, available_at: '2026-01-02', default_enabled: true }, { id: 'tickets', label: 'Tickets', currency: 'uma_ticket' as const, amount: 10, available_at: '2026-01-02', default_enabled: true }] } };
    expect(projectPlan(plan, bundle).targets.map(item => item.rewardCaratsGained)).toEqual([500, 1220, 1220]);
    plan.disabledRewardIds = ['gift']; plan.disabledEventIds = ['cm'];
    expect(projectPlan(plan, bundle).targets.map(item => item.rewardCaratsGained)).toEqual([0, 0, 0]);
  });
  it('keeps per-goal crystal odds, rejects missing rates and never substitutes one goal for an unavailable joint chance', () => {
    const plan = createPlan(); plan.projectionStartDate = '2026-01-01'; plan.balances.freeJewels = 30000;
    plan.balances.rainbowFullCrystals = 2; plan.balances.goldFullCrystals = 1;
    plan.targets = [{ id: 'odds', eventId: 'odds', title: 'Rate-up goals', bannerKind: 'support', bannerEnd: '2026-01-02', pullTiming: 'end', plannedPulls: 200, desiredCopies: 3, pickupGoals: [{ pickupId: 30028, desiredCopies: 3 }, { pickupId: 20066, desiredCopies: 3 }], useTickets: false, allowPaidJewels: false, rainbowCrystalsPlanned: 2, goldCrystalsPlanned: 1 }];
    const gacha = { event_id: 'odds', gacha_id: 1, banner_kind: 'support' as const, start_date: '2026-01-01', end_date: '2026-01-02', spark_pulls: 0, pickups: [{ pickup_id: 30028, rate: .0075 }, { pickup_id: 20066, rate: .0225 }] };
    const bundle = { core: {}, income: { rules: [] }, rewards: { rewards: [] }, gachas: [gacha], supportCardRarities: { '30028': 3, '20066': 2 } };
    const result = projectPlan(plan, bundle).targets[0]!;
    expect(result).toMatchObject({ rainbowCrystalsUsed: 2, goldCrystalsUsed: 1, sparkCopies: 0, ratesAvailable: true, jointProbabilityExact: true });
    expect(result.pickupGoals).toMatchObject([{ pickupId: 30028, desiredCopies: 3, copiesNeededFromPulls: 1, crystalCopiesApplied: 2, crystalKind: 'rainbow', pickupRate: .0075 }, { pickupId: 20066, desiredCopies: 3, copiesNeededFromPulls: 2, crystalCopiesApplied: 1, crystalKind: 'gold', pickupRate: .0225 }]);
    expect(result.pickupGoals[0]!.probability).toBeCloseTo(1 - .9925 ** 200, 10);
    expect(result.pickupProbability).toBeLessThan(result.pickupGoals[0]!.probability!);
    for (const rate of [Number.NaN, -1, 101]) {
      gacha.pickups[1]!.rate = rate;
      const missing = projectPlan(plan, bundle).targets[0]!;
      expect(missing).toMatchObject({ ratesAvailable: false, jointProbabilityExact: false });
      expect(missing.pickupProbability).toBeUndefined(); expect(missing.pickupGoals[1]!.probability).toBeUndefined();
      expect(missing.pickupGoals[0]!.probability).toBe(result.pickupGoals[0]!.probability);
    }
    gacha.pickups[1]!.rate = 0;
    expect(projectPlan(plan, bundle).targets[0]).toMatchObject({ ratesAvailable: true, pickupProbability: 0 });
    plan.targets[0]!.rainbowCrystalsPlanned = 0; plan.targets[0]!.goldCrystalsPlanned = 0;
    plan.targets[0]!.pickupGoals = Array.from({ length: 13 }, (_, index) => ({ pickupId: 30001 + index, desiredCopies: 5 }));
    gacha.pickups = plan.targets[0]!.pickupGoals.map(goal => ({ pickup_id: goal.pickupId, rate: .001 }));
    const tooLarge = projectPlan(plan, bundle).targets[0]!;
    expect(tooLarge).toMatchObject({ ratesAvailable: true, jointProbabilityExact: false });
    expect(tooLarge.pickupProbability).toBeUndefined(); expect(tooLarge.pickupGoals[0]!.probability).toBeGreaterThan(0);
  });
  it('validates imports atomically and preserves non-conflicting IDs with bounded, unique plan names', () => {
    const plan = createPlan('A'.repeat(80));
    const collection = { version: 1 as const, activePlanId: plan.id, plans: [plan] };
    for (const [input, message] of [['{', 'not valid JSON'], ['null', 'invalid shape'], ['[]', 'invalid shape'], ['{"plans":[null,[],1]}', 'no usable plans'], [' '.repeat(2_000_001), 'too large']]) expect(() => importPlanCollection(input!, collection)).toThrow(message);
    const next = importPlanCollection(JSON.stringify({ plans: [plan, { ...plan, id: 'existing-export-id' }] }), collection);
    expect(collection.plans).toEqual([plan]);
    expect(next.plans.map(item => item.name)).toEqual([plan.name, `${'A'.repeat(78)} 2`, `${'A'.repeat(78)} 3`]);
    expect(next.plans[1]!.id).not.toBe(plan.id);
    expect(next.activePlanId).toBe('existing-export-id');
    const limited = importPlanCollection(JSON.stringify({ plans: Array.from({ length: 60 }, (_, index) => ({ ...plan, id: `export-${index}`, name: `Export ${index}` })) }), collection);
    expect(limited.plans).toHaveLength(50);
    expect(limited.plans.some(item => item.id === limited.activePlanId)).toBe(true);
  });
  it('retains disabled target settings, persisted identity and optional metadata when re-enabled', () => {
    const plan = createPlan(); plan.projectionStartDate = '2026-01-01';
    const event = { id: 'banner', title: 'Banner', eventType: 'character_banner', date: new Date('2026-01-02'), pickupCardIds: [1001], gachaId: 7, gachaIds: [7], image: '/banner.webp' };
    const original = setTimelineEvent({ version: 1, activePlanId: plan.id, plans: [plan] }, event, true);
    Object.assign(activePlan(original).targets[0]!, { plannedPulls: 330, useTickets: false, allowPaidJewels: true, pullTiming: 'custom', customPullDate: '2026-01-03', desiredCopies: 2, rainbowCrystalsPlanned: 2, goldCrystalsPlanned: 1, pickupGoals: [{ pickupId: 1001, desiredCopies: 2 }, { pickupId: 1002, desiredCopies: 1 }] });
    const configured = structuredClone(activePlan(original).targets[0]);
    const disabled = setTimelineEvent(original, event, false);
    expect(activePlan(original).disabledEventIds).toEqual([]);
    expect(activePlan(disabled).targets).toEqual([configured]);
    expect(projectPlan(activePlan(disabled)).targets).toEqual([]);
    let stored = '';
    savePlanCollection(disabled, { setItem: (_, value) => stored = value });
    expect(JSON.parse(stored).plans[0].targets[0].bannerStart).toBeUndefined();
    expect(JSON.parse(stored).plans[0].targets[0].bannerEnd).toBeUndefined();
    expect(JSON.parse(stored).plans[0].targets[0].customPullDate).toBe('2026-01-03');
    const restored = setTimelineEvent(loadPlanCollection({ getItem: () => stored }), { ...event, image: undefined, gachaId: undefined, gachaIds: [], pickupCardIds: [9999] }, true);
    expect(activePlan(restored).disabledEventIds).toEqual([]);
    expect(activePlan(restored).targets).toEqual([configured]);
    expect(projectPlan(activePlan(restored)).plannedPulls).toBe(330);
  });
  it('re-enables only the event’s usable rewards and automatic variants without replacing unrelated choices', () => {
    const plan = createPlan();
    const reward = { event_id: 'story', label: 'Reward', available_at: '2026-01-02', currency: 'free_jewels' as const, amount: 150 };
    const resources: PlannerRewardResource = {
      rewards: [
        { ...reward, id: 'automatic', default_enabled: true },
        { ...reward, id: 'optional', default_enabled: false },
        { ...reward, id: 'selector', amount: 0, default_enabled: false, source_items: [{ item_category: 41, item_id: 1, amount: 1 }] },
        { ...reward, id: 'crystal', amount: 0, source_items: [{ item_category: 164, item_id: 144, amount: 1 }] },
        { ...reward, id: 'empty', amount: 0 },
        { ...reward, id: 'unrelated', event_id: 'other' }
      ],
      competitive_variants: [true, false].map(automatic => ({ id: automatic ? 'missions' : 'placement', event_id: 'story', competition: 'legend_race', label: 'Variant', default_enabled: automatic, source_items: [{ item_category: 90, item_id: 43, amount: 300 }] }))
    };
    plan.disabledRewardIds = [...resources.rewards.map(item => item.id), 'missions', 'placement'];
    plan.enabledRewardIds = ['automatic', 'missions', 'placement', 'unrelated'];
    plan.enabledRewardEventIds = ['other'];
    const event = { id: 'story', title: 'Story', eventType: 'story_event', plannerRewardAvailable: true };
    const original = { version: 1 as const, activePlanId: plan.id, plans: [plan] };
    const disabled = setTimelineEvent(original, event, false, resources);
    expect(activePlan(disabled).disabledRewardIds).toEqual(plan.disabledRewardIds);
    const result = activePlan(setTimelineEvent(disabled, event, true, resources));
    expect(result.targets).toEqual([]);
    expect(result.enabledRewardEventIds).toEqual(['other', 'story']);
    expect(result.disabledRewardIds).toEqual(['empty', 'unrelated', 'placement']);
    expect(result.enabledRewardIds).toEqual(['placement', 'unrelated', 'optional', 'selector']);
    expect(plan.enabledRewardIds).toEqual(['automatic', 'missions', 'placement', 'unrelated']);
  });
  it('uses the Angular storage key and sanitizes persisted collections', () => { const plan = createPlan('Parity'); const values = new Map<string, string>(); savePlanCollection({ version: 1, activePlanId: plan.id, plans: [plan] }, { setItem: (key, value) => values.set(key, value) }); expect(values.has(CARAT_PLANNER_STORAGE_KEY)).toBe(true); expect(loadPlanCollection({ getItem: (key) => values.get(key) ?? null }).plans[0]?.name).toBe('Parity'); });
  it('funds tickets before free and paid Carats', () => { const plan = createPlan(); plan.balances = { ...plan.balances, freeJewels: 1500, paidJewels: 1500, umaTickets: 5 }; plan.targets = [{ id: 't', eventId: 'e', title: 'Banner', bannerKind: 'character', pullTiming: 'end', plannedPulls: 20, desiredCopies: 1, useTickets: true, allowPaidJewels: true }]; const result = projectPlan(plan); expect(result.targets[0]).toMatchObject({ ticketPulls: 5, freeJewelPulls: 10, paidJewelPulls: 5, shortfallJewels: 0 }); });
  it('counts spark exchange copies before random pickup copies', () => { expect(probabilityAtLeast(200, 1)).toBe(1); expect(probabilityAtLeast(100, 1)).toBeGreaterThan(.5); });
  it('projects enabled recurring income, custom income, and default event rewards before a target', () => {
    const plan = createPlan(); plan.projectionStartDate = '2026-01-01'; plan.enabledIncomeRuleIds = ['daily']; plan.customIncome = [{ id: 'weekly', label: 'Weekly', currency: 'uma_ticket', amount: 1, cadence: 'weekly', startDate: '2026-01-01' }]; plan.targets = [{ id: 't', eventId: 'e', title: 'Banner', bannerKind: 'character', bannerStart: '2026-01-08', bannerEnd: '2026-01-08', pullTiming: 'end', plannedPulls: 10, desiredCopies: 1, useTickets: true, allowPaidJewels: false }];
    const result = projectPlan(plan, { core: { jewel_cost_per_pull: 150 }, income: { rules: [{ id: 'daily', label: 'Daily', currency: 'free_jewels', amount: 100, cadence: 'daily', start_date: '2026-01-01' }] }, rewards: { rewards: [{ id: 'gift', label: 'Gift', currency: 'free_jewels', amount: 550, available_at: '2026-01-05', default_enabled: true }] } });
    expect(result.targets[0]).toMatchObject({ ticketPulls: 2, freeJewelPulls: 8, shortfallJewels: 0 });
    expect(result.targets[0]?.balanceBefore).toMatchObject({ umaTickets: 2, freeJewels: 1350 });
    expect(result.balances.freeJewels).toBe(150);
  });
  it('clamps Angular monthly income to the real month end while preserving the recurrence anchor', () => {
    const plan = createPlan(); plan.projectionStartDate = '2026-01-30'; plan.enabledIncomeRuleIds = ['month-end']; plan.targets = [{ id: 't', eventId: 'e', title: 'Banner', bannerKind: 'character', bannerEnd: '2026-02-28', pullTiming: 'end', plannedPulls: 2, desiredCopies: 1, useTickets: false, allowPaidJewels: false }];
    const result = projectPlan(plan, { core: {}, income: { rules: [{ id: 'month-end', label: 'Month end', currency: 'free_jewels', amount: 150, cadence: 'monthly', start_date: '2026-01-31', day_of_month: 31 }] }, rewards: { rewards: [] } });
    expect(result.targets[0]).toMatchObject({ freeJewelPulls: 2, shortfallJewels: 0 });
  });
  it('uses protected banner cost, campaign free pulls, published rate, and spark threshold', () => {
    const plan = createPlan(); plan.projectionStartDate = '2026-01-01'; plan.balances.freeJewels = 200; plan.targets = [{ id: 't', eventId: 'event', gachaId: 7, title: 'Banner', bannerKind: 'character', bannerEnd: '2026-01-02', pullTiming: 'end', plannedPulls: 103, desiredCopies: 2, pickupId: 1001, pickupGoals: [{ pickupId: 1001, desiredCopies: 2 }], useTickets: true, allowPaidJewels: false }];
    const result = projectPlan(plan, { core: { jewel_cost_per_pull: 150, default_spark_pulls: 200 }, income: { rules: [] }, rewards: { rewards: [], free_pull_campaigns: [{ id: 'free', label: 'Free campaign', total_pulls: 100, default_allocations: [{ event_id: 'event', gacha_id: 7, pulls: 100 }] }] }, gachas: [{ event_id: 'event', gacha_id: 7, banner_kind: 'character', start_date: '2026-01-01', end_date: '2026-01-02', jewel_cost_per_pull: 100, spark_pulls: 100, pickups: [{ pickup_id: 1001, rate: .01 }] }] });
    expect(result.targets[0]).toMatchObject({ freePullsUsed: 100, freeJewelPulls: 2, fundedPulls: 102, shortfallJewels: 100, sparkCopies: 1 });
    expect(result.targets[0]?.pickupProbability).toBeGreaterThan(.63);
  });
  it('counts end-dated event rewards from the event start when the plan begins inside the claim window', () => {
    const plan = createPlan(); plan.projectionStartDate = '2026-01-05'; plan.targets = [{ id: 't', eventId: 'banner', title: 'Banner', bannerKind: 'character', bannerEnd: '2026-01-06', pullTiming: 'end', plannedPulls: 1, desiredCopies: 1, useTickets: false, allowPaidJewels: false }];
    const event = { id: 'story', date: new Date('2026-01-01T00:00:00Z'), estimatedEndDate: new Date('2026-01-10T00:00:00Z') } as TimelineRecord;
    const result = projectPlan(plan, { core: {}, income: { rules: [] }, rewards: { rewards: [{ id: 'story-gift', label: 'Story reward', event_id: 'story', currency: 'free_jewels', amount: 150, available_at: '2026-01-10', default_enabled: true }] }, timelineEvents: [event] });
    expect(result.targets[0]).toMatchObject({ fundedPulls: 1, shortfallJewels: 0 });
  });
  it('uses the shared support catalog rarity for Uncap Crystal eligibility', () => {
    const resultFor=(pickupId:number,rarity?:number)=>{const plan=createPlan();plan.projectionStartDate='2026-01-01';plan.balances.rainbowFullCrystals=2;plan.balances.goldFullCrystals=2;plan.targets=[{id:'t',eventId:'support',title:'Support',bannerKind:'support',bannerEnd:'2026-01-02',pullTiming:'end',plannedPulls:0,desiredCopies:2,pickupId,pickupGoals:[{pickupId,desiredCopies:2}],useTickets:false,allowPaidJewels:false,rainbowCrystalsPlanned:1,goldCrystalsPlanned:1}];return projectPlan(plan,{core:{},income:{rules:[]},rewards:{rewards:[]},supportCardRarities:rarity===undefined?{}:{[String(pickupId)]:rarity}}).targets[0]!;};
    expect(resultFor(20001,2)).toMatchObject({rainbowCrystalsUsed:0,goldCrystalsUsed:1});
    expect(resultFor(10001,1)).toMatchObject({rainbowCrystalsUsed:0,goldCrystalsUsed:0});
    expect(resultFor(99999)).toMatchObject({rainbowCrystalsUsed:1,goldCrystalsUsed:0});
  });
  it('uses a published reward collection window even without a matching timeline event', () => {
    const plan = createPlan(); plan.projectionStartDate = '2026-01-05';
    plan.targets = [{ id: 't', eventId: 'banner', title: 'Banner', bannerKind: 'character', bannerEnd: '2026-01-06', pullTiming: 'end', plannedPulls: 1, desiredCopies: 1, useTickets: false, allowPaidJewels: false }];
    const resources = { core: {}, income: { rules: [] }, rewards: { rewards: [{ id: 'gift', label: 'Gift', currency: 'free_jewels' as const, amount: 150, available_at: '2026-01-01', available_until: '2026-01-10', default_enabled: true }] } };
    expect(projectPlan(plan, resources).targets[0]).toMatchObject({ fundedPulls: 1, shortfallJewels: 0 });
    plan.projectionStartDate = '2026-01-11';
    plan.targets[0]!.bannerEnd = '2026-01-12';
    expect(projectPlan(plan, resources).targets[0]?.fundedPulls).toBe(0);
  });
});
