import type { SkillData } from '@/lib/game-data/skills/skills';
import {
  loadPotentialSkills,
  STARTING_POTENTIAL_LEVEL,
  unlockedSkills,
  type PotentialSkills
} from '@/lib/game-data/cards/potential-skills';
import { aptitudeGrade } from '@/lib/profile/profile-display';
import { hintedSkills } from '../skill-offers';
import { BUILD_CODE_VERSION, decodeBuildCode, type BuildCode } from './build-code';

/**
 * A career's final turn, saved as JSON: her state when the career ends, before she spends her skill points. honse_act
 * writes the turn's `single_mode_load_common`; UmaExporter writes the whole server response, with the same state under
 * `data`. Either way `chara_info` holds her stats, aptitudes, style, mood, skills, skill points, fans and hint levels,
 * which read as a build code: the runner, her skill points, every hinted skill as an offer at its hint level, and the
 * skills her card's potential (talent) level unlocks, on offer without a hint where she has none. The course and its
 * conditions stay as they are. contracts/final-turn.schema.json documents the shape read here.
 */
interface CareerSkill {
  skill_id: number;
  level: number;
}

interface CareerHint {
  group_id: number;
  rarity: number;
  level: number;
}

export interface FinalTurnCharaInfo {
  card_id: number;
  speed: number;
  stamina: number;
  power: number;
  guts: number;
  wiz: number;
  motivation: number;
  fans?: number;
  /** Potential level, 1 to 5: it unlocks skills of her card to buy without a hint. */
  talent_level?: number;
  skill_point: number;
  race_running_style: number;
  proper_distance_short: number;
  proper_distance_mile: number;
  proper_distance_middle: number;
  proper_distance_long: number;
  proper_running_style_nige: number;
  proper_running_style_senko: number;
  proper_running_style_sashi: number;
  proper_running_style_oikomi: number;
  proper_ground_turf: number;
  proper_ground_dirt: number;
  skill_array: CareerSkill[];
  skill_tips_array: CareerHint[];
}

const NUMBER_FIELDS = [
  'card_id',
  'speed',
  'stamina',
  'power',
  'guts',
  'wiz',
  'motivation',
  'skill_point',
  'race_running_style',
  'proper_distance_short',
  'proper_distance_mile',
  'proper_distance_middle',
  'proper_distance_long',
  'proper_running_style_nige',
  'proper_running_style_senko',
  'proper_running_style_sashi',
  'proper_running_style_oikomi',
  'proper_ground_turf',
  'proper_ground_dirt'
] as const satisfies readonly (keyof FinalTurnCharaInfo)[];

/** The game's running styles 1 to 4, as a build code names them. */
const STRATEGIES: Record<number, string> = { 1: 'Nige', 2: 'Senkou', 3: 'Sasi', 4: 'Oikomi' };

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function isCareerSkill(value: unknown): value is CareerSkill {
  const entry = record(value);
  return entry !== undefined && isNumber(entry.skill_id) && isNumber(entry.level);
}

function isCareerHint(value: unknown): value is CareerHint {
  const entry = record(value);
  return (
    entry !== undefined &&
    isNumber(entry.group_id) &&
    isNumber(entry.rarity) &&
    isNumber(entry.level)
  );
}

/** Her `chara_info` from a final turn of either tool, or undefined when the JSON is not one. */
export function finalTurnCharaInfo(value: unknown): FinalTurnCharaInfo | undefined {
  const root = record(value);
  const state = record(root?.single_mode_load_common) ?? record(root?.data) ?? root;
  const info = record(state?.chara_info);
  if (!info) return undefined;

  if (!NUMBER_FIELDS.every((field) => isNumber(info[field]))) return undefined;

  if (!Array.isArray(info.skill_array) || !info.skill_array.every(isCareerSkill)) return undefined;

  const hints = info.skill_tips_array ?? [];
  if (!Array.isArray(hints) || !hints.every(isCareerHint)) return undefined;

  return { ...info, skill_tips_array: hints } as FinalTurnCharaInfo;
}

/** Character uniques are 1xxxxx. */
const isUnique = (skill: number) => skill >= 100000 && skill < 200000;

/**
 * Her final turn as a build code; its hints need the skill catalog to name the skills they are for, and her potential
 * level her card's potential skills.
 */
export function finalTurnCode(
  info: FinalTurnCharaInfo,
  skillLookup: Map<number, SkillData>,
  potentialSkills: PotentialSkills
): BuildCode {
  const unique = info.skill_array.find((skill) => isUnique(skill.skill_id));
  const hintLevels: Record<string, number> = {};
  for (const hint of info.skill_tips_array) {
    for (const skill of hintedSkills(
      { groupId: hint.group_id, rarity: hint.rarity },
      skillLookup
    )) {
      hintLevels[String(skill.skill_id)] = hint.level;
    }
  }

  const unlocked = unlockedSkills(potentialSkills, {
    cardId: info.card_id,
    potentialLevel: isNumber(info.talent_level) ? info.talent_level : STARTING_POTENTIAL_LEVEL
  });
  const chartSkills = [...new Set([...Object.keys(hintLevels), ...unlocked.map(String)])];

  return {
    version: BUILD_CODE_VERSION,
    uma1: {
      outfitId: String(info.card_id),
      speed: info.speed,
      stamina: info.stamina,
      power: info.power,
      guts: info.guts,
      wisdom: info.wiz,
      strategy: STRATEGIES[info.race_running_style],
      aptitudes: [
        info.proper_distance_short,
        info.proper_distance_mile,
        info.proper_distance_middle,
        info.proper_distance_long,
        info.proper_running_style_nige,
        info.proper_running_style_senko,
        info.proper_running_style_sashi,
        info.proper_running_style_oikomi,
        info.proper_ground_turf,
        info.proper_ground_dirt
      ].map(aptitudeGrade),
      skills: info.skill_array.map((skill) => String(skill.skill_id)),
      ...(unique ? { uniqueLv: unique.level } : {}),
      // The game's motivation runs 1 (awful) to 5 (great); a code's mood runs −2 to 2.
      mood: info.motivation - 3,
      sp: info.skill_point,
      ...(isNumber(info.fans) ? { fans: info.fans } : {})
    },
    chartSkills,
    hintLevels
  };
}

/**
 * Reads a build code or a career's final turn. JSON with a career `chara_info` is a final turn; anything else is read
 * as a build code, which says what is wrong with it. `potentialSkills` loads the cards' potential skills for a final turn.
 */
export async function decodeBuildImport(
  text: string,
  skillLookup: Map<number, SkillData>,
  potentialSkills: () => Promise<PotentialSkills> = loadPotentialSkills
): Promise<BuildCode> {
  const value = text.trim();
  if (value.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error('This JSON is cut off or changed. Export it again.');
    }

    const info = finalTurnCharaInfo(parsed);
    if (info) return finalTurnCode(info, skillLookup, await potentialSkills());
  }

  return decodeBuildCode(value);
}
