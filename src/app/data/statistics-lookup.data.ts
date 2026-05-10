export interface StatisticsFormatLike {
  format?: string | null;
  format_version?: number | string | null;
  index?: {
    format?: string | null;
    format_version?: number | string | null;
    distances?: string[] | null;
  } | null;
}

export interface StatisticsDistanceInfo {
  id: string;
  slug: string;
  label: string;
  icon: string;
  color: string;
  aliases: string[];
}

export const STATISTICS_DISTANCES: StatisticsDistanceInfo[] = [
  {
    id: '1',
    slug: 'sprint',
    label: 'Sprint',
    icon: 'flash_on',
    color: '#e74c3c',
    aliases: ['short']
  },
  {
    id: '2',
    slug: 'mile',
    label: 'Mile',
    icon: 'directions_run',
    color: '#f39c12',
    aliases: []
  },
  {
    id: '3',
    slug: 'medium',
    label: 'Medium',
    icon: 'timeline',
    color: '#2ecc71',
    aliases: ['middle']
  },
  {
    id: '4',
    slug: 'long',
    label: 'Long',
    icon: 'trending_up',
    color: '#3498db',
    aliases: []
  },
  {
    id: '5',
    slug: 'dirt',
    label: 'Dirt',
    icon: 'landscape',
    color: '#9b59b6',
    aliases: []
  }
];

export const STATISTICS_SCENARIO_NAMES: { [key: string]: string } = {
  '1': 'URA',
  '2': 'Aoharu',
  '3': 'MANT',
  '4': 'MANT',
  '5': 'UAF',
  '6': 'Great Food',
  '7': 'Mecha'
};

export const STATISTICS_RUNNING_STYLE_NAMES: { [key: string]: string } = {
  '1': 'Front Runner',
  '2': 'Pace Chaser',
  '3': 'Late Surger',
  '4': 'End Closer'
};

const DISTANCE_BY_KEY = new Map<string, StatisticsDistanceInfo>();

for (const distance of STATISTICS_DISTANCES) {
  [distance.id, distance.slug, distance.label, ...distance.aliases].forEach(alias => {
    DISTANCE_BY_KEY.set(alias.toLowerCase(), distance);
  });
}

export function isIdsStatisticsFormat(dataset?: StatisticsFormatLike | null): boolean {
  const format = dataset?.format ?? dataset?.index?.format;
  const version = dataset?.format_version ?? dataset?.index?.format_version;

  return format === 'ids-v1' || Number(version ?? 0) >= 2;
}

export function resolveStatisticsDistance(distance: string | number | null | undefined): StatisticsDistanceInfo | null {
  if (distance === null || distance === undefined) {
    return null;
  }

  const key = String(distance).trim().toLowerCase();
  return DISTANCE_BY_KEY.get(key) ?? null;
}

export function toStatisticsDistanceOption(distance: string | number, idsFormat: boolean): string {
  const resolved = resolveStatisticsDistance(distance);
  if (resolved) {
    return idsFormat ? resolved.id : resolved.slug;
  }

  return String(distance).trim().toLowerCase();
}

export function toStatisticsDistanceFileName(distance: string | number, idsFormat: boolean): string {
  const resolved = resolveStatisticsDistance(distance);
  if (resolved) {
    return idsFormat ? resolved.id : resolved.slug;
  }

  return String(distance).trim().toLowerCase();
}

export function getStatisticsDistanceLabel(distance: string | number | null | undefined): string {
  const resolved = resolveStatisticsDistance(distance);
  if (resolved) {
    return resolved.label;
  }

  return distance === null || distance === undefined ? '' : String(distance);
}

export function getStatisticsDistanceIcon(distance: string | number | null | undefined): string {
  return resolveStatisticsDistance(distance)?.icon ?? 'track_changes';
}

export function getStatisticsDistanceColor(distance: string | number | null | undefined): string {
  return resolveStatisticsDistance(distance)?.color ?? '#7f8c8d';
}

export function getStatisticsScenarioName(scenarioId: string | number, data?: any): string {
  if (data?.name) {
    return data.name;
  }

  const key = String(scenarioId);
  return STATISTICS_SCENARIO_NAMES[key] ?? `Scenario ${key}`;
}

export function getStatisticsRunningStyleName(runningStyleId: string | number): string {
  const key = String(runningStyleId);
  return STATISTICS_RUNNING_STYLE_NAMES[key] ?? key;
}