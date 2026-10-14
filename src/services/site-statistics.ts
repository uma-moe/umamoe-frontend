import { appHttp } from './http/app-http';

export interface SiteStatistics {
  today: { tasks_24h: number };
  freshness: { accounts_24h: number; accounts_7d: number; umas_tracked: number };
}

export function loadSiteStatistics(signal: AbortSignal): Promise<SiteStatistics> {
  return appHttp.request('/api/stats', { query: { days: 30 }, signal });
}
