import { characterImagePath } from '@/lib/catalog/character-catalog';
import { factorMetadata } from '@/lib/catalog/factor-catalog';
import { getRankInfoFromScore } from '@/lib/rank';
import type { VeteranRecord } from '@/lib/veterans/generated/veteran-record';
import type { VeteranUiRecord, VeteranSparkGroup } from '@/components/game/veteran-ui-types';
import type { SparkTone, SparkSource } from '@/components/sparks/SparkItem.svelte';

export const scenarios: Record<number, string> = { 1: 'URA Finals', 2: 'Unity Cup', 3: 'Grand Concert', 4: 'Trackblazer', 5: 'Grand Masters', 6: 'Project L’Arc', 7: 'U.A.F.', 8: 'Great Food Festival', 9: 'Run! Mecha', 10: 'Twinkle Legends', 11: 'Design Your Island', 12: 'Yukoma Hot Springs', 13: 'Beyond Dreams' };
function tone(type: number | undefined): SparkTone { return type === 0 ? 'blue' : type === 1 ? 'pink' : type === 5 ? 'green' : 'white'; }
export function sparkGroups(recordId: string, factors: { id:number; level:number; matched?:boolean }[], source?: SparkSource): VeteranSparkGroup[] {
  const groups = new Map<SparkTone, VeteranSparkGroup>();
  for (const [index, item] of factors.entries()) {
    const metadata = factorMetadata(item.id);
    const groupTone = tone(metadata?.type);
    const group = groups.get(groupTone) ?? { tone: groupTone, items: [] };
    group.items.push({ id: `${recordId}:${item.id}:${item.level}:${index}`, name: metadata?.text ?? `Factor ${item.id}`, level: item.level, source, matched:item.matched });
    groups.set(groupTone, group);
  }
  return (['blue', 'pink', 'green', 'white'] as const).flatMap(tone => groups.has(tone) ? [groups.get(tone)!] : []);
}
function rawNumber(record: VeteranRecord, path: string): number | undefined { const raw = record.rawSource as Record<string, unknown> | undefined; const value = raw?.[path]; return typeof value === 'number' ? value : undefined; }

export function combineVeteranFactors(factors: { id:number; level:number }[]): VeteranRecord['factors'] {
  const merged = new Map<number, VeteranRecord['factors'][number]>();
  for (const factor of factors) {
    const current = merged.get(factor.id);
    if (current) current.level += factor.level;
    else merged.set(factor.id, { ...factor });
  }
  return [...merged.values()].sort((a,b) => b.level - a.level || a.id - b.id);
}

export function veteranToUi(record: VeteranRecord, workspace: string, characters: ReadonlyMap<number, { name: string }>): VeteranUiRecord {
  const parents = record.parents.filter(parent => parent.positionId === 10 || parent.positionId === 20).sort((a, b) => a.positionId - b.positionId);
  const character = characters.get(record.cardId); const rank = record.rankScore != null ? getRankInfoFromScore(record.rankScore).label : 'G';
  return { id: record.recordId, name: record.name || character?.name || `Character ${record.cardId}`, image: characterImagePath(record.cardId), rank, score: record.rankScore ?? undefined, scenario: record.scenarioId ? scenarios[record.scenarioId] ?? `Scenario ${record.scenarioId}` : undefined, detail: `Card ${record.cardId}`, workspace, updated: record.createdAt ? new Date(record.createdAt).toLocaleDateString() : undefined, affinity: rawNumber(record, 'affinity_score') ?? 0, stats: [
    { id: 'speed', label: 'Speed', value: record.stats.speed, tone: 'speed', icon: '/assets/images/icon/stats/speed.webp' }, { id: 'stamina', label: 'Stamina', value: record.stats.stamina, tone: 'stamina', icon: '/assets/images/icon/stats/stamina.webp' }, { id: 'power', label: 'Power', value: record.stats.power, tone: 'power', icon: '/assets/images/icon/stats/power.webp' }, { id: 'guts', label: 'Guts', value: record.stats.guts, tone: 'guts', icon: '/assets/images/icon/stats/guts.webp' }, { id: 'wit', label: 'Wit', value: record.stats.wisdom, tone: 'wit', icon: '/assets/images/icon/stats/wit.webp' }
  ], combinedSparks: sparkGroups(record.recordId, combineVeteranFactors([...record.factors, ...parents.flatMap(parent => parent.factors)])), sparks: sparkGroups(record.recordId, record.factors, 'main'), parents: parents.map(parent => ({ id: `${record.recordId}:parent:${parent.positionId}`, position: parent.positionId === 10 ? 'P1' : 'P2', name: characters.get(parent.cardId)?.name ?? `Character ${parent.cardId}`, image: characterImagePath(parent.cardId), affinity: 0, sparks: sparkGroups(`${record.recordId}:parent:${parent.positionId}`, parent.factors, 'parent') })) };
}
