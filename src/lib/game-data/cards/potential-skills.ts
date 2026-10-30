import { fetchJsonResource } from '@/services/resources/json-response';

/**
 * The skills a trainee card lets her buy without a hint, by the potential (talent) level that unlocks each: level 1
 * gives its starting skills, levels 2 to 5 one more each. `scripts/build-potential-skills.ts` writes the data.
 */
export interface PotentialSkill {
  level: number;
  skillId: number;
}

/** Card id to its potential skills. */
export type PotentialSkills = ReadonlyMap<number, PotentialSkill[]>;

/** A career that names no potential level still has the card's starting skills. */
export const STARTING_POTENTIAL_LEVEL = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function parseSkill(value: unknown): PotentialSkill {
  if (!Array.isArray(value) || !isWholeNumber(value[0]) || !isWholeNumber(value[1]))
    throw new Error('Potential skill data has an invalid skill.');
  return { level: value[0], skillId: value[1] };
}

/** `{cards: [{card, skills: [[level, skill id], ...]}]}`. */
export function parsePotentialSkills(value: unknown): Map<number, PotentialSkill[]> {
  if (!isRecord(value) || !Array.isArray(value.cards))
    throw new Error('Potential skill data is invalid.');

  return new Map(
    value.cards.map((entry): [number, PotentialSkill[]] => {
      if (!isRecord(entry) || !isWholeNumber(entry.card) || !Array.isArray(entry.skills))
        throw new Error('Potential skill data has an invalid card.');
      return [entry.card, entry.skills.map(parseSkill)];
    })
  );
}

let potentialSkillsPromise: Promise<PotentialSkills> | undefined;

export function loadPotentialSkills(): Promise<PotentialSkills> {
  potentialSkillsPromise ??= fetchJsonResource<unknown>(
    '/game-data/potential-skills.json.gz',
    {},
    'Potential skills'
  )
    .then(parsePotentialSkills)
    .catch((error: unknown) => {
      potentialSkillsPromise = undefined;
      throw error;
    });

  return potentialSkillsPromise;
}

/** The skills her card has unlocked at her potential level. */
export function unlockedSkills(
  potentialSkills: PotentialSkills,
  { cardId, potentialLevel }: { cardId: number; potentialLevel: number }
): number[] {
  return (potentialSkills.get(cardId) ?? [])
    .filter((skill) => skill.level <= potentialLevel)
    .map((skill) => skill.skillId);
}
