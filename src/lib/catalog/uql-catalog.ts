import { loadFactorCatalog } from './factor-catalog';
import { loadCharacterCatalog, loadCharacterNames } from './character-catalog';
import { loadSupportCardCatalog } from './support-card-catalog';
import { loadRaceQueryValues } from './race-catalog';
import type { UqlQueryCatalog } from '@/lib/inheritance/uql-compiler';

/** Reuse the shared resource promises; loaded only when entering/restoring UQL. */
export async function loadUqlQueryCatalog(): Promise<UqlQueryCatalog> {
  const [characters, names, supports, races] = await Promise.all([
    loadCharacterCatalog(),
    loadCharacterNames(),
    loadSupportCardCatalog(),
    loadRaceQueryValues(),
    loadFactorCatalog(),
  ]);
  return {
    characters: [...characters.values()].map((character) => {
      const id = Number(character.id);
      const entry = names[String(Math.floor(id / 100))];
      const skin = entry?.skins?.[String(id % 100).padStart(2, '0')] ?? '';
      const name = entry?.name || character.name;
      return {
        id: character.id,
        name,
        skin,
        displayName: skin && skin !== 'Original' ? `${name} [${skin}]` : name,
      };
    }),
    supports,
    races,
  };
}
