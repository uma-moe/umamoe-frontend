import { QueryCache } from '@/services/data/query-cache';
import { appHttp } from '@/services/http/app-http';
import type { ActivityHall, ActivityQuery, ActivityReport } from '@/lib/activity/activity-types';

export type { ActivityHall, ActivityQuery, ActivityReport, ActivityScore } from '@/lib/activity/activity-types';

const cache = new QueryCache();

export const activityRepository = {
  hall(query: ActivityQuery, refresh = false): Promise<ActivityHall> {
    return cache.get(`activity:hall:${JSON.stringify(query)}`, 60_000, () => appHttp.request<ActivityHall>('/api/v4/shame/hall', { query: { page: query.page, limit: query.limit, query: query.query, sort_by: query.sortBy === 'score' ? undefined : query.sortBy, min_score: query.minScore, min_days: query.minDays } }), refresh);
  },
  report(viewerId: number, refresh = false): Promise<ActivityReport> {
    return cache.get(`activity:viewer:${viewerId}`, 60_000, () => appHttp.request<ActivityReport>(`/api/v4/shame/viewer/${viewerId}`), refresh);
  }
};
