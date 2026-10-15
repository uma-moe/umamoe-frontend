import {
  aggregateMetric,
  aggregateStatDistributions,
  compositionLabel,
  meanStats,
  metricMaps,
  type StatisticsFilters
} from '@/lib/statistics/statistics';
import { characterName, skillName, supportName, supportRow } from './statistics-format';
import {
  characterRows as rankCharacters,
  classDistribution,
  statAveragesByClass
} from './statistics-selection';
import type {
  GlobalStatistics,
  StatDistribution,
  StatisticsCatalogEntry
} from './statistics-repository';

export interface StatisticsViewSource {
  stats: () => GlobalStatistics | undefined;
  filters: () => StatisticsFilters;
  characters: () => StatisticsCatalogEntry[];
  availableCharacters: () => StatisticsCatalogEntry[];
  supportCatalog: () => Map<string, StatisticsCatalogEntry>;
  skillCatalog: () => Map<string, StatisticsCatalogEntry>;
}

export class StatisticsView {
  #source: StatisticsViewSource;

  constructor(source: StatisticsViewSource) {
    this.#source = source;
  }

  get stats(): GlobalStatistics | undefined {
    return this.#source.stats();
  }

  get filters(): StatisticsFilters {
    return this.#source.filters();
  }

  get characters(): StatisticsCatalogEntry[] {
    return this.#source.characters();
  }

  get supportCatalog(): Map<string, StatisticsCatalogEntry> {
    return this.#source.supportCatalog();
  }

  get skillCatalog(): Map<string, StatisticsCatalogEntry> {
    return this.#source.skillCatalog();
  }

  get availableCharacters(): StatisticsCatalogEntry[] {
    return this.#source.availableCharacters();
  }

  classData = $derived(this.stats ? classDistribution(this.stats, this.filters) : []);
  selectedSamples = $derived(this.classData.reduce((total, item) => total + item.value, 0));
  classAverages = $derived(
    this.stats ? statAveragesByClass(this.stats, this.filters) : { categories: [], series: [] }
  );
  umaData = $derived(
    this.stats
      ? aggregateMetric(metricMaps(this.stats, 'uma_distribution', this.filters), (id, item) =>
          characterName(this.characters, id, item)
        ).map((item) => ({
          ...item,
          image: this.characters.find((entry) => entry.id === item.id)?.image,
          detail: this.characters.find((entry) => entry.id === item.id)?.detail
        }))
      : []
  );
  characterRows = $derived(rankCharacters(this.availableCharacters, this.umaData));
  deckData = $derived(
    this.stats
      ? aggregateMetric(
          metricMaps(this.stats, 'support_card_combinations', this.filters),
          (id, item) => compositionLabel(item, id)
        )
      : []
  );
  supports = $derived(
    this.stats
      ? aggregateMetric(metricMaps(this.stats, 'support_cards', this.filters), (id, item) =>
          supportName(this.supportCatalog, id, item)
        )
      : []
  );
  supportData = $derived(this.supports.map((item) => supportRow(this.supportCatalog, item)));
  skillData = $derived(
    this.stats
      ? aggregateMetric(metricMaps(this.stats, 'skills', this.filters), (id, item) =>
          skillName(this.skillCatalog, id, item)
        ).map((item) => ({
          ...item,
          image: this.skillCatalog.get(item.id)?.image
        }))
      : []
  );
  statData = $derived(
    this.stats
      ? aggregateStatDistributions(
          metricMaps(this.stats, 'stat_averages', this.filters) as Array<
            Record<string, StatDistribution>
          >
        )
      : {}
  );
  averageStats = $derived(
    this.stats
      ? meanStats(
          metricMaps(this.stats, 'stat_averages', this.filters) as Array<
            Record<string, StatDistribution>
          >
        )
      : {}
  );
  commonClass = $derived(
    [...this.classData].sort((a, b) => b.value - a.value).find((item) => item.value > 0)
  );
}
