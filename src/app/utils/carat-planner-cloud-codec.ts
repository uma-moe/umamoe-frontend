import {
  CaratPlan,
  CaratPlanCollection,
  PlannerBannerKind,
  PlannerCurrency,
  PlannerIncomeCadence,
  PLANNER_INCOME_PRESET_IDS,
  PlannerPickupGoal,
  PlannerTarget,
} from '../models/carat-planner.model';
import {
  compactPlannerPlanData,
  expandCompactPlannerPlanData,
} from './carat-planner-share-codec';
import {
  CONDITIONAL_REWARD_DEFAULT_SELECTIONS,
  SPECULATIVE_INCOME_INCLUDED_OPTION,
  SPECULATIVE_INCOME_SCENARIO_GROUP_ID,
} from './carat-planner-income-assumptions';

const CLOUD_COLLECTION_VERSION = 3;
const CLOUD_SHARE_VERSION = 2;
const DAY_ZERO = Date.UTC(2020, 0, 1);
const DAY_MS = 86_400_000;

const CURRENCIES = [
  'free_jewels', 'paid_jewels', 'uma_ticket', 'support_ticket',
  'rainbow_crystal', 'gold_crystal', 'rainbow_full_crystal', 'gold_full_crystal',
] as const satisfies readonly PlannerCurrency[];
const CADENCES = ['once', 'daily', 'weekly', 'monthly', 'interval'] as const satisfies readonly PlannerIncomeCadence[];
const BANNER_KINDS = ['character', 'support', 'paid', 'other'] as const satisfies readonly PlannerBannerKind[];

/** Append only. Existing numeric tokens are part of the persisted cloud format. */
const TOKENS = [
  'daily-missions', 'regular-login-cycle', 'daily-jewel-pack',
  'speculative_income', 'temporary_story_rewards', 'racing_carnival_mission',
  'masters_challenge_rewards', 'story_event_rewards', 'factor_research_rewards',
  'scenario_evaluation_rewards', 'main_story_rewards', 'limited_login_rewards',
  'limited_mission_rewards', 'racing_carnival_rewards', 'trainer_skills_test_rewards',
  'champions_meeting_result', 'club_rank', 'league_of_heroes_rank',
  'legend_race_clears', 'strongest_team_reward_tier', 'team_trials_class',
  'monthly_shop_tickets', 'champions_meeting_round_income', 'random_gameplay_income',
  'training_pass', 'none', 'include', 'median', 'open_first', 'open_second',
  'open_third', 'champion', 'silver_4', 'platinum_4', 'opponents_1', 'opponents_2',
  'all', 'clears_only', 'score_only', 'clear_1', 'clear_2', 'clear_3', 'tier_1',
  'points_220000', 'class_2', 'class_3', 'class_4', 'class_5', 'class_6',
  'friend_points', 'low_investment', 'competitive', 'meta_highroller', 'low',
  'medium', 'high', 'free', 'paid', 'premium', '__default_schedule__', '__excluded__',
  'rank_1', 'rank_2', 'rank_3', 'rank_4', 'rank_5', 'rank_6', 'rank_7', 'rank_8',
  'rank_9', 'rank_10', 'rank_11',
] as const;
const TOKEN_TO_CODE = new Map<string, number>(TOKENS.map((value, index) => [value, index]));
const DEFAULT_SCENARIO_SELECTIONS: Readonly<Record<string, string>> = {
  [SPECULATIVE_INCOME_SCENARIO_GROUP_ID]: SPECULATIVE_INCOME_INCLUDED_OPTION,
  ...CONDITIONAL_REWARD_DEFAULT_SELECTIONS,
};

type CompactToken = number | string;
type CompactAmount = [currency: number, amount: number];
type CompactVariableReward = [
  eventId: string,
  optionId: CompactToken,
  availableAt: number | string,
  amounts: CompactAmount[],
];
type CompactCustomIncome = [
  label: string,
  currency: number,
  amount: number,
  cadence: number,
  startDate: number | string,
  endDate: number | string | null,
  every: number,
];
type CompactGoal = 0 | [pickupId: number, desiredCopies: number] | Array<[pickupId: number, desiredCopies: number]>;
type CompactTarget = [
  eventId: string,
  gachaId: number,
  bannerKind: number,
  pullsFromDefault: number,
  goals: CompactGoal,
  flags: number,
  ...optional: Array<number | number[]>
];
type CompactCloudPlanV3 = [
  id: string,
  name: string,
  createdAt: number | string,
  updatedAt: number | string,
  projectionStartDate: number | string,
  balances: number[],
  enabledIncomeRuleIds: CompactToken[],
  enabledRewardIds: string[],
  disabledRewardIds: string[],
  disabledEventIds: string[],
  scenarioSelections: Array<[groupId: CompactToken, optionId: CompactToken]>,
  variableRewardSelections: CompactVariableReward[],
  freePullCampaignSelections: Array<[campaignId: string, eventId: CompactToken]>,
  customIncome: CompactCustomIncome[],
  targets: CompactTarget[],
  presetState?: number,
];

interface CompactCloudCollectionV3 {
  version: 3;
  activePlanId: string;
  plans: CompactCloudPlanV3[];
}

type CompactCloudPlanV2 = [
  id: string,
  createdAt: string,
  updatedAt: string,
  customIncomeIds: string[],
  targetIds: string[],
  plan: unknown,
];

interface CompactCloudCollectionV2 {
  version: 2;
  activePlanId: string;
  plans: CompactCloudPlanV2[];
}

interface CompactCloudShare {
  id: string;
  name: string;
  v: 2;
  p: unknown;
}

/** Stores only choices that cannot be rebuilt from the planner resources. */
export function compactPlannerCollectionForCloud(collection: CaratPlanCollection): unknown {
  return {
    version: CLOUD_COLLECTION_VERSION,
    activePlanId: collection.activePlanId,
    plans: collection.plans.map(compactCloudPlanV3),
  } satisfies CompactCloudCollectionV3;
}

/** Reads full v1, tuple v2, and sparse v3 rows for automatic migration. */
export function expandPlannerCollectionFromCloud(value: unknown): CaratPlanCollection | null {
  if (isLegacyCollection(value)) return value;
  if (isCompactCollectionV3(value)) return expandCollectionV3(value);
  if (isCompactCollectionV2(value)) return expandCollectionV2(value);
  return null;
}

/** Only the latest sparse format is considered fully compact. */
export function isCompactPlannerCollectionForCloud(value: unknown): boolean {
  return isCompactCollectionV3(value);
}

/** Short shares stay self-contained and therefore retain the v2 plan codec. */
export function compactPlannerPlanForCloudShare(plan: CaratPlan): unknown {
  return {
    id: plan.id,
    name: plan.name,
    v: CLOUD_SHARE_VERSION,
    p: compactPlannerPlanData(plan),
  } satisfies CompactCloudShare;
}

export function expandPlannerPlanFromCloudShare(value: unknown): CaratPlan | null {
  if (isLegacyPlan(value)) return value;
  if (!isCompactShare(value)) return null;
  const plan = expandCompactPlannerPlanData(value.p);
  if (!plan) return null;
  return { ...plan, id: value.id, name: value.name };
}

function compactCloudPlanV3(plan: CaratPlan): CompactCloudPlanV3 {
  const disabledEvents = new Set(plan.disabledEventIds ?? []);
  const targetEvents = new Set(plan.targets.map(target => target.eventId));
  const values: CompactCloudPlanV3 = [
    plan.id,
    plan.name,
    instantCode(plan.createdAt),
    instantCode(plan.updatedAt),
    dayCode(plan.projectionStartDate),
    trimTrailingZeros([
      plan.balances.freeJewels, plan.balances.paidJewels,
      plan.balances.umaTickets, plan.balances.supportTickets,
      plan.balances.rainbowCrystals, plan.balances.goldCrystals,
      plan.balances.rainbowFullCrystals ?? 0, plan.balances.goldFullCrystals ?? 0,
    ]),
    plan.enabledIncomeRuleIds.map(tokenCode),
    plan.enabledRewardIds,
    plan.disabledRewardIds ?? [],
    [...disabledEvents].filter(eventId => !targetEvents.has(eventId)),
    Object.entries(plan.scenarioSelections)
      .filter(([groupId, optionId]) => DEFAULT_SCENARIO_SELECTIONS[groupId] !== optionId)
      .map(([groupId, optionId]) => [tokenCode(groupId), tokenCode(optionId)]),
    Object.entries(plan.variableRewardSelections ?? {}).map(([eventId, selection]) => [
      eventId,
      tokenCode(selection.optionId),
      dayCode(selection.availableAt),
      Object.entries(selection.amounts).map(([currency, amount]) => [
        codeOf(CURRENCIES, currency as PlannerCurrency), amount ?? 0,
      ]),
    ]),
    Object.entries(plan.freePullCampaignSelections ?? {}).map(([campaignId, eventId]) => [
      campaignId, tokenCode(eventId),
    ]),
    plan.customIncome.map(item => [
      item.label,
      codeOf(CURRENCIES, item.currency),
      item.amount,
      codeOf(CADENCES, item.cadence),
      dayCode(item.startDate),
      item.endDate ? dayCode(item.endDate) : null,
      item.every ?? 0,
    ]),
    plan.targets.map(target => compactTarget(target, disabledEvents.has(target.eventId))),
  ];
  const presetState = compactPresetState(plan);
  if (presetState > 0) values.push(presetState);
  return values;
}

function compactTarget(target: PlannerTarget, disabled: boolean): CompactTarget {
  const timingCode = target.pullTiming === 'start' ? 1 : target.pullTiming === 'custom' ? 2 : 0;
  let flags = timingCode;
  if (!target.useTickets) flags |= 1 << 2;
  if (target.allowPaidJewels) flags |= 1 << 3;
  if (disabled) flags |= 1 << 4;
  if (target.gachaIds?.length) flags |= 1 << 5;
  if (target.customPullDate) flags |= 1 << 6;
  if (target.ticketLimit !== undefined) flags |= 1 << 7;
  if (target.rainbowCrystalsPlanned) flags |= 1 << 8;
  if (target.goldCrystalsPlanned) flags |= 1 << 9;

  const values: CompactTarget = [
    target.eventId,
    target.gachaId ?? 0,
    codeOf(BANNER_KINDS, target.bannerKind),
    target.plannedPulls - 200,
    compactGoals(target.pickupGoals ?? []),
    flags,
  ];
  if (flags & (1 << 5)) values.push(target.gachaIds ?? []);
  if (flags & (1 << 6)) values.push(dayCode(target.customPullDate!));
  if (flags & (1 << 7)) values.push(target.ticketLimit ?? 0);
  if (flags & (1 << 8)) values.push(target.rainbowCrystalsPlanned ?? 0);
  if (flags & (1 << 9)) values.push(target.goldCrystalsPlanned ?? 0);
  return values;
}

function expandCollectionV3(value: CompactCloudCollectionV3): CaratPlanCollection | null {
  const plans = value.plans.map(expandCloudPlanV3).filter((plan): plan is CaratPlan => plan !== null);
  if (plans.length === 0) return null;
  return {
    version: 1,
    activePlanId: plans.some(plan => plan.id === value.activePlanId) ? value.activePlanId : plans[0].id,
    plans,
  };
}

function expandCloudPlanV3(value: CompactCloudPlanV3): CaratPlan | null {
  const id = stringValue(value[0]);
  const name = stringValue(value[1]);
  const projectionStartDate = dayValue(value[4]);
  if (!id || !name || !projectionStartDate) return null;
  const balances = value[5];
  const disabledEventIds = new Set(stringArray(value[9]));
  const targets = value[14].map((target, index) => {
    const expanded = expandTarget(target, id, index);
    if (expanded.disabled) disabledEventIds.add(expanded.target.eventId);
    return expanded.target;
  });
  return {
    id,
    name,
    createdAt: instantValue(value[2]),
    updatedAt: instantValue(value[3]),
    projectionStartDate,
    balances: {
      freeJewels: numberAt(balances, 0),
      paidJewels: numberAt(balances, 1),
      umaTickets: numberAt(balances, 2),
      supportTickets: numberAt(balances, 3),
      rainbowCrystals: numberAt(balances, 4),
      goldCrystals: numberAt(balances, 5),
      rainbowFullCrystals: numberAt(balances, 6),
      goldFullCrystals: numberAt(balances, 7),
    },
    enabledIncomeRuleIds: value[6].map(tokenValue).filter(Boolean),
    enabledRewardIds: stringArray(value[7]),
    disabledRewardIds: stringArray(value[8]),
    enabledRewardEventIds: [],
    disabledEventIds: [...disabledEventIds],
    scenarioSelections: {
      ...DEFAULT_SCENARIO_SELECTIONS,
      ...Object.fromEntries(value[10]
        .map(([groupId, optionId]) => [tokenValue(groupId), tokenValue(optionId)])
        .filter(([groupId, optionId]) => Boolean(groupId && optionId))),
    },
    variableRewardSelections: Object.fromEntries(value[11].map(item => {
      const optionId = tokenValue(item[1]);
      return [item[0], {
        optionId,
        label: optionId,
        availableAt: dayValue(item[2]),
        amounts: Object.fromEntries(item[3].map(([currency, amount]) => [
          valueOf(CURRENCIES, currency, 'free_jewels'), amount,
        ])),
      }];
    })),
    freePullCampaignSelections: Object.fromEntries(value[12].map(([campaignId, eventId]) => [
      campaignId, tokenValue(eventId),
    ])),
    resourceDefaultsApplied: true,
    ...expandPresetState(value[15]),
    customIncome: value[13].map((item, index) => ({
      id: `cloud-income-${id}-${index + 1}`,
      label: item[0],
      currency: valueOf(CURRENCIES, item[1], 'free_jewels'),
      amount: item[2],
      cadence: valueOf(CADENCES, item[3], 'once'),
      startDate: dayValue(item[4]),
      ...(item[5] === null ? {} : { endDate: dayValue(item[5]) }),
      ...(item[6] > 0 ? { every: item[6] } : {}),
    })),
    targets,
  };
}

function expandTarget(value: CompactTarget, planId: string, index: number): { target: PlannerTarget; disabled: boolean } {
  const flags = nonNegativeInt(value[5]);
  let optionalIndex = 6;
  const gachaIds = flags & (1 << 5) ? numberArray(value[optionalIndex++]) : [];
  const customPullDate = flags & (1 << 6)
    ? dayValue(value[optionalIndex++] as number | string)
    : undefined;
  const ticketLimit = flags & (1 << 7) ? nonNegativeInt(value[optionalIndex++]) : undefined;
  const rainbowCrystalsPlanned = flags & (1 << 8) ? nonNegativeInt(value[optionalIndex++]) : 0;
  const goldCrystalsPlanned = flags & (1 << 9) ? nonNegativeInt(value[optionalIndex++]) : 0;
  const pickupGoals = expandGoals(value[4]);
  const firstGoal = pickupGoals[0];
  const timing = flags & 3;
  const eventId = stringValue(value[0]);
  const target: PlannerTarget = {
    id: `cloud-target-${planId}-${index + 1}`,
    eventId,
    ...(value[1] > 0 ? { gachaId: nonNegativeInt(value[1]) } : {}),
    ...(gachaIds.length ? { gachaIds } : {}),
    title: eventId,
    bannerKind: valueOf(BANNER_KINDS, value[2], 'other'),
    pullTiming: timing === 1 ? 'start' : timing === 2 ? 'custom' : 'end',
    ...(customPullDate ? { customPullDate } : {}),
    plannedPulls: Math.max(0, Math.trunc(Number(value[3]) || 0) + 200),
    desiredCopies: firstGoal?.desiredCopies ?? 1,
    ...(firstGoal ? { pickupId: firstGoal.pickupId } : {}),
    pickupGoals,
    useTickets: (flags & (1 << 2)) === 0,
    ...(ticketLimit === undefined ? {} : { ticketLimit }),
    allowPaidJewels: (flags & (1 << 3)) !== 0,
    ...(rainbowCrystalsPlanned > 0 ? { rainbowCrystalsPlanned } : {}),
    ...(goldCrystalsPlanned > 0 ? { goldCrystalsPlanned } : {}),
  };
  return { target, disabled: (flags & (1 << 4)) !== 0 };
}

function expandCollectionV2(value: CompactCloudCollectionV2): CaratPlanCollection | null {
  const plans = value.plans.map(expandCloudPlanV2).filter((plan): plan is CaratPlan => plan !== null);
  if (plans.length === 0) return null;
  return {
    version: 1,
    activePlanId: plans.some(plan => plan.id === value.activePlanId) ? value.activePlanId : plans[0].id,
    plans,
  };
}

function expandCloudPlanV2(value: CompactCloudPlanV2): CaratPlan | null {
  const plan = expandCompactPlannerPlanData(value[5]);
  if (!plan) return null;
  return {
    ...plan,
    id: value[0],
    createdAt: value[1],
    updatedAt: value[2],
    customIncome: plan.customIncome.map((item, index) => ({ ...item, id: value[3][index] ?? item.id })),
    targets: plan.targets.map((target, index) => ({ ...target, id: value[4][index] ?? target.id })),
  };
}

function compactGoals(goals: readonly PlannerPickupGoal[]): CompactGoal {
  const values = goals.map(goal => [goal.pickupId, goal.desiredCopies] as [number, number]);
  return values.length === 0 ? 0 : values.length === 1 ? values[0] : values;
}

function expandGoals(value: CompactGoal): PlannerPickupGoal[] {
  if (value === 0) return [];
  const values = typeof value[0] === 'number'
    ? [value as [number, number]]
    : value as Array<[number, number]>;
  return values
    .filter(item => Array.isArray(item) && Number.isFinite(item[0]) && Number.isFinite(item[1]))
    .map(([pickupId, desiredCopies]) => ({
      pickupId: nonNegativeInt(pickupId),
      desiredCopies: Math.max(1, nonNegativeInt(desiredCopies)),
    }));
}

function compactPresetState(plan: CaratPlan): number {
  const index = plan.incomePresetId ? PLANNER_INCOME_PRESET_IDS.indexOf(plan.incomePresetId) : -1;
  return index < 0 ? 0 : (index + 1) | (plan.incomePresetEdited ? 1 << 3 : 0);
}

function expandPresetState(value: unknown): Pick<CaratPlan, 'incomePresetId' | 'incomePresetEdited'> {
  const state = nonNegativeInt(value);
  const presetId = PLANNER_INCOME_PRESET_IDS[(state & 7) - 1];
  return presetId ? { incomePresetId: presetId, incomePresetEdited: (state & (1 << 3)) !== 0 } : {};
}

function tokenCode(value: string): CompactToken {
  return TOKEN_TO_CODE.get(value) ?? value;
}

function tokenValue(value: CompactToken): string {
  return typeof value === 'number' ? TOKENS[value] ?? '' : stringValue(value);
}

function instantCode(value: string): number | string {
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : value;
}

function instantValue(value: number | string): string {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function dayCode(value: string): number | string {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? Math.trunc((parsed - DAY_ZERO) / DAY_MS) : value;
}

function dayValue(value: number | string): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(DAY_ZERO + value * DAY_MS).toISOString().slice(0, 10);
  }
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : '';
}

function trimTrailingZeros(values: number[]): number[] {
  while (values.length && values[values.length - 1] === 0) values.pop();
  return values;
}

function codeOf<T extends string>(values: readonly T[], value: T): number {
  const index = values.indexOf(value);
  return index >= 0 ? index : 0;
}

function valueOf<T extends string>(values: readonly T[], code: number, fallback: T): T {
  return Number.isInteger(code) && values[code] !== undefined ? values[code] : fallback;
}

function numberAt(values: readonly number[], index: number): number {
  const value = values[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function nonNegativeInt(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map(nonNegativeInt).filter(number => number > 0) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isLegacyCollection(value: unknown): value is CaratPlanCollection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<CaratPlanCollection>;
  return record.version === 1
    && typeof record.activePlanId === 'string'
    && Array.isArray(record.plans)
    && record.plans.every(isLegacyPlan);
}

function isCompactCollectionV3(value: unknown): value is CompactCloudCollectionV3 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<CompactCloudCollectionV3>;
  return record.version === CLOUD_COLLECTION_VERSION
    && typeof record.activePlanId === 'string'
    && Array.isArray(record.plans)
    && record.plans.length > 0
    // New fields may be appended without making older clients reject the plan.
    && record.plans.every(item => Array.isArray(item) && item.length >= 15);
}

function isCompactCollectionV2(value: unknown): value is CompactCloudCollectionV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<CompactCloudCollectionV2>;
  return record.version === 2
    && typeof record.activePlanId === 'string'
    && Array.isArray(record.plans)
    && record.plans.every(item => Array.isArray(item)
      && item.length === 6
      && typeof item[0] === 'string'
      && typeof item[1] === 'string'
      && typeof item[2] === 'string'
      && Array.isArray(item[3])
      && Array.isArray(item[4]));
}

function isCompactShare(value: unknown): value is CompactCloudShare {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<CompactCloudShare>;
  return record.v === CLOUD_SHARE_VERSION
    && typeof record.id === 'string'
    && typeof record.name === 'string'
    && record.p !== undefined;
}

function isLegacyPlan(value: unknown): value is CaratPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<CaratPlan>;
  return typeof record.id === 'string'
    && typeof record.name === 'string'
    && Array.isArray(record.targets)
    && Array.isArray(record.customIncome);
}
