import { loadFactors } from '../../game-data/factors/factors';
import { loadCharacters, loadCharacterNames } from '../../game-data/characters';
import { loadSupportCards } from '../../game-data/support-cards/support-cards';
import { loadRaceQueryValues } from '../../game-data/racing/races';
import type { UqlQueryData } from '@/lib/inheritance/uql/uql-compiler';

/** Reuse the shared resource promises; loaded only when entering/restoring UQL. */
export async function loadUqlQueryData(): Promise<UqlQueryData> {
  const [characters, names, supports, races] = await Promise.all([
    loadCharacters(),
    loadCharacterNames(),
    loadSupportCards(),
    loadRaceQueryValues(),
    loadFactors()
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
        displayName: skin && skin !== 'Original' ? `${name} [${skin}]` : name
      };
    }),
    supports,
    races
  };
}
