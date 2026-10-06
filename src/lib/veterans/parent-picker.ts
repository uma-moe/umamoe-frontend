import type { ProfileVeteran, SuccessionChara } from '@/pages/profile/profile-repository';
import type { InheritanceRecord } from '@/lib/inheritance/inheritance-search';
import { resolveVeteranFactors, veteranCreationTime, type FactorTone } from '@/lib/profile/profile-veterans';
import { totalStats } from '@/lib/profile/profile-display';
import { emptyPlannerNodes, calculatePlannerAffinity } from '@/lib/lineage/planner';
import type { VeteranAffinityEngine } from './affinity-engine';
import type { CharacterCatalogEntry } from '@/lib/catalog/character-catalog';
import type { VeteranRecord } from './generated/veteran-record';
import { veteranProfile } from './veteran-profile';

export type ParentSource = 'veteran' | 'bookmark' | 'partner' | 'manual';
export interface SelectableParent extends ProfileVeteran {
  pickerId: string;
  name?: string;
  trainerName?: string;
  share_source: ParentSource;
  share_inheritance_id?: number;
  share_local_id?: string;
}
export type ParentSort = 'total' | 'affinity' | 'blue' | 'pink' | 'green' | 'name' | 'creation_time';
export interface ParentFactorFilter { factorId: number; scope: 'combined' | 'any' | 'own' | 'p1' | 'p2'; minLevel: number; maxLevel?: number; }
export interface ParentPickerState { tab: 'veterans' | 'bookmarks' | 'saved' | 'manual'; accountId: string; query: string; sort: ParentSort; factors: ParentFactorFilter[]; factorOperators?: Partial<Record<FactorTone, 'and' | 'or'>>; }
// Angular's scoped picker state is in memory, not a new browser-storage contract.
export const parentPickerSessions = new Map<string, ParentPickerState>();
export const MANUAL_PARENTS_KEY = 'vpd_manual_entries';
export interface ManualParent {
  id: string; label: string; mainCardId: number; ownSparkIds: number[];
  p1CardId: number | null; p1SparkIds: number[]; p2CardId: number | null; p2SparkIds: number[];
  mainWinSaddleIds?: number[]; p1WinSaddleIds?: number[]; p2WinSaddleIds?: number[]; createdAt: string;
}

function parentNode(position: number, card: number, factors: number[], wins: number[] = []): SuccessionChara {
  return { position_id: position, card_id: card, rank: 0, rarity: null, talent_level: null, factor_id_array: factors, win_saddle_id_array: wins };
}
function emptyParent(card: number): ProfileVeteran {
  return { id: 0, member_id: null, card_id: card, distance_type: null, running_style: null, speed: null, stamina: null, power: null, guts: null, wiz: null, rank_score: null };
}
export function accountParent(veteran: ProfileVeteran, accountId: string): SelectableParent {
  return { ...veteran, trainer_id: accountId, pickerId: `veteran:${accountId}:${veteran.member_id ?? veteran.id}`, share_source: 'veteran' };
}
export function deviceParent(record: VeteranRecord, accountId = ''): SelectableParent {
  return accountParent({ ...veteranProfile(record), id: `device-${accountId || 'local'}-${record.recordId}` }, accountId);
}
export function parentCharacter(parent: ProfileVeteran, characters: ReadonlyMap<number, CharacterCatalogEntry>) {
  const cardId = parent.card_id || [...characters.keys()].find(id => Math.floor(id / 100) === parent.trained_chara_id);
  return { cardId, name: cardId ? characters.get(cardId)?.name || `Character ${cardId}` : parent.trained_chara_id ? `Uma #${parent.trained_chara_id}` : 'Unknown' };
}
export function inheritanceParent(record: InheritanceRecord, source: 'bookmark' | 'partner'): SelectableParent {
  const factors = (blue: number | undefined, pink: number | undefined, green: number | undefined, white: number[]) => [blue, pink, green, ...white].filter((id): id is number => Number.isInteger(id) && Number(id) > 0);
  return { ...emptyParent(record.mainParentId), pickerId: `${source}:${record.accountId}:${record.id}`, share_source: source, share_inheritance_id: record.id,
    trainer_id: record.accountId, trainerName: record.trainerName, rank_score: record.rankScore, rarity: record.rarity, scenario_id: record.scenarioId,
    factors: factors(record.mainBlue, record.mainPink, record.mainGreen, record.mainWhite), win_saddle_id_array: record.mainWinSaddles,
    succession_chara_array: [parentNode(10, record.leftParentId, factors(record.leftBlue, record.leftPink, record.leftGreen, record.leftWhite), record.leftWinSaddles), parentNode(20, record.rightParentId, factors(record.rightBlue, record.rightPink, record.rightGreen, record.rightWhite), record.rightWinSaddles)].filter((node) => node.card_id > 0)
  };
}
export function manualParent(entry: ManualParent): SelectableParent {
  return { ...emptyParent(entry.mainCardId), name: entry.label || undefined, pickerId: `manual:${entry.id}`, share_source: 'manual', share_local_id: entry.id,
    factors: entry.ownSparkIds, win_saddle_id_array: entry.mainWinSaddleIds ?? [], creation_time: entry.createdAt,
    succession_chara_array: [parentNode(10, entry.p1CardId ?? 0, entry.p1SparkIds, entry.p1WinSaddleIds), parentNode(20, entry.p2CardId ?? 0, entry.p2SparkIds, entry.p2WinSaddleIds)].filter((node) => node.card_id > 0)
  };
}
export function parseManualParents(raw: string | null): ManualParent[] {
  if (!raw) return [];
  const values: unknown = JSON.parse(raw);
  const ids = (value: unknown) => Array.isArray(value) && value.every((id) => Number.isSafeInteger(id) && id > 0);
  if (!Array.isArray(values) || !values.every((value) => {
    if (!value || typeof value !== 'object') return false;
    const entry = value as ManualParent;
    return typeof entry.id === 'string' && typeof entry.label === 'string' && typeof entry.createdAt === 'string' && Number.isSafeInteger(entry.mainCardId) && entry.mainCardId > 0
      && [entry.p1CardId, entry.p2CardId].every((id) => id == null || Number.isSafeInteger(id) && id > 0)
      && [entry.ownSparkIds, entry.p1SparkIds, entry.p2SparkIds].every(ids)
      && [entry.mainWinSaddleIds, entry.p1WinSaddleIds, entry.p2WinSaddleIds].every((value) => value === undefined || ids(value));
  })) throw new Error('Saved manual entries could not be read. They have been left untouched.');
  return values as ManualParent[];
}
export function parentFactors(node: ProfileVeteran | SuccessionChara) {
  const inheritance = 'inheritance' in node ? node.inheritance : undefined;
  const source = !node.factor_info_array?.length && inheritance
    ? { factors: [...(inheritance.blue_sparks ?? []), ...(inheritance.pink_sparks ?? []), ...(inheritance.green_sparks ?? []), ...(inheritance.white_sparks ?? [])] } : node;
  const tones = ['blue', 'pink', 'green', 'white'];
  return resolveVeteranFactors(source).sort((a,b) => tones.indexOf(a.tone) - tones.indexOf(b.tone) || b.level - a.level);
}
export function scopedParentFactors(parent: ProfileVeteran, scope: ParentFactorFilter['scope']) {
  const ancestors = (parent.succession_chara_array ?? []).filter((node) => node.position_id === 10 || node.position_id === 20);
  if (scope === 'own') return parentFactors(parent);
  if (scope === 'any' || scope === 'combined') return [parent, ...ancestors].flatMap(parentFactors);
  return ancestors.filter((node) => node.position_id === (scope === 'p1' ? 10 : 20)).flatMap(parentFactors);
}
function factorLevelMatches(level: number, filter: ParentFactorFilter): boolean {
  return level >= filter.minLevel && level <= (filter.maxLevel ?? Infinity);
}
function parentFactorMatches(parent: ProfileVeteran, filter: ParentFactorFilter): boolean {
  if (!filter.factorId) return true;
  const factors = scopedParentFactors(parent, filter.scope).filter(factor => factor.id === filter.factorId);
  return filter.scope === 'combined'
    ? factorLevelMatches(factors.reduce((sum, factor) => sum + factor.level, 0), filter)
    : factors.some(factor => factorLevelMatches(factor.level, filter));
}
export function groupParentFilters(filters: ParentFactorFilter[]) {
  const entries = filters.map((filter, index) => ({filter,index,resolved:resolveVeteranFactors({factors:[filter.factorId*10+1]})[0]!})).filter(({filter}) => filter.factorId);
  return (['blue','pink','green','white'] as const)
    .map(tone => ({tone,entries:entries.filter(entry => entry.resolved.tone === tone)}))
    .filter(group => group.entries.length);
}
export function parentSparkMatched(parent: ProfileVeteran, spark: { id:number; level:number }, source: 'own'|'p1'|'p2', filters: ParentFactorFilter[]): boolean {
  return filters.some(filter => filter.factorId === spark.id && (filter.scope === 'combined'
    ? parentFactorMatches(parent, filter)
    : (filter.scope === 'any' || filter.scope === source) && factorLevelMatches(spark.level, filter)));
}
export function parentAffinity(parent: ProfileVeteran, targetId: number | undefined, engine: VeteranAffinityEngine | undefined, groups: ReadonlyMap<number, number>): number {
  const score = parentAffinityDetails(parent, targetId, engine, groups);
  return score ? score.parentOne.total + score.race.p1Left + score.race.p1Right : 0;
}
export function parentAffinityDetails(parent: ProfileVeteran, targetId: number | undefined, engine: VeteranAffinityEngine | undefined, groups: ReadonlyMap<number, number>) {
  if (!targetId || !engine) return null;
  const nodes = emptyPlannerNodes(); nodes.target.characterId = targetId; nodes.p1.characterId = parent.card_id;
  nodes.p1.winSaddleIds = parent.win_saddle_id_array ?? [];
  for (const [id, position] of [[10, 'p1-1'], [20, 'p1-2']] as const) {
    const ancestor = parent.succession_chara_array?.find((node) => node.position_id === id);
    nodes[position].characterId = ancestor?.card_id ?? null; nodes[position].winSaddleIds = ancestor?.win_saddle_id_array ?? [];
  }
  return calculatePlannerAffinity(engine, nodes, groups);
}

/** Angular ranks affinity-resource IDs before taking 20 and resolving outfits. Race wins do not enter this ranking. */
export function manualBestFits(cardIds: readonly (number | null)[], slot: number, targetId: number | undefined, engine: VeteranAffinityEngine | undefined, characters: ReadonlyMap<number, CharacterCatalogEntry>) {
  if (!engine?.ready || !targetId || slot < 0 || slot > 2) return [];
  // Compatibility: Angular's manual fitter maps Grandparent 2 to gp2Left,
  // on the empty P2 branch. Its individual score is still a P1 triple.
  const positions = ['p1', 'p1-1', 'p2-1'] as const;
  const nodes = emptyPlannerNodes(); nodes.target.characterId = targetId;
  positions.forEach((position, index) => nodes[position].characterId = cardIds[index] ?? null);
  const target = targetId >= 10000 ? Math.floor(targetId / 100) : targetId;
  const main = cardIds[0] ? Math.floor(cardIds[0] / 100) : null;
  const outfits = [...characters.values()];
  return engine.characterIds.map(charaId => {
    nodes[positions[slot]!]!.characterId = charaId;
    return { charaId, totalAffinity: calculatePlannerAffinity(engine, nodes)!.relationTotal,
      individualAffinity: slot === 0 ? engine.pair(target, charaId) : engine.triple(target, main, charaId) };
  }).sort((a, b) => b.totalAffinity - a.totalAffinity).slice(0, 20).flatMap(candidate => {
    const character = outfits.find(character => Math.floor(Number(character.id) / 100) === candidate.charaId);
    return character ? [{ ...candidate, character }] : [];
  });
}
export function filterParents(parents: SelectableParent[], state: Pick<ParentPickerState, 'query' | 'sort' | 'factors' | 'factorOperators'>, name: (parent: SelectableParent) => string, affinity: (parent: SelectableParent) => number): SelectableParent[] {
  const query = state.query.trim().toLocaleLowerCase();
  const factorGroups = groupParentFilters(state.factors);
  const score = (parent: SelectableParent) => {
    if (state.sort === 'creation_time') return veteranCreationTime(parent);
    // Angular supplies affinity/stat sorting only for Veteran-shaped tabs.
    const veteranTab = parent.share_source === 'veteran' || parent.share_source === 'partner';
    if (state.sort === 'affinity') return veteranTab ? affinity(parent) : 0;
    if (state.sort === 'total' && veteranTab) return totalStats(parent);
    return scopedParentFactors(parent, parent.share_source === 'manual' ? 'own' : 'any')
      .filter((factor) => state.sort === 'total' ? factor.tone !== 'white' : factor.tone === state.sort).reduce((sum, factor) => sum + factor.level, 0);
  };
  return parents.filter((parent) => (!query || name(parent).toLocaleLowerCase().includes(query) || parent.trainerName?.toLocaleLowerCase().includes(query)) && factorGroups.every(group =>
    state.factorOperators?.[group.tone] === 'or'
      ? group.entries.some(({filter}) => parentFactorMatches(parent, filter))
      : group.entries.every(({filter}) => parentFactorMatches(parent, filter))))
    .map((parent) => ({ parent, score: state.sort === 'name' ? 0 : score(parent) }))
    .sort((left, right) => state.sort === 'name' ? name(left.parent).localeCompare(name(right.parent))
      : left.score == null ? right.score == null ? 0 : 1 : right.score == null ? -1 : right.score - left.score).map(({ parent }) => parent);
}
