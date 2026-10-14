import { QueryCache } from '@/services/data/query-cache';
import { appHttp } from '@/services/http/app-http';
import type { ClubDetails, ClubQuery, ClubRecord, ClubSummary, PagedResult, RankingQuery, TrainerRanking } from './community-types';

const cache = new QueryCache();
const fiveMinutes = 5 * 60 * 1000;
const oneHour = 60 * 60 * 1000;

interface RawRanking {
  viewer_id: number;
  trainer_name?: string | null;
  circle_id?: number | null;
  circle_name?: string | null;
  rank?: number;
  total_fans?: number;
  monthly_gain?: number;
  active_days?: number;
  avg_daily?: number | null;
  total_gain?: number;
  avg_day?: number | null;
  avg_week?: number | null;
  avg_month?: number | null;
  gain_3d?: number;
  gain_7d?: number;
  gain_30d?: number;
  rank_3d?: number;
  rank_7d?: number;
  rank_30d?: number;
  rank_total_fans?: number;
  rank_total_gain?: number;
  rank_avg_day?: number;
  rank_avg_week?: number;
  rank_avg_month?: number;
}

function compact(value: number | null | undefined, prefix = ''): string {
  if (value == null) return '-';
  const abs = Math.abs(value), sign = value < 0 ? '-' : prefix;
  if (abs >= 1_000_000_000) return sign + (abs / 1_000_000_000).toFixed(2) + 'B';
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + 'M';
  if (abs >= 10_000) return sign + (abs / 1_000).toFixed(1) + 'K';
  return sign + abs.toLocaleString();
}

function clubFrom(raw: ClubRecord): ClubSummary {
  return {
    circleId: raw.circle_id,
    name: raw.name,
    comment: raw.comment ?? '',
    leaderName: raw.leader_name ?? String(raw.leader_viewer_id ?? 'Unknown'),
    members: raw.member_count ?? 0,
    joinStyle: raw.join_style === 2 || raw.join_style === 3 ? raw.join_style : 1,
    policy: raw.policy ?? 0,
    rank: raw.monthly_rank ?? 0,
    yesterdayRank: raw.yesterday_rank,
    monthlyFans: raw.monthly_point ?? 0,
    yesterdayFans: raw.yesterday_points,
    liveFans: raw.live_points,
    clubRank: raw.club_rank
  };
}

function rankingRank(raw: RawRanking, query: RankingQuery): number {
  if (query.tab === 'gains') return raw[`rank_${(query.sortBy ?? 'gain_30d').replace('gain_', '')}` as keyof RawRanking] as number ?? raw.rank ?? 0;
  if (query.tab === 'alltime') {
    const key = `rank_${query.sortBy ?? 'avg_month'}` as keyof RawRanking;
    return raw[key] as number ?? raw.rank ?? 0;
  }
  return raw.rank ?? 0;
}

function rankingStats(raw: RawRanking, query: RankingQuery): TrainerRanking['stats'] {
  const metric = (label: string, value: number | null | undefined, prefix = '', emphasized = false, compactMobile = true) => ({
    label, value: value == null ? '-' : prefix + value.toLocaleString(undefined, { maximumFractionDigits: 0 }),
    mobileValue: compactMobile ? compact(value, prefix) : undefined, emphasized
  });
  if (query.tab === 'monthly') return [
    metric('Fans', raw.total_fans),
    { ...metric('Monthly gain', raw.monthly_gain, (raw.monthly_gain ?? 0) > 0 ? '+' : ''), positive: (raw.monthly_gain ?? 0) > 0 },
    { ...metric('Avg/day', raw.avg_daily, '', false, false), mobileHidden: true },
    { label: 'Active', value: raw.active_days == null ? '-' : `${raw.active_days}d`, mobileHidden: true }
  ];
  if (query.tab === 'alltime') return [
    metric('Total fans', raw.total_fans, '', query.sortBy === 'total_fans'),
    { ...metric('Total gain', raw.total_gain, (raw.total_gain ?? 0) > 0 ? '+' : '', query.sortBy === 'total_gain'), positive: (raw.total_gain ?? 0) > 0, mobileHidden: query.sortBy !== 'total_gain' },
    { ...metric('Avg/day', raw.avg_day, '', query.sortBy === 'avg_day', false), mobileHidden: query.sortBy !== 'avg_day' },
    { ...metric('Avg/week', raw.avg_week, '', query.sortBy === 'avg_week', false), mobileHidden: query.sortBy !== 'avg_week' },
    metric('Avg/month', raw.avg_month, '', query.sortBy === 'avg_month')
  ];
  const selectedGain = query.sortBy === 'gain_3d' || query.sortBy === 'gain_7d' ? query.sortBy : 'gain_30d';
  return [
    { ...metric(`${selectedGain.slice(5)} Gain`, raw[selectedGain], '+', selectedGain === 'gain_30d'), positive: true, mobileHidden: selectedGain !== 'gain_30d' },
    metric('3d', raw.gain_3d, '+', query.sortBy === 'gain_3d'),
    metric('7d', raw.gain_7d, '+', query.sortBy === 'gain_7d'),
    metric('30d', raw.gain_30d, '+', (query.sortBy ?? 'gain_30d') === 'gain_30d')
  ];
}

function page<T>(response: Record<string, unknown>, items: T[], requestedPage: number, pageSize: number): PagedResult<T> {
  const total = Number(response.total ?? response.total_count ?? items.length);
  return { items, total, page: Number(response.page ?? requestedPage), pageSize: Number(response.limit ?? pageSize), totalPages: Number(response.total_pages ?? Math.max(1, Math.ceil(total / pageSize))) };
}

function clubsKey(query: ClubQuery): string { return `clubs:${JSON.stringify(query)}`; }
function clubDetailsKey(id: number, year: number, month: number): string { return `clubs:detail:${id}:${year}:${month}`; }

export const communityRepository = {
  clubsRefreshSeconds(query: ClubQuery): number { return Math.ceil(cache.remainingMs(clubsKey(query)) / 1000); },
  clubDetailsRefreshSeconds(id: number, year: number, month: number): number { return Math.ceil(cache.remainingMs(clubDetailsKey(id, year, month)) / 1000); },

  async clubs(query: ClubQuery, refresh = false): Promise<PagedResult<ClubSummary>> {
    const key = clubsKey(query);
    const isLiveTop = !query.query && !query.name && query.page === 0 && query.pageSize === 100 && query.sortBy === 'rank';
    return cache.get(key, isLiveTop ? fiveMinutes : oneHour, async () => {
      const response = await appHttp.request<Record<string, unknown>>('/api/v4/circles/list', { query: { page: query.page, limit: query.pageSize, query: query.query, name: query.name, sort_by: query.sortBy, sort_dir: query.sortOrder } });
      const raw = (Array.isArray(response) ? response : response.circles ?? response.list ?? []) as ClubRecord[];
      return page(response, raw.map(clubFrom), query.page, query.pageSize);
    }, refresh);
  },

  async rankings(query: RankingQuery, refresh = false): Promise<PagedResult<TrainerRanking>> {
    const key = `rankings:${JSON.stringify(query)}`;
    return cache.get(key, fiveMinutes, async () => {
      const response = await appHttp.request<Record<string, unknown>>(`/api/v4/rankings/${query.tab}`, { query: { page: query.page, limit: query.pageSize, query: query.query, circle_name: query.query, month: query.tab === 'monthly' ? query.month : undefined, year: query.tab === 'monthly' ? query.year : undefined, sort_by: query.tab === 'monthly' ? undefined : query.sortBy } });
      const raw = (response.rankings ?? []) as RawRanking[];
      const entries = raw.map((entry) => ({ viewerId: entry.viewer_id, name: entry.trainer_name || 'Unknown trainer', circleId: entry.circle_id ?? undefined, circleName: entry.circle_name ?? undefined, rank: rankingRank(entry, query), stats: rankingStats(entry, query) }));
      return page(response, entries, query.page, query.pageSize);
    }, refresh);
  },

  async clubDetails(id: number, year: number, month: number, refresh = false): Promise<ClubDetails> {
    const key = clubDetailsKey(id, year, month);
    return cache.get(key, fiveMinutes, async () => {
      const response = await appHttp.request<Record<string, unknown>>('/api/v4/circles', { query: { circle_id: id, year, month } });
      return {
        circle: response.circle as ClubRecord,
        members: ((response.members ?? []) as ClubDetails['members']).map(member => ({ ...member, viewer_id: Number(member.viewer_id), year: Number(member.year), month: Number(member.month), daily_fans: member.daily_fans ?? [] })),
        clubRank: response.club_rank as number | undefined,
        fansToNextTier: response.fans_to_next_tier as number | undefined,
        fansToLowerTier: response.fans_to_lower_tier as number | undefined,
        yesterdayFansToNextTier: response.yesterday_fans_to_next_tier as number | undefined,
        yesterdayFansToLowerTier: response.yesterday_fans_to_lower_tier as number | undefined
      };
    }, refresh);
  },

  invalidate(prefix?: 'clubs' | 'rankings'): void { cache.invalidate(prefix ? `${prefix}:` : undefined); }
};
