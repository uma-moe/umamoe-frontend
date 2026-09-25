import { plannerRewardAvailabilityWindow, timelineEventIndex } from './planner-reward-availability';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
import { parseResourceDate } from './timeline-prediction-types';
import { isPaidBanner, paidBannerType, paidBannerSteps, paidBannerDrawRates, plannerCardKind } from './planner-paid-banners';
import { calculateMultiPickupProbability } from './planner-pull-probability';
import { plannerRewardBundles, plannerSourceItemTotals } from './planner-reward-currencies';
import {
  CONDITIONAL_REWARD_DEFAULT_SELECTIONS,
  conditionalRewardScenarioGroup,
  plannerRewardSelectionEnabled,
  plannerRewardNeedsEnabledOverride,
  selectedConditionalRewardAmount,
} from './planner-reward-assumptions';
import {
  randomGameplayIncomeRules,
  dailyCaratPackPurchaseRule,
  incomeRuleScenarioSelectionMatches,
  isLegacyTrainingPassIncomeRule,
  speculativeIncomeEntries,
  trainingPassIncomeRules,
} from './planner-income-assumptions';
import { competitionIncomeEntries } from './planner-competition-assumptions';
import { plannerUtcDay as utcDay, plannerDayKey as dayKey, validPlannerDateKey } from './planner-calendar';

export const CARAT_PLANNER_STORAGE_KEY = 'carat-planner-plans-v1';
export { TIMELINE_PREFERENCES_KEY } from '@/pages/timeline/timeline-controls';
export type PlannerCurrency = 'free_jewels' | 'paid_jewels' | 'uma_ticket' | 'support_ticket' | 'rainbow_crystal' | 'gold_crystal' | 'rainbow_full_crystal' | 'gold_full_crystal';
export type PlannerIncomeCadence = 'once' | 'daily' | 'weekly' | 'monthly' | 'interval';
export interface PlannerCoreResource { version?: string | number; jewel_cost_per_pull?: number; default_spark_pulls?: number; gacha_shard_by_event?: Record<string, string>; gacha_shard_by_id?: Record<string, string>; gacha_shards?: string[]; }
export interface PlannerIncomeRule { id: string; label: string; description?: string; category?: string; currency: PlannerCurrency; amount: number; cadence: PlannerIncomeCadence; start_date: string; end_date?: string | null; every?: number; weekday?: number; day_of_month?: number; default_enabled?: boolean; scenario_group?: string; scenario_option?: string; provenance?: string; }
export interface PlannerIncomeResource { version?: string | number; rules: PlannerIncomeRule[]; }
export interface PlannerSourceItem { item_category: number; item_id: number; amount: number; mission_count?: number; odds?: number; order_min?: number; order_max?: number; bonus?: number; }
export interface PlannerRewardEntry { id: string; label: string; event_id?: string; gacha_id?: number; currency: PlannerCurrency; amount?: number | null; available_at: string; available_until?: string; category?: string; default_enabled?: boolean; full_completion?: boolean; provenance?: string; assumption?: string; confidence?: string; evidence?: string; source_items?: PlannerSourceItem[]; source_url?: string; }
export interface PlannerFreePullCampaignAllocation { event_id: string; gacha_id?: number; pulls: number; }
export interface PlannerEventBenefit { id: string; event_id: string; gacha_id?: number; campaign_id?: string; kind: string; label: string; item_category?: number; item_id?: number; amount?: number | null; available_at: string; planner_effect: string; provenance?: string; confidence?: string; source_url?: string; }
export interface PlannerFreePullCampaign { id: string; label: string; total_pulls: number; pulls_per_day?: number; allocation_mode?: string; stockable?: boolean; eligible_gacha_ids?: number[]; default_allocations: PlannerFreePullCampaignAllocation[]; provenance?: string; confidence?: string; source_url?: string; }
export interface PlannerPickupRate { pickup_id: number; label?: string; rate: number; exchangeable?: boolean; }
export interface PlannerRarityRate { rarity: number; rate: number; }
export interface PlannerStepUp { selection_pool_size?: number; selection_pickup_rate?: number; rounds: number; steps: { gacha_id: number; pulls: number; cost: number; guaranteed_rarity: number; selectable: boolean }[]; }
export interface PlannerGachaEntry { paid_draw?: { limit: number; guaranteed_rarity: number; guaranteed_count: number }; step_up?: PlannerStepUp; event_id?: string; gacha_id: number; gacha_type?: number; banner_kind: PlannerTarget['bannerKind']; start_date: string; end_date: string; jewel_cost_per_pull?: number; spark_pulls?: number; free_pulls?: number; free_pulls_source_url?: string; ticket_currency?: Extract<PlannerCurrency, 'uma_ticket' | 'support_ticket'>; pickups?: PlannerPickupRate[]; featured_pickups?: PlannerPickupRate[]; rarity_rates?: PlannerRarityRate[]; provenance?: string; confidence?: string; rates_provenance?: string; rates_confidence?: string; }
export interface PlannerGachaResource { version?: string | number; shard?: string; gachas: PlannerGachaEntry[]; }
export interface PlannerGlobalRewardComparison { speculative_method?: string; observation_end: string; speculative_monthly_carats: number; speculative_recent_median_monthly_carats?: number; }
export interface PlannerCompetitiveRewardVariant { master_event_id?: number; id: string; competition: string; event_id: string; label: string; source_items: PlannerSourceItem[]; available_at?: string; default_enabled?: boolean; provenance?: string; source_url?: string; }
export interface PlannerRewardResource { version?: string | number; rewards: PlannerRewardEntry[]; event_benefits?: PlannerEventBenefit[]; free_pull_campaigns?: PlannerFreePullCampaign[]; competitive_variants?: PlannerCompetitiveRewardVariant[]; global_reward_comparison?: PlannerGlobalRewardComparison; }
export interface PlannerDataBundle { core: PlannerCoreResource; income: PlannerIncomeResource; rewards: PlannerRewardResource; gachas?: PlannerGachaEntry[]; timelineEvents?: TimelineRecord[]; supportCardRarities?: Readonly<Record<string,number>>; }
export interface PlannerCustomIncome { id: string; label: string; currency: PlannerCurrency; amount: number; cadence: PlannerIncomeCadence; startDate: string; endDate?: string; every?: number; }
export interface PlannerBalances { freeJewels: number; paidJewels: number; umaTickets: number; supportTickets: number; rainbowCrystals: number; goldCrystals: number; rainbowFullCrystals: number; goldFullCrystals: number; }
export interface PlannerPickupGoal { pickupId: number; desiredCopies: number; }
export interface PlannerTarget { id: string; eventId: string; gachaId?: number; gachaIds?: number[]; title: string; bannerKind: 'character' | 'support' | 'paid' | 'other'; imagePath?: string; bannerStart?: string; bannerEnd?: string; pullTiming: 'start' | 'end' | 'custom'; customPullDate?: string; plannedPulls: number; desiredCopies: number; pickupId?: number; pickupGoals?: PlannerPickupGoal[]; useTickets: boolean; ticketLimit?: number; allowPaidJewels: boolean; rainbowCrystalsPlanned?: number; goldCrystalsPlanned?: number; }
export interface PlannerVariableRewardSelection { optionId: string; label: string; availableAt: string; amounts: Partial<Record<PlannerCurrency, number>>; }
export interface CaratPlan { id: string; name: string; createdAt: string; updatedAt: string; projectionStartDate: string; balances: PlannerBalances; enabledIncomeRuleIds: string[]; enabledRewardIds: string[]; disabledRewardIds: string[]; enabledRewardEventIds: string[]; disabledEventIds: string[]; scenarioSelections: Record<string, string>; variableRewardSelections: Record<string, PlannerVariableRewardSelection>; freePullCampaignSelections: Record<string, string>; resourceDefaultsApplied: boolean; incomePresetId?: 'conservative' | 'casual' | 'active' | 'completionist'; incomePresetEdited?: boolean; customIncome: PlannerCustomIncome[]; targets: PlannerTarget[]; [key: string]: unknown; }
export interface CaratPlanCollection { version: 1; activePlanId: string; plans: CaratPlan[]; }
export interface PlannerGoalProjection { pickupId: number; desiredCopies: number; copiesNeededFromPulls: number; crystalCopiesApplied: number; crystalKind?: 'rainbow' | 'gold'; pickupRate?: number; probability?: number; }
export interface PlannerLedgerEntry { id: string; label: string; date: string; currency: PlannerCurrency; amount: number; source: 'rule' | 'custom' | 'reward'; }
export interface TargetProjection { income: PlannerLedgerEntry[]; targetId: string; pullDate: string; balanceBefore: PlannerBalances; fundedPulls: number; plannedPulls: number; shortfallJewels: number; freePullsUsed: number; freeJewelPulls: number; paidJewelPulls: number; ticketPulls: number; freeJewelsAfter: number; paidJewelsAfter: number; ticketsAfter: number; rewardCaratsGained: number; sparkCopies: number; rainbowCrystalsUsed: number; goldCrystalsUsed: number; pickupProbability?: number; pickupGoals: PlannerGoalProjection[]; ratesAvailable: boolean; jointProbabilityExact: boolean; }
export interface PlanProjection { unallocatedIncome: PlannerLedgerEntry[]; targets: TargetProjection[]; balances: PlannerBalances; totalShortfallJewels: number; requiredPaidJewels: number; plannedPulls: number; }

/** Planner records are JSON-compatible by contract. This also safely unwraps
 * reactive framework proxies before they cross into pure domain functions. */
export function clonePlanCollection(collection: CaratPlanCollection): CaratPlanCollection {
  return JSON.parse(JSON.stringify(collection)) as CaratPlanCollection;
}

function id(prefix: string): string { return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`; }
const integer = (value: unknown): number => { const numeric = Number(value); return Number.isFinite(numeric) ? Math.trunc(numeric) : 0; };
const number = (value: unknown, max = 10_000_000): number => Math.min(max, Math.max(0, integer(value)));
const text = (value: unknown, fallback: string, max = 100): string => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;
function balances(value: unknown): PlannerBalances { const item = value && typeof value === 'object' ? value as Record<string, unknown> : {}; return { freeJewels: number(item.freeJewels, Infinity), paidJewels: number(item.paidJewels, Infinity), umaTickets: number(item.umaTickets, Infinity), supportTickets: number(item.supportTickets, Infinity), rainbowCrystals: number(item.rainbowCrystals, Infinity), goldCrystals: number(item.goldCrystals, Infinity), rainbowFullCrystals: number(item.rainbowFullCrystals, Infinity), goldFullCrystals: number(item.goldFullCrystals, Infinity) }; }
function target(value: unknown): PlannerTarget | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const eventId = text(item.eventId, '');
  const title = text(item.title, '');
  if (!eventId || !title) return null;
  const kind = ['character', 'support', 'paid'].includes(String(item.bannerKind)) ? item.bannerKind as PlannerTarget['bannerKind'] : 'other';
  const timing = ['start', 'custom'].includes(String(item.pullTiming)) ? item.pullTiming as PlannerTarget['pullTiming'] : 'end';
  const legacyDesiredCopies = Math.max(1, number(item.desiredCopies, 20) || 1);
  const seenPickups = new Set<number>();
  const pickupGoals = (Array.isArray(item.pickupGoals) ? item.pickupGoals : []).slice(0, 20).flatMap((goal) => {
    if (!goal || typeof goal !== 'object') return [];
    const raw = goal as Record<string, unknown>;
    const pickupId = number(raw.pickupId, Number.MAX_SAFE_INTEGER);
    if (!pickupId || seenPickups.has(pickupId)) return [];
    seenPickups.add(pickupId);
    return [{ pickupId, desiredCopies: Math.max(1, number(raw.desiredCopies, 20) || 1) }];
  });
  const pickupId = pickupGoals[0]?.pickupId ?? (item.pickupId === undefined ? undefined : number(item.pickupId, Number.MAX_SAFE_INTEGER) || undefined);
  const desiredCopies = pickupGoals[0]?.desiredCopies ?? legacyDesiredCopies;
  return {
    id: text(item.id, id('target')), eventId,
    gachaId: item.gachaId === undefined ? undefined : number(item.gachaId, Number.MAX_SAFE_INTEGER),
    gachaIds: numberArray(item.gachaIds), title, bannerKind: kind,
    imagePath: text(item.imagePath, '', 500) || undefined,
    bannerStart: validPlannerDateKey(item.bannerStart) || undefined,
    bannerEnd: validPlannerDateKey(item.bannerEnd) || undefined,
    pullTiming: timing, customPullDate: validPlannerDateKey(item.customPullDate) || undefined,
    plannedPulls: number(item.plannedPulls, 5000), desiredCopies, pickupId,
    pickupGoals: Array.isArray(item.pickupGoals) ? pickupGoals : pickupId ? [{ pickupId, desiredCopies }] : [],
    useTickets: item.useTickets !== false,
    ticketLimit: item.ticketLimit === undefined ? undefined : number(item.ticketLimit, 5000),
    allowPaidJewels: item.allowPaidJewels === true,
    rainbowCrystalsPlanned: number(item.rainbowCrystalsPlanned, 20),
    goldCrystalsPlanned: number(item.goldCrystalsPlanned, 20)
  };
}
export function createPlan(name = 'My plan'): CaratPlan { const now = new Date().toISOString(); return { id: id('plan'), name, createdAt: now, updatedAt: now, projectionStartDate: now.slice(0, 10), balances: balances({}), enabledIncomeRuleIds: [], enabledRewardIds: [], disabledRewardIds: [], enabledRewardEventIds: [], disabledEventIds: [], scenarioSelections: { speculative_income: 'include', ...CONDITIONAL_REWARD_DEFAULT_SELECTIONS }, variableRewardSelections: {}, freePullCampaignSelections: {}, resourceDefaultsApplied: false, customIncome: [], targets: [] }; }
export function sanitizePlan(value: unknown): CaratPlan | null { if (!value || typeof value !== 'object') return null; const item = value as Record<string, unknown>; const now = new Date().toISOString(); return { ...item, id: text(item.id, id('plan')), name: text(item.name, 'Untitled plan', 80), createdAt: text(item.createdAt, now), updatedAt: text(item.updatedAt, now), projectionStartDate: validPlannerDateKey(item.projectionStartDate) || now.slice(0, 10), balances: balances(item.balances), enabledIncomeRuleIds: stringArray(item.enabledIncomeRuleIds), enabledRewardIds: stringArray(item.enabledRewardIds), disabledRewardIds: stringArray(item.disabledRewardIds), enabledRewardEventIds: stringArray(item.enabledRewardEventIds), disabledEventIds: stringArray(item.disabledEventIds), scenarioSelections: sanitizeScenarioSelections(item.scenarioSelections), variableRewardSelections: sanitizeVariableSelections(item.variableRewardSelections), freePullCampaignSelections: recordString(item.freePullCampaignSelections), resourceDefaultsApplied: item.resourceDefaultsApplied === true, incomePresetId: ['conservative','casual','active','completionist'].includes(String(item.incomePresetId)) ? item.incomePresetId as CaratPlan['incomePresetId'] : undefined, incomePresetEdited: item.incomePresetEdited === true, customIncome: (Array.isArray(item.customIncome) ? item.customIncome : []).map(customIncome).filter((entry): entry is PlannerCustomIncome => Boolean(entry)).slice(0, 200), targets: (Array.isArray(item.targets) ? item.targets : []).map(target).filter((entry): entry is PlannerTarget => Boolean(entry)).slice(0, 200) } as CaratPlan; }
function customIncome(value: unknown): PlannerCustomIncome | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const label = text(item.label, '', 100);
  const startDate = validPlannerDateKey(item.startDate);
  if (!label || !startDate) return null;
  const currency = ['free_jewels','paid_jewels','uma_ticket','support_ticket','rainbow_crystal','gold_crystal','rainbow_full_crystal','gold_full_crystal'].includes(String(item.currency)) ? item.currency as PlannerCurrency : 'free_jewels';
  const cadence = ['daily','weekly','monthly','interval'].includes(String(item.cadence)) ? item.cadence as PlannerIncomeCadence : 'once';
  return { id: text(item.id, id('income')), label, currency, amount: integer(item.amount), cadence, startDate, endDate: validPlannerDateKey(item.endDate) || undefined, every: Math.max(1, integer(item.every)) };
}
function stringArray(value: unknown): string[] { return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string'))] : []; }
function numberArray(value: unknown): number[] { return Array.isArray(value) ? [...new Set(value.map(Number).filter((item) => Number.isFinite(item) && item >= 0).map(Math.trunc))] : []; }
function sanitizeScenarioSelections(value: unknown): Record<string, string> {
  const selections = recordString(value);
  const legacy = selections.seasonal_gift_rewards;
  if (legacy) {
    for (const group of ['valentines_gift_rewards', 'white_day_gift_rewards', 'christmas_gift_rewards']) {
      if (!Object.hasOwn(selections, group)) selections[group] = legacy;
    }
    delete selections.seasonal_gift_rewards;
  }
  if (selections.speculative_income === '') selections.speculative_income = 'none';
  return { speculative_income: 'include', ...CONDITIONAL_REWARD_DEFAULT_SELECTIONS, ...selections };
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function recordString(value: unknown): Record<string, string> { return Object.fromEntries(Object.entries(record(value)).filter((item): item is [string, string] => typeof item[1] === 'string').slice(0, 100).map(([key, item]) => [key.slice(0, 100), item.slice(0, 100)])); }
function sanitizeVariableSelections(value: unknown): Record<string, PlannerVariableRewardSelection> { const result: Record<string, PlannerVariableRewardSelection> = {}; for (const [eventId, raw] of Object.entries(record(value))) { if (!raw || typeof raw !== 'object') continue; const item = raw as Record<string, unknown>; const optionId = text(item.optionId, ''); const label = text(item.label, ''); const availableAt = text(item.availableAt, ''); if (!optionId || !label) continue; const amounts = Object.fromEntries(Object.entries(record(item.amounts)).filter(([currency]) => ['free_jewels','paid_jewels','uma_ticket','support_ticket','rainbow_crystal','gold_crystal','rainbow_full_crystal','gold_full_crystal'].includes(currency)).map(([currency, amount]) => [currency, number(amount)])) as Partial<Record<PlannerCurrency, number>>; result[eventId] = { optionId, label, availableAt, amounts }; } return result; }
export function loadPlanCollection(storage: Pick<Storage, 'getItem'> = localStorage): CaratPlanCollection { try { const parsed = JSON.parse(storage.getItem(CARAT_PLANNER_STORAGE_KEY) ?? 'null') as Record<string, unknown> | null; const plans = (Array.isArray(parsed?.plans) ? parsed.plans : []).map(sanitizePlan).filter((plan): plan is CaratPlan => Boolean(plan)).slice(0, 50); if (plans.length) { const active = text(parsed?.activePlanId, ''); return { version: 1, activePlanId: plans.some((plan) => plan.id === active) ? active : plans[0]!.id, plans }; } } catch {} const plan = createPlan(); return { version: 1, activePlanId: plan.id, plans: [plan] }; }
export function withoutPlannerResourceDates(plan: CaratPlan): CaratPlan {
  return { ...plan, targets: plan.targets.map(target => { const copy = { ...target }; delete copy.bannerStart; delete copy.bannerEnd; return copy; }) };
}
export function savePlanCollection(collection: CaratPlanCollection, storage: Pick<Storage, 'setItem'> = localStorage): void { const plans = collection.plans.map(sanitizePlan).filter((plan): plan is CaratPlan => Boolean(plan)).slice(0, 50).map(withoutPlannerResourceDates); if (!plans.length) plans.push(createPlan()); const clean = { version: 1 as const, activePlanId: plans.some((plan) => plan.id === collection.activePlanId) ? collection.activePlanId : plans[0]!.id, plans }; storage.setItem(CARAT_PLANNER_STORAGE_KEY, JSON.stringify(clean)); }
export function importPlanCollection(json: string, collection: CaratPlanCollection): CaratPlanCollection {
  if (json.length > 2_000_000) throw new Error('Planner import is too large.');
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error('Planner import is not valid JSON.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Planner import has an invalid shape.');
  const value = parsed as Record<string, unknown>;
  const imported = (Array.isArray(value.plans) ? value.plans : [value.plan ?? value]).map(raw => Array.isArray(raw) ? null : sanitizePlan(raw)).filter((plan): plan is CaratPlan => Boolean(plan)).slice(0, 50);
  if (!imported.length) throw new Error('Planner import contains no usable plans.');
  const next = clonePlanCollection(collection);
  const ids = new Set(next.plans.map(plan => plan.id));
  const names = new Set(next.plans.map(plan => plan.name.toLowerCase()));
  for (const plan of imported) {
    if (ids.has(plan.id)) plan.id = id('plan');
    ids.add(plan.id);
    plan.name = uniquePlanName(plan.name, names);
    names.add(plan.name.toLowerCase());
    next.plans.push(plan);
  }
  next.plans = next.plans.slice(0, 50);
  const last = imported.at(-1)!;
  next.activePlanId = next.plans.some(plan => plan.id === last.id) ? last.id : next.plans[0]!.id;
  return next;
}
function uniquePlanName(name: string, names: ReadonlySet<string>): string {
  let candidate = name;
  let suffix = 2;
  while (names.has(candidate.toLowerCase())) candidate = `${name.slice(0, 80 - String(suffix).length - 1)} ${suffix++}`;
  return candidate;
}
export function importSharedPlan(value: unknown, shareId: string, collection: CaratPlanCollection): CaratPlanCollection {
  const cleanId = text(shareId, '', 20).replace(/[^a-zA-Z0-9]/g, '');
  if (!cleanId) throw new Error('Shared plan link is invalid.');
  const sharedId = `shared-${cleanId}`;
  const next = clonePlanCollection(collection);
  if (!next.plans.some(plan => plan.id === sharedId)) {
    const imported = Array.isArray(value) ? null : sanitizePlan(value);
    if (!imported) throw new Error('Shared plan contains no usable planner data.');
    imported.id = sharedId;
    imported.name = uniquePlanName(`${imported.name} (shared)`.slice(0, 80), new Set(next.plans.map(plan => plan.name.toLowerCase())));
    imported.createdAt = imported.updatedAt = new Date().toISOString();
    next.plans.push(imported);
    next.plans = next.plans.slice(0, 50);
  }
  next.activePlanId = next.plans.some(plan => plan.id === sharedId) ? sharedId : next.plans[0]!.id;
  return next;
}
export function activePlan(collection: CaratPlanCollection): CaratPlan { return collection.plans.find((plan) => plan.id === collection.activePlanId) ?? collection.plans[0]!; }
export function enabledPlannerTargets(plan: CaratPlan): PlannerTarget[] {
  const disabled = new Set(plan.disabledEventIds);
  return plan.targets.filter(target => !disabled.has(target.eventId));
}
export function bannerKind(event: Pick<TimelineRecord, 'eventType'> & Partial<Pick<TimelineRecord, 'gachaType'>>): PlannerTarget['bannerKind'] { if (event.eventType.includes('paid') || paidBannerType(event.gachaType)) return 'paid'; if (event.eventType.includes('character')) return 'character'; if (event.eventType.includes('support')) return 'support'; return 'other'; }
export type PlannerGachaEvent = Pick<TimelineRecord, 'id' | 'title' | 'eventType'> & Partial<Pick<TimelineRecord, 'date' | 'estimatedEndDate' | 'gachaId' | 'gachaIds' | 'gachaType' | 'pickupCardIds'>>;
function normalizedEventId(id: string): string { return id.trim().replaceAll('_', '-').replace(/-+/g, '-').toLowerCase(); }
export function findPlannerEvent(id: string, events: readonly TimelineRecord[]): TimelineRecord | undefined {
  return timelineEventIndex(events).get(id) ?? events.find(event => normalizedEventId(event.id) === normalizedEventId(id));
}
export function plannerTargetEvents(plan: CaratPlan, events: readonly TimelineRecord[]): PlannerGachaEvent[] {
  return enabledPlannerTargets(plan).filter(target => target.bannerKind === 'character' || target.bannerKind === 'support' || target.bannerKind === 'paid').map(target => {
    const event = findPlannerEvent(target.eventId, events);
    return {
      id: event?.id ?? target.eventId, title: event?.title ?? target.title,
      eventType: event?.eventType ?? `${target.bannerKind}_banner`,
      gachaId: event?.gachaId ?? target.gachaId, gachaIds: event?.gachaIds ?? target.gachaIds,
      gachaType: event?.gachaType,
      date: event?.date ?? parseResourceDate(target.bannerStart),
      estimatedEndDate: event ? event.estimatedEndDate : parseResourceDate(target.bannerEnd),
      pickupCardIds: event?.pickupCardIds.length ? event.pickupCardIds : plannerPickupGoals(target).map(goal => goal.pickupId),
    };
  });
}
export function synchronizePlannerTargets(plan: CaratPlan, events: readonly TimelineRecord[], gachas: PlannerGachaEntry[] = []): CaratPlan {
  let changed = false;
  const targets = plan.targets.map(target => {
    const next = { ...target };
    const event = findPlannerEvent(target.eventId, events);
    if (event) {
      next.title = event.title;
      const kind = bannerKind(event);
      if (kind !== 'other') next.bannerKind = kind;
      if (event.image) next.imagePath = event.image; else delete next.imagePath;
      if (event.gachaId !== undefined) next.gachaId = event.gachaId;
      if (event.gachaIds.length) next.gachaIds = event.gachaIds; else delete next.gachaIds;
    }
    const gacha = findGacha(next, { gachas });
    const resourceStart = event?.date?.toISOString().slice(0, 10) ?? parseResourceDate(gacha?.start_date)?.toISOString().slice(0, 10);
    const start = resourceStart ?? parseResourceDate(target.bannerStart)?.toISOString().slice(0, 10);
    const resourceEnd = event?.estimatedEndDate?.toISOString().slice(0, 10) ?? parseResourceDate(gacha?.end_date)?.toISOString().slice(0, 10) ?? resourceStart;
    const end = resourceEnd ?? parseResourceDate(target.bannerEnd)?.toISOString().slice(0, 10) ?? start;
    if (start) next.bannerStart = start; else delete next.bannerStart;
    if (end) next.bannerEnd = end; else delete next.bannerEnd;
    if (JSON.stringify(next) === JSON.stringify(target)) return target;
    changed = true;
    return next;
  });
  return changed ? { ...plan, targets } : plan;
}
export function setTimelineEvent(
  collection: CaratPlanCollection,
  event: Pick<TimelineRecord, 'id' | 'title' | 'eventType'> & Partial<Pick<TimelineRecord, 'date' | 'estimatedEndDate' | 'pickupCardIds' | 'image' | 'gachaId' | 'gachaIds' | 'gachaType' | 'plannerRewardAvailable'>>,
  selected: boolean,
  rewards?: PlannerRewardResource,
): CaratPlanCollection {
  const copy = clonePlanCollection(collection);
  const plan = activePlan(copy);
  const disabled = new Set(plan.disabledEventIds);
  // Angular disables a target without discarding its configured pulls or goals.
  selected ? disabled.delete(event.id) : disabled.add(event.id);
  plan.disabledEventIds = [...disabled];
  const existing = plan.targets.find((item) => item.eventId === event.id);
  const kind = bannerKind(event);
  if (selected && (kind === 'character' || kind === 'support' || kind === 'paid')) {
    const start = (event.date ?? new Date()).toISOString().slice(0, 10);
    const end = event.estimatedEndDate?.toISOString().slice(0, 10) ?? start;
    const pickupId = event.pickupCardIds?.[0];
    if (existing) {
      Object.assign(existing, { title: event.title, bannerKind: kind, bannerStart: start, bannerEnd: end });
      if (event.image !== undefined) existing.imagePath = event.image;
      if (event.gachaId !== undefined) existing.gachaId = event.gachaId;
      if (event.gachaIds?.length) existing.gachaIds = [...event.gachaIds];
      if (pickupId !== undefined && existing.pickupId === undefined && !existing.pickupGoals?.length) {
        existing.pickupId = pickupId;
        existing.desiredCopies = 1;
        existing.pickupGoals = [{ pickupId, desiredCopies: 1 }];
      }
    } else {
      plan.targets.push({ id: id('target'), eventId: event.id, gachaId: event.gachaId, gachaIds: event.gachaIds?.length ? [...event.gachaIds] : undefined, title: event.title, bannerKind: kind, imagePath: event.image, bannerStart: start, bannerEnd: end, pullTiming: 'end', plannedPulls: event.gachaType === 14 ? 50 : kind === 'paid' ? 10 : 200, desiredCopies: 1, pickupId, pickupGoals: pickupId === undefined ? [] : [{ pickupId, desiredCopies: 1 }], useTickets: kind !== 'paid', allowPaidJewels: kind === 'paid' });
    }
  }
  if (event.plannerRewardAvailable) {
    const rewardEvents = new Set(plan.enabledRewardEventIds);
    selected ? rewardEvents.add(event.id) : rewardEvents.delete(event.id);
    plan.enabledRewardEventIds = [...rewardEvents];
    if (selected && rewards) {
      const enabledIds = new Set(plan.enabledRewardIds);
      const disabledIds = new Set(plan.disabledRewardIds);
      for (const reward of rewards.rewards) {
        if (reward.event_id !== event.id) continue;
        const usable = Number.isFinite(reward.amount) && Number(reward.amount) > 0
          || plannerSourceItemTotals(reward.source_items ?? []).size > 0
          || reward.source_items?.some(item => item.item_category === 41 || item.item_category === 42);
        if (!usable) continue;
        disabledIds.delete(reward.id);
        plannerRewardNeedsEnabledOverride(reward) ? enabledIds.add(reward.id) : enabledIds.delete(reward.id);
      }
      for (const variant of rewards.competitive_variants ?? []) {
        if (variant.event_id !== event.id || variant.default_enabled !== true || !plannerSourceItemTotals(variant.source_items).size) continue;
        enabledIds.delete(variant.id);
        disabledIds.delete(variant.id);
      }
      plan.enabledRewardIds = [...enabledIds];
      plan.disabledRewardIds = [...disabledIds];
    }
  }
  plan.updatedAt = new Date().toISOString();
  return copy;
}
const dayMs = 86_400_000;
export function resolvePlannerPullDate(target: PlannerTarget, today = new Date().toISOString().slice(0, 10)): string {
  const fallback = utcDay(target.bannerStart) ?? utcDay(today)!;
  const date = utcDay(target.pullTiming === 'custom' ? target.customPullDate : target.pullTiming === 'end' ? target.bannerEnd : target.bannerStart) ?? fallback;
  return new Date(date * dayMs).toISOString().slice(0, 10);
}
function pullDay(target: PlannerTarget): number { return utcDay(resolvePlannerPullDate(target))!; }
function expandIncomeRule(rule: PlannerIncomeRule, start: number, end: number, source: PlannerLedgerEntry['source'] = 'rule'): PlannerLedgerEntry[] {
  const ruleStart = utcDay(rule.start_date);
  if (ruleStart === undefined || !Number.isFinite(rule.amount) || rule.amount === 0) return [];
  const last = Math.min(end, utcDay(rule.end_date) ?? end);
  if (last < start) return [];
  const every = Math.max(1, Number.isFinite(rule.every) ? Math.trunc(rule.every!) : 1);
  const entries: PlannerLedgerEntry[] = [];
  const push = (day: number, occurrence: number) => {
    if (day >= start && day >= ruleStart && day <= last) {
      const date = dayKey(day);
      entries.push({ id: `${rule.id}:${occurrence}:${date}`, label: rule.label, date, currency: rule.currency, amount: Math.trunc(rule.amount), source });
    }
  };
  if (rule.cadence === 'once') { push(ruleStart, 0); return entries; }
  if (rule.cadence === 'monthly') {
    const anchor = new Date(ruleStart * dayMs);
    const requestedDay = Math.min(31, Math.max(1, (Number.isFinite(rule.day_of_month) ? Math.max(0, Math.trunc(rule.day_of_month!)) : 0) || anchor.getUTCDate()));
    for (let occurrence = 0; occurrence < 2400; occurrence++) {
      const month = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + occurrence * every, 1));
      if (month.getTime() / dayMs > last || !Number.isFinite(month.getTime())) break;
      const days = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
      push(Math.trunc(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), Math.min(requestedDay, days)) / dayMs), occurrence);
    }
    return entries;
  }
  let anchor = ruleStart;
  if (rule.cadence === 'weekly' && Number.isFinite(rule.weekday)) {
    const weekday = Math.min(6, Math.max(0, Math.trunc(rule.weekday!)));
    anchor += (weekday - new Date(anchor * dayMs).getUTCDay() + 7) % 7;
  }
  const interval = every * (rule.cadence === 'weekly' ? 7 : 1);
  // Keep Angular's 10,000-occurrence ceiling relative to the original rule start.
  const first = Math.max(0, Math.ceil((start - anchor) / interval));
  for (let occurrence = first; occurrence < 10000; occurrence++) {
    const day = occurrence === 0 ? anchor : anchor + occurrence * interval;
    if (day > last) break;
    push(day, occurrence);
  }
  return entries;
}
function balanceKey(currency: PlannerCurrency): keyof PlannerBalances { return ({ free_jewels:'freeJewels', paid_jewels:'paidJewels', uma_ticket:'umaTickets', support_ticket:'supportTickets', rainbow_crystal:'rainbowCrystals', gold_crystal:'goldCrystals', rainbow_full_crystal:'rainbowFullCrystals', gold_full_crystal:'goldFullCrystals' } as const)[currency] ?? 'freeJewels'; }
function addCurrency(balances: PlannerBalances, currency: PlannerCurrency, amount: number): void { const key = balanceKey(currency); balances[key] = Math.max(0, balances[key] + Math.trunc(amount)); }

/** One ordered ledger for every income source; category totals lose deduction ordering. */
export function buildPlannerLedger(plan: CaratPlan, bundle: PlannerDataBundle | undefined, throughDate: string, pullDates: readonly string[] = enabledPlannerTargets(plan).map(target => resolvePlannerPullDate(target))): PlannerLedgerEntry[] {
  const start = utcDay(plan.projectionStartDate), through = utcDay(throughDate);
  if (start === undefined || through === undefined || through < start) return [];
  const events = bundle?.timelineEvents ?? [];
  const entries: PlannerLedgerEntry[] = [];
  for (const rule of bundle?.income.rules ?? []) {
    if (isLegacyTrainingPassIncomeRule(rule) || (!rule.scenario_group && !plan.enabledIncomeRuleIds.includes(rule.id)) || !incomeRuleScenarioSelectionMatches(rule, plan.scenarioSelections)) continue;
    entries.push(...expandIncomeRule(rule, start, through));
    const purchase = dailyCaratPackPurchaseRule(rule, dayKey(start));
    if (purchase) entries.push(...expandIncomeRule(purchase, start, through));
  }
  const activeRewards = (bundle?.rewards.rewards ?? []).flatMap(reward => {
    if (reward.event_id && plan.disabledEventIds.includes(reward.event_id)) return [];
    if (!plannerRewardSelectionEnabled(reward, plan.scenarioSelections, plan.enabledRewardIds.includes(reward.id), plan.disabledRewardIds.includes(reward.id))) return [];
    const group = conditionalRewardScenarioGroup(reward);
    return [group ? { ...reward, amount: selectedConditionalRewardAmount(reward, plan.scenarioSelections[group]) } : reward];
  });
  for (const reward of plannerRewardBundles(activeRewards)) {
    const window = plannerRewardAvailabilityWindow(reward.eventId, [reward.availableAt], events, [reward.availableUntil]);
    const date = window ? (window.startsAt < dayKey(start) && window.endsAt >= dayKey(start) ? dayKey(start) : window.startsAt) : reward.availableAt;
    const day = utcDay(date);
    if (day === undefined || day < start || day > through) continue;
    for (const [currency, amount] of reward.totals) if (amount !== 0) entries.push({ id: `reward:${reward.id}:${currency}`, label: reward.label, date: dayKey(day), currency, amount, source: 'reward' });
  }
  if (bundle) entries.push(...competitionIncomeEntries(plan, bundle, start - 1, through));
  for (const custom of plan.customIncome) {
    entries.push(...expandIncomeRule({ ...custom, start_date: custom.startDate, end_date: custom.endDate }, start, through, 'custom'));
  }
  for (const rule of [...trainingPassIncomeRules(plan.scenarioSelections.training_pass, events), ...randomGameplayIncomeRules(plan.scenarioSelections.random_gameplay_income, dayKey(start))]) {
    entries.push(...expandIncomeRule(rule, start, through));
  }
  entries.push(...speculativeIncomeEntries(bundle?.rewards.global_reward_comparison, plan.scenarioSelections.speculative_income, start, through, pullDates));
  return entries.sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));
}
export function findGacha(target: PlannerTarget, bundle?: Pick<PlannerDataBundle, 'gachas'>): PlannerGachaEntry | undefined {
  const ids = new Set([target.gachaId, ...(target.gachaIds ?? [])].filter((value): value is number => value !== undefined));
  return bundle?.gachas?.find((gacha) => gacha.event_id === target.eventId) ?? bundle?.gachas?.find((gacha) => ids.has(gacha.gacha_id)) ?? bundle?.gachas?.find(gacha => gacha.event_id && normalizedEventId(gacha.event_id) === normalizedEventId(target.eventId));
}
function freePullsByTarget(plan: CaratPlan, bundle: PlannerDataBundle | undefined, ordered: readonly PlannerTarget[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const campaign of bundle?.rewards.free_pull_campaigns ?? []) {
    const total = number(campaign.total_pulls, 10_000);
    const defaults = (campaign.default_allocations ?? []).filter((allocation) => allocation.event_id && number(allocation.pulls, 10_000) > 0);
    if (!campaign.id || !total || !defaults.length || plan.freePullCampaignSelections[campaign.id] === '__excluded__') continue;
    const supportsStock = campaign.stockable === true || campaign.allocation_mode === 'daily_with_one_time_stock';
    const selectedEvent = plan.freePullCampaignSelections[campaign.id];
    const stockDestination = defaults.at(-1);
    const allocations = supportsStock && selectedEvent === stockDestination?.event_id ? [{ ...stockDestination, pulls: total }] : defaults;
    let remaining = total;
    const claimed = new Set<string>();
    for (const allocation of allocations) {
      const pulls = Math.min(remaining, number(allocation.pulls, 10_000));
      remaining -= pulls;
      const target = ordered.find((item) => !claimed.has(item.id) && (item.eventId === allocation.event_id || allocation.gacha_id !== undefined && (item.gachaId === allocation.gacha_id || item.gachaIds?.includes(allocation.gacha_id))));
      if (!target || !pulls) continue;
      claimed.add(target.id);
      result.set(target.id, (result.get(target.id) ?? 0) + pulls);
    }
  }
  return result;
}
export function availableCrystals(full: number, shards: number): number { return Math.max(0, Math.trunc(full)) + Math.floor(Math.max(0, Math.trunc(shards)) / 20); }
function consumeCrystals(current: PlannerBalances, kind: 'rainbow' | 'gold', requested: number): void {
  const fullKey = kind === 'rainbow' ? 'rainbowFullCrystals' : 'goldFullCrystals';
  const shardKey = kind === 'rainbow' ? 'rainbowCrystals' : 'goldCrystals';
  const fullUsed = Math.min(requested, current[fullKey]);
  current[fullKey] -= fullUsed;
  current[shardKey] = Math.max(0, current[shardKey] - (requested - fullUsed) * 20);
}
export function plannerPickupGoals(target: PlannerTarget, fallbackPickupId?: number): PlannerPickupGoal[] {
  const goals = target.pickupGoals ?? (target.pickupId === undefined ? [] : [{ pickupId: target.pickupId, desiredCopies: target.desiredCopies }]);
  const source = goals.length || fallbackPickupId === undefined ? goals : [{ pickupId: fallbackPickupId, desiredCopies: target.desiredCopies }];
  return source.map(goal => ({ pickupId: goal.pickupId, desiredCopies: Math.max(1, number(goal.desiredCopies, target.bannerKind === 'support' ? 5 : 20)) }));
}

export function projectPlan(plan: CaratPlan, costOrBundle: number | PlannerDataBundle = 150, preparedLedger?: PlannerLedgerEntry[]): PlanProjection {
  const bundle = typeof costOrBundle === 'number' ? undefined : costOrBundle;
  const defaultJewelCost = typeof costOrBundle === 'number' ? Math.max(1, costOrBundle) : Math.max(1, Number(costOrBundle.core.jewel_cost_per_pull) || 150);
  const projectionStart = utcDay(plan.projectionStartDate) ?? 0;
  const ordered = enabledPlannerTargets(plan)
    .filter((target) => pullDay(target) >= projectionStart)
    .sort((left, right) => pullDay(left) - pullDay(right) || left.id.localeCompare(right.id));
  const campaignPulls = freePullsByTarget(plan, bundle, ordered);
  const current: PlannerBalances = balances(plan.balances);
  const pullDates = ordered.map(target => resolvePlannerPullDate(target));
  const ledger = preparedLedger ?? buildPlannerLedger(plan, bundle, pullDates.at(-1) ?? plan.projectionStartDate, pullDates);
  let ledgerIndex = 0;
  const targets: TargetProjection[] = [];
  let totalShortfallJewels = 0;
  let requiredPaidJewels = 0;
  let rewardCaratsGained = 0;
  let plannedPulls = 0;
  for (const target of ordered) {
    const targetDay = pullDay(target);
    const income: PlannerLedgerEntry[] = [];
    const pullDate = dayKey(targetDay);
    while (ledgerIndex < ledger.length && ledger[ledgerIndex]!.date <= pullDate) {
      const entry = ledger[ledgerIndex++]!;
      addCurrency(current, entry.currency, entry.amount);
      income.push(entry);
      if (entry.source === 'reward' && (entry.currency === 'free_jewels' || entry.currency === 'paid_jewels')) rewardCaratsGained += entry.amount;
    }
    const balanceBefore = { ...current };
    const gacha = findGacha(target, bundle);
    const stepUp = gacha?.step_up;
    const steps = paidBannerSteps(gacha);
    const paidOnly = isPaidBanner(target, gacha);
    const cardKind = plannerCardKind(target, gacha);
    const planned = paidOnly ? Math.min(Math.floor(number(target.plannedPulls, 5000) / 10) * 10, steps.reduce((sum, step) => sum + step.pulls, 0)) : number(target.plannedPulls, 5000);
    plannedPulls += planned;
    const freePullsAvailable = campaignPulls.has(target.id) ? campaignPulls.get(target.id)! : number(gacha?.free_pulls, 5000);
    const freePullsUsed = paidOnly ? 0 : Math.min(planned, freePullsAvailable);
    let remaining = planned - freePullsUsed;
    const ticketCurrency = gacha?.ticket_currency ?? (target.bannerKind === 'support' ? 'support_ticket' : target.bannerKind === 'character' ? 'uma_ticket' : undefined);
    const ticketKey = ticketCurrency ? balanceKey(ticketCurrency) : undefined;
    const availableTickets = !paidOnly && target.useTickets && ticketKey ? Math.min(current[ticketKey], target.ticketLimit ?? Number.MAX_SAFE_INTEGER, remaining) : 0;
    if (ticketKey) current[ticketKey] -= availableTickets;
    remaining -= availableTickets;
    const jewelCost = Math.max(1, number(gacha?.jewel_cost_per_pull ?? defaultJewelCost));
    const freeJewelPulls = paidOnly ? 0 : Math.min(remaining, Math.floor(current.freeJewels / jewelCost));
    current.freeJewels -= freeJewelPulls * jewelCost;
    remaining -= freeJewelPulls;
    let paidJewelPulls = 0;
    let paidCost = 0;
    if (paidOnly) {
      for (const step of steps) {
        if (paidJewelPulls + step.pulls > planned) break;
        paidJewelPulls += step.pulls;
        paidCost += step.cost;
      }
      // Paid banners assume the missing currency will be supplied by their pull date.
      current.paidJewels = Math.max(0, current.paidJewels - paidCost);
    } else {
      paidJewelPulls = target.allowPaidJewels ? Math.min(remaining, Math.floor(current.paidJewels / jewelCost)) : 0;
      current.paidJewels -= paidJewelPulls * jewelCost;
    }
    remaining -= paidJewelPulls;
    const fundedPulls = planned - remaining;
    const sparkPulls = number(gacha?.spark_pulls ?? (paidOnly ? 0 : bundle?.core.default_spark_pulls ?? 200));
    const goals = stepUp ? [{ pickupId: 0, desiredCopies: Math.max(1, number(target.desiredCopies, cardKind === 'support' ? 5 : 20)) }] : plannerPickupGoals({ ...target, bannerKind: cardKind }, target.pickupId ?? gacha?.pickups?.[0]?.pickup_id);
    let rainbowCrystalsUsed = 0;
    let goldCrystalsUsed = 0;
    const adjustedGoals = goals.map((goal) => {
      const rarity = !stepUp && cardKind === 'support' ? bundle?.supportCardRarities?.[String(goal.pickupId)] : undefined;
      const desiredCopies = goal.desiredCopies;
      const crystalKind = stepUp || cardKind !== 'support' || rarity === 1 ? undefined : rarity === 2 ? 'gold' as const : 'rainbow' as const;
      let crystalCopies = 0;
      if (rarity === 2) {
        crystalCopies = Math.max(0, Math.min(desiredCopies - 1, number(target.goldCrystalsPlanned, 20) - goldCrystalsUsed, availableCrystals(current.goldFullCrystals, current.goldCrystals) - goldCrystalsUsed));
        goldCrystalsUsed += crystalCopies;
      } else if (!stepUp && cardKind === 'support' && rarity !== 1) {
        crystalCopies = Math.max(0, Math.min(desiredCopies - 1, number(target.rainbowCrystalsPlanned, 20) - rainbowCrystalsUsed, availableCrystals(current.rainbowFullCrystals, current.rainbowCrystals) - rainbowCrystalsUsed));
        rainbowCrystalsUsed += crystalCopies;
      }
      const pickup = (gacha?.pickups ?? gacha?.featured_pickups)?.find(item => item.pickup_id === goal.pickupId);
      return { pickupId: goal.pickupId, desiredCopies, crystalKind, crystalCopiesApplied: crystalCopies, requestedCopies: Math.max(1, desiredCopies - crystalCopies), rate: stepUp?.selection_pickup_rate ?? pickup?.rate ?? Number.NaN, exchangeable: !stepUp && pickup?.exchangeable !== false };
    });
    if (cardKind === 'support') {
      consumeCrystals(current, 'rainbow', rainbowCrystalsUsed);
      consumeCrystals(current, 'gold', goldCrystalsUsed);
    }
    const goalProbability = adjustedGoals.length ? calculateMultiPickupProbability(fundedPulls, adjustedGoals, sparkPulls, paidOnly ? paidBannerDrawRates(gacha, fundedPulls, adjustedGoals.map(goal => goal.rate)) : undefined) : undefined;
    const pickupProbability = goalProbability?.jointProbability;
    const pickupGoals = adjustedGoals.map(goal => {
      const odds = goalProbability?.goals.find(item => item.pickupId === goal.pickupId);
      return { pickupId: goal.pickupId, desiredCopies: goal.desiredCopies, copiesNeededFromPulls: goal.requestedCopies, crystalCopiesApplied: goal.crystalCopiesApplied, crystalKind: goal.crystalKind, pickupRate: odds?.pickupRate, probability: odds?.probability };
    });
    const ratesAvailable = pickupGoals.length > 0 && pickupGoals.every(goal => goal.pickupRate !== undefined);
    const shortfallJewels = paidOnly ? Math.max(0, paidCost - balanceBefore.paidJewels) : remaining * jewelCost;
    totalShortfallJewels += shortfallJewels;
    if (paidOnly) requiredPaidJewels += shortfallJewels;
    targets.push({ income, targetId: target.id, pullDate: new Date(targetDay * dayMs).toISOString().slice(0,10), balanceBefore, fundedPulls, plannedPulls: planned, shortfallJewels, freePullsUsed, freeJewelPulls, paidJewelPulls, ticketPulls: availableTickets, freeJewelsAfter: current.freeJewels, paidJewelsAfter: current.paidJewels, ticketsAfter: ticketKey ? current[ticketKey] : 0, rewardCaratsGained, sparkCopies: sparkPulls > 0 ? Math.floor(fundedPulls / sparkPulls) : 0, rainbowCrystalsUsed, goldCrystalsUsed, pickupProbability, pickupGoals, ratesAvailable, jointProbabilityExact: goalProbability?.jointProbabilityExact ?? false });
  }
  return { targets, balances: current, totalShortfallJewels, requiredPaidJewels, plannedPulls, unallocatedIncome: ledger.slice(ledgerIndex) };
}
export function probabilityAtLeast(draws: number, copies: number, rate = .0075, sparkCopies = Math.floor(draws / 200)): number { const needed = Math.max(0, copies - sparkCopies); if (!needed) return 1; if (!draws || rate <= 0) return 0; let probabilityBelow = 0; let term = Math.pow(1 - rate, draws); for (let hits = 0; hits < needed; hits += 1) { if (hits) term *= (draws - hits + 1) / hits * rate / (1 - rate); probabilityBelow += term; } return Math.max(0, Math.min(1, 1 - probabilityBelow)); }
