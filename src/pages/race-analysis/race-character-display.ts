import { characterImagePath, type CharacterCatalogEntry } from '@/lib/catalog/character-catalog';
import type { RaceRunner } from '@/lib/race/race-capture-parser';


export function runnerName(runner: RaceRunner, characters: Map<number, CharacterCatalogEntry>): string {
  return runner.name.startsWith('Runner ') ? characters.get(runner.cardId ?? runner.charaId ?? -1)?.name ?? runner.name : runner.name;
}

export function runnerImage(runner: RaceRunner, characters: Map<number, CharacterCatalogEntry>): string | undefined {
  const entry = characters.get(runner.cardId ?? runner.charaId ?? -1);
  return entry ? characterImagePath(Number(entry.id)) : undefined;
}
