import { characterImagePath, type CharacterData } from '@/lib/game-data/characters';
import type { RaceRunner } from '@/lib/race/capture/race-capture-parser';

export function runnerName(runner: RaceRunner, characters: Map<number, CharacterData>): string {
  return runner.name.startsWith('Runner ')
    ? (characters.get(runner.cardId ?? runner.charaId ?? -1)?.name ?? runner.name)
    : runner.name;
}

export function runnerImage(
  runner: RaceRunner,
  characters: Map<number, CharacterData>
): string | undefined {
  const entry = characters.get(runner.cardId ?? runner.charaId ?? -1);
  return entry ? characterImagePath(Number(entry.id)) : undefined;
}
