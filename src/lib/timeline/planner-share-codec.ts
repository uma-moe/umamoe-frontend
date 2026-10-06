import type {
  CaratPlan,
  PlannerCurrency,
  PlannerIncomeCadence,
  PlannerTarget,
} from './carat-planner';
import { CONDITIONAL_REWARD_DEFAULT_SELECTIONS } from './planner-reward-assumptions';

const FORMAT_VERSION = 2;
const MAX_PLAN_BYTES = 262_144;
const MAX_PAYLOAD_CHARS = 32_000;
const DEFAULT_SCENARIOS = { speculative_income: 'include', ...CONDITIONAL_REWARD_DEFAULT_SELECTIONS };
const CURRENCIES = ['free_jewels','paid_jewels','uma_ticket','support_ticket','rainbow_crystal','gold_crystal','rainbow_full_crystal','gold_full_crystal'] as const satisfies readonly PlannerCurrency[];
const CADENCES = ['once','daily','weekly','monthly','interval'] as const satisfies readonly PlannerIncomeCadence[];
const BANNER_KINDS = ['character','support','paid','other'] as const satisfies readonly PlannerTarget['bannerKind'][];
const PULL_TIMINGS = ['start','end','custom'] as const satisfies readonly PlannerTarget['pullTiming'][];
const PRESETS = ['conservative','casual','active','completionist'] as const;

type CompactAmount = [number, number];
type CompactVariableReward = [string, string, string, string, CompactAmount[]];
type CompactCustomIncome = [string, number, number, number, string, string | null, number | null];
type CompactTarget = [string, number | null, number[], string, number, string | null, number, string | null, number, number, number | null, Array<[number, number]>, 0 | 1, number | null, 0 | 1, number, number, string?, (number | null)?, Record<string, number>?];
type CompactPlan = [2, string, string, number[], string[], string[], string[], string[], string[], Array<[string,string]>, CompactVariableReward[], Array<[string,string]>, -1|0|1, CompactCustomIncome[], CompactTarget[], number?];

export interface DecodedPlannerShare { plan: unknown; fingerprint: string; }
export class PlannerShareTooLargeError extends Error { constructor() { super('This plan is too large for a self-contained link. Log in to create a short link.'); } }

/** Byte-for-byte compatible with Angular compact planner link format v2. */
export async function encodeCompactPlannerShare(plan: CaratPlan): Promise<string> {
  const source = new TextEncoder().encode(JSON.stringify(compactPlan(plan)));
  if (source.byteLength > MAX_PLAN_BYTES) throw new PlannerShareTooLargeError();
  let codec = 'j';
  let bytes: Uint8Array<ArrayBufferLike> = source;
  if (typeof CompressionStream !== 'undefined' && typeof Blob.prototype.stream === 'function') {
    codec = 'g';
    bytes = await transformBytes(source, new CompressionStream('gzip'), MAX_PLAN_BYTES, () => new PlannerShareTooLargeError());
  }
  const payload = `${codec}.${encodeBase64Url(bytes)}`;
  if (payload.length > MAX_PAYLOAD_CHARS) throw new PlannerShareTooLargeError();
  return payload;
}

export async function decodeCompactPlannerShare(payload: string): Promise<DecodedPlannerShare> {
  const value = payload.trim();
  if (!value || value.length > MAX_PAYLOAD_CHARS || value[1] !== '.' || !/^[a-zA-Z0-9_-]+$/.test(value.slice(2))) throw new Error('This compact plan link is invalid.');
  const packed = decodeBase64Url(value.slice(2));
  let source: Uint8Array;
  if (value[0] === 'g') {
    if (typeof DecompressionStream === 'undefined' || typeof Blob.prototype.stream !== 'function') throw new Error('This browser cannot open compressed plan links.');
    source = await transformBytes(packed, new DecompressionStream('gzip'), MAX_PLAN_BYTES, () => new Error('This compact plan link is too large.'));
  } else if (value[0] === 'j') source = packed;
  else throw new Error('This compact plan link uses an unsupported format.');
  if (source.byteLength > MAX_PLAN_BYTES) throw new Error('This compact plan link is too large.');
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(source)); } catch { throw new Error('This compact plan link is invalid.'); }
  const legacy = isRecord(parsed) && parsed.v === 1 && isRecord(parsed.p) ? parsed.p : undefined;
  const plan = legacy ?? expandPlan(parsed);
  if (!plan) throw new Error('This compact plan link contains no usable plan.');
  return { plan, fingerprint: await fingerprint(value) };
}

export function compactPlannerPlanData(plan: CaratPlan): unknown { return compactPlan(plan); }
export function expandCompactPlannerPlanData(value: unknown): CaratPlan | null { return expandPlan(value); }

function compactPlan(plan: CaratPlan): CompactPlan {
  const value: CompactPlan = [
    FORMAT_VERSION,
    plan.name,
    plan.projectionStartDate,
    [plan.balances.freeJewels,plan.balances.paidJewels,plan.balances.umaTickets,plan.balances.supportTickets,plan.balances.rainbowCrystals,plan.balances.goldCrystals,plan.balances.rainbowFullCrystals,plan.balances.goldFullCrystals],
    plan.enabledIncomeRuleIds,
    plan.enabledRewardIds,
    plan.disabledRewardIds,
    plan.enabledRewardEventIds,
    plan.disabledEventIds,
    Object.entries(plan.scenarioSelections).filter(([group, option]) => DEFAULT_SCENARIOS[group as keyof typeof DEFAULT_SCENARIOS] !== option),
    Object.entries(plan.variableRewardSelections).map(([eventId, selection]) => [eventId,selection.optionId,selection.label,selection.availableAt,Object.entries(selection.amounts).map(([currency, amount]) => [codeOf(CURRENCIES,currency as PlannerCurrency),amount ?? 0])]),
    Object.entries(plan.freePullCampaignSelections),
    plan.resourceDefaultsApplied === undefined ? -1 : plan.resourceDefaultsApplied ? 1 : 0,
    plan.customIncome.map((item) => [item.label,codeOf(CURRENCIES,item.currency),item.amount,codeOf(CADENCES,item.cadence),item.startDate,item.endDate ?? null,item.every ?? null]),
    plan.targets.map((target) => [target.eventId,target.gachaId ?? null,target.gachaIds ?? [],target.title,codeOf(BANNER_KINDS,target.bannerKind),target.imagePath ?? null,codeOf(PULL_TIMINGS,target.pullTiming),target.customPullDate ?? null,target.plannedPulls,target.desiredCopies,target.pickupId ?? null,(target.pickupGoals ?? []).map((goal) => [goal.pickupId,goal.desiredCopies]),target.useTickets ? 1 : 0,target.ticketLimit ?? null,target.allowPaidJewels ? 1 : 0,target.rainbowCrystalsPlanned ?? 0,target.goldCrystalsPlanned ?? 0,target.notes || '',target.actualPulls ?? null,target.actualCopies ?? {}]),
  ];
  const preset = compactPreset(plan);
  if (preset) value.push(preset);
  return value;
}

function expandPlan(raw: unknown): CaratPlan | null {
  if (!isCompactPlan(raw)) return null;
  const value = raw;
  const now = new Date().toISOString();
  const balances = value[3];
  const preset = expandPreset(value[15]);
  return {
    id: 'shared-plan', name: value[1], createdAt: now, updatedAt: now, projectionStartDate: value[2],
    balances: { freeJewels:numberAt(balances,0),paidJewels:numberAt(balances,1),umaTickets:numberAt(balances,2),supportTickets:numberAt(balances,3),rainbowCrystals:numberAt(balances,4),goldCrystals:numberAt(balances,5),rainbowFullCrystals:numberAt(balances,6),goldFullCrystals:numberAt(balances,7) },
    enabledIncomeRuleIds:stringArray(value[4]),enabledRewardIds:stringArray(value[5]),disabledRewardIds:stringArray(value[6]),enabledRewardEventIds:stringArray(value[7]),disabledEventIds:stringArray(value[8]),
    scenarioSelections:{ ...DEFAULT_SCENARIOS, ...Object.fromEntries(pairArray(value[9])) },
    variableRewardSelections:Object.fromEntries(value[10].map((item) => [item[0],{ optionId:item[1],label:item[2],availableAt:item[3],amounts:Object.fromEntries(item[4].map(([currency,amount]) => [valueOf(CURRENCIES,currency,'free_jewels'),amount])) }])),
    freePullCampaignSelections:Object.fromEntries(pairArray(value[11])),resourceDefaultsApplied:value[12] === 1,...preset,
    customIncome:value[13].map((item,index) => ({ id:`shared-income-${index+1}`,label:item[0],currency:valueOf(CURRENCIES,item[1],'free_jewels'),amount:item[2],cadence:valueOf(CADENCES,item[3],'once'),startDate:item[4],...(item[5] ? {endDate:item[5]} : {}),...(item[6] !== null ? {every:item[6]} : {}) })),
    targets:value[14].map((target,index) => ({ id:`shared-target-${index+1}`,eventId:target[0],...(target[1] !== null ? {gachaId:target[1]} : {}),...(target[2].length ? {gachaIds:target[2]} : {}),title:target[3],bannerKind:valueOf(BANNER_KINDS,target[4],'other'),...(target[5] ? {imagePath:target[5]} : {}),pullTiming:valueOf(PULL_TIMINGS,target[6],'end'),...(target[7] ? {customPullDate:target[7]} : {}),plannedPulls:target[8],...(typeof target[17] === 'string' && target[17] ? {notes:target[17]} : {}),...(target[18] == null ? {} : {actualPulls:target[18]}),...(target[19] && Object.keys(target[19]).length ? {actualCopies:target[19]} : {}),desiredCopies:target[9],...(target[10] !== null ? {pickupId:target[10]} : {}),pickupGoals:target[11].map(([pickupId,desiredCopies]) => ({pickupId,desiredCopies})),useTickets:target[12] === 1,...(target[13] !== null ? {ticketLimit:target[13]} : {}),allowPaidJewels:target[14] === 1,...(target[15] ? {rainbowCrystalsPlanned:target[15]} : {}),...(target[16] ? {goldCrystalsPlanned:target[16]} : {}) })),
  };
}

function compactPreset(plan: CaratPlan): number { const index = plan.incomePresetId ? PRESETS.indexOf(plan.incomePresetId) : -1; return index < 0 ? 0 : (index + 1) | (plan.incomePresetEdited ? 8 : 0); }
function expandPreset(raw: unknown): Pick<CaratPlan,'incomePresetId'|'incomePresetEdited'> { const state = nonNegativeInt(raw); const preset = PRESETS[(state & 7) - 1]; return preset ? {incomePresetId:preset,incomePresetEdited:(state & 8) !== 0} : {}; }
function codeOf<T extends string>(values: readonly T[], value: T): number { const index = values.indexOf(value); return index < 0 ? 0 : index; }
function valueOf<T extends string>(values: readonly T[], code: number, fallback: T): T { return Number.isInteger(code) && values[code] !== undefined ? values[code] : fallback; }
function numberAt(values: number[], index: number): number { const value = values[index]; return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
function nonNegativeInt(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(0,Math.trunc(parsed)) : 0; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function pairArray(value: unknown): Array<[string,string]> { return Array.isArray(value) ? value.filter((item): item is [string,string] => Array.isArray(item) && typeof item[0] === 'string' && typeof item[1] === 'string') : []; }
function isRecord(value: unknown): value is Record<string,unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function isCompactPlan(value: unknown): value is CompactPlan { return Array.isArray(value) && value[0] === FORMAT_VERSION && typeof value[1] === 'string' && typeof value[2] === 'string' && Array.isArray(value[3]) && value.slice(4,12).every(Array.isArray) && [-1,0,1].includes(value[12]) && Array.isArray(value[13]) && Array.isArray(value[14]); }

async function transformBytes(source: Uint8Array, transform: CompressionStream | DecompressionStream, max: number, tooLarge: () => Error): Promise<Uint8Array> {
  const buffer = source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength) as ArrayBuffer;
  const reader = (new Blob([buffer]).stream().pipeThrough(transform) as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  try { while (true) { const result = await reader.read(); if (result.done) break; length += result.value.byteLength; if (length > max) { await reader.cancel(); throw tooLarge(); } chunks.push(result.value); } } finally { reader.releaseLock(); }
  const output = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { output.set(chunk,offset); offset += chunk.byteLength; } return output;
}
function encodeBase64Url(value: Uint8Array): string { let binary=''; for (let index=0;index<value.length;index+=0x8000) binary += String.fromCharCode(...value.subarray(index,index+0x8000)); return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/g,''); }
function decodeBase64Url(value: string): Uint8Array { const normalized=value.replaceAll('-','+').replaceAll('_','/'); try { return Uint8Array.from(atob(normalized.padEnd(normalized.length+((4-normalized.length%4)%4),'=')),(character)=>character.charCodeAt(0)); } catch { throw new Error('This compact plan link is invalid.'); } }
async function fingerprint(value: string): Promise<string> { const bytes=new TextEncoder().encode(value); if (crypto?.subtle) { try { const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)); return [...digest.subarray(0,8)].map((byte)=>byte.toString(16).padStart(2,'0')).join(''); } catch {} } let hash=0x811c9dc5; for (const byte of bytes) { hash^=byte; hash=Math.imul(hash,0x01000193); } return (hash>>>0).toString(16).padStart(8,'0'); }
