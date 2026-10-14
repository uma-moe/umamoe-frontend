import { get } from 'svelte/store';
import { loadSupportCardCatalog } from '@/lib/catalog/support-card-catalog';
import { characterImagePath, loadCharacterCatalog } from '@/lib/catalog/character-catalog';
import { loadSkillCatalog, skillImage } from '@/lib/catalog/skill-catalog';

export type CatalogKind = 'characters' | 'supports' | 'skills' | 'factors';
export interface CatalogEntry {
  id: string;
  kind: CatalogKind;
  title: string;
  detail: string;
  tags: string[];
  image?: string;
  releaseDate?: string;
  rarity?: number;
  searchText: string;
}

const cache = new Map<CatalogKind, Promise<CatalogEntry[]>>();
const supportTypes: Record<string, string> = { speed: 'Speed', stamina: 'Stamina', power: 'Power', guts: 'Guts', intelligence: 'Wit', friend: 'Friend', group: 'Group' };
const factorTypes: Record<number, string> = { 0: 'Stat', 1: 'Aptitude', 2: 'Race', 3: 'Skill', 4: 'Scenario', 5: 'Unique' };

function searchable(entry: Omit<CatalogEntry, 'searchText'>): CatalogEntry {
  return { ...entry, searchText: [entry.id, entry.title, entry.detail, ...entry.tags].join(' ').toLowerCase() };
}

async function characters(): Promise<CatalogEntry[]> {
  const data = await loadCharacterCatalog();
  return [...data.values()].map((entry) => searchable({ id: entry.id, kind: 'characters', title: entry.name, detail: `Character · ${entry.release_date || 'Release unknown'}`, tags: [`${entry.rarity}★`], rarity: entry.rarity, releaseDate: entry.release_date, image: characterImagePath(Number(entry.id)) }));
}

async function supports(): Promise<CatalogEntry[]> {
  const data = await loadSupportCardCatalog();
  return data.map((entry) => searchable({ id: entry.id, kind: 'supports', title: entry.name, detail: `${supportTypes[entry.type] ?? entry.type} support · ${entry.release_date || 'Release unknown'}`, tags: [supportTypes[entry.type] ?? entry.type, entry.rarity === 3 ? 'SSR' : entry.rarity === 2 ? 'SR' : 'R'], rarity: entry.rarity, releaseDate: entry.release_date, image: `/game-assets/umamusume_cards/tex_support_card_${entry.id}.webp` }));
}

async function skills(): Promise<CatalogEntry[]> {
  const data = await loadSkillCatalog();
  return [...data.values()].map((entry) => searchable({ id: String(entry.skill_id), kind: 'skills', title: entry.name, detail: entry.effect || entry.conditions || 'Skill effect unavailable', tags: [entry.rarity >= 2 ? 'Rare' : 'Normal'], rarity: entry.rarity, image: skillImage(entry.icon) }));
}

async function factors(): Promise<CatalogEntry[]> {
  const { factorOptions, loadFactorCatalog, factorCatalogState } = await import('@/lib/catalog/factor-catalog');
  await loadFactorCatalog();
  const data = factorOptions();
  if (!data.length) throw new Error(get(factorCatalogState).error || 'Factors could not be loaded.');
  return data.map((entry) => searchable({ id: entry.id, kind: 'factors', title: entry.text, detail: `${factorTypes[entry.type] ?? 'Other'} inheritance factor`, tags: [factorTypes[entry.type] ?? 'Other'] }));
}

export function loadCatalog(kind: CatalogKind): Promise<CatalogEntry[]> {
  const current = cache.get(kind);
  if (current) return current;
  const request = kind === 'characters' ? characters() : kind === 'supports' ? supports() : kind === 'skills' ? skills() : factors();
  cache.set(kind, request);
  void request.catch(() => cache.delete(kind));
  return request;
}
