import { resourceRepository } from './resource-repository';

export interface CharacterCatalogEntry {
  id: string;
  name: string;
  image: string;
  subtitle?: string;
  rarity?: number;
  release_date?: string;
  isReleased_en?: boolean;
}

let characterCatalog: Promise<Map<number, CharacterCatalogEntry>> | undefined;
export type CharacterNames = Record<string, { name: string; skins?: Record<string, string> }>;
let characterNames: Promise<CharacterNames> | undefined;
resourceRepository.onUpdate(name => {
  if (name === 'character' || name === 'character_names') characterCatalog = undefined;
  if (name === 'character_names') characterNames = undefined;
});

export function loadCharacterNames(): Promise<CharacterNames> {
  characterNames ??= resourceRepository.load<CharacterNames>('character_names').catch(error => { characterNames = undefined; throw error; });
  return characterNames;
}

export function loadCharacterCatalog(): Promise<Map<number, CharacterCatalogEntry>> {
  characterCatalog ??= Promise.all([resourceRepository.load<CharacterCatalogEntry[]>('character'), loadCharacterNames()]).then(([entries, names]) => new Map(entries.map(entry => {
    const character = names[String(Math.floor(Number(entry.id) / 100))];
    return [Number(entry.id), { ...entry, id: String(entry.id), name: character?.name || entry.name, subtitle: character?.skins?.[String(entry.id).slice(-2)] ?? entry.subtitle }];
  }))).catch(error => { characterCatalog = undefined; throw error; });
  return characterCatalog;
}

/** Pickers use live release flags; historical records can use the full catalog. */
export async function loadReleasedCharacterCatalog(): Promise<CharacterCatalogEntry[]> {
  return [...(await loadCharacterCatalog()).values()].filter(character => character.isReleased_en === true);
}

/** Canonical path for optimized character thumbnails. */
export function characterImagePath(cardId: number): string {
  return `/game-assets/character_thumbs/chara_stand_${Math.floor(cardId / 100)}_${cardId}.webp`;
}

/** Demand-loaded lookup so character data never enters the base shell chunk. */
export function loadCharacterImageCatalog(): Promise<Map<number, string>> {
  return loadCharacterCatalog().then((entries) => new Map([...entries].map(([id]) => [id, characterImagePath(id)])));
}
