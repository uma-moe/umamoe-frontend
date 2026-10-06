import { QueryCache } from '@/services/data/query-cache';
import { appHttp } from '@/services/http/app-http';
import { getAuthToken } from '@/services/auth/auth-token';

const cache = new QueryCache();
let cacheToken: string | undefined;
const visibilityWrites = new Map<string, Promise<ProfileVisibility>>();
function sessionCache(): QueryCache {
  const token = getAuthToken();
  if (token !== cacheToken) { cache.invalidate(); visibilityWrites.clear(); cacheToken = token; }
  return cache;
}
export interface TrainerProfile { account_id: string; name: string; follower_num: number | null; own_follow_num: number | null; best_team_class: number | null; team_class: number | null; team_evaluation_point: number | null; leader_chara_dress_id?: number | null; rank_score: number | null; comment: string | null; }
export interface ProfileCircle { circle_id: number; name: string; member_count: number; monthly_rank: number | null; monthly_point: number | null; last_month_rank: number | null; last_month_point: number | null; live_points: number | null; live_rank: number | null; yesterday_rank?: number; yesterday_points?: number; club_rank?: number; leader_name?: string; join_style?: number; policy?: number; comment?: string; }
export interface CircleHistory { year: number; month: number; circle_id: number; circle_name: string; circle_rank: number | null; circle_points: number | null; }
export interface MonthlyFans { year: number; month: number; total_fans: number; monthly_gain: number; active_days: number; avg_daily: number | null; rank: number; circle_id: number; circle_name: string; }
export interface RollingFans { gain_3d: number; gain_7d: number; gain_30d: number; rank_3d: number; rank_7d: number; rank_30d: number; }
export interface AlltimeFans { total_fans: number; total_gain: number; active_days: number; avg_day: number | null; avg_week: number | null; avg_month: number | null; rank_total_fans: number; rank_total_gain: number; rank_avg_day?: number; rank_avg_week?: number; rank_avg_month?: number; }
export interface ProfileInheritance {
  inheritance_id: number; account_id?: string; main_parent_id: number; parent_left_id: number; parent_right_id: number;
  parent_rank?: number; parent_rarity?: number; affinity_score: number | null; blue_sparks?: number[]; pink_sparks?: number[]; green_sparks?: number[]; white_sparks?: number[];
  main_blue_factors?: number; main_pink_factors?: number; main_green_factors?: number; main_white_factors?: number[];
  left_blue_factors?: number; left_pink_factors?: number; left_green_factors?: number; left_white_factors?: number[];
  right_blue_factors?: number; right_pink_factors?: number; right_green_factors?: number; right_white_factors?: number[];
  main_win_saddles?: number[]; left_win_saddles?: number[]; right_win_saddles?: number[]; race_results?: number[];
  blue_stars_sum: number; pink_stars_sum: number; green_stars_sum: number; white_stars_sum: number; win_count: number; white_count?: number;
}
export interface ProfileSupportCard { support_card_id: number; limit_break_count: number; experience: number; }
export interface VeteranSupportCard { support_card_id: number; limit_break_count: number | null; }
export interface StadiumMember {
  id: number; distance_type: number | null; card_id: number | null; running_style: number | null; speed: number | null; stamina: number | null; power: number | null; guts: number | null; wiz: number | null; rank_score: number | null;
  skills?: number[] | null; scenario_id?: number | null; rarity?: number | null; talent_level?: number | null; proper_ground_turf?: number | null; proper_ground_dirt?: number | null;
  proper_distance_short?: number | null; proper_distance_mile?: number | null; proper_distance_middle?: number | null; proper_distance_long?: number | null;
  proper_running_style_nige?: number | null; proper_running_style_senko?: number | null; proper_running_style_sashi?: number | null; proper_running_style_oikomi?: number | null;
}
export interface ProfileResponse { trainer: TrainerProfile; circle: ProfileCircle | null; circle_history: CircleHistory[]; fan_history: { monthly: MonthlyFans[]; rolling: RollingFans | null; alltime: AlltimeFans | null }; inheritance: ProfileInheritance | null; support_card: ProfileSupportCard | null; borrow_stats?: { view_count?: number; copy_count?: number } | null; team_stadium: StadiumMember[]; veterans?: ProfileVeteran[]; }
export interface VeteranInheritance {
  blue_sparks: number[]; pink_sparks: number[]; green_sparks: number[]; white_sparks: number[];
  blue_stars_sum: number; pink_stars_sum: number; green_stars_sum: number; white_stars_sum: number;
  affinity_score?: number | null; [key: string]: unknown;
}
export interface FactorInfoEntry { factor_id: number; level: number; }
export interface SuccessionChara {
  position_id: number; card_id: number; rank: number; rarity: number | null; talent_level: number | null;
  factor_id_array: number[]; factor_info_array?: FactorInfoEntry[]; win_saddle_id_array?: number[]; owner_viewer_id?: number;
}
export interface ProfileVeteran extends Omit<StadiumMember, 'id'> {
  id: number | string;
  trained_chara_id?: number | null; member_id: number | null; trainer_id?: string; fans?: number | null; team_rating?: number | null;
  factors?: number[] | null; factor_info_array?: FactorInfoEntry[] | null; support_cards?: number[] | null;
  support_card_list?: VeteranSupportCard[] | null;
  skill_array?: Array<{ skill_id: number; level: number }> | null; inheritance?: VeteranInheritance | null;
  succession_chara_array?: SuccessionChara[] | null; creation_time?: string | null; retired_at?: string | null;
  race_results?: number[] | null; win_saddle_id_array?: number[] | null;
}
export interface ProfileVisibility { profile_hidden: boolean; hidden_sections: string[]; }
export interface VeteranIngestResult { inserted: number; updated: number; deleted: number; total: number; }

export const profileRepository = {
  veteran(id: string, refresh = false): Promise<ProfileVeteran> { return sessionCache().get(`veteran:${id}`, 5 * 60_000, () => appHttp.request<ProfileVeteran>(`/api/v4/user/profile/veterans/${encodeURIComponent(id)}`), refresh); },
  async load(accountId: string, refresh = false, includeCircleDetails = false): Promise<ProfileResponse> {
    const profile = await sessionCache().get(`profile:${accountId}`, 5 * 60_000, () => appHttp.request<ProfileResponse>(`/api/v4/user/profile/${encodeURIComponent(accountId)}`), refresh);
    if (!includeCircleDetails || !profile.circle) return profile;
    try {
      const { communityRepository } = await import('@/pages/clubs/community-repository');
      const now = new Date();
      const details = await communityRepository.clubDetails(profile.circle.circle_id, now.getFullYear(), now.getMonth() + 1);
      return { ...profile, circle: { ...profile.circle, ...details.circle, club_rank: details.clubRank ?? details.circle.club_rank } };
    } catch { return profile; }
  },
  async visibility(accountId: string): Promise<ProfileVisibility> {
    sessionCache(); const token = getAuthToken();
    await visibilityWrites.get(accountId)?.catch(() => {});
    if (getAuthToken() !== token) throw new Error('Your sign-in session changed.');
    return appHttp.request<ProfileVisibility>(`/api/v4/user/profile/${encodeURIComponent(accountId)}/visibility`);
  },
  updateVisibility(accountId: string, visibility: ProfileVisibility): Promise<ProfileVisibility> {
    sessionCache(); const token = getAuthToken();
    const body = { profile_hidden: visibility.profile_hidden, hidden_sections: [...visibility.hidden_sections] };
    const request = (visibilityWrites.get(accountId) ?? Promise.resolve()).catch(() => {}).then(() => {
      if (getAuthToken() !== token) throw new Error('Your sign-in session changed.');
      return appHttp.request<ProfileVisibility>(`/api/v4/user/profile/${encodeURIComponent(accountId)}/visibility`, { method: 'PUT', body });
    });
    visibilityWrites.set(accountId, request);
    return request.finally(() => { if (visibilityWrites.get(accountId) === request) visibilityWrites.delete(accountId); });
  },
  async ingestVeterans(accountId: string, payload: unknown[]): Promise<VeteranIngestResult> {
    // Each upload is the complete collection: insert new, update matching, delete missing.
    const result = await appHttp.request<VeteranIngestResult>(`/ingest/veteran?account_id=${encodeURIComponent(accountId)}`, { method: 'POST', body: payload });
    sessionCache().invalidate(`profile:${accountId}`); cache.invalidate('veteran:');
    return result;
  }
};
