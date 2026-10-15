import { factorMetadata } from '@/lib/catalog/factor-catalog';
import { characterImagePath, type CharacterCatalogEntry } from '@/lib/catalog/character-catalog';
import {
  BTREE_ORDER,
  emptyPlannerNodes,
  type PlannerNode,
  type PlannerPosition,
  type PlannerSpark
} from '@/lib/lineage/planner';
import { resolveVeteranFactors } from '@/lib/profile/profile-veterans';
import type { ProfileVeteran, SuccessionChara } from '@/pages/profile/profile-repository';

export type PlannerNodes = Record<PlannerPosition, PlannerNode>;

export function characterImage(entry: CharacterCatalogEntry | undefined): string | undefined {
  return entry ? characterImagePath(Number(entry.id)) : undefined;
}

export function characterEntry(
  characters: Map<number, CharacterCatalogEntry>,
  id: number | null
): [number, CharacterCatalogEntry] | undefined {
  if (id == null) return undefined;
  const exact = characters.get(id);
  if (exact) return [id, exact];
  return [...characters.entries()].find(([cardId]) => Math.floor(cardId / 100) === id);
}

export function hydratePlannerNodes(
  input: PlannerNodes,
  characters: Map<number, CharacterCatalogEntry>,
  legacyCardIds: Set<number>
): PlannerNodes {
  return Object.fromEntries(
    BTREE_ORDER.map((position) => {
      const node = input[position];
      const resolved = characterEntry(characters, node.characterId);
      const entry = resolved?.[1];
      if (characters.size && node.characterId && legacyCardIds.has(node.characterId) && !entry)
        return [position, emptyPlannerNodes()[position]];
      const sparks = node.sparks.map((spark) => {
        const metadata = factorMetadata(spark.factorId);
        return metadata ? { ...spark, name: metadata.text, type: metadata.type } : spark;
      });
      return [
        position,
        {
          ...node,
          sparks,
          characterId: resolved?.[0] ?? node.characterId,
          name:
            entry?.name ??
            node.name ??
            (node.characterId ? `Character ${node.characterId}` : undefined),
          image: characterImage(entry) ?? node.image
        }
      ];
    })
  ) as PlannerNodes;
}

export function sparksFrom(source: ProfileVeteran | SuccessionChara): PlannerSpark[] {
  const resolved = resolveVeteranFactors(source);
  return resolved.map((factor) => ({
    factorId: factor.id,
    name: factor.name,
    type: factor.type,
    level: factor.level
  }));
}

function successionMap(parent: PlannerPosition): Partial<Record<number, PlannerPosition>> {
  if (parent === 'target')
    return { 10: 'p1', 20: 'p2', 11: 'p1-1', 12: 'p1-2', 21: 'p2-1', 22: 'p2-2' };
  if (parent === 'p1')
    return { 10: 'p1-1', 20: 'p1-2', 11: 'p1-1-1', 12: 'p1-1-2', 21: 'p1-2-1', 22: 'p1-2-2' };
  if (parent === 'p2')
    return { 10: 'p2-1', 20: 'p2-2', 11: 'p2-1-1', 12: 'p2-1-2', 21: 'p2-2-1', 22: 'p2-2-2' };
  if (parent === 'p1-1') return { 10: 'p1-1-1', 20: 'p1-1-2' };
  if (parent === 'p1-2') return { 10: 'p1-2-1', 20: 'p1-2-2' };
  if (parent === 'p2-1') return { 10: 'p2-1-1', 20: 'p2-1-2' };
  if (parent === 'p2-2') return { 10: 'p2-2-1', 20: 'p2-2-2' };
  return {};
}

export function applySuccession(
  nodes: PlannerNodes,
  parent: PlannerPosition,
  succession: SuccessionChara[],
  characters: Map<number, CharacterCatalogEntry>
): PlannerNodes {
  const mapping = successionMap(parent);
  const next = { ...nodes };
  for (const item of succession) {
    const position = mapping[item.position_id];
    if (!position) continue;
    const entry = characters.get(item.card_id);
    next[position] = {
      ...next[position],
      characterId: item.card_id,
      name: entry?.name ?? `Character ${item.card_id}`,
      image: characterImage(entry),
      sparks: sparksFrom(item),
      winSaddleIds: item.win_saddle_id_array ?? [],
      succession: item,
      veteran: undefined
    };
  }
  return next;
}
