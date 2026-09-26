import type { Build, Summary, Snapshot } from './hakuraku-types';
import type { RaceRunner } from '@/lib/race/race-capture-parser';
import { loadCharacterCatalog } from '@/lib/catalog/character-catalog';

// Hakuraku's published SimData schema and chart semantics; see public/hakuraku/LICENSE.
export const CM_API = 'https://hakuraku.moe/api/simdata';
export const styleOrder = [5, 1, 2, 3, 4, 6];
export const styleNames: Record<number, string> = { 1:'Front Runner', 2:'Pace Chaser', 3:'Late Surger', 4:'End Closer', 5:'Runaway', 6:'Debuffer' };
export const styleColors: Record<number, string> = { 1:'#5e98e7', 2:'#a4db22', 3:'#fdde34', 4:'#ffb231', 5:'#b266ff', 6:'#ef4444' };
export const accessibleColors: Record<number, string> = { 1:'#648fff', 2:'#dc267f', 3:'#fe6100', 4:'#ffb000', 5:'#785ef0', 6:'#b8c0cc' };
export const pct = (n: number, digits = 1) => Number.isFinite(n) ? (n * 100).toFixed(digits) + '%' : '—';
export const number = (n: number) => n.toLocaleString('en-US');
export const snapshotPath = (id: string, path: string) => '/snapshots/' + encodeURIComponent(id) + '/' + path;
export async function cmGet<T>(path: string, signal: AbortSignal, snapshotId?: string): Promise<T> {
  const response = await fetch(CM_API + path, { signal, credentials:'omit' });
  if (!response.ok) throw new Error('Hakuraku data is unavailable (HTTP ' + response.status + ').');
  const bytes = new Uint8Array(await response.arrayBuffer());
  const json = bytes[0] === 31 && bytes[1] === 139 ? new TextDecoder().decode((await import('pako')).ungzip(bytes)) : new TextDecoder().decode(bytes);
  const data = JSON.parse(json);
  if (!data || typeof data !== 'object' || (snapshotId && data.snapshotId !== snapshotId)) throw new Error('The results do not match this snapshot. Reload to try again.');
  return data as T;
}
/** Keep the published statistics, resolving display labels through uma.moe's catalog. */
export async function loadCmSummary(id: string, signal: AbortSignal): Promise<Summary> {
  const [data, characters] = await Promise.all([
    cmGet<Summary>(snapshotPath(id, 'summary'), signal, id),
    loadCharacterCatalog().catch(() => new Map())
  ]);
  const cards = Object.fromEntries(Object.entries(data.cards).map(([id, card]) => {
    const character = characters.get(Number(id));
    return [id, { ...card, sourceName: card.name, sourceOutfit: card.outfit, name: character?.name || card.name, outfit: character?.subtitle || card.outfit }];
  }));
  return { ...data, cards, pairs: data.pairs.map(pair => ({ ...pair, name: cards[pair.card]?.name ?? pair.name, outfit: cards[pair.card]?.outfit ?? pair.outfit })) };
}
export function buildRunner(build: Build, data: Pick<Summary, 'cards'>, index = 0): RaceRunner {
  const grade = (value: string | undefined) => value && /^[SABCDEFG]$/.test(value) ? 'GFEDCBAS'.indexOf(value) + 1 : undefined;
  return { index, cardId:build.card, charaId:build.chara, name:data.cards[build.card]?.name ?? String(build.card), isPlayer:false,
    stats:{speed:build.stats?.[0],stamina:build.stats?.[1],power:build.stats?.[2],guts:build.stats?.[3],wit:build.stats?.[4]},
    aptitudes:{distance:grade(build.aptitudes?.[0]),surface:grade(build.aptitudes?.[1]),style:grade(build.aptitudes?.[2])},
    skillIds:build.skills?.map(([id])=>id) ?? [], raw:{rank_score:build.score, runningStyle:build.racingStyle, analysisStyle:build.style} };
}
export type Manifest = { snapshots: Snapshot[] };

