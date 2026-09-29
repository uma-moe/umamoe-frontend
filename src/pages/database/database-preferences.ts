import {
  activeInheritanceFilterCount,
  emptyInheritanceFilters,
  type FactorRequirement,
  type InheritanceFilterMode,
  type InheritanceSearchFilters
} from '@/lib/inheritance/inheritance-search';

export const DATABASE_FILTER_STATE_KEY = 'database-filter-state-v2';
export const DATABASE_FILTER_MODE_KEY = 'database-filter-mode-v1';
export const DATABASE_FILTER_PRESETS_KEY = 'database-filter-presets-v1';
export const DATABASE_LIST_MODE_KEY = 'db-list-mode';
export const DATABASE_HIDDEN_SPARKS_KEY = 'db-hidden-spark-factors';
export const DATABASE_SPARK_ORDER_KEY = 'db-spark-order';

type PriorityFactorState = number | [number, number];

/**
 * The compact filter payload is a public compatibility contract: Angular puts
 * it in localStorage, presets, and the `filters` query parameter. Keep fields
 * optional and retain unknown keys so a Svelte save never destroys a setting
 * implemented by an older/newer frontend.
 */
export interface CompactDatabaseFilterState extends Record<string, unknown> {
  fm?: InheritanceFilterMode;
  uql?: string;
  b?: (number | null)[][];
  p?: (number | null)[][];
  g?: (number | null)[][];
  w?: (number | null)[][];
  sid?: number[];
  ow?: PriorityFactorState[];
  omw?: PriorityFactorState[];
  lw?: PriorityFactorState[];
  mb?: (number | null)[][];
  mp?: (number | null)[][];
  mg?: (number | null)[][];
  mw?: (number | null)[][];
  t?: (number | null)[];
  sc?: string;
  lb?: number;
  uid?: string;
  un?: string;
  mwc?: number;
  mwh?: number;
  pr?: number;
  mf?: number;
  bss?: number;
  pss?: number;
  gss?: number;
  wss?: number;
  cwc?: number;
  cws?: number;
  swc?: number;
  sws?: number;
  rwc?: number;
  rws?: number;
  mcwc?: number;
  mcws?: number;
  mswc?: number;
  msws?: number;
  mrwc?: number;
  mrws?: number;
  mmwc?: number;
  imp?: number[];
  ip?: number[];
  ep?: number[];
  emp?: number[];
  p2c?: number;
  p2w?: number[];
  p2i?: number | string;
  rs?: [number, number, number, number][];
  vet?: string | [string, number];
}

export interface SavedDatabaseFilterState {
  version: 2;
  mode: InheritanceFilterMode;
  formState?: string;
  uqlState?: string;
  defaultMlbFilterRemoved?: boolean;
  hiddenP2ContextRemoved?: boolean;
}

export interface SavedDatabaseFilterPreset {
  version: 1;
  id: string;
  name: string;
  mode: InheritanceFilterMode;
  state: string;
  createdAt: number;
  updatedAt: number;
}

export interface RestoredDatabasePreferences {
  mode: InheritanceFilterMode;
  filters: InheritanceSearchFilters;
  compact: CompactDatabaseFilterState;
  saved: SavedDatabaseFilterState | null;
}

function isMode(value: unknown): value is InheritanceFilterMode {
  return value === 'basic' || value === 'advanced' || value === 'uql';
}

function utf8ToBinary(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return binary;
}

function binaryToUtf8(value: string): string {
  const bytes = Uint8Array.from(value, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeDatabaseFilterState(state: CompactDatabaseFilterState): string {
  if (!Object.keys(state).length) return '';
  return btoa(utf8ToBinary(JSON.stringify(state)));
}

export function decodeDatabaseFilterState(value: string | undefined): CompactDatabaseFilterState {
  if (!value) return {};
  const parsed = JSON.parse(binaryToUtf8(atob(value))) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid database filter state.');
  return parsed as CompactDatabaseFilterState;
}

function finiteNumber(value: unknown): number | undefined {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function finiteNumbers(value: unknown): number[] {
  return Array.isArray(value) ? value.map(finiteNumber).filter((item): item is number => item !== undefined) : [];
}

function restoreFactors(value: unknown, maximumCap = 9): FactorRequirement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!Array.isArray(entry)) return [];
    const factorId = finiteNumber(entry[0]);
    if (factorId === undefined || factorId < 0) return [];
    const minimumStars = Math.max(1, Math.min(maximumCap, finiteNumber(entry[1]) ?? 1));
    const maximumStars = Math.max(minimumStars, Math.min(maximumCap, finiteNumber(entry[2]) ?? maximumCap));
    const requirement: FactorRequirement = { factorId, minimumStars, maximumStars };
    if (entry[3] === 1) requirement.operator = 'or';
    if (maximumCap === 3) return [requirement];
    const minimumOccurrences = finiteNumber(entry[4]);
    const maximumOccurrences = finiteNumber(entry[5]);
    if (minimumOccurrences !== undefined) requirement.minimumOccurrences = Math.max(0, Math.min(3, Math.trunc(minimumOccurrences)));
    if (maximumOccurrences !== undefined) requirement.maximumOccurrences = Math.max(requirement.minimumOccurrences ?? 0, Math.min(3, Math.trunc(maximumOccurrences)));
    if (entry[6] === 1) requirement.metric = 'occurrences';
    return [requirement];
  });
}

function restorePriorityFactors(value: unknown): FactorRequirement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const factorId = finiteNumber(Array.isArray(entry) ? entry[0] : entry);
    if (!factorId || factorId <= 0) return [];
    const priority = Math.max(0, Math.floor(finiteNumber(Array.isArray(entry) ? entry[1] : 0) ?? 0));
    return [{ factorId, minimumStars: 1, maximumStars: 9, priority }];
  });
}

function compactFactors(requirements: FactorRequirement[]): (number | null)[][] | undefined {
  const result = requirements
    .filter((requirement) => Number.isFinite(requirement.factorId) && requirement.factorId >= 0)
    .map((requirement) => {
      const compact: (number | null)[] = [
        Math.trunc(requirement.factorId),
        Math.max(1, Math.trunc(requirement.minimumStars || 1)),
        Math.max(requirement.minimumStars || 1, Math.trunc(requirement.maximumStars ?? 9))
      ];
      if (requirement.operator === 'or') compact[3] = 1;
      if (requirement.minimumOccurrences !== undefined) compact[4] = requirement.minimumOccurrences;
      if (requirement.maximumOccurrences !== undefined) compact[5] = requirement.maximumOccurrences;
      if (requirement.metric === 'occurrences') compact[6] = 1;
      return compact;
    });
  return result.length ? result : undefined;
}

function compactPriorityFactors(requirements: FactorRequirement[]): PriorityFactorState[] | undefined {
  const result = requirements
    .filter((requirement) => Number.isFinite(requirement.factorId) && requirement.factorId > 0)
    .map((requirement) => {
      const priority = Math.max(0, Math.floor(requirement.priority ?? 0));
      return priority ? [Math.trunc(requirement.factorId), priority] as [number, number] : Math.trunc(requirement.factorId);
    });
  return result.length ? result : undefined;
}

function setOrDelete<T extends CompactDatabaseFilterState, K extends keyof T>(state: T, key: K, value: T[K] | undefined): void {
  if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) delete state[key];
  else state[key] = value;
}

export function filtersFromCompactState(state: CompactDatabaseFilterState, mode: InheritanceFilterMode): InheritanceSearchFilters {
  const filters = emptyInheritanceFilters();
  filters.blue = restoreFactors(state.b);
  filters.pink = restoreFactors(state.p);
  filters.green = restoreFactors(state.g);
  filters.white = restoreFactors(state.w).filter(item => item.factorId > 0);
  filters.mainBlue = restoreFactors(state.mb, 3);
  filters.mainPink = restoreFactors(state.mp, 3);
  filters.mainGreen = restoreFactors(state.mg, 3);
  filters.mainWhite = restoreFactors(state.mw, 3).filter(item => item.factorId > 0);
  filters.optionalWhite = restorePriorityFactors(state.ow);
  filters.optionalMainWhite = restorePriorityFactors(state.omw);
  filters.lineageWhite = restorePriorityFactors(state.lw);
  filters.optionalWhiteIds = filters.optionalWhite.map((item) => item.factorId);
  filters.lineageWhiteIds = filters.lineageWhite.map((item) => item.factorId);
  filters.scenarioIds = finiteNumbers(state.sid);
  filters.includeMainParentIds = finiteNumbers(state.imp);
  filters.includeParentIds = finiteNumbers(state.ip);
  filters.excludeParentIds = finiteNumbers(state.ep);
  filters.excludeMainParentIds = finiteNumbers(state.emp);
  const tree = Array.isArray(state.t) ? state.t.map(finiteNumber) : [];
  filters.playerCharaId = tree[0];
  filters.mainParentIds = [...new Set([tree[1], ...filters.includeMainParentIds].filter((item): item is number => item !== undefined))];
  filters.parentLeftId = tree[2];
  filters.parentRightId = tree[3];
  filters.supportCardId = finiteNumber(state.sc);
  filters.minLimitBreak = finiteNumber(state.lb);
  filters.trainerId = typeof state.uid === 'string' ? state.uid : undefined;
  filters.trainerName = typeof state.un === 'string' ? state.un : undefined;
  filters.minWinCount = finiteNumber(state.mwc);
  filters.minWhiteCount = finiteNumber(state.mwh);
  filters.minParentRank = finiteNumber(state.pr);
  filters.maxFollowerNum = finiteNumber(state.mf) ?? 999;
  filters.minBlueStarsSum = finiteNumber(state.bss);
  filters.minPinkStarsSum = finiteNumber(state.pss);
  filters.minGreenStarsSum = finiteNumber(state.gss);
  filters.minWhiteStarsSum = finiteNumber(state.wss);
  filters.minCommonWhiteCount = finiteNumber(state.cwc);
  filters.minCommonWhiteStarsSum = finiteNumber(state.cws);
  filters.minScenarioWhiteCount = finiteNumber(state.swc);
  filters.minScenarioWhiteStarsSum = finiteNumber(state.sws);
  filters.minRaceWhiteCount = finiteNumber(state.rwc);
  filters.minRaceWhiteStarsSum = finiteNumber(state.rws);
  filters.minMainCommonWhiteCount = finiteNumber(state.mcwc);
  filters.minMainCommonWhiteStarsSum = finiteNumber(state.mcws);
  filters.minMainScenarioWhiteCount = finiteNumber(state.mswc);
  filters.minMainScenarioWhiteStarsSum = finiteNumber(state.msws);
  filters.minMainRaceWhiteCount = finiteNumber(state.mrwc);
  filters.minMainRaceWhiteStarsSum = finiteNumber(state.mrws);
  filters.minMainWhiteCount = finiteNumber(state.mmwc);
  filters.p2MainCharaId = !state.vet && typeof state.p2c === 'number' && Number.isSafeInteger(state.p2c) && state.p2c > 0 ? state.p2c : undefined;
  filters.p2WinSaddle = state.vet ? [] : [...new Set(finiteNumbers(state.p2w).filter((id) => Number.isSafeInteger(id) && id > 0))];
  filters.raceSchedule = Array.isArray(state.rs) ? state.rs : [];
  filters.uql = mode === 'uql' && typeof state.uql === 'string' ? state.uql : undefined;
  return filters;
}

export function compactStateFromFilters(filters: InheritanceSearchFilters, previous: CompactDatabaseFilterState = {}): CompactDatabaseFilterState {
  const state: CompactDatabaseFilterState = { ...previous };
  setOrDelete(state, 'b', compactFactors(filters.blue));
  setOrDelete(state, 'p', compactFactors(filters.pink));
  setOrDelete(state, 'g', compactFactors(filters.green));
  setOrDelete(state, 'w', compactFactors(filters.white.filter(item => item.factorId > 0)));
  setOrDelete(state, 'mb', compactFactors(filters.mainBlue));
  setOrDelete(state, 'mp', compactFactors(filters.mainPink));
  setOrDelete(state, 'mg', compactFactors(filters.mainGreen));
  setOrDelete(state, 'mw', compactFactors(filters.mainWhite.filter(item => item.factorId > 0)));
  setOrDelete(state, 'ow', compactPriorityFactors(filters.optionalWhite));
  setOrDelete(state, 'omw', compactPriorityFactors(filters.optionalMainWhite));
  setOrDelete(state, 'lw', compactPriorityFactors(filters.lineageWhite));
  setOrDelete(state, 'sid', filters.scenarioIds.length ? filters.scenarioIds : undefined);
  setOrDelete(state, 'imp', filters.includeMainParentIds.length ? filters.includeMainParentIds : undefined);
  setOrDelete(state, 'ip', filters.includeParentIds.length ? filters.includeParentIds : undefined);
  setOrDelete(state, 'ep', filters.excludeParentIds.length ? filters.excludeParentIds : undefined);
  setOrDelete(state, 'emp', filters.excludeMainParentIds.length ? filters.excludeMainParentIds : undefined);
  const previousTree = Array.isArray(previous.t) ? [...previous.t] : Array<number | null>(7).fill(null);
  previousTree[0] = filters.playerCharaId ?? null;
  previousTree[1] = filters.mainParentIds.find((id) => !filters.includeMainParentIds.includes(id)) ?? null;
  previousTree[2] = filters.parentLeftId ?? null;
  previousTree[3] = filters.parentRightId ?? null;
  setOrDelete(state, 't', previousTree.some((value) => value != null) ? previousTree : undefined);
  setOrDelete(state, 'sc', filters.supportCardId === undefined ? undefined : String(filters.supportCardId));
  setOrDelete(state, 'lb', filters.minLimitBreak && filters.minLimitBreak > 0 ? filters.minLimitBreak : undefined);
  setOrDelete(state, 'uid', filters.trainerId?.trim() || undefined);
  setOrDelete(state, 'un', filters.trainerName?.trim() || undefined);
  setOrDelete(state, 'mwc', filters.minWinCount);
  setOrDelete(state, 'mwh', filters.minWhiteCount);
  setOrDelete(state, 'pr', filters.minParentRank && filters.minParentRank !== 1 ? filters.minParentRank : undefined);
  setOrDelete(state, 'mf', filters.maxFollowerNum !== undefined && filters.maxFollowerNum >= 1000 ? filters.maxFollowerNum : undefined);
  setOrDelete(state, 'bss', filters.minBlueStarsSum);
  setOrDelete(state, 'pss', filters.minPinkStarsSum);
  setOrDelete(state, 'gss', filters.minGreenStarsSum);
  setOrDelete(state, 'wss', filters.minWhiteStarsSum);
  setOrDelete(state, 'cwc', filters.minCommonWhiteCount);
  setOrDelete(state, 'cws', filters.minCommonWhiteStarsSum);
  setOrDelete(state, 'swc', filters.minScenarioWhiteCount);
  setOrDelete(state, 'sws', filters.minScenarioWhiteStarsSum);
  setOrDelete(state, 'rwc', filters.minRaceWhiteCount);
  setOrDelete(state, 'rws', filters.minRaceWhiteStarsSum);
  setOrDelete(state, 'mcwc', filters.minMainCommonWhiteCount);
  setOrDelete(state, 'mcws', filters.minMainCommonWhiteStarsSum);
  setOrDelete(state, 'mswc', filters.minMainScenarioWhiteCount);
  setOrDelete(state, 'msws', filters.minMainScenarioWhiteStarsSum);
  setOrDelete(state, 'mrwc', filters.minMainRaceWhiteCount);
  setOrDelete(state, 'mrws', filters.minMainRaceWhiteStarsSum);
  setOrDelete(state, 'mmwc', filters.minMainWhiteCount);
  // URLs and presets retain Angular's public affinity context. Only preference
  // storage strips it; an owned selection is restored separately through `vet`.
  setOrDelete(state, 'p2c', filters.p2MainCharaId);
  setOrDelete(state, 'p2w', filters.p2WinSaddle);
  if (!state.p2c && !state.p2w?.length) delete state.p2i;
  setOrDelete(state, 'rs', filters.raceSchedule.length ? filters.raceSchedule : undefined);
  setOrDelete(state, 'uql', filters.uql?.trim() || undefined);
  return state;
}

function normalizedSavedState(value: unknown, modeFallback: InheritanceFilterMode): SavedDatabaseFilterState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Partial<SavedDatabaseFilterState>;
  if (candidate.version !== 2 || !isMode(candidate.mode)) return null;
  return {
    version: 2,
    mode: modeFallback,
    formState: typeof candidate.formState === 'string' ? candidate.formState : undefined,
    uqlState: typeof candidate.uqlState === 'string' ? candidate.uqlState : undefined,
    defaultMlbFilterRemoved: candidate.defaultMlbFilterRemoved === true,
    hiddenP2ContextRemoved: candidate.hiddenP2ContextRemoved === true
  };
}

export function readDatabasePreferences(storage: Storage): RestoredDatabasePreferences {
  const storedMode = storage.getItem(DATABASE_FILTER_MODE_KEY);
  const parsedMode = isMode(storedMode) ? storedMode : undefined;
  let parsed: unknown = null;
  try { parsed = JSON.parse(storage.getItem(DATABASE_FILTER_STATE_KEY) ?? 'null'); } catch { parsed = null; }
  const candidateMode = parsed && typeof parsed === 'object' && isMode((parsed as { mode?: unknown }).mode) ? (parsed as { mode: InheritanceFilterMode }).mode : 'basic';
  const mode = parsedMode ?? candidateMode;
  const saved = normalizedSavedState(parsed, mode);
  const encoded = mode === 'uql' ? saved?.uqlState : saved?.formState;
  let compact: CompactDatabaseFilterState = {};
  try { compact = decodeDatabaseFilterState(encoded); } catch { compact = {}; }
  let migrated = false;
  if (saved?.defaultMlbFilterRemoved !== true && compact.lb === 4) { delete compact.lb; migrated = true; }
  if (saved?.hiddenP2ContextRemoved !== true && ('p2c' in compact || 'p2w' in compact || 'p2i' in compact)) migrated = true;
  delete compact.p2c;
  delete compact.p2w;
  delete compact.p2i;
  let restoredSaved = saved;
  if (saved && (migrated || !saved.defaultMlbFilterRemoved || !saved.hiddenP2ContextRemoved)) {
    const migratedState = encodeDatabaseFilterState(compact);
    restoredSaved = { ...saved, defaultMlbFilterRemoved: true, hiddenP2ContextRemoved: true };
    if (mode === 'uql') restoredSaved.uqlState = migratedState;
    else restoredSaved.formState = migratedState;
    storage.setItem(DATABASE_FILTER_STATE_KEY, JSON.stringify(restoredSaved));
  }
  return { mode, filters: filtersFromCompactState(compact, mode), compact, saved: restoredSaved };
}

export function writeDatabasePreferences(
  storage: Storage,
  mode: InheritanceFilterMode,
  filters: InheritanceSearchFilters,
  previousSaved: SavedDatabaseFilterState | null,
  previousCompact: CompactDatabaseFilterState
): { saved: SavedDatabaseFilterState; compact: CompactDatabaseFilterState } {
  const compact = compactStateFromFilters(filters, previousCompact);
  const preference = { ...compact };
  delete preference.p2c; delete preference.p2w; delete preference.p2i;
  const encoded = encodeDatabaseFilterState(preference);
  const saved: SavedDatabaseFilterState = {
    version: 2,
    mode,
    formState: previousSaved?.formState,
    uqlState: previousSaved?.uqlState,
    defaultMlbFilterRemoved: true,
    hiddenP2ContextRemoved: true
  };
  if (mode === 'uql') {
    saved.uqlState = encoded;
    if (!encoded) saved.formState = '';
  } else saved.formState = encoded;
  storage.setItem(DATABASE_FILTER_MODE_KEY, mode);
  storage.setItem(DATABASE_FILTER_STATE_KEY, JSON.stringify(saved));
  return { saved, compact };
}

export function readDatabasePresets(storage: Storage): SavedDatabaseFilterPreset[] {
  try {
    const parsed = JSON.parse(storage.getItem(DATABASE_FILTER_PRESETS_KEY) ?? '[]') as unknown;
    return normalizePresetEntries(parsed);
  } catch { return []; }
}

function normalizePresetEntries(payload: unknown): SavedDatabaseFilterPreset[] {
  const values = Array.isArray(payload) ? payload : payload && typeof payload === 'object' && Array.isArray((payload as { presets?: unknown }).presets) ? (payload as { presets: unknown[] }).presets : [];
  return values.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const candidate = value as Partial<SavedDatabaseFilterPreset>;
    if (candidate.version !== 1 || !candidate.name?.trim() || !isMode(candidate.mode) || typeof candidate.state !== 'string') return [];
    try { if (candidate.state) decodeDatabaseFilterState(candidate.state); } catch { return []; }
    const createdAt = Number.isFinite(candidate.createdAt) ? candidate.createdAt! : Date.now();
    return [{ version: 1, id: candidate.id?.trim() || `${createdAt}-${candidate.name.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name: candidate.name.trim(), mode: candidate.mode, state: candidate.state, createdAt, updatedAt: Number.isFinite(candidate.updatedAt) ? candidate.updatedAt! : createdAt } satisfies SavedDatabaseFilterPreset];
  }).sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name));
}

export function exportDatabasePresets(presets: SavedDatabaseFilterPreset[], exportedAt = new Date().toISOString()): string {
  return btoa(utf8ToBinary(JSON.stringify({ type: 'uma.moe.database-filter-presets', version: 1, exportedAt, presets })));
}

export function importDatabasePresets(transferText: string, existing: SavedDatabaseFilterPreset[], now = Date.now()): { presets: SavedDatabaseFilterPreset[]; importedCount: number } {
  const payload = JSON.parse(binaryToUtf8(atob(transferText))) as unknown;
  if (!payload || typeof payload !== 'object' || (payload as { type?: unknown }).type !== 'uma.moe.database-filter-presets' || (payload as { version?: unknown }).version !== 1) throw new Error('Invalid database preset export.');
  const imported = normalizePresetEntries(payload);
  if (!imported.length) return { presets: [...existing], importedCount: 0 };
  const presets = [...existing];
  const usedIds = new Set(presets.map((preset) => preset.id));
  let importedCount = 0;
  for (const preset of imported) {
    const existingIndex = presets.findIndex((entry) => entry.name.toLocaleLowerCase() === preset.name.toLocaleLowerCase());
    if (existingIndex >= 0) {
      const current = presets[existingIndex]!;
      presets[existingIndex] = { ...preset, id: current.id, createdAt: current.createdAt, updatedAt: now + importedCount++ };
      continue;
    }
    let id = preset.id; let collision = 0;
    while (usedIds.has(id)) id = `${preset.id}-${++collision}`;
    usedIds.add(id); presets.push({ ...preset, id, updatedAt: now + importedCount++ });
  }
  presets.sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name));
  return { presets, importedCount };
}

export function writeDatabasePresets(storage: Storage, presets: SavedDatabaseFilterPreset[]): void {
  storage.setItem(DATABASE_FILTER_PRESETS_KEY, JSON.stringify(presets));
}

export function databasePresetFilterCount(preset: SavedDatabaseFilterPreset): number {
  try { return activeInheritanceFilterCount(filtersFromCompactState(decodeDatabaseFilterState(preset.state), preset.mode)); }
  catch { return 0; }
}
