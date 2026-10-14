import { decodeFactor, decodeFactorEntry } from '@/lib/catalog/factor-catalog';
import { sparkMetrics } from '@/lib/inheritance/spark-probability';
import type { VeteranAffinityEngine } from '@/lib/veterans/affinity-engine';

export const LINEAGE_STORAGE_KEY = 'lineage-planner-state-v1';
export const LINEAGE_SAVES_KEY = 'lineage-planner-saves-v1';
export const TREE_POSITIONS = [
  { position: 'target', layer: 0, label: 'Target' },
  { position: 'p1', layer: 1, label: 'Parent 1', parentPosition: 'target' },
  { position: 'p2', layer: 1, label: 'Parent 2', parentPosition: 'target' },
  { position: 'p1-1', layer: 2, label: 'Grandparent 1', parentPosition: 'p1' },
  { position: 'p1-2', layer: 2, label: 'Grandparent 2', parentPosition: 'p1' },
  { position: 'p2-1', layer: 2, label: 'Grandparent 3', parentPosition: 'p2' },
  { position: 'p2-2', layer: 2, label: 'Grandparent 4', parentPosition: 'p2' },
  { position: 'p1-1-1', layer: 3, label: 'Great-GP 1', parentPosition: 'p1-1' },
  { position: 'p1-1-2', layer: 3, label: 'Great-GP 2', parentPosition: 'p1-1' },
  { position: 'p1-2-1', layer: 3, label: 'Great-GP 3', parentPosition: 'p1-2' },
  { position: 'p1-2-2', layer: 3, label: 'Great-GP 4', parentPosition: 'p1-2' },
  { position: 'p2-1-1', layer: 3, label: 'Great-GP 5', parentPosition: 'p2-1' },
  { position: 'p2-1-2', layer: 3, label: 'Great-GP 6', parentPosition: 'p2-1' },
  { position: 'p2-2-1', layer: 3, label: 'Great-GP 7', parentPosition: 'p2-2' },
  { position: 'p2-2-2', layer: 3, label: 'Great-GP 8', parentPosition: 'p2-2' }
] as const;
export const BTREE_ORDER = TREE_POSITIONS.map((entry) => entry.position);
export type PlannerPosition = typeof TREE_POSITIONS[number]['position'];

export interface PlannerSpark { factorId: number; name: string; type: number; level: number; }
export interface PlannerNode {
  position: PlannerPosition;
  layer: number;
  label: string;
  characterId: number | null;
  name?: string;
  image?: string;
  sparks: PlannerSpark[];
  winSaddleIds: number[];
  veteran?: unknown;
  succession?: unknown;
}
export interface PlannerPayloadNode { position: PlannerPosition; characterId: number | null; sparks: PlannerSpark[]; veteran?: unknown; succession?: unknown; manualWinSaddleIds: number[]; }
export interface PlannerShareNode { p: number; c?: number; s?: number[]; r?: number[]; }
export interface PlannerShareState { v: 1; n: PlannerShareNode[]; }
export interface PlannerTransferState { payload: PlannerPayloadNode[]; source: 'database' | 'profile'; }
export interface PlannerAffinity {
  parentOne: { pair: number; left: number; right: number; total: number };
  parentTwo: { pair: number; left: number; right: number; total: number };
  shared: number;
  relationTotal: number;
  race: { parentPair: number; p1Left: number; p1Right: number; p2Left: number; p2Right: number; total: number };
  total: number;
}

export function emptyPlannerNodes(): Record<PlannerPosition, PlannerNode> {
  return Object.fromEntries(TREE_POSITIONS.map((entry) => [entry.position, { position: entry.position, layer: entry.layer, label: entry.label, characterId: null, sparks: [], winSaddleIds: [] }])) as unknown as Record<PlannerPosition, PlannerNode>;
}

export function buildPlannerPayload(nodes: Record<PlannerPosition, PlannerNode>): PlannerPayloadNode[] {
  return BTREE_ORDER.flatMap((position) => {
    const node = nodes[position];
    if (!node.characterId && !node.sparks.length && !node.winSaddleIds.length) return [];
    return [{ position, characterId: node.characterId, sparks: node.sparks, veteran: node.veteran, succession: node.succession, manualWinSaddleIds: node.winSaddleIds }];
  });
}

export function parsePlannerPayload(value: unknown): PlannerPayloadNode[] | null {
  const payload = Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray((value as { payload?: unknown }).payload) ? (value as { payload: unknown[] }).payload : null;
  if (!payload) return null;
  const positions = new Set<string>(BTREE_ORDER);
  const seen = new Set<string>();
  const result: PlannerPayloadNode[] = [];
  for (const raw of payload) {
    if (!raw || typeof raw !== 'object') return null;
    const entry = raw as Record<string, unknown>;
    const position = String(entry.position);
    const characterId = entry.characterId == null ? null : typeof entry.characterId === 'number' || typeof entry.characterId === 'string' ? Number(entry.characterId) : NaN;
    if (!positions.has(position) || seen.has(position) || (characterId !== null && (!Number.isSafeInteger(characterId) || characterId <= 0))) return null;
    seen.add(position);
    result.push({ position: position as PlannerPosition, characterId, sparks: parseSparks(entry.sparks), veteran: entry.veteran, succession: entry.succession, manualWinSaddleIds: numberList(entry.manualWinSaddleIds) });
  }
  return result;
}

export function applyPlannerPayload(payload: PlannerPayloadNode[]): Record<PlannerPosition, PlannerNode> {
  const nodes = emptyPlannerNodes();
  for (const entry of payload) nodes[entry.position] = { ...nodes[entry.position], characterId: entry.characterId, sparks: entry.sparks, winSaddleIds: entry.manualWinSaddleIds, veteran: entry.veteran, succession: entry.succession };
  return nodes;
}

function transferObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function transferNumber(source: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value) && value > 0) return Math.trunc(value);
  }
  return null;
}

function transferList(source: Record<string, unknown>, ...keys: string[]): unknown[] {
  for (const key of keys) if (Array.isArray(source[key])) return source[key] as unknown[];
  return [];
}

function transferSparks(node: Record<string, unknown>): PlannerSpark[] {
  const values = [node.factor_info_array, node.factorInfoArray, node.factors, node.factor_id_array]
    .find((value): value is unknown[] => Array.isArray(value) && value.length > 0) ?? [];
  return values.flatMap((value) => {
    const raw = transferObject(value);
    const explicitLevel = transferNumber(raw, 'level');
    const encoded = typeof value === 'number' || typeof value === 'string'
      ? Number(value)
      : transferNumber(raw, 'factorId', 'factor_id', 'id');
    if (!Number.isFinite(encoded) || Number(encoded) <= 0) return [];
    const decoded = decodeFactor(Number(encoded));
    const factor = raw.factor_id != null ? decodeFactorEntry(Number(encoded), explicitLevel ?? undefined)
      : explicitLevel == null ? decoded : decodeFactor(Number(encoded) * 10 + explicitLevel);
    return [{ factorId: factor.id, name: factor.name, type: factor.type, level: factor.level }];
  });
}

function transferredNode(position: PlannerPosition, characterId: number | null, sparks: PlannerSpark[], wins: unknown[], context?: { veteran?: unknown; succession?: unknown }): PlannerPayloadNode | null {
  if (!characterId && !sparks.length && !wins.length) return null;
  return {
    position,
    characterId,
    sparks,
    manualWinSaddleIds: wins.map(Number).filter((value) => Number.isFinite(value) && value > 0).map(Math.trunc),
    ...context
  };
}

/** Converts the one-shot Angular `planner_transfer` payload without changing its storage contract. */
export function parsePlannerTransfer(value: unknown, source: 'database' | 'profile' = 'database'): PlannerTransferState | null {
  const transfer = transferObject(value);
  if (!Object.keys(transfer).length) return null;
  const payload: PlannerPayloadNode[] = [];
  const record = transferObject(transfer.record);
  const target = transferredNode('target', transferNumber(transfer, 'targetCharaId', 'target_chara_id'), [], []);
  if (target) payload.push(target);

  if (Object.keys(record).length) {
    const definitions: Array<{ position: PlannerPosition; character: string[]; blue: string[]; pink: string[]; green: string[]; white: string[]; wins: string[] }> = [
      { position: 'p1', character: ['mainParentId', 'main_parent_id'], blue: ['mainBlue', 'main_blue_factors'], pink: ['mainPink', 'main_pink_factors'], green: ['mainGreen', 'main_green_factors'], white: ['mainWhite', 'main_white_factors'], wins: ['mainWinSaddles', 'main_win_saddles'] },
      { position: 'p1-1', character: ['leftParentId', 'parent_left_id'], blue: ['leftBlue', 'left_blue_factors'], pink: ['leftPink', 'left_pink_factors'], green: ['leftGreen', 'left_green_factors'], white: ['leftWhite', 'left_white_factors'], wins: ['leftWinSaddles', 'left_win_saddles'] },
      { position: 'p1-2', character: ['rightParentId', 'parent_right_id'], blue: ['rightBlue', 'right_blue_factors'], pink: ['rightPink', 'right_pink_factors'], green: ['rightGreen', 'right_green_factors'], white: ['rightWhite', 'right_white_factors'], wins: ['rightWinSaddles', 'right_win_saddles'] }
    ];
    for (const definition of definitions) {
      const scalarSparks = [...definition.blue, ...definition.pink, ...definition.green]
        .map((key) => record[key]).filter((item) => item !== null && item !== undefined);
      const node = transferredNode(
        definition.position,
        transferNumber(record, ...definition.character),
        transferSparks({ factors: [...scalarSparks, ...transferList(record, ...definition.white)] }),
        transferList(record, ...definition.wins)
      );
      if (node) payload.push(node);
    }
  }

  const veteran = transferObject(transfer.veteran);
  if (Object.keys(veteran).length) {
    const rawVeteran = transferObject(veteran.rawSource);
    const requestedPosition = String(transfer.veteranPosition ?? transfer.veteran_position ?? 'p2') as PlannerPosition;
    const position = new Set<string>(BTREE_ORDER).has(requestedPosition) ? requestedPosition : 'p2';
    // Inheritance summaries include ancestors; a node must contain only its own sparks.
    const sparks = transferSparks(veteran);
    const node = transferredNode(
      position,
      transferNumber(veteran, 'cardId', 'card_id', 'chara_id'),
      sparks,
      transferList(veteran, 'win_saddle_id_array').length ? transferList(veteran, 'win_saddle_id_array') : transferList(rawVeteran, 'win_saddle_id_array', 'main_win_saddles'),
      { veteran: transfer.veteran }
    );
    if (node) payload.push(node);

    const succession = transferList(veteran, 'parents', 'succession_chara_array', 'successionCharaArray');
    const childPositions: Partial<Record<PlannerPosition, Record<number, PlannerPosition>>> = {
      p1: { 10: 'p1-1', 20: 'p1-2' }, p2: { 10: 'p2-1', 20: 'p2-2' }
    };
    const mapping = childPositions[position] ?? {};
    for (const rawChild of succession) {
      const child = transferObject(rawChild);
      const childPosition = mapping[transferNumber(child, 'positionId', 'position_id') ?? -1];
      if (!childPosition) continue;
      const sourceChild = transferList(rawVeteran, 'succession_chara_array', 'parents').map(transferObject).find((entry) => transferNumber(entry, 'position_id', 'positionId') === transferNumber(child, 'positionId', 'position_id'));
      const childNode = transferredNode(
        childPosition,
        transferNumber(child, 'cardId', 'card_id'),
        transferSparks(child),
        transferList(child, 'win_saddle_id_array').length ? transferList(child, 'win_saddle_id_array') : transferList(sourceChild ?? {}, 'win_saddle_id_array'),
        { succession: rawChild }
      );
      if (childNode) payload.push(childNode);
    }
  }

  return payload.length ? { payload, source } : null;
}

export function buildShareState(nodes: Record<PlannerPosition, PlannerNode>): PlannerShareState | null {
  const entries = BTREE_ORDER.flatMap((position, p) => {
    const node = nodes[position];
    const sparks = node.sparks.map((spark) => spark.factorId * 10 + spark.level);
    if (!node.characterId && !sparks.length && !node.winSaddleIds.length) return [];
    return [{ p, ...(node.characterId ? { c: node.characterId } : {}), ...(sparks.length ? { s: sparks } : {}), ...(node.winSaddleIds.length ? { r: node.winSaddleIds } : {}) }];
  });
  return entries.length ? { v: 1, n: entries } : null;
}

export function encodeShareState(state: PlannerShareState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeShareState(value: string): PlannerPayloadNode[] | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const state = JSON.parse(new TextDecoder().decode(bytes)) as PlannerShareState;
    if (state.v !== 1 || !Array.isArray(state.n)) return null;
    return state.n.flatMap((entry) => {
      const position = BTREE_ORDER[entry.p];
      if (!position) return [];
      return [{ position, characterId: Number.isFinite(entry.c) ? entry.c! : null, sparks: numberList(entry.s).map((encoded) => { const factor = decodeFactor(encoded); return { factorId: factor.id, name: factor.name, type: factor.type, level: factor.level }; }), manualWinSaddleIds: numberList(entry.r) }];
    });
  } catch { return null; }
}

function numberList(value: unknown): number[] { return Array.isArray(value) ? value.map(Number).filter(Number.isFinite).map(Math.trunc) : []; }
function parseSparks(value: unknown): PlannerSpark[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const entry = raw as Record<string, unknown>;
    const factorId = Number(entry.factorId ?? entry.factor_id);
    const level = Math.max(1, Math.min(3, Number(entry.level) || 1));
    if (!Number.isFinite(factorId)) return [];
    const factor = decodeFactor(factorId * 10 + level);
    return [{ factorId: factor.id, name: String(entry.name ?? factor.name), type: Number(entry.type ?? factor.type), level }];
  });
}

function baseId(cardId: number | null): number | null { return cardId ? cardId >= 10000 ? Math.floor(cardId / 100) : cardId : null; }

/** A slot must differ from its parent, sibling and direct children, across all outfits. */
export function plannerExcludedCharacters(nodes: Record<PlannerPosition, PlannerNode>, position: PlannerPosition): Set<number> {
  const slot = TREE_POSITIONS.find((entry) => entry.position === position)!;
  const parent = 'parentPosition' in slot ? slot.parentPosition : undefined;
  return new Set(TREE_POSITIONS.filter((entry) => entry.position !== position && (
    entry.position === parent || 'parentPosition' in entry && (entry.parentPosition === position || entry.parentPosition === parent)
  )).flatMap((entry) => {
    const id = baseId(nodes[entry.position].characterId);
    return id == null ? [] : [id];
  }));
}

export function canPlacePlannerCharacter(nodes: Record<PlannerPosition, PlannerNode>, position: PlannerPosition, characterId: number): boolean {
  const id = baseId(characterId);
  return id != null && !plannerExcludedCharacters(nodes, position).has(id);
}

/** Match Angular's scorePlannerSlot: a fresh character never inherits the old slot's wins. */
export function plannerCharacterAffinity(engine: VeteranAffinityEngine | undefined, nodes: Record<PlannerPosition, PlannerNode>, position: PlannerPosition, characterId: number, groups: ReadonlyMap<number, number>): number | undefined {
  if (!engine?.ready || nodes[position].layer === 3) return undefined;
  const trial = { ...nodes, [position]: { ...nodes[position], characterId, winSaddleIds: [] } };
  return plannerNodeAffinity(calculatePlannerAffinity(engine, trial, groups), position);
}
function sharedWins(first: PlannerNode, second: PlannerNode, groups: ReadonlyMap<number, number>): number {
  const right = new Set(second.winSaddleIds.map((id) => groups.get(id)).filter((id) => id != null));
  return new Set(first.winSaddleIds.map((id) => groups.get(id)).filter((id) => id != null && right.has(id))).size * 3;
}

export function calculatePlannerAffinity(engine: VeteranAffinityEngine | undefined, nodes: Record<PlannerPosition, PlannerNode>, groups: ReadonlyMap<number, number> = new Map()): PlannerAffinity | null {
  if (!engine?.ready) return null;
  const id = (position: PlannerPosition) => baseId(nodes[position].characterId);
  const target = id('target'); const p1 = id('p1'); const p2 = id('p2');
  const p1Pair = engine.pair(target, p1); const p2Pair = engine.pair(target, p2);
  const p1Left = engine.triple(target, p1, id('p1-1')); const p1Right = engine.triple(target, p1, id('p1-2'));
  const p2Left = engine.triple(target, p2, id('p2-1')); const p2Right = engine.triple(target, p2, id('p2-2'));
  const shared = engine.pair(p1, p2);
  const race = {
    parentPair: sharedWins(nodes.p1, nodes.p2, groups),
    p1Left: sharedWins(nodes.p1, nodes['p1-1'], groups), p1Right: sharedWins(nodes.p1, nodes['p1-2'], groups),
    p2Left: sharedWins(nodes.p2, nodes['p2-1'], groups), p2Right: sharedWins(nodes.p2, nodes['p2-2'], groups), total: 0
  };
  race.total = race.parentPair + race.p1Left + race.p1Right + race.p2Left + race.p2Right;
  const parentOne = { pair: p1Pair, left: p1Left, right: p1Right, total: p1Pair + p1Left + p1Right };
  const parentTwo = { pair: p2Pair, left: p2Left, right: p2Right, total: p2Pair + p2Left + p2Right };
  const relationTotal = parentOne.total + parentTwo.total + shared;
  return { parentOne, parentTwo, shared, relationTotal, race, total: relationTotal + race.total };
}

export function plannerSparkChance(spark: PlannerSpark, affinity: number, perRun: boolean): number {
  return sparkMetrics([{ spark, affinity }], perRun).chance;
}

/** Creation odds during training, not the independent inheritance-roll odds. */
export function plannerSkillSparks(nodes: Record<PlannerPosition, PlannerNode>) {
  const counts = new Map<number, { factorId: number; name: string; count: number }>();
  for (const node of Object.values(nodes)) {
    if (node.layer < 1 || node.layer > 2) continue;
    for (const spark of node.sparks) {
      if (spark.type !== 3) continue;
      const entry = counts.get(spark.factorId) ?? { factorId: spark.factorId, name: spark.name, count: 0 };
      entry.count++;
      counts.set(spark.factorId, entry);
    }
  }
  return [...counts.values()].map(entry => {
    const multiplier = 1.1 ** entry.count;
    return { ...entry, learned: Math.round(20 * multiplier * 100) / 100, upgraded: Math.round(25 * multiplier * 100) / 100, gold: Math.round(40 * multiplier * 100) / 100 };
  }).sort((a, b) => b.learned - a.learned);
}

/** Direct-parent sparks include the shared P1–P2 relation and all branch race bonuses. */
export function plannerNodeAffinity(affinity: PlannerAffinity | null, position: PlannerPosition): number {
  return plannerAffinityBreakdown(affinity, position)?.total ?? 0;
}

export function plannerAffinityBreakdown(affinity: PlannerAffinity | null, position: PlannerPosition) {
  if (!affinity) return null;
  let base = 0, race = 0;
  switch (position) {
    case 'target': base = affinity.relationTotal; race = affinity.race.total; break;
    case 'p1': base = affinity.parentOne.total + affinity.shared; race = affinity.race.parentPair + affinity.race.p1Left + affinity.race.p1Right; break;
    case 'p2': base = affinity.parentTwo.total + affinity.shared; race = affinity.race.parentPair + affinity.race.p2Left + affinity.race.p2Right; break;
    case 'p1-1': base = affinity.parentOne.left; race = affinity.race.p1Left; break;
    case 'p1-2': base = affinity.parentOne.right; race = affinity.race.p1Right; break;
    case 'p2-1': base = affinity.parentTwo.left; race = affinity.race.p2Left; break;
    case 'p2-2': base = affinity.parentTwo.right; race = affinity.race.p2Right; break;
  }
  return { base, race, total: base + race };
}

/** Unlike parent spark odds, the target composition counts the shared term once. */
export function plannerAffinityFlows(affinity: PlannerAffinity | null) {
  if (!affinity) return null;
  return {
    p1: affinity.parentOne.total + affinity.race.p1Left + affinity.race.p1Right,
    p2: affinity.parentTwo.total + affinity.race.p2Left + affinity.race.p2Right,
    shared: affinity.shared + affinity.race.parentPair
  };
}
