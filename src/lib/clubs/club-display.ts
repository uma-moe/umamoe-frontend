import type { ClubMemberMetric, ClubMemberSnapshot } from './member-metrics';

export const clubPolicyLabels: Record<number, string> = {
  1: 'You Do You',
  2: 'Laid-back',
  3: 'Going for Gold',
  4: 'Beginners Welcome',
  5: "Let's Party!",
  6: 'Rank 2000+',
  7: 'Rank 1000+',
  8: 'Rank 500+',
  9: 'Rank 250+',
  10: 'Rank 100+',
  11: 'Rank 20+',
  12: 'Log in Daily',
  13: 'Log in Every 3 Days',
  14: 'Active in the Morning',
  15: 'Active in the Afternoon',
  16: 'Active in the Evening',
  17: 'Active at Night'
};

export function clubRankIcon(rank?: number): string | undefined {
  return rank && Number.isInteger(rank) && rank >= 1 && rank <= 11
    ? `/assets/images/icon/circle_rank/utx_ico_circle_rank_${String(rank).padStart(2, '0')}.webp`
    : undefined;
}

export function clubInitialPeriod(
  query: { year?: string; month?: string },
  fallback: { year: number; month: number }
) {
  const year = Number(query.year),
    month = Number(query.month);

  return {
    year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : fallback.year,
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : fallback.month
  };
}

export function clubDataStatus(
  club: { liveFans?: number; lastLiveUpdate?: string; lastUpdated?: string },
  members: readonly ClubMemberSnapshot[],
  period: { year: number; month: number; currentMonth: boolean },
  now = Date.now()
) {
  const liveTime = Date.parse(club.lastLiveUpdate ?? '');
  const reset = Math.floor((now + 9 * 3600000) / 86400000) * 86400000 - 9 * 3600000;
  const liveFresh = Boolean(club.liveFans) && Number.isFinite(liveTime) && liveTime >= reset;
  if (period.currentMonth && Number.isFinite(liveTime))
    return { liveFresh, updatedAt: club.lastLiveUpdate };

  const candidates = [
    club.lastUpdated,
    ...members
      .filter((member) => member.year === period.year && member.month === period.month)
      .map((member) => member.last_updated)
  ];

  const updatedAt = candidates.reduce<string | undefined>(
    (latest, value) =>
      value &&
      Number.isFinite(Date.parse(value)) &&
      (!latest || Date.parse(value) > Date.parse(latest))
        ? value
        : latest,
    undefined
  );

  return { liveFresh, updatedAt };
}

export function formatClubTimeAgo(value: string | undefined, now = Date.now()): string {
  const timestamp = Date.parse(value ?? '');
  if (!Number.isFinite(timestamp)) return 'unknown';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 30 * 86400) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 360 * 86400) return `${Math.floor(seconds / (30 * 86400))}mo ago`;
  return `${Math.floor(seconds / (365 * 86400))}y ago`;
}

export const clubMetrics = [
  { value: 'today_gain', key: 'todayGain', label: 'Today', flag: 'showTodayGain' },
  { value: 'monthly_gain', key: 'monthlyGain', label: 'Monthly Gain', flag: 'showMonthlyGain' },
  { value: 'weekly_gain', key: 'weeklyGain', label: 'Weekly Gain', flag: 'showWeeklyGain' },
  { value: 'daily_gain', key: 'dailyGain', label: 'Daily Gain', flag: 'showDailyGain' },
  { value: 'avg_daily_gain', key: 'sevenDayAverage', label: '7 Day Avg', flag: 'showSevenDayAvg' },
  { value: 'daily_avg', key: 'dailyAverage', label: 'Daily Avg', flag: 'showDailyAvg' },
  {
    value: 'projected_monthly',
    key: 'projectedMonthly',
    label: 'Projected Monthly',
    flag: 'showProjectedMonthly'
  },
  { value: 'total_fans', key: 'fanCount', label: 'Total Fans', flag: 'showTotalFans' }
] as const;

export const defaultClubConfig = {
  selectedCalculation: 'monthly_gain',
  showTotalFans: true,
  showTodayGain: true,
  showSevenDayAvg: true,
  showDailyGain: true,
  showDailyAvg: false,
  showLastUpdated: true,
  showWeeklyGain: false,
  showProjectedMonthly: false,
  showMonthlyGain: false,
  showRole: false,
  showTrainerId: false,
  includePriorClubData: true
};

export type ClubDisplayConfig = typeof defaultClubConfig;
export function readClubConfig(raw: string | null): ClubDisplayConfig {
  const result = { ...defaultClubConfig };

  try {
    const value = JSON.parse(raw ?? '{}');
    for (const key of Object.keys(result) as Array<keyof ClubDisplayConfig>) {
      if (key === 'selectedCalculation') {
        if (clubMetrics.some((metric) => metric.value === value?.[key])) result[key] = value[key];
      } else if (typeof value?.[key] === 'boolean') result[key] = value[key];
    }
  } catch {
    /* Corrupt preferences must not prevent the club from opening. */
  }

  return result;
}

export function clubMetric(config: ClubDisplayConfig): (typeof clubMetrics)[number] {
  return (
    clubMetrics.find((metric) => metric.value === config.selectedCalculation) ?? clubMetrics[1]
  );
}

export function memberMetric(member: ClubMemberMetric, config: ClubDisplayConfig): number {
  return member[clubMetric(config).key];
}
