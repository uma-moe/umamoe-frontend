import { loadPotentialSkills, type PotentialSkills } from '@/lib/game-data/cards/potential-skills';
import type { SkillData } from '@/lib/game-data/skills/skills';
import type { ProfileVeteran } from '@/pages/profile/profile-repository';
import { simulatorUmaFromVeteran } from '../../simulator-uma';
import { BUILD_CODE_VERSION, buildCodeRunner, type BuildCode } from '../build/code/build-code';
import { finalTurnCharaInfo, finalTurnCode } from './final-turn';
import { veteransInJson } from './veteran-json';

/** What a runner JSON holds: a build to load, or Veterans to choose from. */
export type RunnerJson =
  | { kind: 'career-turn'; code: BuildCode }
  | { kind: 'veteran'; code: BuildCode }
  | { kind: 'veterans'; veterans: ProfileVeteran[]; unraceable: number };

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** Keys only race captures carry: API race data, HorseACT's race horses, Team Trials rounds, or a resimulated capture. */
const RACE_KEYS = [
  'race_horse_data_array',
  'raceHorse',
  '<RaceHorse>k__BackingField',
  'race_start_params_array',
  'resimulation'
];

function isRaceFile(value: unknown): boolean {
  const root = record(value);
  const data = record(root?.data);
  return RACE_KEYS.some((key) => (root && key in root) || (data && key in data));
}

/** A Veteran's build as a code: her runner alone, so the course stays as it is. */
export function veteranCode(veteran: ProfileVeteran): BuildCode {
  return {
    version: BUILD_CODE_VERSION,
    uma1: buildCodeRunner(simulatorUmaFromVeteran(veteran, 'Veteran'))
  };
}

/**
 * Reads a runner saved as JSON, from umadump's files or the game API's responses: a career turn, or Veterans (a list or
 * one trained Uma). Throws an error that says what the file is when it holds neither.
 */
export async function readRunnerJson(
  text: string,
  skillLookup: Map<number, SkillData>,
  potentialSkills: () => Promise<PotentialSkills> = loadPotentialSkills
): Promise<RunnerJson> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('This file isn’t JSON, or it was cut off. Save it again.');
  }

  const careerState = finalTurnCharaInfo(value);
  if (careerState) {
    const code = finalTurnCode(careerState, skillLookup, await potentialSkills());
    return { kind: 'career-turn', code };
  }

  const found = veteransInJson(value);
  if (found) {
    const [first, ...rest] = found.veterans;
    if (!first) throw new Error('None of these Veterans have trained stats, so they can’t race.');

    if (!rest.length) return { kind: 'veteran', code: veteranCode(first) };

    return { kind: 'veterans', ...found };
  }

  if (isRaceFile(value))
    throw new Error(
      'This is a race file. Open it in Race analysis, which can send its field to the Race sim.'
    );

  throw new Error('This JSON isn’t a career turn or Veterans.');
}
