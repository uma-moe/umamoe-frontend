import type { VeteranRecord } from './generated/veteran-record';
import { validateVeteranRecord } from './veteran-validator';
import { decodeFactorEntry } from '@/lib/catalog/factor-catalog';

type UnknownRecord = Record<string, unknown>;
function object(value: unknown): UnknownRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}; }
function integer(value: unknown, fallback = 0): number { const next = Number(value); return Number.isFinite(next) ? Math.max(0, Math.trunc(next)) : fallback; }
function nullableInteger(value: unknown): number | null { const next = Number(value); return value !== null && value !== undefined && Number.isFinite(next) ? Math.trunc(next) : null; }
function string(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }

function factor(value: unknown): { id: number; level: number } {
  if (typeof value === 'number' || typeof value === 'string') {
    const encoded = integer(value); const raw = String(encoded);
    return { id: integer(raw.slice(0, -1)), level: integer(raw.slice(-1), 1) };
  }
  const entry = object(value);
  const encoded = integer(entry.factor_id ?? entry.factorId ?? entry.id);
  if (entry.factor_id !== undefined) {
    const { id, level } = decodeFactorEntry(encoded, entry.level === undefined ? undefined : integer(entry.level));
    return { id, level };
  }
  if (entry.level !== undefined) return { id: encoded, level: integer(entry.level, 1) };
  const raw = String(encoded);
  return { id: integer(raw.slice(0, -1)), level: integer(raw.slice(-1), 1) };
}

function skill(value: unknown): { id: number; level: number } {
  if (typeof value === 'number' || typeof value === 'string') { const encoded = integer(value); return { id: Math.floor(encoded / 10), level: encoded % 10 || 1 }; }
  const entry = object(value); return { id: integer(entry.skill_id ?? entry.skillId ?? entry.id), level: integer(entry.level, 1) };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as UnknownRecord).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function veteranFingerprint(value: Pick<VeteranRecord, 'cardId' | 'createdAt' | 'stats' | 'skills' | 'factors' | 'parents'>): string {
  const input = stable(value); let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

export function normalizeVeteranRecord(input: unknown): VeteranRecord {
  const raw = object(input);
  if (raw.schemaVersion === 1) return validateVeteranRecord(input);
  const rawStats = object(raw.stats);
  const trainedCharaId = nullableInteger(raw.trainedCharaId ?? raw.trained_chara_id);
  const factorInput = [raw.factor_info_array, raw.factorInfoArray, raw.factor_id_array, raw.factors].map(list).find((values) => values.length) ?? [];
  const parentInput = list(raw.parents ?? raw.succession_chara_array ?? raw.successionCharaArray);
  const record: VeteranRecord = {
    schemaVersion: 1,
    recordId: '',
    trainedCharaId,
    cardId: integer(raw.cardId ?? raw.card_id ?? raw.chara_id),
    name: string(raw.name ?? raw.chara_name ?? raw.characterName),
    createdAt: string(raw.createdAt ?? raw.creation_time ?? raw.create_time ?? raw.retired_at),
    scenarioId: nullableInteger(raw.scenarioId ?? raw.scenario_id),
    rankScore: nullableInteger(raw.rankScore ?? raw.rank_score ?? raw.evaluation),
    source: (['uma-profile', 'hakuraku-json', 'horseact-json', 'umaextractor-json', 'client'].includes(String(raw.source)) ? raw.source : 'unknown') as VeteranRecord['source'],
    stats: { speed: integer(rawStats.speed ?? raw.speed), stamina: integer(rawStats.stamina ?? raw.stamina), power: integer(rawStats.power ?? raw.power), guts: integer(rawStats.guts ?? raw.guts), wisdom: integer(rawStats.wisdom ?? rawStats.wit ?? rawStats.wiz ?? raw.wisdom ?? raw.wit ?? raw.wiz) },
    skills: list(raw.skills ?? raw.skill_array ?? raw.skillArray).map(skill).filter((item) => item.id > 0),
    factors: factorInput.map(factor).filter((item) => item.id > 0),
    parents: parentInput.map((value) => { const parent = object(value); return { positionId: integer(parent.positionId ?? parent.position_id), cardId: integer(parent.cardId ?? parent.card_id), factors: ([parent.factors, parent.factor_info_array, parent.factor_id_array].map(list).find((values) => values.length) ?? []).map(factor).filter((item) => item.id > 0) }; }).filter((item) => item.cardId > 0),
    rawSource: raw
  };
  const suppliedId = string(raw.recordId ?? raw.record_id ?? raw.id);
  record.recordId = trainedCharaId != null ? `trained-${trainedCharaId}` : suppliedId ?? `veteran-${veteranFingerprint(record)}`;
  return validateVeteranRecord(record);
}

export function normalizeVeteranImport(input: unknown): VeteranRecord[] {
  const root = object(input);
  const data = object(root.data);
  const values = Array.isArray(input) ? input : list(root.veterans ?? root.records ?? root.trained_chara_array ?? data.trained_chara_array ?? root.data);
  if (!values.length && (root.card_id || root.cardId)) return [normalizeVeteranRecord(input)];
  if (!values.length) throw new Error('The JSON does not contain a Veteran list. Expected an array or a veterans/records/data array.');
  return values.map((value, index) => { try { return normalizeVeteranRecord(value); } catch (error) { throw new Error(`Veteran ${index + 1}: ${error instanceof Error ? error.message : 'invalid record'}`); } });
}
