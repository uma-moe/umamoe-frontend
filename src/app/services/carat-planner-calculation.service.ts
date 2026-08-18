import { Injectable } from '@angular/core';
import { getSupportCardById } from '../data/support-cards.data';
import { Rarity } from '../models/support-card.model';
import {
  CaratPlan,
  CaratPlanProjection,
  CaratPlannerDataBundle,
  CaratPlannerTimelineEvent,
  FREE_PULL_CAMPAIGN_EXCLUDED_SELECTION,
  PickupOddsResult,
  PlannerBalances,
  PlannerCompetitiveRewardVariant,
  PlannerCurrency,
  PlannerGachaEntry,
  PlannerGlobalRewardComparison,
  PlannerIncomeRule,
  PlannerLedgerEntry,
  PlannerPickupGoal,
  PlannerRewardEntry,
  PlannerTarget,
  PlannerTargetProjection,
} from '../models/carat-planner.model';
import { plannerRewardBundles } from '../utils/planner-reward-currencies';
import {
  PLANNER_COMPETITION_ASSUMPTION_GROUPS,
  PLANNER_DATA_DRIVEN_COMPETITION_ASSUMPTION_GROUPS,
  resolveDataDrivenCompetitionAssumption,
} from '../utils/carat-planner-competition-assumptions';
import {
  conditionalRewardScenarioGroup,
  conditionalRewardScenarioSelectionMatches,
  incomeRuleScenarioSelectionMatches,
  isLegacyTrainingPassIncomeRule,
  RANDOM_GAMEPLAY_INCOME_SCENARIO_GROUP_ID,
  randomGameplayIncomeRules,
  SPECULATIVE_INCOME_INCLUDED_OPTION,
  SPECULATIVE_INCOME_MEDIAN_OPTION,
  SPECULATIVE_INCOME_SCENARIO_GROUP_ID,
  TRAINING_PASS_SCENARIO_GROUP_ID,
  trainingPassIncomeRules,
} from '../utils/carat-planner-income-assumptions';
import { CaratPullProbabilityService } from './carat-pull-probability.service';

const DAY_MS = 86_400_000;
const CRYSTAL_SHARDS_PER_UNCAP = 20;

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
      if (isLegacyTrainingPassIncomeRule(rule)
        || !enabledRules.has(rule.id)
        || !this.isSelectedScenario(rule, plan.scenarioSelections)) {
        continue;
      }
      ledger.push(...this.expandRule(rule, startDate, endDate));
    }

    const activeRewards = (data.rewards.rewards ?? []).filter(reward =>
      enabledRewards.has(reward.id)
      && this.isConditionalRewardEnabled(reward, plan.scenarioSelections)
      && !(reward.event_id ? disabledEvents.has(reward.event_id) : false));
    for (const bundle of plannerRewardBundles(activeRewards)) {
      const date = this.toDateKey(bundle.availableAt);
      if (!date || date < startDate || date > endDate) {
        continue;
      }
      for (const [currency, amount] of bundle.totals) {
        if (amount === 0) continue;
        ledger.push({
          id: `reward:${bundle.id}:${currency}`,
          label: bundle.label,
          date,
          currency,
          amount,
          source: 'reward',
        });
      }
    }

    for (const [eventId, selection] of Object.entries(plan.variableRewardSelections ?? {})) {
      if (disabledEvents.has(eventId)) continue;
      const date = this.toDateKey(selection.availableAt)
        || this.competitiveEventDate(eventId, events);
      if (!date || date < startDate || date > endDate) continue;
      for (const [currency, rawAmount] of Object.entries(selection.amounts) as [PlannerCurrency, number][]) {
        const amount = this.nonNegativeInt(rawAmount);
        if (amount <= 0) continue;
        ledger.push({
          id: `competitive:${eventId}:${selection.optionId}:${currency}`,
          label: selection.label,
          date,
          currency,
          amount,
          source: 'reward',
        });
      }
    }

    for (const group of PLANNER_COMPETITION_ASSUMPTION_GROUPS) {
      const selectedOption = group.options.find(option => option.value === plan.scenarioSelections[group.id]);
      if (!selectedOption) continue;
      for (const event of events) {
        if (event.type !== group.eventType
          || disabledEvents.has(event.id)
          || plan.variableRewardSelections?.[event.id]) continue;
        const date = this.competitiveEventDate(event.id, events);
        if (!date || date < startDate || date > endDate) continue;
        for (const [currency, rawAmount] of Object.entries(selectedOption.amounts) as [PlannerCurrency, number][]) {
          const amount = this.nonNegativeInt(rawAmount);
          if (amount <= 0) continue;
          ledger.push({
            id: `competition-assumption:${event.id}:${selectedOption.value}:${currency}`,
            label: `${group.label}: ${selectedOption.label}`,
            date,
            currency,
            amount,
            source: 'rule',
          });
        }
      }
    }

    for (const group of PLANNER_DATA_DRIVEN_COMPETITION_ASSUMPTION_GROUPS) {
      const selectionValue = plan.scenarioSelections[group.id];
      if (!selectionValue) continue;
      const variantsByEvent = new Map<string, PlannerCompetitiveRewardVariant[]>();
      for (const variant of data.rewards.competitive_variants ?? []) {
        if (variant.competition !== group.eventType) continue;
        const variants = variantsByEvent.get(variant.event_id) ?? [];
        variants.push(variant);
        variantsByEvent.set(variant.event_id, variants);
      }
      for (const [eventId, variants] of variantsByEvent) {
        if (disabledEvents.has(eventId) || plan.variableRewardSelections?.[eventId]) continue;
        const selectedOption = resolveDataDrivenCompetitionAssumption(group.id, selectionValue, variants);
        if (!selectedOption) continue;
        const date = this.competitiveVariantDate(eventId, variants, events);
        if (!date || date < startDate || date > endDate) continue;
        for (const [currency, rawAmount] of Object.entries(selectedOption.amounts) as [PlannerCurrency, number][]) {
          const amount = this.nonNegativeInt(rawAmount);
          if (amount <= 0) continue;
          ledger.push({
            id: `competition-assumption:${eventId}:${selectionValue}:${currency}`,
            label: `${group.label}: ${selectedOption.label}`,
            date,
            currency,
            amount,
            source: 'rule',
          });
        }
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

    for (const rule of trainingPassIncomeRules(
      plan.scenarioSelections[TRAINING_PASS_SCENARIO_GROUP_ID],
      events,
    )) {
      ledger.push(...this.expandRule(rule, startDate, endDate));
    }

    for (const rule of randomGameplayIncomeRules(
      plan.scenarioSelections[RANDOM_GAMEPLAY_INCOME_SCENARIO_GROUP_ID],
      startDate,
    )) {
      ledger.push(...this.expandRule(rule, startDate, endDate));
    }

    const speculativeSelection =
      plan.scenarioSelections[SPECULATIVE_INCOME_SCENARIO_GROUP_ID];
    if (speculativeSelection === SPECULATIVE_INCOME_INCLUDED_OPTION
      || speculativeSelection === SPECULATIVE_INCOME_MEDIAN_OPTION) {
      ledger.push(...this.speculativeIncomeEntries(
        plan,
        data.rewards.global_reward_comparison,
        speculativeSelection,
        startDate,
        endDate,
      ));
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
    lbCrystals?: Partial<Record<'rainbow' | 'gold', number>>,
  ): PickupOddsResult {
    const normalizedDraws = this.nonNegativeInt(draws);
    const goals = this.targetPickupGoals(target, gacha);
    const remainingCrystals = {
      rainbow: this.nonNegativeInt(lbCrystals?.rainbow ?? target.rainbowCrystalsPlanned),
      gold: this.nonNegativeInt(lbCrystals?.gold ?? target.goldCrystalsPlanned),
    };
    const threshold = this.nonNegativeInt(sparkPulls);
    const sparkCopiesAvailable = threshold > 0
      ? Math.floor(normalizedDraws / threshold)
      : 0;
    const goalOdds = goals.map(goal => {
      const pickup = gacha?.pickups?.find(item => item.pickup_id === goal.pickupId);
      const crystalKind = this.lbCrystalKind(target, goal.pickupId);
      const crystalCopiesApplied = crystalKind
        ? Math.min(remainingCrystals[crystalKind], Math.min(4, goal.desiredCopies - 1))
        : 0;
      if (crystalKind) remainingCrystals[crystalKind] -= crystalCopiesApplied;
      const copiesNeededFromPulls = Math.max(1, goal.desiredCopies - crystalCopiesApplied);
      const odds = this.calculateOdds(
        normalizedDraws,
        copiesNeededFromPulls,
        pickup?.rate,
        pickup?.exchangeable === false ? undefined : threshold,
      );
      return {
        pickupId: goal.pickupId,
        requestedCopies: goal.desiredCopies,
        copiesNeededFromPulls,
        crystalCopiesApplied,
        crystalKind: crystalCopiesApplied > 0 ? crystalKind : undefined,
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
          requestedCopies: goal.copiesNeededFromPulls,
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
    const rainbowCrystalBudget = target.bannerKind === 'support'
      ? Math.min(
        this.availableUncapCrystals(
          balances.rainbowFullCrystals,
          balances.rainbowCrystals,
        ),
        this.nonNegativeInt(target.rainbowCrystalsPlanned),
      )
      : 0;
    const goldCrystalBudget = target.bannerKind === 'support'
      ? Math.min(
        this.availableUncapCrystals(
          balances.goldFullCrystals,
          balances.goldCrystals,
        ),
        this.nonNegativeInt(target.goldCrystalsPlanned),
      )
      : 0;
    const odds = this.calculateTargetOdds(fundedPulls, target, gacha, sparkPulls, {
      rainbow: rainbowCrystalBudget,
      gold: goldCrystalBudget,
    });
    const rainbowCrystalsUsed = odds.goalOdds?.reduce((total, goal) => (
      total + (goal.crystalKind === 'rainbow' ? goal.crystalCopiesApplied : 0)
    ), 0) ?? 0;
    const goldCrystalsUsed = odds.goalOdds?.reduce((total, goal) => (
      total + (goal.crystalKind === 'gold' ? goal.crystalCopiesApplied : 0)
    ), 0) ?? 0;
    this.consumeUncapCrystals(balances, 'rainbow', rainbowCrystalsUsed);
    this.consumeUncapCrystals(balances, 'gold', goldCrystalsUsed);

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
      odds,
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

  private speculativeIncomeEntries(
    plan: CaratPlan,
    comparison: PlannerGlobalRewardComparison | undefined,
    selection: string,
    rangeStart: string,
    rangeEnd: string,
  ): PlannerLedgerEntry[] {
    const start = this.toUtcDate(rangeStart);
    const end = this.toUtcDate(rangeEnd);
    const observationEnd = this.toUtcDate(comparison?.observation_end);
    const monthlyCarats = this.nonNegativeInt(
      selection === SPECULATIVE_INCOME_MEDIAN_OPTION
        ? comparison?.speculative_recent_median_monthly_carats
        : comparison?.speculative_monthly_carats,
    );
    if (!start || !end || !observationEnd || monthlyCarats <= 0) return [];
    const anchor = observationEnd > start ? observationEnd : start;
    if (end <= anchor) return [];
    const anchorKey = this.dateKey(anchor);

    const checkpoints = new Set<string>([rangeEnd]);
    for (let month = 1; month < 2400; month++) {
      const checkpoint = this.calendarMonthFrom(anchor, month);
      if (checkpoint > end) break;
      checkpoints.add(this.dateKey(checkpoint));
    }
    const disabledEvents = new Set(plan.disabledEventIds ?? []);
    for (const target of plan.targets) {
      if (disabledEvents.has(target.eventId) || this.isTargetBeforeProjectionStart(plan, target)) continue;
      const pullDate = this.resolvePullDate(target);
      if (pullDate > anchorKey && pullDate <= rangeEnd) checkpoints.add(pullDate);
    }

    const entries: PlannerLedgerEntry[] = [];
    let speculativeTotal = 0;

    for (const checkpoint of [...checkpoints].sort()) {
      const checkpointDate = this.toUtcDate(checkpoint);
      if (!checkpointDate || checkpointDate <= anchor) continue;
      const targetTotal = Math.round(
        monthlyCarats * this.elapsedCalendarMonths(anchor, checkpointDate),
      );
      const amount = Math.max(0, targetTotal - speculativeTotal);
      if (amount === 0) continue;
      entries.push({
        id: `speculative-income:${checkpoint}`,
        label: 'Speculative Global reward uplift',
        date: checkpoint,
        currency: 'free_jewels',
        amount,
        source: 'rule',
      });
      speculativeTotal += amount;
    }
    return entries;
  }

  private elapsedCalendarMonths(start: Date, end: Date): number {
    if (end <= start) return 0;
    let wholeMonths = (end.getUTCFullYear() - start.getUTCFullYear()) * 12
      + end.getUTCMonth() - start.getUTCMonth();
    let anchor = this.calendarMonthFrom(start, wholeMonths);
    if (anchor > end) {
      wholeMonths--;
      anchor = this.calendarMonthFrom(start, wholeMonths);
    }
    const next = this.calendarMonthFrom(start, wholeMonths + 1);
    const fraction = Math.max(0, Math.min(1, (end.getTime() - anchor.getTime())
      / Math.max(DAY_MS, next.getTime() - anchor.getTime())));
    return Math.max(0, wholeMonths + fraction);
  }

  private calendarMonthFrom(anchor: Date, offset: number): Date {
    const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + offset, 1));
    const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(
      first.getUTCFullYear(),
      first.getUTCMonth(),
      Math.min(anchor.getUTCDate(), daysInMonth),
    ));
  }

  private isSelectedScenario(rule: PlannerIncomeRule, selections: Record<string, string>): boolean {
    return incomeRuleScenarioSelectionMatches(rule, selections);
  }

  private isConditionalRewardEnabled(
    reward: Pick<PlannerRewardEntry, 'assumption' | 'label'>,
    selections: Record<string, string>,
  ): boolean {
    const group = conditionalRewardScenarioGroup(reward);
    return !group || conditionalRewardScenarioSelectionMatches(reward, selections[group]);
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
      variableRewardSelections: Object.entries(plan.variableRewardSelections ?? {})
        .sort(([left], [right]) => left.localeCompare(right)),
      freePullCampaignSelections,
      customIncome,
      dataToken: this.objectToken(data),
      gachaTokens,
      eventsToken: events.length > 0 ? this.objectToken(events) : 0,
    });
  }

  private competitiveEventDate(
    eventId: string,
    events: readonly CaratPlannerTimelineEvent[],
  ): string {
    const event = events.find(item => item.id === eventId);
    return this.toDateKey(event?.estimatedEndDate)
      || this.toDateKey(event?.globalReleaseDate ?? event?.estimatedGlobalDate ?? event?.jpReleaseDate);
  }

  private competitiveVariantDate(
    eventId: string,
    variants: readonly PlannerCompetitiveRewardVariant[],
    events: readonly CaratPlannerTimelineEvent[],
  ): string {
    const sourcedDate = variants
      .map(variant => this.toDateKey(variant.available_at))
      .filter(Boolean)
      .sort()[0];
    if (sourcedDate) return sourcedDate;

    const masterIds = new Set(variants.map(variant => variant.master_event_id).filter(Number.isFinite));
    const event = events.find(item => item.id === eventId)
      ?? events.find(item => {
        const trailingId = Number(item.id.match(/(\d+)$/)?.[1]);
        return masterIds.has(trailingId)
          || [...masterIds].some(masterId => item.imagePath?.endsWith(`/${masterId}.webp`));
      });
    return this.toDateKey(event?.estimatedEndDate)
      || this.toDateKey(event?.globalReleaseDate ?? event?.estimatedGlobalDate ?? event?.jpReleaseDate);
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
        desiredCopies: this.targetDesiredCopies(target, goal.desiredCopies),
      }));
    }
    if (target.pickupId !== undefined) {
      return [{
        pickupId: this.nonNegativeInt(target.pickupId),
        desiredCopies: this.targetDesiredCopies(target, target.desiredCopies),
      }];
    }
    if (gacha?.pickups?.length) {
      return [{
        pickupId: gacha.pickups[0].pickup_id,
        desiredCopies: this.targetDesiredCopies(target, target.desiredCopies),
      }];
    }
    return [];
  }

  private targetDesiredCopies(target: PlannerTarget, value: number): number {
    const maximum = target.bannerKind === 'support' ? 5 : 20;
    return Math.min(maximum, Math.max(1, this.nonNegativeInt(value)));
  }

  private lbCrystalKind(target: PlannerTarget, pickupId: number): 'rainbow' | 'gold' | undefined {
    if (target.bannerKind !== 'support') return undefined;
    const rarity = getSupportCardById(String(pickupId))?.rarity;
    if (rarity === Rarity.SR) return 'gold';
    if (rarity === Rarity.R) return undefined;
    // Future support cards often precede the bundled metadata; normal support pickups are SSR.
    return 'rainbow';
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
    balances[key] = Math.max(0, (balances[key] ?? 0) + Math.trunc(amount));
  }

  private getCurrency(balances: PlannerBalances, currency: PlannerCurrency): number {
    return balances[this.balanceKey(currency)] ?? 0;
  }

  private balanceKey(currency: PlannerCurrency): keyof PlannerBalances {
    switch (currency) {
      case 'paid_jewels': return 'paidJewels';
      case 'uma_ticket': return 'umaTickets';
      case 'support_ticket': return 'supportTickets';
      case 'rainbow_crystal': return 'rainbowCrystals';
      case 'gold_crystal': return 'goldCrystals';
      case 'rainbow_full_crystal': return 'rainbowFullCrystals';
      case 'gold_full_crystal': return 'goldFullCrystals';
      default: return 'freeJewels';
    }
  }

  private availableUncapCrystals(
    fullCrystals: number | undefined,
    shards: number | undefined,
  ): number {
    return this.nonNegativeInt(fullCrystals)
      + Math.floor(this.nonNegativeInt(shards) / CRYSTAL_SHARDS_PER_UNCAP);
  }

  private consumeUncapCrystals(
    balances: PlannerBalances,
    kind: 'rainbow' | 'gold',
    amount: number,
  ): void {
    const fullKey = kind === 'rainbow' ? 'rainbowFullCrystals' : 'goldFullCrystals';
    const shardKey = kind === 'rainbow' ? 'rainbowCrystals' : 'goldCrystals';
    const requested = this.nonNegativeInt(amount);
    const fullUsed = Math.min(requested, this.nonNegativeInt(balances[fullKey]));
    balances[fullKey] = this.nonNegativeInt(balances[fullKey]) - fullUsed;
    balances[shardKey] = Math.max(
      0,
      this.nonNegativeInt(balances[shardKey])
        - (requested - fullUsed) * CRYSTAL_SHARDS_PER_UNCAP,
    );
  }

  private copyBalances(value: PlannerBalances): PlannerBalances {
    return {
      freeJewels: this.nonNegativeInt(value.freeJewels),
      paidJewels: this.nonNegativeInt(value.paidJewels),
      umaTickets: this.nonNegativeInt(value.umaTickets),
      supportTickets: this.nonNegativeInt(value.supportTickets),
      rainbowCrystals: this.nonNegativeInt(value.rainbowCrystals),
      goldCrystals: this.nonNegativeInt(value.goldCrystals),
      rainbowFullCrystals: this.nonNegativeInt(value.rainbowFullCrystals),
      goldFullCrystals: this.nonNegativeInt(value.goldFullCrystals),
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
