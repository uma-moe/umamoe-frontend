import type { ProfileVeteran } from '@/pages/profile/profile-repository';

type UnknownRecord = Record<string, unknown>;

interface LearnedSkill {
  skill_id: number;
  level: number;
}

const record = (value: unknown): UnknownRecord | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const numberOrNull = (value: unknown): number | null => (isNumber(value) ? value : null);

const textOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function isLearnedSkill(value: unknown): value is LearnedSkill {
  const entry = record(value);
  return entry !== undefined && isNumber(entry.skill_id) && isNumber(entry.level);
}

/** What makes a record a trained Uma: her card and trained stats. */
function looksTrained(entry: UnknownRecord): boolean {
  return isNumber(entry.card_id) && isNumber(entry.speed) && isNumber(entry.wiz);
}

/**
 * One trained Uma as the game saves her (umadump's `trained_chara_data.json` entries and `veteran.json`), or undefined
 * when the record lacks the stats and skills a race needs.
 */
export function trainedVeteran(value: unknown, index = 0): ProfileVeteran | undefined {
  const entry = record(value);
  if (!entry || !looksTrained(entry)) return undefined;

  const { speed, stamina, power, guts, wiz, skill_array: skills } = entry;
  const stats = [speed, stamina, power, guts, wiz];
  if (!stats.every(isNumber)) return undefined;

  if (!Array.isArray(skills) || !skills.every(isLearnedSkill)) return undefined;

  const trainedCharaId = numberOrNull(entry.trained_chara_id);
  return {
    id: trainedCharaId ?? 'json-' + index,
    trained_chara_id: trainedCharaId,
    member_id: null,
    distance_type: null,
    card_id: numberOrNull(entry.card_id),
    running_style: numberOrNull(entry.running_style),
    speed: numberOrNull(speed),
    stamina: numberOrNull(stamina),
    power: numberOrNull(power),
    guts: numberOrNull(guts),
    wiz: numberOrNull(wiz),
    rank_score: numberOrNull(entry.rank_score),
    scenario_id: numberOrNull(entry.scenario_id),
    rarity: numberOrNull(entry.rarity),
    talent_level: numberOrNull(entry.talent_level),
    fans: numberOrNull(entry.fans),
    proper_ground_turf: numberOrNull(entry.proper_ground_turf),
    proper_ground_dirt: numberOrNull(entry.proper_ground_dirt),
    proper_distance_short: numberOrNull(entry.proper_distance_short),
    proper_distance_mile: numberOrNull(entry.proper_distance_mile),
    proper_distance_middle: numberOrNull(entry.proper_distance_middle),
    proper_distance_long: numberOrNull(entry.proper_distance_long),
    proper_running_style_nige: numberOrNull(entry.proper_running_style_nige),
    proper_running_style_senko: numberOrNull(entry.proper_running_style_senko),
    proper_running_style_sashi: numberOrNull(entry.proper_running_style_sashi),
    proper_running_style_oikomi: numberOrNull(entry.proper_running_style_oikomi),
    skill_array: skills.map(({ skill_id, level }) => ({ skill_id, level })),
    create_time: textOrNull(entry.create_time)
  };
}

/** Where Veteran exports keep their list: the file itself, or a list under one of these keys. */
function veteranList(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;

  const root = record(value);
  const data = record(root?.data);
  const lists = [root?.trained_chara_array, data?.trained_chara_array, root?.data, root?.veterans];
  return lists.find((list): list is unknown[] => Array.isArray(list));
}

/** One trained Uma on her own, as umadump's veteran.json or under the game API's `data`. */
function singleTrainedRecord(value: unknown): UnknownRecord | undefined {
  const root = record(value);
  return [root, record(root?.data)].find((entry) => entry !== undefined && looksTrained(entry));
}

/**
 * The Veterans in a JSON: a whole export or a single trained Uma, in umadump's files or the game API's responses.
 * Undefined when the JSON holds none; records without trained stats can't race and are counted apart.
 */
export function veteransInJson(
  value: unknown
): { veterans: ProfileVeteran[]; unraceable: number } | undefined {
  const single = singleTrainedRecord(value);
  if (single) {
    const veteran = trainedVeteran(single);
    return veteran ? { veterans: [veteran], unraceable: 0 } : { veterans: [], unraceable: 1 };
  }

  const list = veteranList(value);
  const trainedRecords = list?.filter((entry) => {
    const candidate = record(entry);
    return candidate !== undefined && isNumber(candidate.card_id);
  });
  if (!trainedRecords?.length) return undefined;

  const veterans = trainedRecords
    .map((entry, index) => trainedVeteran(entry, index))
    .filter((veteran): veteran is ProfileVeteran => veteran !== undefined);
  return { veterans, unraceable: trainedRecords.length - veterans.length };
}
