import type { ProfileVeteran, SuccessionChara, VeteranSupportCard } from '@/pages/profile/profile-repository';
import type { VeteranRecord } from './generated/veteran-record';

const number = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
const ids = (value: unknown): number[] => Array.isArray(value) ? value.filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0) : [];
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function veteranSupportCards(raw: { support_cards?: unknown; support_card_list?: unknown }): VeteranSupportCard[] {
  const details = Array.isArray(raw.support_card_list) ? raw.support_card_list.map(object) : [];
  const recordedIds = ids(raw.support_cards);
  return (recordedIds.length ? recordedIds : ids(details.map(card => card.support_card_id))).map(value => {
    // Team Stadium packs the five-digit R/SR/SSR card ID and LB into one integer.
    const packed = recordedIds.length > 0 && value >= 100000 && value < 400000;
    const id = packed ? Math.floor(value / 10) : value;
    const detail = details.find(card => card.support_card_id === id);
    const limitBreak = detail ? number(detail.limit_break_count) : packed ? value % 10 : null;
    return { support_card_id:id, limit_break_count:limitBreak !== null && limitBreak >= 0 && limitBreak <= 4 ? limitBreak : null };
  });
}

/** Preserve extractor-only fields for ingest, while mapping normalized exports back to game fields. */
export function veteranPayload(record: VeteranRecord): Record<string, unknown> {
  const raw = record.rawSource ?? {};
  const ancestors = Array.isArray(raw.succession_chara_array) ? raw.succession_chara_array : [];
  return { ...raw, trained_chara_id: record.trainedCharaId, card_id: record.cardId,
    speed: record.stats.speed, stamina: record.stats.stamina, power: record.stats.power, guts: record.stats.guts, wiz: record.stats.wisdom,
    rank_score: record.rankScore, scenario_id: record.scenarioId,
    skill_array: record.skills.map(skill => ({ skill_id: skill.id, level: skill.level })),
    factor_info_array: record.factors.map(factor => ({ factor_id: factor.id, level: factor.level })),
    succession_chara_array: record.parents.map(parent => ({
      ...object(ancestors.find(value => object(value).position_id === parent.positionId)),
      position_id: parent.positionId, card_id: parent.cardId,
      factor_info_array: parent.factors.map(factor => ({ factor_id: factor.id, level: factor.level }))
    })),
    create_time: raw.create_time ?? record.createdAt
  };
}

/** UI rows only receive known scalar/array shapes; raw exports remain available for upload. */
export function veteranProfile(record: VeteranRecord): ProfileVeteran {
  const raw = record.rawSource ?? {};
  const payload = veteranPayload(record);
  const ancestors = payload.succession_chara_array as Record<string, unknown>[];
  const supports = veteranSupportCards(raw);
  const profile: ProfileVeteran = {
    id: record.recordId, member_id: null, trained_chara_id: record.trainedCharaId,
    card_id: record.cardId, speed: record.stats.speed, stamina: record.stats.stamina, power: record.stats.power, guts: record.stats.guts, wiz: record.stats.wisdom,
    rank_score: record.rankScore ?? null, scenario_id: record.scenarioId,
    distance_type: number(raw.distance_type), running_style: number(raw.running_style),
    skill_array: payload.skill_array as ProfileVeteran['skill_array'],
    factor_info_array: payload.factor_info_array as ProfileVeteran['factor_info_array'],
    factors: record.factors.map(factor => factor.id * 10 + factor.level),
    win_saddle_id_array: ids(raw.win_saddle_id_array), race_results: ids(raw.race_results),
    support_cards: supports.map(card => card.support_card_id), support_card_list: supports,
    creation_time: record.createdAt,
    succession_chara_array: ancestors.map((parent, index): SuccessionChara => ({
      position_id: record.parents[index]!.positionId, card_id: record.parents[index]!.cardId,
      rank: number(parent.rank) ?? 0, rarity: number(parent.rarity), talent_level: number(parent.talent_level),
      factor_id_array: record.parents[index]!.factors.map(factor => factor.id * 10 + factor.level),
      factor_info_array: parent.factor_info_array as SuccessionChara['factor_info_array'], win_saddle_id_array: ids(parent.win_saddle_id_array)
    }))
  };
  for (const field of ['rarity', 'talent_level', 'fans', 'team_rating', 'proper_ground_turf', 'proper_ground_dirt', 'proper_distance_short', 'proper_distance_mile', 'proper_distance_middle', 'proper_distance_long', 'proper_running_style_nige', 'proper_running_style_senko', 'proper_running_style_sashi', 'proper_running_style_oikomi'] as const) profile[field] = number(raw[field]);
  return profile;
}

export function mergeVeterans(existing: ProfileVeteran[], incoming: ProfileVeteran[]): ProfileVeteran[] {
  const key = (v: ProfileVeteran) => v.trained_chara_id != null ? `trained:${v.trained_chara_id}` : `id:${v.id}`;
  return [...new Map([...existing, ...incoming].map(v => [key(v), v])).values()];
}
