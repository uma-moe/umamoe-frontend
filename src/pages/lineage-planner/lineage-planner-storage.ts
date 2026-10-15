import type { CharacterCatalogEntry } from '@/lib/catalog/character-catalog';
import {
  BTREE_ORDER,
  buildPlannerPayload,
  buildShareState,
  decodeShareState,
  emptyPlannerNodes,
  encodeShareState,
  LINEAGE_SAVES_KEY,
  LINEAGE_STORAGE_KEY,
  parsePlannerPayload,
  parsePlannerTransfer,
  type PlannerPayloadNode
} from '@/lib/lineage/planner';
import { characterEntry, type PlannerNodes } from './lineage-planner-nodes';

export type SavedTrees = Record<string, PlannerPayloadNode[]>;

export function persistPlannerTree(nodes: PlannerNodes): void {
  const payload = buildPlannerPayload(nodes);
  try {
    if (payload.length) localStorage.setItem(LINEAGE_STORAGE_KEY, JSON.stringify(payload));
    else localStorage.removeItem(LINEAGE_STORAGE_KEY);
  } catch {
    /* storage can be unavailable */
  }
  const url = new URL(window.location.href);
  const share = buildShareState(nodes);
  if (share) url.searchParams.set('tree', encodeShareState(share));
  else url.searchParams.delete('tree');
  url.searchParams.delete('cards');
  url.searchParams.delete('from');
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export function restoredPlannerPayload(
  characters: Map<number, CharacterCatalogEntry>,
  legacyCardIds: Set<number>,
  onwarning: (message: string) => void
): PlannerPayloadNode[] | null {
  const query = new URLSearchParams(location.search);
  let payload: PlannerPayloadNode[] | null = null;
  const shared = query.get('tree');
  if (shared) {
    payload = decodeShareState(shared);
    if (!payload) onwarning('Invalid lineage planner URL state.');
  }
  const from = query.get('from');
  if (!payload && (from === 'db' || from === 'profile')) {
    let rawTransfer: unknown = null;
    try {
      rawTransfer = JSON.parse(localStorage.getItem('planner_transfer') ?? 'null');
    } catch {
      rawTransfer = null;
    } finally {
      try {
        localStorage.removeItem('planner_transfer');
      } catch {
        /* legacy one-shot storage may be unavailable */
      }
    }
    payload =
      parsePlannerTransfer(rawTransfer, from === 'profile' ? 'profile' : 'database')?.payload ??
      null;
  }
  if (!payload && from !== 'db' && from !== 'profile') {
    const cards = query.get('cards');
    if (cards) {
      const ids = cards.split(',').map((value) => parseInt(value, 10));
      if (ids.length < 5) return null;
      const initial = emptyPlannerNodes();
      ids.slice(0, BTREE_ORDER.length).forEach((id, index) => {
        const position = BTREE_ORDER[index];
        const entry = id ? characterEntry(characters, id) : undefined;
        if (position && Number.isSafeInteger(id) && id > 0 && (entry || !characters.size)) {
          initial[position].characterId = entry?.[0] ?? id;
          legacyCardIds.add(id);
        }
      });
      payload = buildPlannerPayload(initial);
    }
  }
  if (!payload) {
    try {
      payload = parsePlannerPayload(
        JSON.parse(localStorage.getItem(LINEAGE_STORAGE_KEY) ?? 'null')
      );
    } catch {
      payload = null;
    }
  }
  return payload;
}

export function readSavedTrees(): SavedTrees | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LINEAGE_SAVES_KEY) ?? '{}');
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      Object.values(parsed).some(
        (payload) => !Array.isArray(payload) || !parsePlannerPayload(payload)
      )
    )
      throw new Error();
    return parsed as SavedTrees;
  } catch {
    return null;
  }
}

export function plannerExportText(nodes: PlannerNodes): string | null {
  const payload = buildPlannerPayload(nodes);
  return payload.length
    ? JSON.stringify(
        { version: 1, type: 'lineage-planner', exportedAt: new Date().toISOString(), payload },
        null,
        2
      )
    : null;
}
