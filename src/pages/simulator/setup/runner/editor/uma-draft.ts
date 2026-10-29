import type { MonteCarloSkillInput } from '../../../requests/race-sim-request';
import type { SimulatorUma } from '../../../simulator-uma';
import { TRAINEE_MAX_STAT, TRAINEE_MIN_STAT } from '../../trainee';

/** The five stats in the game's order, with their label and icon. */
export const STAT_FIELDS = [
  { key: 'speed', label: 'Speed', icon: 'speed' },
  { key: 'stamina', label: 'Stamina', icon: 'stamina' },
  { key: 'power', label: 'Power', icon: 'power' },
  { key: 'guts', label: 'Guts', icon: 'guts' },
  { key: 'wisdom', label: 'Wit', icon: 'wit' }
] as const;

export type StatKey = (typeof STAT_FIELDS)[number]['key'];

/** The race entry fields as typed; empty means automatic or not set. */
export interface DraftEntry {
  gate: string;
  fans: string;
}

const MAX_GATE = 18;
const MAX_FANS = 4294967295;
const MAX_TEAM_ID = 255;

const isWholeNumber = (value: string) => /^\d+$/.test(value);

export function statInvalid(value: string | number): boolean {
  const text = String(value);
  if (!isWholeNumber(text)) return true;

  const stat = Number(text);
  return stat < TRAINEE_MIN_STAT || stat > TRAINEE_MAX_STAT;
}

export function gateInvalid(gate: string): boolean {
  if (gate === '') return false;

  return !isWholeNumber(gate) || Number(gate) < 1 || Number(gate) > MAX_GATE;
}

export function fansInvalid(fans: string): boolean {
  if (fans === '') return false;

  return !isWholeNumber(fans) || Number(fans) > MAX_FANS;
}

/**
 * A card's own unique skill, read from the game's numbering: the outfit sets the hundred-thousands (1 for the first,
 * 11 for the second, 12 for the third) and the character the rest. Card 100201 has 100021, card 100103 has 120011.
 */
export function characterUniqueSkillId(cardId: number): number {
  const character = Math.floor(cardId / 100);
  const outfit = cardId % 100;

  return 100000 + (outfit - 1) * 10000 + (character - 1000) * 10 + 1;
}

/**
 * Her skills after a change of character: the old card's unique comes off and the new card's goes on first, at the
 * old unique's level. A unique the skill data doesn't know is left out rather than guessed.
 */
export function swapCharacterUnique({
  skills,
  previousCardId,
  nextCardId,
  knownSkill
}: {
  skills: MonteCarloSkillInput[];
  previousCardId?: number;
  nextCardId: number;
  knownSkill: (skillId: number) => boolean;
}): MonteCarloSkillInput[] {
  const previousUnique =
    previousCardId === undefined ? undefined : characterUniqueSkillId(previousCardId);
  const nextUnique = characterUniqueSkillId(nextCardId);
  const carriedLevel =
    skills.find((skill) => skill.skillId === previousUnique)?.level ??
    skills.find((skill) => skill.skillId === nextUnique)?.level ??
    1;

  const others = skills.filter(
    (skill) => skill.skillId !== previousUnique && skill.skillId !== nextUnique
  );
  if (!knownSkill(nextUnique)) return others;

  return [{ skillId: nextUnique, level: carriedLevel }, ...others];
}

/** The first thing that keeps the draft from being saved, in words; empty when it can be saved. */
export function draftProblem(draft: SimulatorUma, entry: DraftEntry): string {
  if (!draft.name.trim()) return 'Give her a name.';

  const badStat = STAT_FIELDS.find((stat) => statInvalid(draft.trainee[stat.key]));
  if (badStat) {
    return `${badStat.label} must be a whole number from 1 to 3,000.`;
  }

  if (gateInvalid(entry.gate)) return 'The gate must be from 1 to 18, or empty for automatic.';

  if (fansInvalid(entry.fans)) return 'Fans must be a whole number, or empty.';

  const { teamId } = draft;
  const teamInvalid =
    teamId !== undefined && (!Number.isInteger(teamId) || teamId < 0 || teamId > MAX_TEAM_ID);
  if (teamInvalid) return 'Pick a team color again.';

  return '';
}
