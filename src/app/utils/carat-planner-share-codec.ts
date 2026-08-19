import {
  CaratPlan,
  PlannerBannerKind,
  PlannerCurrency,
  PlannerIncomeCadence,
  PlannerPullTiming,
} from '../models/carat-planner.model';

const SHARE_FORMAT_VERSION = 2;
const MAX_PLAN_BYTES = 262_144;
const MAX_SHARE_PAYLOAD_CHARS = 32_000;

const CURRENCIES = [
  'free_jewels',
  'paid_jewels',
  'uma_ticket',
  'support_ticket',
  'rainbow_crystal',
  'gold_crystal',
  'rainbow_full_crystal',
  'gold_full_crystal',
] as const satisfies readonly PlannerCurrency[];
const CADENCES = ['once', 'daily', 'weekly', 'monthly', 'interval'] as const satisfies readonly PlannerIncomeCadence[];
const BANNER_KINDS = ['character', 'support', 'paid', 'other'] as const satisfies readonly PlannerBannerKind[];
const PULL_TIMINGS = ['start', 'end', 'custom'] as const satisfies readonly PlannerPullTiming[];

interface LegacyPlannerShareEnvelope {
  v: 1;
  p: CaratPlan;
}

type CompactAmount = [currency: number, amount: number];
type CompactVariableReward = [
  eventId: string,
  optionId: string,
  label: string,
  availableAt: string,
  amounts: CompactAmount[],
];
type CompactCustomIncome = [
  label: string,
  currency: number,
  amount: number,
  cadence: number,
  startDate: string,
  endDate: string | null,
  every: number | null,
];
type CompactTarget = [
  eventId: string,
  gachaId: number | null,
  gachaIds: number[],
  title: string,
  bannerKind: number,
  imagePath: string | null,
  pullTiming: number,
  customPullDate: string | null,
  plannedPulls: number,
  desiredCopies: number,
  pickupId: number | null,
  pickupGoals: Array<[pickupId: number, desiredCopies: number]>,
  useTickets: 0 | 1,
  ticketLimit: number | null,
  allowPaidJewels: 0 | 1,
  rainbowCrystalsPlanned: number,
  goldCrystalsPlanned: number,
];
type CompactPlannerShare = [
  version: 2,
  name: string,
  projectionStartDate: string,
  balances: number[],
  enabledIncomeRuleIds: string[],
  enabledRewardIds: string[],
  disabledRewardIds: string[],
  enabledRewardEventIds: string[],
  disabledEventIds: string[],
  scenarioSelections: Array<[groupId: string, optionId: string]>,
  variableRewardSelections: CompactVariableReward[],
  freePullCampaignSelections: Array<[campaignId: string, eventId: string]>,
  resourceDefaultsApplied: -1 | 0 | 1,
  customIncome: CompactCustomIncome[],
  targets: CompactTarget[],
];

export interface DecodedPlannerShare {
  plan: unknown;
  fingerprint: string;
}

export class PlannerShareTooLargeError extends Error {
  constructor() {
    super('This plan is too large for a self-contained link. Log in to create a short link.');
  }
}

export async function encodeCompactPlannerShare(plan: CaratPlan): Promise<string> {
  const source = new TextEncoder().encode(JSON.stringify(compactPlan(plan)));
  if (source.byteLength > MAX_PLAN_BYTES) throw new PlannerShareTooLargeError();

  let codec = 'j';
  let encodedBytes = source;
  if (typeof CompressionStream !== 'undefined') {
    codec = 'g';
    encodedBytes = await transformBytes(
      source,
      new CompressionStream('gzip'),
      MAX_PLAN_BYTES,
      () => new PlannerShareTooLargeError(),
    );
  }

  const payload = `${codec}.${encodeBase64Url(encodedBytes)}`;
  if (payload.length > MAX_SHARE_PAYLOAD_CHARS) throw new PlannerShareTooLargeError();
  return payload;
}

export async function decodeCompactPlannerShare(payload: string): Promise<DecodedPlannerShare> {
  const value = payload.trim();
  if (!value || value.length > MAX_SHARE_PAYLOAD_CHARS || value[1] !== '.') {
    throw new Error('This compact plan link is invalid.');
  }

  const codec = value[0];
  const encoded = value.slice(2);
  if (!/^[a-zA-Z0-9_-]+$/.test(encoded)) {
    throw new Error('This compact plan link is invalid.');
  }

  const packed = decodeBase64Url(encoded);
  let source: Uint8Array;
  if (codec === 'g') {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot open compressed plan links.');
    }
    source = await transformBytes(
      packed,
      new DecompressionStream('gzip'),
      MAX_PLAN_BYTES,
      () => new Error('This compact plan link is too large.'),
    );
  } else if (codec === 'j') {
    source = packed;
  } else {
    throw new Error('This compact plan link uses an unsupported format.');
  }

  if (source.byteLength > MAX_PLAN_BYTES) throw new Error('This compact plan link is too large.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(source));
  } catch {
    throw new Error('This compact plan link is invalid.');
  }
  const plan = isLegacyShareEnvelope(parsed)
    ? parsed.p
    : isCompactPlannerShare(parsed)
      ? expandPlan(parsed)
      : null;
  if (!plan) throw new Error('This compact plan link contains no usable plan.');

  return {
    plan,
    fingerprint: await fingerprint(value),
  };
}

function compactPlan(plan: CaratPlan): CompactPlannerShare {
  return [
    SHARE_FORMAT_VERSION,
    plan.name,
    plan.projectionStartDate,
    [
      plan.balances.freeJewels,
      plan.balances.paidJewels,
      plan.balances.umaTickets,
      plan.balances.supportTickets,
      plan.balances.rainbowCrystals,
      plan.balances.goldCrystals,
      plan.balances.rainbowFullCrystals ?? 0,
      plan.balances.goldFullCrystals ?? 0,
    ],
    plan.enabledIncomeRuleIds,
    plan.enabledRewardIds,
    plan.disabledRewardIds ?? [],
    plan.enabledRewardEventIds,
    plan.disabledEventIds ?? [],
    Object.entries(plan.scenarioSelections),
    Object.entries(plan.variableRewardSelections ?? {}).map(([eventId, selection]) => [
      eventId,
      selection.optionId,
      selection.label,
      selection.availableAt,
      Object.entries(selection.amounts).map(([currency, amount]) => [
        codeOf(CURRENCIES, currency as PlannerCurrency),
        amount ?? 0,
      ]),
    ]),
    Object.entries(plan.freePullCampaignSelections ?? {}),
    plan.resourceDefaultsApplied === undefined ? -1 : plan.resourceDefaultsApplied ? 1 : 0,
    plan.customIncome.map(item => [
      item.label,
      codeOf(CURRENCIES, item.currency),
      item.amount,
      codeOf(CADENCES, item.cadence),
      item.startDate,
      item.endDate ?? null,
      item.every ?? null,
    ]),
    plan.targets.map(target => [
      target.eventId,
      target.gachaId ?? null,
      target.gachaIds ?? [],
      target.title,
      codeOf(BANNER_KINDS, target.bannerKind),
      target.imagePath ?? null,
      codeOf(PULL_TIMINGS, target.pullTiming),
      target.customPullDate ?? null,
      target.plannedPulls,
      target.desiredCopies,
      target.pickupId ?? null,
      (target.pickupGoals ?? []).map(goal => [goal.pickupId, goal.desiredCopies]),
      target.useTickets ? 1 : 0,
      target.ticketLimit ?? null,
      target.allowPaidJewels ? 1 : 0,
      target.rainbowCrystalsPlanned ?? 0,
      target.goldCrystalsPlanned ?? 0,
    ]),
  ];
}

function expandPlan(value: CompactPlannerShare): CaratPlan {
  const now = new Date().toISOString();
  const balances = value[3];
  return {
    id: 'shared-plan',
    name: value[1],
    createdAt: now,
    updatedAt: now,
    projectionStartDate: value[2],
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
    enabledIncomeRuleIds: stringArray(value[4]),
    enabledRewardIds: stringArray(value[5]),
    disabledRewardIds: stringArray(value[6]),
    enabledRewardEventIds: stringArray(value[7]),
    disabledEventIds: stringArray(value[8]),
    scenarioSelections: Object.fromEntries(pairArray(value[9])),
    variableRewardSelections: Object.fromEntries(value[10].map(item => [item[0], {
      optionId: item[1],
      label: item[2],
      availableAt: item[3],
      amounts: Object.fromEntries(item[4].map(([currency, amount]) => [
        valueOf(CURRENCIES, currency, 'free_jewels'),
        amount,
      ])),
    }])),
    freePullCampaignSelections: Object.fromEntries(pairArray(value[11])),
    resourceDefaultsApplied: value[12] === 1,
    customIncome: value[13].map((item, index) => ({
      id: `shared-income-${index + 1}`,
      label: item[0],
      currency: valueOf(CURRENCIES, item[1], 'free_jewels'),
      amount: item[2],
      cadence: valueOf(CADENCES, item[3], 'once'),
      startDate: item[4],
      ...(item[5] ? { endDate: item[5] } : {}),
      ...(item[6] !== null ? { every: item[6] } : {}),
    })),
    targets: value[14].map((target, index) => ({
      id: `shared-target-${index + 1}`,
      eventId: target[0],
      ...(target[1] !== null ? { gachaId: target[1] } : {}),
      ...(target[2].length ? { gachaIds: target[2] } : {}),
      title: target[3],
      bannerKind: valueOf(BANNER_KINDS, target[4], 'other'),
      ...(target[5] ? { imagePath: target[5] } : {}),
      pullTiming: valueOf(PULL_TIMINGS, target[6], 'end'),
      ...(target[7] ? { customPullDate: target[7] } : {}),
      plannedPulls: target[8],
      desiredCopies: target[9],
      ...(target[10] !== null ? { pickupId: target[10] } : {}),
      pickupGoals: target[11].map(([pickupId, desiredCopies]) => ({ pickupId, desiredCopies })),
      useTickets: target[12] === 1,
      ...(target[13] !== null ? { ticketLimit: target[13] } : {}),
      allowPaidJewels: target[14] === 1,
      ...(target[15] > 0 ? { rainbowCrystalsPlanned: target[15] } : {}),
      ...(target[16] > 0 ? { goldCrystalsPlanned: target[16] } : {}),
    })),
  };
}

function codeOf<T extends string>(values: readonly T[], value: T): number {
  const index = values.indexOf(value);
  return index >= 0 ? index : 0;
}

function valueOf<T extends string>(values: readonly T[], code: number, fallback: T): T {
  return Number.isInteger(code) && values[code] !== undefined ? values[code] : fallback;
}

function numberAt(values: number[], index: number): number {
  const value = values[index];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function pairArray(value: unknown): Array<[string, string]> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is [string, string] => (
    Array.isArray(item) && typeof item[0] === 'string' && typeof item[1] === 'string'
  ));
}

async function transformBytes(
  source: Uint8Array,
  transform: CompressionStream | DecompressionStream,
  maxOutputBytes: number,
  tooLargeError: () => Error,
): Promise<Uint8Array> {
  const buffer = source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength,
  ) as ArrayBuffer;
  const stream = new Blob([buffer]).stream().pipeThrough(transform) as ReadableStream<Uint8Array>;
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > maxOutputBytes) {
        await reader.cancel();
        throw tooLargeError();
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < value.length; index += chunkSize) {
    binary += String.fromCharCode(...value.subarray(index, index + chunkSize));
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  try {
    return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
  } catch {
    throw new Error('This compact plan link is invalid.');
  }
}

async function fingerprint(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  if (globalThis.crypto?.subtle) {
    try {
      const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
      return [...digest.subarray(0, 8)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    } catch {}
  }

  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function isLegacyShareEnvelope(value: unknown): value is LegacyPlannerShareEnvelope {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<LegacyPlannerShareEnvelope>;
  return record.v === 1 && !!record.p && typeof record.p === 'object';
}

function isCompactPlannerShare(value: unknown): value is CompactPlannerShare {
  return Array.isArray(value)
    && value[0] === SHARE_FORMAT_VERSION
    && typeof value[1] === 'string'
    && typeof value[2] === 'string'
    && Array.isArray(value[3])
    && value.slice(4, 12).every(Array.isArray)
    && (value[12] === -1 || value[12] === 0 || value[12] === 1)
    && Array.isArray(value[13])
    && Array.isArray(value[14]);
}
