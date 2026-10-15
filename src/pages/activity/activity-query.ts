import type { ActivitySort } from '@/lib/activity/activity-types';

export interface ActivityQuery {
  page: number;
  pageSize: string;
  search: string;
  sortBy: ActivitySort;
  minScore: string;
  minDays: string;
}

export const sortOptions = (
  [
    ['score', 'Suspicion score'],
    ['short_fan_gain', 'Short high-fan score'],
    ['short_high_fan', 'Short high-fan careers'],
    ['online_streak', 'Online streak'],
    ['active_time', 'Active time'],
    ['behavior_change', 'Behavior spike'],
    ['careers_per_hour', 'Careers/hour'],
    ['fans_per_minute', 'Fans/minute'],
    ['peak_fans_per_minute', 'Peak fans/minute'],
    ['avg_career_length', 'Shortest avg career'],
    ['careers', 'Total careers'],
    ['max_session', 'Longest session']
  ] satisfies Array<[ActivitySort, string]>
).map(([value, label]) => ({ value, label }));

export const scoreOptions = [
  { value: '0', label: 'All scores' },
  { value: '40', label: '40+' },
  { value: '60', label: '60+' },
  { value: '80', label: '80+' }
];

export const dayOptions = [1, 3, 7, 14, 30].map((value) => ({
  value: String(value),
  label: `${value}+ observed days`
}));

export const pageSizeOptions = [25, 50, 100, 200].map((value) => ({
  value: String(value),
  label: String(value)
}));

export function readActivityQuery(search: string): ActivityQuery {
  const query = new URLSearchParams(search);
  const requestedSort = query.get('sortBy') as ActivitySort | null;
  return {
    page: Math.max(1, Number(query.get('page') ?? 0) + 1),
    pageSize: query.get('pageSize') ?? '50',
    search: query.get('query') ?? '',
    sortBy:
      requestedSort && sortOptions.some((option) => option.value === requestedSort)
        ? requestedSort
        : 'score',
    minScore: query.get('minScore') ?? '0',
    minDays: query.get('minDays') ?? '1'
  };
}

export function writeActivityQuery(state: ActivityQuery): void {
  const url = new URL(location.href);
  const set = (key: string, value: string, defaultValue: string) =>
    value === defaultValue ? url.searchParams.delete(key) : url.searchParams.set(key, value);

  set('page', String(state.page - 1), '0');
  set('pageSize', state.pageSize, '50');
  set('query', state.search, '');
  set('sortBy', state.sortBy, 'score');
  set('minScore', state.minScore, '0');
  set('minDays', state.minDays, '1');
  history.replaceState(history.state, '', `${url.pathname}${url.search}`);
}
