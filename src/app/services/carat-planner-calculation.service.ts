import { Injectable } from '@angular/core';
import {
  CaratPlan,
  CaratPlanProjection,
  CaratPlannerDataBundle,
  CaratPlannerTimelineEvent,
  FREE_PULL_CAMPAIGN_EXCLUDED_SELECTION,
  PickupOddsResult,
  PlannerBalances,
  PlannerCurrency,
  PlannerGachaEntry,
  PlannerIncomeRule,
  PlannerLedgerEntry,
  PlannerPickupGoal,
  PlannerTarget,
  PlannerTargetProjection,
} from '../models/carat-planner.model';
import {
  isProjectableCompetitiveVariant,
  plannerSourceItemTotals,
} from '../utils/planner-reward-currencies';
import { timelineEventMasterId } from '../utils/timeline-event-image';
import { CaratPullProbabilityService } from './carat-pull-probability.service';

const DAY_MS = 86_400_000;

interface ProjectionCacheEntry {
  baseKey: string;
  finalDate: string;
  ledger: PlannerLedgerEntry[];
  targetKeys: string[];
  projection: CaratPlanProjection;
}

interface ResolvedFreePullCampaigns {
  managedTargetIds: Set<string>;
  pullsByTargetId: Map<string, number>;
}

@Injectable({ providedIn: 'root' })
export class CaratPlannerCalculationService {
  private readonly oddsCache = new Map<string, PickupOddsResult>();
  private readonly projectionCache = new Map<string, ProjectionCacheEntry>();
  private readonly objectTokens = new WeakMap<object, number>();
  private nextObjectToken = 1;
  private readonly pullProbability = new CaratPullProbabilityService();

  project(
    plan: CaratPlan,
    data: CaratPlannerDataBundle,
    gachas: readonly PlannerGachaEntry[] = [],
    events: readonly CaratPlannerTimelineEvent[] = [],
  ): CaratPlanProjection {
    const orderedTargets = plan.targets
      .filter(target => !(plan.disabledEventIds ?? []).includes(target.eventId))
      .filter(target => !this.isTargetBeforeProjectionStart(plan, target))
      .sort((a, b) => this.resolvePullDate(a).localeCompare(this.resolvePullDate(b)) || a.id.localeCompare(b.id));
    const campaignFreePulls = this.resolveFreePullCampaigns(plan, data, orderedTargets);
    const baseKey = this.projectionBaseKey(plan, data, gachas, events);
    const targetKeys = orderedTargets.map(target => this.targetKey(target));
    const cached = this.projectionCache.get(plan.id);
    let reusableTargets = 0;

    if (cached?.baseKey === baseKey) {
      const sharedLength = Math.min(cached.targetKeys.length, targetKeys.length);
      while (reusableTargets < sharedLength && cached.targetKeys[reusableTargets] === targetKeys[reusableTargets]) {
        reusableTargets++;
      }
      if (reusableTargets === targetKeys.length && reusableTargets === cached.targetKeys.length) {
        return cached.projection;
      }
    }

    const finalDate = orderedTargets.length > 0
      ? this.resolvePullDate(orderedTargets[orderedTargets.length - 1])
      : plan.projectionStartDate;
    const ledger = cached?.baseKey === baseKey && cached.finalDate === finalDate
      ? cached.ledger
      : this.buildLedger(plan, data, finalDate, events);
    const balances = reusableTargets > 0 && cached
      ? this.copyBalances(cached.projection.targets[reusableTargets - 1].balanceAfter)
      : this.copyBalances(plan.balances);
    const projections: PlannerTargetProjection[] = reusableTargets > 0 && cached
      ? cached.projection.targets.slice(0, reusableTargets)
      : [];
    let rewardCaratsGained = reusableTargets > 0 && cached
      ? cached.projection.targets[reusableTargets - 1].rewardCaratsGained ?? 0
      : 0;
    let ledgerIndex = 0;

    if (reusableTargets > 0) {
      const lastReusedDate = projections[reusableTargets - 1].pullDate;
      while (ledgerIndex < ledger.length && ledger[ledgerIndex].date <= lastReusedDate) {
        ledgerIndex++;
      }
    }

    for (let targetIndex = reusableTargets; targetIndex < orderedTargets.length; targetIndex++) {
      const target = orderedTargets[targetIndex];
      const pullDate = this.resolvePullDate(target);
      const income: PlannerLedgerEntry[] = [];
      while (ledgerIndex < ledger.length && ledger[ledgerIndex].date <= pullDate) {
        const entry = ledger[ledgerIndex++];
        this.addCurrency(balances, entry.currency, entry.amount);
        income.push(entry);
        if (entry.source === 'reward'
          && (entry.currency === 'free_jewels' || entry.currency === 'paid_jewels')) {
          rewardCaratsGained += entry.amount;
        }
      }

      const gacha = this.findGacha(target, gachas);
      const freePullsAvailable = campaignFreePulls.managedTargetIds.has(target.id)
        ? campaignFreePulls.pullsByTargetId.get(target.id) ?? 0
        : this.nonNegativeInt(gacha?.free_pulls);
      projections.push(this.projectTarget(
        target,
        pullDate,
        balances,
        income,
        data,
        freePullsAvailable,
        rewardCaratsGained,
        gacha,
      ));
    }

    const projection: CaratPlanProjection = {
      planId: plan.id,
      targets: projections,
      finalBalances: this.copyBalances(balances),
      unallocatedIncome: ledger.slice(ledgerIndex),
    };
    this.projectionCache.set(plan.id, { baseKey, finalDate, ledger, targetKeys, projection });
    return projection;
  }

  buildLedger(
    plan: CaratPlan,
    data: CaratPlannerDataBundle,
    throughDate: string,
    events: readonly CaratPlannerTimelineEvent[] = [],
  ): PlannerLedgerEntry[] {
    const startDate = this.toDateKey(plan.projectionStartDate);
    const endDate = this.toDateKey(throughDate);
    if (!startDate || !endDate || endDate < startDate) {
      return [];
    }

    const enabledRules = new Set(plan.enabledIncomeRuleIds);
    const enabledRewards = new Set(plan.enabledRewardIds);
    const disabledEvents = new Set(plan.disabledEventIds ?? []);
    const ledger: PlannerLedgerEntry[] = [];

    for (const rule of data.income.rules ?? []) {
      if (!enabledRules.has(rule.id) || !this.isSelectedScenario(rule, plan.scenarioSelections)) {
        continue;
      }
      ledger.push(...this.expandRule(rule, startDate, endDate));
    }

    for (const reward of data.rewards.rewards ?? []) {
      if (!enabledRewards.has(reward.id)
        || (reward.event_id ? disabledEvents.has(reward.event_id) : false)) continue;
      const date = this.toDateKey(reward.available_at);
      if (!date || date < startDate || date > endDate) {
        continue;
      }
      const hasTopLevelAmount = Number.isFinite(reward.amount) && (reward.amount ?? 0) !== 0;
      if (hasTopLevelAmount) {
        ledger.push({
          id: `reward:${reward.id}`,
          label: reward.label,
          date,
          currency: reward.currency,
          amount: Math.trunc(reward.amount ?? 0),
          source: 'reward',
        });
      }

      for (const [currency, amount] of plannerSourceItemTotals(reward.source_items ?? [])) {
        if (hasTopLevelAmount && reward.currency === currency) continue;
        if (amount === 0) continue;
        ledger.push({
          id: `reward:${reward.id}:${currency}`,
          label: reward.label,
          date,
          currency,
          amount,
          source: 'reward',
        });
      }
    }

    for (const variant of data.rewards.competitive_variants ?? []) {
      if (!enabledRewards.has(variant.id)
        || disabledEvents.has(variant.event_id)
        || !isProjectableCompetitiveVariant(variant)) continue;
      const date = this.competitiveVariantDate(variant, events);
      if (!date || date < startDate || date > endDate) continue;
      for (const [currency, amount] of plannerSourceItemTotals(variant.source_items ?? [])) {
        if (amount <= 0) continue;
        ledger.push({
          id: `competitive:${variant.id}:${currency}`,
          label: variant.label,
          date,
          currency,
          amount,
          source: 'reward',
        });
      }
    }

    for (const custom of plan.customIncome) {
      const rule: PlannerIncomeRule = {
        id: custom.id,
        label: custom.label,
        currency: custom.currency,
        amount: custom.amount,
        cadence: custom.cadence,
        start_date: custom.startDate,
        end_date: custom.endDate,
        every: custom.every,
      };
      ledger.push(...this.expandRule(rule, startDate, endDate).map(entry => ({ ...entry, source: 'custom' as const })));
    }

    return ledger.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }

  calculateOdds(draws: number, requestedCopies: number, pickupRate?: number, sparkPulls?: number): PickupOddsResult {
    const normalizedDraws = this.nonNegativeInt(draws);
    const normalizedCopies = Math.max(1, this.nonNegativeInt(requestedCopies));
    const threshold = this.nonNegativeInt(sparkPulls);
    const exchangeCopies = threshold > 0 ? Math.floor(normalizedDraws / threshold) : 0;
    const randomCopiesNeeded = Math.max(0, normalizedCopies - exchangeCopies);
    const rate = this.normalizeRate(pickupRate);
    const cacheKey = `${normalizedDraws}:${normalizedCopies}:${rate ?? 'none'}:${threshold}`;
    const cached = this.oddsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const result: PickupOddsResult = {
      draws: normalizedDraws,
      requestedCopies: normalizedCopies,
      exchangeCopies,
      randomCopiesNeeded,
      pickupRate: rate,
      probability: rate === undefined ? undefined : this.binomialTail(normalizedDraws, randomCopiesNeeded, rate),
    };
    this.oddsCache.set(cacheKey, result);
    return result;
  }

  calculateTargetOdds(
    draws: number,
    target: PlannerTarget,
    gacha?: PlannerGachaEntry,
    sparkPulls?: number,
  ): PickupOddsResult {
    const normalizedDraws = this.nonNegativeInt(draws);
    const goals = this.targetPickupGoals(target, gacha);
    const threshold = this.nonNegativeInt(sparkPulls);
    const sparkCopiesAvailable = threshold > 0
      ? Math.floor(normalizedDraws / threshold)
      : 0;
    const goalOdds = goals.map(goal => {
      const pickup = gacha?.pickups?.find(item => item.pickup_id === goal.pickupId);
      const odds = this.calculateOdds(
        normalizedDraws,
        goal.desiredCopies,
        pickup?.rate,
        pickup?.exchangeable === false ? undefined : threshold,
      );
      return {
        pickupId: goal.pickupId,
        requestedCopies: goal.desiredCopies,
        exchangeable: pickup?.exchangeable !== false,
        exchangeCopiesAvailable: odds.exchangeCopies,
        randomCopiesNeeded: odds.randomCopiesNeeded,
        pickupRate: odds.pickupRate,
        probability: odds.probability,
      };
    });
    const firstGoal = goals[0];
    const firstGoalOdds = goalOdds[0];
    const firstOdds = firstGoalOdds
      ?? this.calculateOdds(normalizedDraws, target.desiredCopies, undefined, undefined);
    const allRatesAvailable = goals.length > 0 && goalOdds.every(goal => goal.pickupRate !== undefined);
    const joint = allRatesAvailable
      ? this.pullProbability.calculateGoals(
        normalizedDraws,
        goalOdds.map(goal => ({
          pickupId: goal.pickupId,
          rate: goal.pickupRate!,
          requestedCopies: goal.requestedCopies,
          exchangeable: goal.exchangeable,
        })),
        threshold,
      )
      : undefined;

    return {
      draws: normalizedDraws,
      requestedCopies: firstGoal?.desiredCopies ?? firstOdds.requestedCopies,
      exchangeCopies: firstGoalOdds?.exchangeCopiesAvailable ?? 0,
      randomCopiesNeeded: firstOdds.randomCopiesNeeded,
      pickupRate: firstOdds.pickupRate,
      probability: joint?.jointProbabilityExact ? joint.jointProbability : goals.length <= 1 ? firstOdds.probability : undefined,
      goalOdds,
      jointProbability: joint?.jointProbability,
      jointProbabilityExact: joint?.jointProbabilityExact ?? false,
      sparkCopiesAvailable,
    };
  }

  resolvePullDate(target: PlannerTarget): string {
    const fallback = this.toDateKey(target.bannerStart) || this.todayKey();
    if (target.pullTiming === 'custom') {
      return this.toDateKey(target.customPullDate) || fallback;
    }
    if (target.pullTiming === 'end') {
      return this.toDateKey(target.bannerEnd) || fallback;
    }
    return fallback;
  }

  isTargetBeforeProjectionStart(
    plan: Pick<CaratPlan, 'projectionStartDate'>,
    target: PlannerTarget,
  ): boolean {
    const projectionStart = this.toDateKey(plan.projectionStartDate);
    return Boolean(projectionStart && this.resolvePullDate(target) < projectionStart);
  }

  private projectTarget(
    target: PlannerTarget,
    pullDate: string,
    balances: PlannerBalances,
    income: PlannerLedgerEntry[],
    data: CaratPlannerDataBundle,
    freePullsAvailable: number,
    rewardCaratsGained: number,
    gacha?: PlannerGachaEntry,
  ): PlannerTargetProjection {
    const balanceBefore = this.copyBalances(balances);
    const plannedPulls = this.nonNegativeInt(target.plannedPulls);
    const normalizedFreePulls = this.nonNegativeInt(freePullsAvailable);
    const freePullsUsed = Math.min(plannedPulls, normalizedFreePulls);
    let remainingPulls = plannedPulls - freePullsUsed;
    const ticketCurrency = gacha?.ticket_currency ?? this.ticketCurrencyFor(target.bannerKind);
    const ticketBalance = ticketCurrency ? this.getCurrency(balances, ticketCurrency) : 0;
    const ticketLimit = target.ticketLimit === undefined
      ? ticketBalance
      : Math.min(ticketBalance, this.nonNegativeInt(target.ticketLimit));
    const ticketPullsUsed = target.useTickets && ticketCurrency
      ? Math.min(remainingPulls, ticketLimit)
      : 0;
    if (ticketCurrency && ticketPullsUsed > 0) {
      this.addCurrency(balances, ticketCurrency, -ticketPullsUsed);
    }
    remainingPulls -= ticketPullsUsed;

    const jewelCost = Math.max(1, this.nonNegativeInt(gacha?.jewel_cost_per_pull ?? data.core.jewel_cost_per_pull ?? 150));
    const freeJewelPulls = Math.min(remainingPulls, Math.floor(balances.freeJewels / jewelCost));
    balances.freeJewels -= freeJewelPulls * jewelCost;
    remainingPulls -= freeJewelPulls;

    const paidJewelPulls = target.allowPaidJewels
      ? Math.min(remainingPulls, Math.floor(balances.paidJewels / jewelCost))
      : 0;
    balances.paidJewels -= paidJewelPulls * jewelCost;
    remainingPulls -= paidJewelPulls;

    const fundedPulls = plannedPulls - remainingPulls;
    const sparkPulls = gacha?.spark_pulls ?? data.core.default_spark_pulls;
    const rainbowCrystalsUsed = target.bannerKind === 'support'
      ? Math.min(balances.rainbowCrystals, this.nonNegativeInt(target.rainbowCrystalsPlanned))
      : 0;
    const goldCrystalsUsed = target.bannerKind === 'support'
      ? Math.min(balances.goldCrystals, this.nonNegativeInt(target.goldCrystalsPlanned))
      : 0;
    balances.rainbowCrystals -= rainbowCrystalsUsed;
    balances.goldCrystals -= goldCrystalsUsed;

    return {
      targetId: target.id,
      pullDate,
      balanceBefore,
      balanceAfter: this.copyBalances(balances),
      income,
      rewardCaratsGained,
      plannedPulls,
      fundedPulls,
      freePullsAvailable: normalizedFreePulls,
      freePullsUsed,
      ticketPullsUsed,
      freeJewelPulls,
      paidJewelPulls,
      rainbowCrystalsUsed,
      goldCrystalsUsed,
      unfilledPulls: remainingPulls,
      jewelCost,
      shortfallJewels: remainingPulls * jewelCost,
      odds: this.calculateTargetOdds(fundedPulls, target, gacha, sparkPulls),
    };
  }

  private expandRule(rule: PlannerIncomeRule, rangeStart: string, rangeEnd: string): PlannerLedgerEntry[] {
    const ruleStart = this.toUtcDate(rule.start_date);
    const start = this.toUtcDate(rangeStart);
    const end = this.toUtcDate(rangeEnd);
    if (!ruleStart || !start || !end || !Number.isFinite(rule.amount) || rule.amount === 0) {
      return [];
    }

    const explicitEnd = this.toUtcDate(rule.end_date);
    const effectiveEnd = explicitEnd && explicitEnd < end ? explicitEnd : end;
    if (effectiveEnd < start) {
      return [];
    }

    const every = Math.max(1, this.nonNegativeInt(rule.every) || 1);
    const entries: PlannerLedgerEntry[] = [];
    const push = (date: Date, occurrence: number) => {
      if (date >= start && date <= effectiveEnd && date >= ruleStart) {
        entries.push({
          id: `${rule.id}:${occurrence}:${this.dateKey(date)}`,
          label: rule.label,
          date: this.dateKey(date),
          currency: rule.currency,
          amount: Math.trunc(rule.amount),
          source: 'rule',
        });
      }
    };

    if (rule.cadence === 'once') {
      push(ruleStart, 0);
      return entries;
    }

    if (rule.cadence === 'monthly') {
      const requestedDay = Math.min(31, Math.max(1, this.nonNegativeInt(rule.day_of_month) || ruleStart.getUTCDate()));
      let cursor = new Date(Date.UTC(ruleStart.getUTCFullYear(), ruleStart.getUTCMonth(), 1));
      let occurrence = 0;
      while (cursor <= effectiveEnd && occurrence < 2400) {
        const daysInMonth = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
        push(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), Math.min(requestedDay, daysInMonth))), occurrence);
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + every, 1));
        occurrence++;
      }
      return entries;
    }

    let stepDays = every;
    let cursor = new Date(ruleStart);
    if (rule.cadence === 'weekly') {
      stepDays *= 7;
      if (Number.isFinite(rule.weekday)) {
        const weekday = Math.min(6, Math.max(0, this.nonNegativeInt(rule.weekday)));
        cursor = new Date(cursor.getTime() + ((weekday - cursor.getUTCDay() + 7) % 7) * DAY_MS);
      }
    }
    let occurrence = 0;
    while (cursor <= effectiveEnd && occurrence < 10000) {
      push(cursor, occurrence);
      cursor = new Date(cursor.getTime() + stepDays * DAY_MS);
      occurrence++;
    }
    return entries;
  }

  private isSelectedScenario(rule: PlannerIncomeRule, selections: Record<string, string>): boolean {
    if (!rule.scenario_group) {
      return true;
    }
    return selections[rule.scenario_group] === rule.scenario_option;
  }

  private findGacha(target: PlannerTarget, gachas: readonly PlannerGachaEntry[]): PlannerGachaEntry | undefined {
    const ids = new Set<number>([
      ...(target.gachaId === undefined ? [] : [target.gachaId]),
      ...(target.gachaIds ?? []),
    ]);
    return gachas.find(gacha => !!gacha.event_id && gacha.event_id === target.eventId)
      ?? gachas.find(gacha => ids.has(gacha.gacha_id));
  }

  private projectionBaseKey(
    plan: CaratPlan,
    data: CaratPlannerDataBundle,
    gachas: readonly PlannerGachaEntry[],
    events: readonly CaratPlannerTimelineEvent[],
  ): string {
    const customIncome = [...plan.customIncome]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(item => ({
        id: item.id,
        label: item.label,
        currency: item.currency,
        amount: item.amount,
        cadence: item.cadence,
        startDate: item.startDate,
        endDate: item.endDate,
        every: item.every,
      }));
    const scenarios = Object.entries(plan.scenarioSelections).sort(([left], [right]) => left.localeCompare(right));
    const freePullCampaignSelections = Object.entries(plan.freePullCampaignSelections ?? {})
      .sort(([left], [right]) => left.localeCompare(right));
    const gachaTokens = gachas.map(gacha => this.objectToken(gacha)).sort((a, b) => a - b);
    return JSON.stringify({
      projectionStartDate: plan.projectionStartDate,
      balances: plan.balances,
      enabledIncomeRuleIds: [...new Set(plan.enabledIncomeRuleIds)].sort(),
      enabledRewardIds: [...new Set(plan.enabledRewardIds)].sort(),
      disabledRewardIds: [...new Set(plan.disabledRewardIds ?? [])].sort(),
      disabledEventIds: [...new Set(plan.disabledEventIds ?? [])].sort(),
      scenarios,
      freePullCampaignSelections,
      customIncome,
      dataToken: this.objectToken(data),
      gachaTokens,
      eventsToken: events.length > 0 ? this.objectToken(events) : 0,
    });
  }

  private competitiveVariantDate(
    variant: { event_id: string; master_event_id: number; competition: string; available_at?: string },
    events: readonly CaratPlannerTimelineEvent[],
  ): string {
    const explicit = this.toDateKey(variant.available_at);
    if (explicit) return explicit;
    const event = events.find(item => item.id === variant.event_id)
      ?? events.find(item => item.type === variant.competition
        && timelineEventMasterId(item.id) === variant.master_event_id);
    return this.toDateKey(event?.globalReleaseDate ?? event?.estimatedGlobalDate ?? event?.jpReleaseDate);
  }

  private resolveFreePullCampaigns(
    plan: CaratPlan,
    data: CaratPlannerDataBundle,
    orderedTargets: readonly PlannerTarget[],
  ): ResolvedFreePullCampaigns {
    const managedTargetIds = new Set<string>();
    const pullsByTargetId = new Map<string, number>();

    for (const campaign of data.rewards.free_pull_campaigns ?? []) {
      const totalPulls = this.nonNegativeInt(campaign.total_pulls);
      const defaultAllocations = (campaign.default_allocations ?? [])
        .filter(allocation => Boolean(allocation.event_id) && this.nonNegativeInt(allocation.pulls) > 0);
      if (!campaign.id || totalPulls === 0 || defaultAllocations.length === 0) continue;

      for (const target of orderedTargets) {
        if (defaultAllocations.some(allocation => this.targetMatchesFreePullAllocation(target, allocation))) {
          managedTargetIds.add(target.id);
        }
      }

      const supportsStock = campaign.stockable === true
        || campaign.allocation_mode === 'daily_with_one_time_stock';
      const selectedEventId = plan.freePullCampaignSelections?.[campaign.id];
      if (selectedEventId === FREE_PULL_CAMPAIGN_EXCLUDED_SELECTION) continue;
      const stockDestination = defaultAllocations[defaultAllocations.length - 1];
      const selectedAllocation = supportsStock && selectedEventId === stockDestination?.event_id
        ? stockDestination
        : undefined;
      const allocations = selectedAllocation
        ? [{ ...selectedAllocation, pulls: totalPulls }]
        : defaultAllocations;
      const claimedTargetIds = new Set<string>();
      let remaining = totalPulls;

      for (const allocation of allocations) {
        if (remaining <= 0) break;
        const allocatedPulls = Math.min(remaining, this.nonNegativeInt(allocation.pulls));
        remaining -= allocatedPulls;
        if (allocatedPulls === 0) continue;
        const target = orderedTargets.find(item =>
          !claimedTargetIds.has(item.id) && this.targetMatchesFreePullAllocation(item, allocation));
        if (!target) continue;
        claimedTargetIds.add(target.id);
        pullsByTargetId.set(target.id, (pullsByTargetId.get(target.id) ?? 0) + allocatedPulls);
      }
    }

    return { managedTargetIds, pullsByTargetId };
  }

  private targetMatchesFreePullAllocation(
    target: PlannerTarget,
    allocation: { event_id: string; gacha_id?: number },
  ): boolean {
    if (target.eventId === allocation.event_id) return true;
    if (allocation.gacha_id === undefined) return false;
    return target.gachaId === allocation.gacha_id || (target.gachaIds ?? []).includes(allocation.gacha_id);
  }

  private targetKey(target: PlannerTarget): string {
    return JSON.stringify({
      id: target.id,
      eventId: target.eventId,
      gachaId: target.gachaId,
      gachaIds: [...new Set(target.gachaIds ?? [])].sort((a, b) => a - b),
      bannerKind: target.bannerKind,
      bannerStart: target.bannerStart,
      bannerEnd: target.bannerEnd,
      pullTiming: target.pullTiming,
      customPullDate: target.customPullDate,
      plannedPulls: target.plannedPulls,
      desiredCopies: target.desiredCopies,
      pickupId: target.pickupId,
      pickupGoals: this.targetPickupGoals(target),
      useTickets: target.useTickets,
      ticketLimit: target.ticketLimit,
      allowPaidJewels: target.allowPaidJewels,
      rainbowCrystalsPlanned: target.rainbowCrystalsPlanned,
      goldCrystalsPlanned: target.goldCrystalsPlanned,
    });
  }

  private objectToken(value: object): number {
    const cached = this.objectTokens.get(value);
    if (cached !== undefined) {
      return cached;
    }
    const token = this.nextObjectToken++;
    this.objectTokens.set(value, token);
    return token;
  }

  private ticketCurrencyFor(kind: PlannerTarget['bannerKind']): Extract<PlannerCurrency, 'uma_ticket' | 'support_ticket'> | undefined {
    return kind === 'character' ? 'uma_ticket' : kind === 'support' ? 'support_ticket' : undefined;
  }

  private targetPickupGoals(target: PlannerTarget, gacha?: PlannerGachaEntry): PlannerPickupGoal[] {
    if (target.pickupGoals?.length) {
      return target.pickupGoals.map(goal => ({
        pickupId: this.nonNegativeInt(goal.pickupId),
        desiredCopies: Math.max(1, this.nonNegativeInt(goal.desiredCopies)),
      }));
    }
    if (target.pickupId !== undefined) {
      return [{
        pickupId: this.nonNegativeInt(target.pickupId),
        desiredCopies: Math.max(1, this.nonNegativeInt(target.desiredCopies)),
      }];
    }
    if (gacha?.pickups?.length) {
      return [{
        pickupId: gacha.pickups[0].pickup_id,
        desiredCopies: Math.max(1, this.nonNegativeInt(target.desiredCopies)),
      }];
    }
    return [];
  }

  private binomialTail(draws: number, successesNeeded: number, rate: number): number {
    if (successesNeeded <= 0) {
      return 1;
    }
    if (draws < successesNeeded || rate <= 0) {
      return 0;
    }
    if (rate >= 1) {
      return 1;
    }

    const logRate = Math.log(rate);
    const logMiss = Math.log1p(-rate);
    let logProbability = this.logCombination(draws, successesNeeded)
      + successesNeeded * logRate
      + (draws - successesNeeded) * logMiss;
    let largestLog = logProbability;
    let scaledTotal = 1;

    for (let successes = successesNeeded + 1; successes <= draws; successes++) {
      logProbability += Math.log(draws - successes + 1) - Math.log(successes) + logRate - logMiss;
      if (logProbability > largestLog) {
        scaledTotal = scaledTotal * Math.exp(largestLog - logProbability) + 1;
        largestLog = logProbability;
      } else {
        scaledTotal += Math.exp(logProbability - largestLog);
      }
    }
    const total = Math.exp(largestLog + Math.log(scaledTotal));
    return Math.max(0, Math.min(1, total));
  }

  private logCombination(n: number, k: number): number {
    const smaller = Math.min(k, n - k);
    let result = 0;
    for (let i = 1; i <= smaller; i++) {
      result += Math.log(n - smaller + i) - Math.log(i);
    }
    return result;
  }

  private normalizeRate(rate: number | undefined): number | undefined {
    if (!Number.isFinite(rate) || rate === undefined || rate < 0) {
      return undefined;
    }
    const normalized = rate > 1 ? rate / 100 : rate;
    return normalized <= 1 ? normalized : undefined;
  }

  private addCurrency(balances: PlannerBalances, currency: PlannerCurrency, amount: number): void {
    const key = this.balanceKey(currency);
    balances[key] = Math.max(0, balances[key] + Math.trunc(amount));
  }

  private getCurrency(balances: PlannerBalances, currency: PlannerCurrency): number {
    return balances[this.balanceKey(currency)];
  }

  private balanceKey(currency: PlannerCurrency): keyof PlannerBalances {
    switch (currency) {
      case 'paid_jewels': return 'paidJewels';
      case 'uma_ticket': return 'umaTickets';
      case 'support_ticket': return 'supportTickets';
      case 'rainbow_crystal': return 'rainbowCrystals';
      case 'gold_crystal': return 'goldCrystals';
      default: return 'freeJewels';
    }
  }

  private copyBalances(value: PlannerBalances): PlannerBalances {
    return {
      freeJewels: this.nonNegativeInt(value.freeJewels),
      paidJewels: this.nonNegativeInt(value.paidJewels),
      umaTickets: this.nonNegativeInt(value.umaTickets),
      supportTickets: this.nonNegativeInt(value.supportTickets),
      rainbowCrystals: this.nonNegativeInt(value.rainbowCrystals),
      goldCrystals: this.nonNegativeInt(value.goldCrystals),
    };
  }

  private nonNegativeInt(value: number | undefined): number {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value ?? 0)) : 0;
  }

  private toDateKey(value: string | Date | null | undefined): string {
    const date = value instanceof Date ? new Date(value) : this.toUtcDate(value);
    return date && !Number.isNaN(date.getTime()) ? this.dateKey(date) : '';
  }

  private toUtcDate(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    const date = match
      ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
      : new Date(value);
    return Number.isNaN(date.getTime()) ? null : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private dateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private todayKey(): string {
    return this.dateKey(new Date());
  }
}
