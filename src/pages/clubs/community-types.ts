export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ClubSummary {
  circleId: number;
  name: string;
  comment: string;
  leaderName: string;
  members: number;
  joinStyle: 1 | 2 | 3;
  policy: number;
  rank: number;
  yesterdayRank?: number;
  monthlyFans: number;
  yesterdayFans?: number;
  liveFans?: number;
  clubRank?: number;
}

export interface ClubQuery {
  page: number;
  pageSize: number;
  query?: string;
  name?: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export type RankingTab = 'monthly' | 'alltime' | 'gains';

export interface TrainerRanking {
  viewerId: number;
  name: string;
  circleId?: number;
  circleName?: string;
  rank: number;
  stats: Array<{ label: string; value: string; mobileValue?: string; mobileHidden?: boolean; emphasized?: boolean; positive?: boolean }>;
}

export interface RankingQuery {
  tab: RankingTab;
  page: number;
  pageSize: number;
  query?: string;
  month?: number;
  year?: number;
  sortBy?: string;
}

/** Keep the detail record in its public wire shape so JSON exports are lossless. */
export interface ClubRecord {
  circle_id: number;
  name: string;
  comment?: string;
  leader_viewer_id?: number;
  leader_name?: string;
  member_count?: number;
  join_style?: number;
  policy?: number;
  monthly_rank?: number;
  monthly_point?: number;
  yesterday_rank?: number;
  yesterday_points?: number;
  live_points?: number;
  club_rank?: number;
  created_at?: string;
  last_updated?: string;
  last_live_update?: string;
  last_month_rank?: number;
  last_month_point?: number;
}

export interface ClubDetails {
  circle: ClubRecord;
  members: import('@/lib/clubs/member-metrics').ClubMemberSnapshot[];
  clubRank?: number;
  fansToNextTier?: number;
  fansToLowerTier?: number;
  yesterdayFansToNextTier?: number;
  yesterdayFansToLowerTier?: number;
}
