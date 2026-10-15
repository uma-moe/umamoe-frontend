import { resourceCache } from '@/services/resources/resource-cache';

export interface CharacterData {
  id: string;
  name: string;
  image: string;
  subtitle?: string;
  rarity?: number;
  release_date?: string;
  isReleased_en?: boolean;
}

let charactersPromise: Promise<Map<number, CharacterData>> | undefined;
export type CharacterNames = Record<string, { name: string; skins?: Record<string, string> }>;
let characterNames: Promise<CharacterNames> | undefined;
resourceCache.onUpdate((name) => {
  if (name === 'character' || name === 'character_names') charactersPromise = undefined;
  if (name === 'character_names') characterNames = undefined;
});

export function loadCharacterNames(): Promise<CharacterNames> {
  characterNames ??= resourceCache.load<CharacterNames>('character_names').catch((error) => {
    characterNames = undefined;
    throw error;
  });

  return characterNames;
}

export function loadCharacters(): Promise<Map<number, CharacterData>> {
  charactersPromise ??= Promise.all([
    resourceCache.load<CharacterData[]>('character'),
    loadCharacterNames()
  ])
    .then(
      ([entries, names]) =>
        new Map(
          entries.map((entry) => {
            const character = names[String(Math.floor(Number(entry.id) / 100))];
            return [
              Number(entry.id),
              {
                ...entry,
                id: String(entry.id),
                name: character?.name || entry.name,
                subtitle: character?.skins?.[String(entry.id).slice(-2)] ?? entry.subtitle
              }
            ];
          })
        )
    )
    .catch((error) => {
      charactersPromise = undefined;
      throw error;
    });

  return charactersPromise;
}

/** Pickers use live release flags; historical records can use the full character data. */
export async function loadReleasedCharacters(): Promise<CharacterData[]> {
  return [...(await loadCharacters()).values()].filter(
    (character) => character.isReleased_en === true
  );
}

/** Canonical path for optimized character thumbnails. */
export function characterImagePath(cardId: number): string {
  return `/game-assets/character_thumbs/chara_stand_${Math.floor(cardId / 100)}_${cardId}.webp`;
}

/** Demand-loaded lookup so character data never enters the base shell chunk. */
export function loadCharacterImages(): Promise<Map<number, string>> {
  return loadCharacters().then(
    (entries) => new Map([...entries].map(([id]) => [id, characterImagePath(id)]))
  );
}
