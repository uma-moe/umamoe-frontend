import type {
  CharacterStatistics,
  DistributionItem,
  GlobalStatistics,
  StatDistribution,
  StatisticsScope
} from './statistics-types';

export interface StatisticsFilters {
  classIds: string[];
  scenarioIds: string[];
  distanceIds: string[];
  allScenarioIds: string[];
  allDistanceIds: string[];
}

export interface ChartDatum {
  id: string;
  name: string;
  value: number;
  percentage?: number;
  image?: string;
  composition?: Record<string, number>;
}

const reserved = new Set([
  'overall',
  'by_team_class',
  'by_scenario',
  'total_entries',
  'total_trainers',
  'total_trained_umas'
]);

export function entryCount(entry: DistributionItem | number | undefined): number {
  return typeof entry === 'number'
    ? entry
    : Number(
        entry?.total ??
          entry?.count ??
          entry?.usage_count ??
          entry?.total_usage ??
          entry?.total_count ??
          0
      );
}

export function metricMaps(
  stats: GlobalStatistics,
  metric: keyof StatisticsScope,
  filters: StatisticsFilters
): Array<Record<string, DistributionItem | number>> {
  if (!filters.classIds.length || (filters.allDistanceIds.length && !filters.distanceIds.length))
    return [];
  const distances = Object.keys(stats.by_distance ?? {}).filter((key) =>
    filters.distanceIds.some((id) => statisticsDistanceId(id) === statisticsDistanceId(key))
  );

  if (distances.length) {
    const maps = distances.flatMap((distanceId) => {
      const distance = stats.by_distance?.[distanceId];
      return filters.classIds.flatMap((classId) =>
        scopes<StatisticsScope>(distance?.by_team_class?.[classId], filters).flatMap((scope) => {
          const map = scope?.[metric];
          return map && typeof map === 'object'
            ? [map as Record<string, DistributionItem | number>]
            : [];
        })
      );
    });

    if (maps.length) return maps;
    // A selected scope with no matches must not reappear as unfiltered data.
    if (distances.length === filters.distanceIds.length) return [];
  }

  const group = stats[metric as keyof GlobalStatistics] as Record<string, unknown> | undefined;
  if (!group) return [];
  const byClass = group.by_team_class as
    | Record<
        string,
        {
          overall?: Record<string, DistributionItem | number>;
          by_scenario?: Record<string, Record<string, DistributionItem | number>>;
        }
      >
    | undefined;

  if (byClass)
    return filters.classIds.flatMap((classId) =>
      scopes<Record<string, DistributionItem | number>>(byClass[classId], filters)
    );
  if (filters.scenarioIds.length < filters.allScenarioIds.length && group.by_scenario) {
    const byScenario = group.by_scenario as Record<
      string,
      Record<string, DistributionItem | number>
    >;

    const selected: Array<Record<string, DistributionItem | number>> = [];
    for (const id of filters.scenarioIds) if (byScenario[id]) selected.push(byScenario[id]);
    return selected;
  }

  return group.overall ? [group.overall as Record<string, DistributionItem | number>] : [];
}

function scopes<T>(
  entry: { overall?: T; by_scenario?: Record<string, T> } | undefined,
  filters: StatisticsFilters
): T[] {
  if (!entry) return [];
  if (!('overall' in entry) && !('by_scenario' in entry)) return [entry as T];
  if (
    entry.overall &&
    (filters.scenarioIds.length >= filters.allScenarioIds.length || !entry.by_scenario)
  )
    return [entry.overall];
  const selected = filters.scenarioIds.flatMap((id) =>
    entry.by_scenario?.[id] ? [entry.by_scenario[id]] : []
  );

  return selected;
}

export function statisticsDistanceId(value: string): string {
  return (
    (
      {
        sprint: '1',
        short: '1',
        mile: '2',
        medium: '3',
        middle: '3',
        long: '4',
        dirt: '5'
      } as Record<string, string>
    )[value.toLowerCase()] ?? value
  );
}

export function characterScopes(
  data: CharacterStatistics,
  filters: StatisticsFilters
): StatisticsScope[] {
  if (!filters.classIds.length || (filters.allDistanceIds.length && !filters.distanceIds.length))
    return [];
  const distances = new Set(filters.distanceIds.map(statisticsDistanceId));
  if (Object.keys(data.by_distance ?? {}).length) {
    return Object.entries(data.by_distance!)
      .filter(([id]) => distances.has(statisticsDistanceId(id)))
      .flatMap(([, distance]) =>
        filters.classIds.flatMap((id) =>
          scopes<StatisticsScope>(distance.by_team_class?.[id], filters)
        )
      );
  }

  return scopes<StatisticsScope>(data, filters);
}

export function characterUsage(
  data: CharacterStatistics,
  filters: StatisticsFilters
): { distances: ChartDatum[]; classes: ChartDatum[] } {
  const count = (items: StatisticsScope[]) =>
    items.reduce(
      (sum, item) =>
        sum + (item.total_entries ?? item.count ?? item.total ?? item.total_trained_umas ?? 0),
      0
    );

  if (!Object.keys(data.by_distance ?? {}).length) {
    if (!characterScopes(data, filters).length) return { distances: [], classes: [] };

    return {
      distances: aggregateMetric([data.global?.distance_distribution ?? {}]),
      classes: aggregateMetric([data.global?.team_class_distribution ?? {}])
    };
  }

  return {
    distances: aggregateMetric([
      Object.fromEntries(
        filters.distanceIds.map((id) => [
          id,
          count(characterScopes(data, { ...filters, distanceIds: [id] }))
        ])
      )
    ]),
    classes: aggregateMetric([
      Object.fromEntries(
        filters.classIds.map((id) => [
          id,
          count(characterScopes(data, { ...filters, classIds: [id] }))
        ])
      )
    ]).sort((a, b) => Number(a.id) - Number(b.id))
  };
}

/** Angular charts average the selected class/scenario means, not the pooled sample means. */
export function meanStats(maps: Array<Record<string, StatDistribution>>): Record<string, number> {
  const totals = new Map<string, { total: number; count: number }>();
  for (const map of maps)
    for (const [stat, item] of Object.entries(map)) {
      if (item.mean === undefined || !Number.isFinite(item.mean)) continue;
      const entry = totals.get(stat) ?? { total: 0, count: 0 };

      entry.total += item.mean;
      entry.count += 1;
      totals.set(stat, entry);
    }

  return Object.fromEntries(
    [...totals].map(([stat, item]) => [stat, Math.round(item.total / item.count)])
  );
}

export function aggregateMetric(
  maps: Array<Record<string, DistributionItem | number | undefined>>,
  label: (id: string, item?: DistributionItem) => string = (id) => id
): ChartDatum[] {
  const totals = new Map<string, { value: number; item?: DistributionItem }>();
  for (const map of maps)
    for (const [key, raw] of Object.entries(map)) {
      if (reserved.has(key) || key.startsWith('total_')) continue;
      const item = typeof raw === 'number' ? undefined : raw;
      const id = String(item?.character_id ?? item?.id ?? key);
      const value = entryCount(raw);
      if (!Number.isFinite(value) || value <= 0) continue;
      totals.set(id, {
        value: (totals.get(id)?.value ?? 0) + value,
        item: item ?? totals.get(id)?.item
      });
    }

  const total = [...totals.values()].reduce((sum, item) => sum + item.value, 0);
  return [...totals]
    .map(([id, item]) => ({
      id,
      name: label(id, item.item),
      value: item.value,
      ...(item.item?.composition ? { composition: item.item.composition } : {}),
      percentage: total ? (item.value / total) * 100 : 0
    }))
    .sort((left, right) => right.value - left.value);
}

export function aggregateStatDistributions(
  maps: Array<Record<string, StatDistribution>>
): Record<string, StatDistribution> {
  const result: Record<string, StatDistribution> = {};

  for (const map of maps)
    for (const [stat, source] of Object.entries(map)) {
      const target = (result[stat] ??= { count: 0, mean: 0, histogram: {} });
      const oldCount = target.count ?? 0;
      const count = source.count ?? 0;
      const nextCount = oldCount + count;
      target.mean = nextCount
        ? ((target.mean ?? 0) * oldCount + (source.mean ?? 0) * count) / nextCount
        : 0;
      target.count = nextCount;
      target.min = Math.min(
        target.min ?? Number.POSITIVE_INFINITY,
        source.min ?? Number.POSITIVE_INFINITY
      );
      target.max = Math.max(
        target.max ?? Number.NEGATIVE_INFINITY,
        source.max ?? Number.NEGATIVE_INFINITY
      );
      for (const [bucket, value] of Object.entries(source.histogram ?? {}))
        target.histogram![bucket] = (target.histogram![bucket] ?? 0) + value;
    }

  return result;
}

export function statMaps(
  stats: GlobalStatistics,
  filters: StatisticsFilters
): Array<Record<string, StatDistribution>> {
  return metricMaps(stats, 'stat_averages', filters) as Array<Record<string, StatDistribution>>;
}

export function histogram(distribution?: StatDistribution): ChartDatum[] {
  const start = (bucket: string) => Number(bucket.split('-')[0]) || 0;
  return Object.entries(distribution?.histogram ?? {})
    .map(([id, value]) => ({ id, name: id, value }))
    .sort((a, b) => start(a.id) - start(b.id));
}

export function compositionLabel(item: DistributionItem | undefined, fallback: string): string {
  const composition = item?.composition;
  if (!composition) return fallback.replaceAll('_', ' ');
  return Object.entries(composition)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${count}× ${type === 'wisdom' ? 'wit' : type}`)
    .join(', ');
}

export function supportTypeDistribution(
  decks: ChartDatum[],
  cards: ChartDatum[],
  cardType: (id: string) => string
): ChartDatum[] {
  const counts: Record<string, number> = {};

  const normalizeType = (type: string) =>
    ['wit', 'wisdom', 'intelligence', 'int'].includes(type.toLowerCase())
      ? 'wiz'
      : type.toLowerCase();

  for (const deck of decks)
    for (const [rawType, count] of Object.entries(deck.composition ?? {})) {
      if (!Number.isFinite(count) || count <= 0) continue;
      const type = normalizeType(rawType);
      counts[type] = (counts[type] ?? 0) + deck.value * count;
    }

  if (!Object.keys(counts).length)
    for (const card of cards) {
      const type = normalizeType(cardType(card.id));
      counts[type] = (counts[type] ?? 0) + card.value;
    }

  return aggregateMetric([counts], (id) =>
    id === 'wiz' ? 'Wit' : id.charAt(0).toUpperCase() + id.slice(1)
  );
}
