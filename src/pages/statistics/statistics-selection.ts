import {
  aggregateMetric,
  meanStats,
  metricMaps,
  statisticsDistanceId,
  type ChartDatum,
  type StatisticsFilters
} from '@/lib/statistics/statistics';
import type { ChartSeries } from './statistics-charts';
import { distanceNames } from './statistics-display';
import { allClasses, scenarioNames, statColors, statNames, title } from './statistics-format';
import type {
  DistributionItem,
  GlobalStatistics,
  StatDistribution,
  StatisticsCatalogEntry
} from './statistics-repository';

export interface DistanceBreakdownItem {
  id: string;
  name: string;
  value: number;
  percentage: number;
  leader?: ChartDatum;
  image?: string;
  means: Record<string, number>;
}

export function selectionSummary(filters: StatisticsFilters): string {
  return [
    filters.scenarioIds.length === filters.allScenarioIds.length
      ? 'All scenarios'
      : filters.scenarioIds.map((id) => scenarioNames[id] ?? id).join(', ') || 'No scenarios',
    filters.classIds.length === allClasses.length
      ? 'All classes'
      : filters.classIds.length
        ? `Classes ${filters.classIds.join(', ')}`
        : 'No classes',
    filters.distanceIds.length === filters.allDistanceIds.length
      ? 'All distances'
      : filters.distanceIds.map((id) => distanceNames[id] ?? id).join(', ') || 'No distances'
  ].join(' · ');
}

export function classDistribution(data: GlobalStatistics, state: StatisticsFilters): ChartDatum[] {
  if (state.allDistanceIds.length && !state.distanceIds.length) return [];
  const values = state.classIds.map((classId) => {
    let value = 0;
    for (const distanceId of state.distanceIds) {
      const key = Object.keys(data.by_distance ?? {}).find(
        (id) => statisticsDistanceId(id) === statisticsDistanceId(distanceId)
      );

      const entry = key ? data.by_distance?.[key]?.by_team_class?.[classId] : undefined;
      if (!entry) continue;
      const overall = entry.overall ?? (!entry.by_scenario ? entry : undefined);
      if (state.scenarioIds.length >= state.allScenarioIds.length && overall)
        value += overall.total_entries ?? overall.total_trained_umas ?? 0;
      else
        for (const scenarioId of state.scenarioIds)
          value +=
            entry.by_scenario?.[scenarioId]?.total_entries ??
            entry.by_scenario?.[scenarioId]?.total_trained_umas ??
            0;
    }

    if (!state.distanceIds.length) {
      const entry = data.team_class_distribution?.[classId];
      value =
        typeof entry === 'number'
          ? entry
          : Number((entry as DistributionItem | undefined)?.count ?? 0);
    }

    return { id: classId, name: `Class ${classId}`, value };
  });

  const total = values.reduce((sum, item) => sum + item.value, 0);
  return values
    .map((item) => ({ ...item, percentage: total ? (item.value / total) * 100 : 0 }))
    .sort((a, b) => Number(a.id) - Number(b.id));
}

function classStatMap(
  data: GlobalStatistics,
  classId: string,
  state: StatisticsFilters
): Record<string, number> {
  return meanStats(
    metricMaps(data, 'stat_averages', { ...state, classIds: [classId] }) as Array<
      Record<string, StatDistribution>
    >
  );
}

export function statAveragesByClass(
  data: GlobalStatistics,
  state: StatisticsFilters
): { categories: string[]; series: ChartSeries[] } {
  const categories = state.classIds.map((id) => `Class ${id}`);
  const maps = state.classIds.map((id) => classStatMap(data, id, state));
  if (!maps.some((map) => Object.keys(map).length)) return { categories: [], series: [] };

  return {
    categories,
    series: ['speed', 'stamina', 'power', 'guts', 'wiz'].map((stat) => ({
      name: statNames[stat] ?? title(stat),
      values: maps.map((map) => map[stat] ?? 0),
      color: statColors[stat]
    }))
  };
}

export function distanceBreakdown(
  stats: GlobalStatistics,
  filters: StatisticsFilters,
  selectedSamples: number,
  characters: StatisticsCatalogEntry[],
  characterName: (id: string, item?: DistributionItem) => string
): DistanceBreakdownItem[] {
  return filters.distanceIds.map((id) => {
    const scope = { ...filters, distanceIds: [id] };

    const value = classDistribution(stats, scope).reduce((sum, item) => sum + item.value, 0);
    const leader = aggregateMetric(metricMaps(stats, 'uma_distribution', scope), characterName)[0];
    return {
      id,
      name: distanceNames[statisticsDistanceId(id)] ?? title(id),
      value,
      percentage: selectedSamples ? (value / selectedSamples) * 100 : 0,
      leader,
      image: characters.find((entry) => entry.id === leader?.id)?.image,
      means: meanStats(
        metricMaps(stats, 'stat_averages', scope) as Array<Record<string, StatDistribution>>
      )
    };
  });
}

export function characterRows(
  availableCharacters: StatisticsCatalogEntry[],
  umaData: ChartDatum[]
): Array<ChartDatum & { detail?: string }> {
  const usage = new Map(umaData.map((item) => [item.id, item]));
  return availableCharacters
    .map((entry) => ({
      id: entry.id,
      name: entry.title,
      detail: entry.detail,
      image: entry.image,
      value: usage.get(entry.id)?.value ?? 0,
      percentage: usage.get(entry.id)?.percentage ?? 0
    }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}
