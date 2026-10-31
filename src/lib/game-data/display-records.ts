import { get } from 'svelte/store';
import { loadSupportCards } from '@/lib/game-data/support-cards/support-cards';
import { characterImagePath, loadCharacters } from '@/lib/game-data/characters';
import { loadSkills, skillImage } from '@/lib/game-data/skills/skills';

export type GameDataKind = 'characters' | 'supports' | 'skills' | 'factors';
export interface GameDataEntry {
  id: string;
  kind: GameDataKind;
  title: string;
  detail: string;
  tags: string[];
  image?: string;
  releaseDate?: string;
  rarity?: number;
  searchText: string;
}

const cache = new Map<GameDataKind, Promise<GameDataEntry[]>>();
const supportTypes: Record<string, string> = {
  speed: 'Speed',
  stamina: 'Stamina',
  power: 'Power',
  guts: 'Guts',
  intelligence: 'Wit',
  friend: 'Friend',
  group: 'Group'
};

const factorTypes: Record<number, string> = {
  0: 'Stat',
  1: 'Aptitude',
  2: 'Race',
  3: 'Skill',
  4: 'Scenario',
  5: 'Unique'
};

function searchable(entry: Omit<GameDataEntry, 'searchText'>): GameDataEntry {
  return {
    ...entry,
    searchText: [entry.id, entry.title, entry.detail, ...entry.tags].join(' ').toLowerCase()
  };
}

async function characters(): Promise<GameDataEntry[]> {
  const data = await loadCharacters();
  return [...data.values()].map((entry) =>
    searchable({
      id: entry.id,
      kind: 'characters',
      title: entry.name,
      detail: `Character, ${entry.release_date || 'release unknown'}`,
      tags: [`${entry.rarity}★`],
      rarity: entry.rarity,
      releaseDate: entry.release_date,
      image: characterImagePath(Number(entry.id))
    })
  );
}

async function supports(): Promise<GameDataEntry[]> {
  const data = await loadSupportCards();
  return data.map((entry) =>
    searchable({
      id: entry.id,
      kind: 'supports',
      title: entry.name,
      detail: `${supportTypes[entry.type] ?? entry.type} support, ${entry.release_date || 'release unknown'}`,
      tags: [
        supportTypes[entry.type] ?? entry.type,
        entry.rarity === 3 ? 'SSR' : entry.rarity === 2 ? 'SR' : 'R'
      ],
      rarity: entry.rarity,
      releaseDate: entry.release_date,
      image: `/game-assets/umamusume_cards/tex_support_card_${entry.id}.webp`
    })
  );
}

async function skills(): Promise<GameDataEntry[]> {
  const data = await loadSkills();
  return [...data.values()].map((entry) =>
    searchable({
      id: String(entry.skill_id),
      kind: 'skills',
      title: entry.name,
      detail: entry.effect || entry.conditions || 'Skill effect unavailable',
      tags: [entry.rarity >= 2 ? 'Rare' : 'Normal'],
      rarity: entry.rarity,
      image: skillImage(entry.icon)
    })
  );
}

async function factors(): Promise<GameDataEntry[]> {
  const { factorOptions, loadFactors, factorLoadingState } =
    await import('@/lib/game-data/factors/factors');

  await loadFactors();
  const data = factorOptions();
  if (!data.length)
    throw new Error(get(factorLoadingState).error || 'Factors could not be loaded.');
  return data.map((entry) =>
    searchable({
      id: entry.id,
      kind: 'factors',
      title: entry.text,
      detail: `${factorTypes[entry.type] ?? 'Other'} inheritance factor`,
      tags: [factorTypes[entry.type] ?? 'Other']
    })
  );
}

export function loadGameDataEntries(kind: GameDataKind): Promise<GameDataEntry[]> {
  const current = cache.get(kind);
  if (current) return current;
  const request =
    kind === 'characters'
      ? characters()
      : kind === 'supports'
        ? supports()
        : kind === 'skills'
          ? skills()
          : factors();

  cache.set(kind, request);
  void request.catch(() => cache.delete(kind));
  return request;
}

export function findCharacterEntry(
  characters: GameDataEntry[],
  id: number
): GameDataEntry | undefined {
  const exact = characters.find((entry) => Number(entry.id) === id);
  if (exact) return exact;
  return characters.find(
    (entry) =>
      Math.floor(Number(entry.id) / 100) === id ||
      Math.floor(Number(entry.id) / 100) === Math.floor(id / 100)
  );
}
