import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  CaratPlan,
  CaratPlanCollection,
  CaratPlannerTimelineEvent,
  PlannerBannerKind,
  PlannerBalances,
  PlannerCurrency,
  PlannerCustomIncome,
  PlannerCompetitiveRewardVariant,
  PlannerIncomeCadence,
  PlannerPickupGoal,
  PlannerPullTiming,
  PlannerRewardEntry,
  PlannerTarget,
} from '../models/carat-planner.model';
import {
  hasProjectableSourceItems,
  isProjectableCompetitiveVariant,
} from '../utils/planner-reward-currencies';

@Injectable({ providedIn: 'root' })
export class CaratPlannerPersistenceService {
  static readonly STORAGE_KEY = 'carat-planner-plans-v1';
  private readonly isBrowser: boolean;
  private readonly collectionSubject: BehaviorSubject<CaratPlanCollection>;

  readonly collection$: Observable<CaratPlanCollection>;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
    this.collectionSubject = new BehaviorSubject<CaratPlanCollection>(this.loadCollection());
    this.collection$ = this.collectionSubject.asObservable();
  }

  get snapshot(): CaratPlanCollection {
    return this.clone(this.collectionSubject.value);
  }

  get activePlan(): CaratPlan {
    const collection = this.collectionSubject.value;
    return this.clone(collection.plans.find(plan => plan.id === collection.activePlanId) ?? collection.plans[0]);
  }

  isEventActive(eventId: string): boolean {
    const plan = this.activePlan;
    if ((plan.disabledEventIds ?? []).includes(eventId)) return false;
    return plan.targets.some(target => target.eventId === eventId)
      || (plan.enabledRewardEventIds ?? []).includes(eventId);
  }

  setActive(planId: string): void {
    const collection = this.snapshot;
    if (!collection.plans.some(plan => plan.id === planId)) {
      return;
    }
    collection.activePlanId = planId;
    this.commit(collection);
  }

  savePlan(plan: CaratPlan): void {
    const sanitized = this.sanitizePlan(plan);
    if (!sanitized) {
      return;
    }
    const collection = this.snapshot;
    const index = collection.plans.findIndex(item => item.id === sanitized.id);
    sanitized.updatedAt = new Date().toISOString();
    if (index >= 0) {
      collection.plans[index] = sanitized;
    } else {
      collection.plans.push(sanitized);
    }
    collection.activePlanId = sanitized.id;
    this.commit(collection);
  }

  setEventActive(
    event: CaratPlannerTimelineEvent,
    active: boolean,
    rewards: readonly PlannerRewardEntry[] = [],
    competitiveVariants: readonly PlannerCompetitiveRewardVariant[] = [],
  ): CaratPlan {
    const plan = this.activePlan;
    const disabledEventIds = new Set(plan.disabledEventIds ?? []);
    active ? disabledEventIds.delete(event.id) : disabledEventIds.add(event.id);
    plan.disabledEventIds = [...disabledEventIds];

    const bannerKind = this.timelineBannerKind(event.type);
    if (active && (bannerKind === 'character' || bannerKind === 'support')) {
      const existing = plan.targets.find(target => target.eventId === event.id);
      const bannerStart = this.timelineDateKey(
        event.globalReleaseDate ?? event.estimatedGlobalDate ?? event.jpReleaseDate,
      );
      const bannerEnd = this.timelineDateKey(event.estimatedEndDate) || bannerStart;
      if (existing) {
        existing.title = event.title;
        existing.bannerKind = bannerKind;
        if (bannerStart) existing.bannerStart = bannerStart;
        if (bannerEnd) existing.bannerEnd = bannerEnd;
        if (event.gachaId !== undefined) existing.gachaId = event.gachaId;
        if (event.gachaIds?.length) existing.gachaIds = [...event.gachaIds];
        if (event.imagePath !== undefined) existing.imagePath = event.imagePath;
        const defaultPickupId = event.pickupCardIds?.[0];
        if (defaultPickupId !== undefined && existing.pickupId === undefined && !existing.pickupGoals?.length) {
          existing.pickupId = defaultPickupId;
          existing.desiredCopies = 1;
          existing.pickupGoals = [{ pickupId: defaultPickupId, desiredCopies: 1 }];
        }
      } else {
        const pickupId = event.pickupCardIds?.[0];
        plan.targets.push({
          id: this.id('target'),
          eventId: event.id,
          gachaId: event.gachaId,
          gachaIds: event.gachaIds,
          title: event.title,
          bannerKind,
          imagePath: event.imagePath,
          bannerStart,
          bannerEnd,
          pullTiming: 'end',
          plannedPulls: 200,
          desiredCopies: 1,
          pickupId,
          pickupGoals: pickupId === undefined ? [] : [{ pickupId, desiredCopies: 1 }],
          useTickets: true,
          allowPaidJewels: false,
        });
      }
    }

    if (event.plannerRewardAvailable) {
      const enabledRewardEventIds = new Set(plan.enabledRewardEventIds ?? []);
      if (!active) {
        enabledRewardEventIds.delete(event.id);
      } else if (rewards.length === 0 && competitiveVariants.length === 0) {
        enabledRewardEventIds.add(event.id);
      } else {
        const eventRewards = rewards.filter(reward =>
          reward.event_id === event.id
          && (
            (Number.isFinite(reward.amount) && Number(reward.amount) > 0)
            || hasProjectableSourceItems(reward.source_items)
            || reward.source_items?.some(item => item.item_category === 41 || item.item_category === 42)
          )
        );
        const eventVariants = competitiveVariants.filter(variant =>
          variant.event_id === event.id && isProjectableCompetitiveVariant(variant));
        const enabledRewardIds = new Set(plan.enabledRewardIds);
        const disabledRewardIds = new Set(plan.disabledRewardIds ?? []);
        const selectableIds = [
          ...eventRewards.map(reward => reward.id),
          ...eventVariants.map(variant => variant.id),
        ];
        if (!selectableIds.some(id => enabledRewardIds.has(id))) {
          selectableIds
            .filter(id => !disabledRewardIds.has(id))
            .forEach(id => enabledRewardIds.add(id));
        }
        plan.enabledRewardIds = [...enabledRewardIds];
        enabledRewardEventIds.add(event.id);
      }
      plan.enabledRewardEventIds = [...enabledRewardEventIds];
    }

    this.savePlan(plan);
    return this.activePlan;
  }

  createPlan(name = 'New plan'): CaratPlan {
    const plan = this.createDefaultPlan(name);
    const collection = this.snapshot;
    collection.plans.push(plan);
    collection.activePlanId = plan.id;
    this.commit(collection);
    return this.clone(plan);
  }

  renamePlan(planId: string, name: string): void {
    const collection = this.snapshot;
    const plan = collection.plans.find(item => item.id === planId);
    if (!plan) {
      return;
    }
    plan.name = this.cleanText(name, 80) || 'Untitled plan';
    plan.updatedAt = new Date().toISOString();
    this.commit(collection);
  }

  duplicatePlan(planId: string): CaratPlan | null {
    const collection = this.snapshot;
    const source = collection.plans.find(plan => plan.id === planId);
    if (!source) {
      return null;
    }
    const now = new Date().toISOString();
    const copy = this.clone(source);
    copy.id = this.id('plan');
    copy.name = `${source.name} copy`.slice(0, 80);
    copy.createdAt = now;
    copy.updatedAt = now;
    copy.customIncome = copy.customIncome.map(item => ({ ...item, id: this.id('income') }));
    copy.targets = copy.targets.map(item => ({ ...item, id: this.id('target') }));
    collection.plans.push(copy);
    collection.activePlanId = copy.id;
    this.commit(collection);
    return this.clone(copy);
  }

  deletePlan(planId: string): void {
    const collection = this.snapshot;
    collection.plans = collection.plans.filter(plan => plan.id !== planId);
    if (collection.plans.length === 0) {
      collection.plans = [this.createDefaultPlan('My plan')];
    }
    if (!collection.plans.some(plan => plan.id === collection.activePlanId)) {
      collection.activePlanId = collection.plans[0].id;
    }
    this.commit(collection);
  }

  exportPlan(planId = this.collectionSubject.value.activePlanId): string {
    const plan = this.collectionSubject.value.plans.find(item => item.id === planId) ?? this.activePlan;
    return JSON.stringify({ version: 1, plan }, null, 2);
  }

  exportAll(): string {
    return JSON.stringify(this.collectionSubject.value, null, 2);
  }

  importJson(json: string): CaratPlanCollection {
    if (json.length > 2_000_000) {
      throw new Error('Planner import is too large.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error('Planner import is not valid JSON.');
    }

    const record = this.asRecord(parsed);
    if (!record) {
      throw new Error('Planner import has an invalid shape.');
    }

    const importedPlans = Array.isArray(record['plans'])
      ? record['plans'].map(item => this.sanitizePlan(item)).filter((item): item is CaratPlan => !!item)
      : [this.sanitizePlan(record['plan'] ?? parsed)].filter((item): item is CaratPlan => !!item);
    if (importedPlans.length === 0) {
      throw new Error('Planner import contains no usable plans.');
    }

    const collection = this.snapshot;
    const existingIds = new Set(collection.plans.map(plan => plan.id));
    for (const imported of importedPlans.slice(0, 50)) {
      if (existingIds.has(imported.id)) {
        imported.id = this.id('plan');
      }
      existingIds.add(imported.id);
      imported.name = this.uniqueName(imported.name, collection.plans);
      collection.plans.push(imported);
    }
    collection.activePlanId = importedPlans[importedPlans.length - 1].id;
    this.commit(collection);
    return this.snapshot;
  }

  createDefaultPlan(name = 'My plan'): CaratPlan {
    const now = new Date().toISOString();
    return {
      id: this.id('plan'),
      name: this.cleanText(name, 80) || 'My plan',
      createdAt: now,
      updatedAt: now,
      projectionStartDate: now.slice(0, 10),
      balances: {
        freeJewels: 0,
        paidJewels: 0,
        umaTickets: 0,
        supportTickets: 0,
        rainbowCrystals: 0,
        goldCrystals: 0,
      },
      enabledIncomeRuleIds: [],
      enabledRewardIds: [],
      disabledRewardIds: [],
      enabledRewardEventIds: [],
      disabledEventIds: [],
      scenarioSelections: {},
      freePullCampaignSelections: {},
      resourceDefaultsApplied: false,
      customIncome: [],
      targets: [],
    };
  }

  private loadCollection(): CaratPlanCollection {
    if (!this.isBrowser) {
      const plan = this.createDefaultPlan();
      return { version: 1, activePlanId: plan.id, plans: [plan] };
    }

    try {
      const raw = localStorage.getItem(CaratPlannerPersistenceService.STORAGE_KEY);
      if (raw) {
        const record = this.asRecord(JSON.parse(raw));
        const plans = Array.isArray(record?.['plans'])
          ? record!['plans'].map(item => this.sanitizePlan(item)).filter((item): item is CaratPlan => !!item).slice(0, 50)
          : [];
        if (plans.length > 0) {
          const requestedActiveId = this.cleanText(record?.['activePlanId'], 100);
          return {
            version: 1,
            activePlanId: plans.some(plan => plan.id === requestedActiveId) ? requestedActiveId : plans[0].id,
            plans,
          };
        }
      }
    } catch (error) {
      console.warn('Ignoring invalid carat planner state.', error);
    }

    const plan = this.createDefaultPlan();
    return { version: 1, activePlanId: plan.id, plans: [plan] };
  }

  private commit(collection: CaratPlanCollection): void {
    const sanitizedPlans = collection.plans
      .map(plan => this.sanitizePlan(plan))
      .filter((plan): plan is CaratPlan => !!plan)
      .slice(0, 50);
    if (sanitizedPlans.length === 0) {
      sanitizedPlans.push(this.createDefaultPlan());
    }
    const next: CaratPlanCollection = {
      version: 1,
      activePlanId: sanitizedPlans.some(plan => plan.id === collection.activePlanId)
        ? collection.activePlanId
        : sanitizedPlans[0].id,
      plans: sanitizedPlans,
    };
    this.collectionSubject.next(this.clone(next));
    if (this.isBrowser) {
      try {
        localStorage.setItem(CaratPlannerPersistenceService.STORAGE_KEY, JSON.stringify(next));
      } catch (error) {
        console.warn('Unable to save carat planner state.', error);
      }
    }
  }

  private sanitizePlan(value: unknown): CaratPlan | null {
    const record = this.asRecord(value);
    if (!record) {
      return null;
    }
    const now = new Date().toISOString();
    const id = this.cleanText(record['id'], 100) || this.id('plan');
    return {
      id,
      name: this.cleanText(record['name'], 80) || 'Untitled plan',
      createdAt: this.validIso(record['createdAt']) || now,
      updatedAt: this.validIso(record['updatedAt']) || now,
      projectionStartDate: this.validDateKey(record['projectionStartDate']) || now.slice(0, 10),
      balances: this.sanitizeBalances(record['balances']),
      enabledIncomeRuleIds: this.stringArray(record['enabledIncomeRuleIds'], 1000),
      enabledRewardIds: this.stringArray(record['enabledRewardIds'], 5000),
      disabledRewardIds: this.stringArray(record['disabledRewardIds'], 5000),
      enabledRewardEventIds: this.stringArray(record['enabledRewardEventIds'], 5000),
      disabledEventIds: this.stringArray(record['disabledEventIds'], 5000),
      scenarioSelections: this.stringRecord(record['scenarioSelections']),
      freePullCampaignSelections: this.stringRecord(record['freePullCampaignSelections']),
      resourceDefaultsApplied: record['resourceDefaultsApplied'] === true,
      customIncome: Array.isArray(record['customIncome'])
        ? record['customIncome'].map(item => this.sanitizeCustomIncome(item)).filter((item): item is PlannerCustomIncome => !!item).slice(0, 200)
        : [],
      targets: Array.isArray(record['targets'])
        ? record['targets'].map(item => this.sanitizeTarget(item)).filter((item): item is PlannerTarget => !!item).slice(0, 200)
        : [],
    };
  }

  private sanitizeBalances(value: unknown): PlannerBalances {
    const record = this.asRecord(value);
    return {
      freeJewels: this.nonNegativeInt(record?.['freeJewels']),
      paidJewels: this.nonNegativeInt(record?.['paidJewels']),
      umaTickets: this.nonNegativeInt(record?.['umaTickets']),
      supportTickets: this.nonNegativeInt(record?.['supportTickets']),
      rainbowCrystals: this.nonNegativeInt(record?.['rainbowCrystals']),
      goldCrystals: this.nonNegativeInt(record?.['goldCrystals']),
    };
  }

  private sanitizeCustomIncome(value: unknown): PlannerCustomIncome | null {
    const record = this.asRecord(value);
    const label = this.cleanText(record?.['label'], 100);
    const startDate = this.validDateKey(record?.['startDate']);
    if (!record || !label || !startDate) {
      return null;
    }
    return {
      id: this.cleanText(record['id'], 100) || this.id('income'),
      label,
      currency: this.currency(record['currency']),
      amount: this.signedInt(record['amount']),
      cadence: this.cadence(record['cadence']),
      startDate,
      endDate: this.validDateKey(record['endDate']) || undefined,
      every: Math.max(1, this.nonNegativeInt(record['every']) || 1),
    };
  }

  private sanitizeTarget(value: unknown): PlannerTarget | null {
    const record = this.asRecord(value);
    const eventId = this.cleanText(record?.['eventId'], 160);
    const title = this.cleanText(record?.['title'], 200);
    const bannerStart = this.validDateKey(record?.['bannerStart']);
    if (!record || !eventId || !title || !bannerStart) {
      return null;
    }
    const legacyDesiredCopies = Math.min(20, Math.max(1, this.nonNegativeInt(record['desiredCopies']) || 1));
    const legacyPickupId = this.optionalInt(record['pickupId']);
    const pickupGoals = Array.isArray(record['pickupGoals'])
      ? this.sanitizePickupGoals(record['pickupGoals'])
      : legacyPickupId === undefined
        ? []
        : [{ pickupId: legacyPickupId, desiredCopies: legacyDesiredCopies }];
    const firstGoal = pickupGoals[0];
    const rainbowCrystalsPlanned = Math.min(20, this.nonNegativeInt(record['rainbowCrystalsPlanned']));
    const goldCrystalsPlanned = Math.min(20, this.nonNegativeInt(record['goldCrystalsPlanned']));
    return {
      id: this.cleanText(record['id'], 100) || this.id('target'),
      eventId,
      gachaId: this.optionalInt(record['gachaId']),
      gachaIds: this.numberArray(record['gachaIds'], 20),
      title,
      bannerKind: this.bannerKind(record['bannerKind']),
      imagePath: this.cleanText(record['imagePath'], 500) || undefined,
      bannerStart,
      bannerEnd: this.validDateKey(record['bannerEnd']) || bannerStart,
      pullTiming: this.pullTiming(record['pullTiming']),
      customPullDate: this.validDateKey(record['customPullDate']) || undefined,
      plannedPulls: Math.min(5000, this.nonNegativeInt(record['plannedPulls'])),
      desiredCopies: firstGoal?.desiredCopies ?? legacyDesiredCopies,
      pickupId: firstGoal?.pickupId ?? legacyPickupId,
      pickupGoals,
      useTickets: record['useTickets'] !== false,
      ticketLimit: this.optionalInt(record['ticketLimit']),
      allowPaidJewels: record['allowPaidJewels'] === true,
      ...(rainbowCrystalsPlanned > 0 ? { rainbowCrystalsPlanned } : {}),
      ...(goldCrystalsPlanned > 0 ? { goldCrystalsPlanned } : {}),
    };
  }

  private sanitizePickupGoals(value: unknown[]): PlannerPickupGoal[] {
    const goals: PlannerPickupGoal[] = [];
    const seen = new Set<number>();
    for (const item of value.slice(0, 20)) {
      const record = this.asRecord(item);
      const pickupId = this.optionalInt(record?.['pickupId']);
      if (pickupId === undefined || seen.has(pickupId)) continue;
      seen.add(pickupId);
      goals.push({
        pickupId,
        desiredCopies: Math.min(20, Math.max(1, this.nonNegativeInt(record?.['desiredCopies']) || 1)),
      });
    }
    return goals;
  }

  private uniqueName(name: string, plans: CaratPlan[]): string {
    const names = new Set(plans.map(plan => plan.name.toLowerCase()));
    if (!names.has(name.toLowerCase())) {
      return name;
    }
    let suffix = 2;
    while (names.has(`${name} ${suffix}`.toLowerCase())) {
      suffix++;
    }
    return `${name} ${suffix}`.slice(0, 80);
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private id(prefix: string): string {
    const randomUuid = typeof crypto !== 'undefined' ? crypto.randomUUID?.() : undefined;
    return `${prefix}-${randomUuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  }

  private cleanText(value: unknown, maxLength: number): string {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
  }

  private validDateKey(value: unknown): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return '';
    }
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? '' : value;
  }

  private validIso(value: unknown): string {
    return typeof value === 'string' && !Number.isNaN(new Date(value).getTime()) ? value : '';
  }

  private nonNegativeInt(value: unknown): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
  }

  private signedInt(value: unknown): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
  }

  private optionalInt(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
      return undefined;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? Math.trunc(numeric) : undefined;
  }

  private stringArray(value: unknown, limit: number): string[] {
    return Array.isArray(value)
      ? [...new Set(value.filter((item): item is string => typeof item === 'string').map(item => item.slice(0, 160)))].slice(0, limit)
      : [];
  }

  private numberArray(value: unknown, limit: number): number[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const numbers = [...new Set(value.map(item => this.optionalInt(item)).filter((item): item is number => item !== undefined))].slice(0, limit);
    return numbers.length > 0 ? numbers : undefined;
  }

  private stringRecord(value: unknown): Record<string, string> {
    const record = this.asRecord(value);
    if (!record) {
      return {};
    }
    return Object.fromEntries(Object.entries(record)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .slice(0, 100)
      .map(([key, item]) => [key.slice(0, 100), item.slice(0, 100)]));
  }

  private currency(value: unknown): PlannerCurrency {
    return value === 'paid_jewels'
      || value === 'uma_ticket'
      || value === 'support_ticket'
      || value === 'rainbow_crystal'
      || value === 'gold_crystal'
      ? value
      : 'free_jewels';
  }

  private cadence(value: unknown): PlannerIncomeCadence {
    return value === 'daily' || value === 'weekly' || value === 'monthly' || value === 'interval' ? value : 'once';
  }

  private bannerKind(value: unknown): PlannerBannerKind {
    return value === 'character' || value === 'support' || value === 'paid' ? value : 'other';
  }

  private timelineBannerKind(type?: string): PlannerBannerKind {
    if (type?.includes('character')) return 'character';
    if (type?.includes('support')) return 'support';
    if (type?.includes('paid')) return 'paid';
    return 'other';
  }

  private timelineDateKey(value?: Date | string): string {
    if (!value) return new Date().toISOString().slice(0, 10);
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
  }

  private pullTiming(value: unknown): PlannerPullTiming {
    return value === 'start' || value === 'custom' ? value : 'end';
  }
}
