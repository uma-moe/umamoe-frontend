import type { CharacterData } from '@/lib/game-data/characters';
import type { ProfileVeteran } from '@/pages/profile/profile-repository';
import { characterUniqueSkillId, inheritedUniqueSkillId } from '../runner/editor/uma-draft';
import { APTITUDE_ROWS, STAT_KEYS, type AptitudeKey, type StatKey } from './screenshot-layout';
import type { ReadSkill, SkillChoice } from './screenshot-skills';
import { similarity, textKey } from './skill-names';

/** What one or more screenshots of the details screen showed. */
export interface ScreenshotReading {
  stats: Partial<Record<StatKey, number>>;
  /** Grade numbers, 8 for S down to 1 for G. */
  aptitudes: Partial<Record<AptitudeKey, number>>;
  skills: ReadSkill[];
  choices: SkillChoice[];
  titleLines: string[];
}

export const STAT_NAMES: Record<StatKey, string> = {
  speed: 'Speed',
  stamina: 'Stamina',
  power: 'Power',
  guts: 'Guts',
  wiz: 'Wit'
};

const APTITUDE_NAMES: Record<AptitudeKey, string> = {
  proper_ground_turf: 'Turf',
  proper_ground_dirt: 'Dirt',
  proper_distance_short: 'Sprint',
  proper_distance_mile: 'Mile',
  proper_distance_middle: 'Medium',
  proper_distance_long: 'Long',
  proper_running_style_nige: 'Front',
  proper_running_style_senko: 'Pace',
  proper_running_style_sashi: 'Late',
  proper_running_style_oikomi: 'End'
};

const STYLE_KEYS: AptitudeKey[] = [
  'proper_running_style_nige',
  'proper_running_style_senko',
  'proper_running_style_sashi',
  'proper_running_style_oikomi'
];

/** A title line must be this close to "[outfit] name" to name the card. */
const TITLE_SIMILARITY = 0.75;

const APTITUDE_KEYS = APTITUDE_ROWS.flat().map((label) => label.key);

/**
 * Several screenshots of one Uma, usually scrolled through her skill list: stats and aptitudes come from the first
 * screenshot that shows them, skills from all of them, each once.
 */
export function mergeReadings(readings: ScreenshotReading[]): ScreenshotReading {
  const merged: ScreenshotReading = {
    stats: {},
    aptitudes: {},
    skills: [],
    choices: [],
    titleLines: []
  };

  for (const reading of readings) {
    merged.stats = { ...reading.stats, ...merged.stats };
    merged.aptitudes = { ...reading.aptitudes, ...merged.aptitudes };
    merged.titleLines.push(...reading.titleLines);

    for (const skill of reading.skills) {
      if (!merged.skills.some((known) => known.skillId === skill.skillId))
        merged.skills.push(skill);
    }

    for (const choice of reading.choices) {
      // A skill shows once per runner, so lines whose best guess is the same skill are one line read twice.
      const same = (other: SkillChoice) => other.candidates[0] === choice.candidates[0];
      if (!merged.choices.some(same)) merged.choices.push(choice);
    }
  }

  // A line one screenshot couldn't settle is often read clearly in the next.
  merged.choices = merged.choices.filter(
    (choice) => !merged.skills.some((skill) => skill.skillId === choice.candidates[0])
  );

  return merged;
}

/** The stats and aptitudes the screenshots didn't show, by the names the screen gives them. */
export function unreadFields(reading: Pick<ScreenshotReading, 'stats' | 'aptitudes'>): string[] {
  return [
    ...STAT_KEYS.filter((key) => reading.stats[key] === undefined).map((key) => STAT_NAMES[key]),
    ...APTITUDE_KEYS.filter((key) => reading.aptitudes[key] === undefined).map(
      (key) => APTITUDE_NAMES[key]
    )
  ];
}

/** The card whose own unique she has; a unique belongs to one card. */
function cardFromUnique(
  skills: ReadSkill[],
  characters: ReadonlyMap<number, CharacterData>
): number | undefined {
  for (const cardId of characters.keys()) {
    const unique = characterUniqueSkillId(cardId);
    if (skills.some((skill) => skill.skillId === unique)) return cardId;
  }

  return undefined;
}

/** The card the screen's title names, as "[outfit] name". */
function cardFromTitle(
  titleLines: string[],
  characters: ReadonlyMap<number, CharacterData>
): number | undefined {
  const lineKeys = titleLines.map(textKey).filter((key) => key.length >= 4);
  let best: { cardId: number; score: number } | undefined;

  for (const [cardId, character] of characters) {
    const titleKey = textKey((character.subtitle ?? '') + character.name);
    for (const lineKey of lineKeys) {
      const score = similarity(lineKey, titleKey);
      if (score >= TITLE_SIMILARITY && score > (best?.score ?? 0)) best = { cardId, score };
    }
  }

  return best?.cardId;
}

/** Her style isn't on the details screen; her best style aptitude is the likeliest one. */
function likelyRunningStyle(aptitudes: ScreenshotReading['aptitudes']): number | null {
  let style: number | null = null;
  let bestGrade = 0;
  STYLE_KEYS.forEach((key, index) => {
    const grade = aptitudes[key];
    if (grade !== undefined && grade > bestGrade) {
      bestGrade = grade;
      style = index + 1;
    }
  });

  return style;
}

/**
 * Her skills with her own unique in its personal form: when OCR missed the `Lvl` suffix the name reads as the
 * inherited copy, which she can never have of herself.
 */
function ownUniqueFirst(skills: ReadSkill[], cardId: number | undefined): ReadSkill[] {
  if (cardId === undefined) return skills;

  const inherited = inheritedUniqueSkillId(cardId);
  const personal = characterUniqueSkillId(cardId);
  return skills.map((skill) =>
    skill.skillId === inherited ? { skillId: personal, level: skill.level } : skill
  );
}

/** The Veteran a reading describes, with the card found from her unique or the screen's title. */
export function screenshotVeteran(
  reading: Pick<ScreenshotReading, 'aptitudes' | 'skills' | 'titleLines'> & {
    stats: Record<StatKey, number>;
  },
  characters: ReadonlyMap<number, CharacterData>
): ProfileVeteran {
  const cardId =
    cardFromUnique(reading.skills, characters) ?? cardFromTitle(reading.titleLines, characters);
  const grade = (key: AptitudeKey) => reading.aptitudes[key] ?? null;

  return {
    id: 'screenshot',
    trained_chara_id: null,
    member_id: null,
    distance_type: null,
    card_id: cardId ?? null,
    running_style: likelyRunningStyle(reading.aptitudes),
    speed: reading.stats.speed,
    stamina: reading.stats.stamina,
    power: reading.stats.power,
    guts: reading.stats.guts,
    wiz: reading.stats.wiz,
    rank_score: null,
    scenario_id: null,
    rarity: null,
    talent_level: null,
    fans: null,
    proper_ground_turf: grade('proper_ground_turf'),
    proper_ground_dirt: grade('proper_ground_dirt'),
    proper_distance_short: grade('proper_distance_short'),
    proper_distance_mile: grade('proper_distance_mile'),
    proper_distance_middle: grade('proper_distance_middle'),
    proper_distance_long: grade('proper_distance_long'),
    proper_running_style_nige: grade('proper_running_style_nige'),
    proper_running_style_senko: grade('proper_running_style_senko'),
    proper_running_style_sashi: grade('proper_running_style_sashi'),
    proper_running_style_oikomi: grade('proper_running_style_oikomi'),
    skill_array: ownUniqueFirst(reading.skills, cardId).map((skill) => ({
      skill_id: skill.skillId,
      level: skill.level
    })),
    create_time: null
  };
}
