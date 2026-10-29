import { RequestCache } from '@/services/cache/request-cache';
import { appHttp } from '@/services/http/app-http';
import { umaLogsApi } from '@/services/http/service-endpoints';

export interface UmaLogsManifestEntry {
  cmId: string;
  cmLabel: string;
  generatedAt: string;
  totalRaces: number;
  trackSummary?: string;
}

export interface UmaLogsManifest {
  datasets: UmaLogsManifestEntry[];
}

export interface UmaLogsCharacterStats {
  charaId: number;
  charaName: string;
  totalRaces: number;
  wins: number;
  top3Finishes: number;
  avgFinishPosition: number;
  avgFinishTime: number;
}

export interface UmaLogsStrategyStats {
  strategy: number;
  strategyName: string;
  totalRaces: number;
  wins: number;
  top3Finishes: number;
  avgFinishPosition: number;
}

export interface UmaLogsGroup {
  raceId: string;
  courseId: number;
  trackLabel: string;
  raceCount: number;
  stats: {
    totalRaces: number;
    totalHorses: number;
    avgRaceDistance: number;
    characterStats: UmaLogsCharacterStats[];
    strategyStats: UmaLogsStrategyStats[];
  };
}

export interface UmaLogsDataset {
  generatedAt: string;
  cmId?: string;
  cmLabel?: string;
  groups: UmaLogsGroup[];
}

export interface UmaLogsQueryResponse {
  columns: { key: string; label: string; type: 'number' | 'percent' | 'dimension' }[];
  rows: Record<string, unknown>[];
  limit: number;
  offset: number;
  source?: 'aggregate-cache' | 'live' | 'compiled';
  [key: string]: unknown;
}

export interface UmaLogsReplayTeamMember {
  frameOrder: number;
  finishOrder: number;
  charaId: number;
  cardId: number;
  strategy: number;
  isDebuffer: boolean;
  rankScore?: number;
}

export interface UmaLogsReplayTeam {
  teamId: number;
  isWinnerTeam: boolean;
  teamSignature: string;
  members: UmaLogsReplayTeamMember[];
}

export interface UmaLogsReplayRow {
  raceUid: string;
  finishTime: number;
  ingestedAt: string;
  roomRunawayCount: number;
  roomFrontCount: number;
  roomPaceCount: number;
  roomLateCount: number;
  roomEndCount: number;
  winnerCardId: number;
  winnerCharaId: number;
  winnerStrategy: number;
  winnerTeam: UmaLogsReplayTeam;
  enemyTeams: UmaLogsReplayTeam[];
}

export interface UmaLogsReplaySearchResponse {
  total: number;
  races: UmaLogsReplayRow[];
}

export type UmaLogsExplorerSort = 'label' | 'entries' | 'teams' | 'wins' | 'teamWins' | 'awPct';
export interface UmaLogsExplorerRow {
  key: string;
  label: string;
  sublabel?: string;
  charaId?: number;
  cardId?: number;
  strategy?: number;
  isDebuffer?: boolean;
  entries: number;
  teams: number;
  wins: number;
  teamWins: number;
  awPct: number;
  teamWinPct: number;
  meanFinishTime?: number;
  medianFinishTime?: number;
}

export interface UmaLogsExplorerResponse {
  totalTeams: number;
  filteredTeams: number;
  filteredTeamWins: number;
  filteredTeamWinPct: number;
  filteredEntries: number;
  rows: UmaLogsExplorerRow[];
}

const cache = new RequestCache();
function assertManifest(value: UmaLogsManifest): UmaLogsManifest {
  if (!value || !Array.isArray(value.datasets))
    throw new Error('UmaLogs returned an invalid manifest.');
  return value;
}

function assertDataset(value: UmaLogsDataset): UmaLogsDataset {
  if (!value || !Array.isArray(value.groups))
    throw new Error('UmaLogs returned an invalid dataset summary.');
  return value;
}

export const cmLogsRepository = {
  manifest(refresh = false): Promise<UmaLogsManifest> {
    return cache.get(
      'umalogs:manifest',
      5 * 60_000,
      async () =>
        assertManifest(await appHttp.request<UmaLogsManifest>(umaLogsApi('/api/umalogs/manifest'))),
      refresh
    );
  },

  summary(cmId: string, refresh = false): Promise<UmaLogsDataset> {
    const safeId = encodeURIComponent(cmId);
    return cache.get(
      `umalogs:summary:${cmId}`,
      5 * 60_000,
      async () =>
        assertDataset(
          await appHttp.request<UmaLogsDataset>(umaLogsApi(`/api/umalogs/${safeId}/summary`))
        ),
      refresh
    );
  },

  query(
    cmId: string,
    courseId: number,
    query: string,
    signal?: AbortSignal
  ): Promise<UmaLogsQueryResponse> {
    return appHttp.request<UmaLogsQueryResponse>(
      umaLogsApi(`/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/queries/run`),
      {
        method: 'POST',
        signal,
        body: { query, compileOnly: false }
      }
    );
  },

  replays(
    cmId: string,
    courseId: number,
    options: {
      sortKey: 'date' | 'finishTime';
      sortDir: 'asc' | 'desc';
      limit: number;
      offset: number;
    },
    signal?: AbortSignal
  ): Promise<UmaLogsReplaySearchResponse> {
    return appHttp.request<UmaLogsReplaySearchResponse>(
      umaLogsApi(`/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/replays/query`),
      {
        method: 'POST',
        signal,
        body: options
      }
    );
  },

  explorer(
    cmId: string,
    courseId: number,
    sortKey: UmaLogsExplorerSort,
    sortDesc: boolean,
    signal?: AbortSignal
  ): Promise<UmaLogsExplorerResponse> {
    const orderField: Record<UmaLogsExplorerSort, string> = {
      label: 'character',
      entries: 'entries',
      teams: 'teams',
      wins: 'wins',
      teamWins: 'team_wins',
      awPct: 'win_rate'
    };

    return appHttp.request<UmaLogsExplorerResponse>(
      umaLogsApi(`/api/umalogs/${encodeURIComponent(cmId)}/groups/${courseId}/explorer/query`),
      {
        method: 'POST',
        signal,
        body: {
          querySpec: {
            version: 1,
            subject: 'teams',
            where: null,
            select: [
              'character',
              'style',
              'is_debuffer',
              'entries',
              'teams',
              'wins',
              'team_wins',
              'team_win_rate'
            ],
            groupBy: ['character', 'style', 'is_debuffer'],
            orderBy: [{ field: orderField[sortKey], direction: sortDesc ? 'desc' : 'asc' }],
            limit: 100
          },
          sortKey,
          sortDesc,
          selectedRowKey: null
        }
      }
    );
  },

  invalidate(): void {
    cache.invalidate('umalogs:');
  }
};
