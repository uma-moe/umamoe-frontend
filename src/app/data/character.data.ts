// Character master data
// This file contains all character information bundled with the application
// Data is imported at build time, so it doesn't appear in network requests
import characterData from '../../data/character.json';
import characterNamesData from '../../data/character_names.json';
import { Character } from '../models/character.model';
// Character name entries from character_names.json
interface CharacterNameEntry {
  name: string;
  skins: Record<string, string>;
}
export type CharacterNameMap = Record<string, CharacterNameEntry>;
// Raw character data interface to match JSON structure
export interface RawCharacterData {
  id: string;
  name: string;
  release_date: string;
  rarity: number;
  href: string;
  image: string;
  image_url: string;
  full_image: string;
  full_image_url: string;
  type_icon_url: string | null;
  type_icon_alt: string | null;
}

let rawCharacterData: RawCharacterData[] = normalizeCharacterData(characterData);
let characterNames: CharacterNameMap = normalizeCharacterNames(characterNamesData);

function normalizeCharacterData(data: unknown): RawCharacterData[] {
  if (Array.isArray(data)) {
    return data as RawCharacterData[];
  }

  const defaultData = (data as any)?.default;
  return Array.isArray(defaultData) ? defaultData as RawCharacterData[] : [];
}

function normalizeCharacterNames(data: unknown): CharacterNameMap {
  return ((data as any)?.default || data || {}) as CharacterNameMap;
}

function buildCharacters(rawData: RawCharacterData[], names: CharacterNameMap): Character[] {
  return rawData.map(char => {
  const charaId = Math.floor(parseInt(char.id, 10) / 100).toString();
  const nameEntry = names[charaId];
  return {
    id: parseInt(char.id),
    name: nameEntry?.name || char.name,
    release_date: char.release_date,
    rarity: char.rarity,
    href: char.href,
    image: char.image,
    image_url: char.image_url,
    full_image: char.full_image,
    full_image_url: char.full_image_url,
    type_icon_url: char.type_icon_url,
    type_icon_alt: char.type_icon_alt
  };
  });
}

// Transform raw JSON data to Character format. Names are resolved from character_names.json.
export const CHARACTERS: Character[] = buildCharacters(rawCharacterData, characterNames);

export function replaceCharacterMasterData(rawData: unknown, namesData: unknown = characterNames): Character[] {
  rawCharacterData = normalizeCharacterData(rawData);
  characterNames = normalizeCharacterNames(namesData);
  CHARACTERS.splice(0, CHARACTERS.length, ...buildCharacters(rawCharacterData, characterNames));
  return CHARACTERS;
}

export function replaceCharacterNamesData(namesData: unknown): Character[] {
  characterNames = normalizeCharacterNames(namesData);
  CHARACTERS.splice(0, CHARACTERS.length, ...buildCharacters(rawCharacterData, characterNames));
  return CHARACTERS;
}

export function getRawCharacterData(): RawCharacterData[] {
  return rawCharacterData;
}

export function getCharacterNameEntries(): CharacterNameMap {
  return characterNames;
}

export function getCharacterNameEntry(charaId: string | number): CharacterNameEntry | undefined {
  return characterNames[String(charaId)];
}
// Export individual getters for convenience
export function getAllCharacters(): Character[] {
  return CHARACTERS;
}
export function getCharacterById(id: number): Character | undefined {
  return CHARACTERS.find(character => character.id === id);
}
export function getCharactersByName(name: string): Character[] {
  return CHARACTERS.filter(character => 
    character.name.toLowerCase().includes(name.toLowerCase())
  );
}
