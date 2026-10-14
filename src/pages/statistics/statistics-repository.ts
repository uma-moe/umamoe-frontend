import { fetchJsonAsset } from '@/lib/catalog/json-asset';
import type { CharacterStatistics, DistanceStatistics, GlobalStatistics, StatisticsDataset } from '@/lib/statistics/statistics-types';
import { QueryCache } from '@/services/data/query-cache';
import { statisticsDistanceId } from '@/lib/statistics/statistics';
import { resourceRepository } from '@/lib/catalog/resource-repository';
import { characterImagePath, type CharacterCatalogEntry, type CharacterNames } from '@/lib/catalog/character-catalog';
import { loadLiveSupportCards, supportCardImagePath } from '@/lib/catalog/support-card-catalog';
import { normalizeSkill, skillImage } from '@/lib/catalog/skill-catalog';
import { supportTypeName } from '@/lib/supports/support-card';

export interface StatisticsCatalogEntry { id: string; title: string; tags: string[]; image?: string; detail?: string; }

export type { CharacterStatistics, DistributionItem, GlobalStatistics, MetricGroup, StatDistribution, StatisticsDataset, StatisticsScope } from '@/lib/statistics/statistics-types';

const cache = new QueryCache();
resourceRepository.onUpdate(name => { if (['character', 'character_names', 'support-cards-db', 'skills'].includes(name)) cache.invalidate('statistics:catalog'); });

function path(value: string): string {
  return /^https?:\/\//i.test(value) || value.startsWith('/') ? value : `/${value}`;
}

function compressed(dataset: StatisticsDataset): boolean {
  return Number(dataset.format_version ?? dataset.index.format_version ?? 0) >= 4;
}

export const statisticsRepository = {
  async catalog(): Promise<{ characters: StatisticsCatalogEntry[]; supports: StatisticsCatalogEntry[]; skills: StatisticsCatalogEntry[] }> {
    return cache.get('statistics:catalog', 60 * 60_000, async () => {
      const [characters, names, supports, skills] = await Promise.all([
        resourceRepository.load<CharacterCatalogEntry[]>('character'),
        resourceRepository.load<CharacterNames>('character_names'),
        loadLiveSupportCards(),
        resourceRepository.load('skills', false, data => {
          if (!Array.isArray(data)) throw new Error('Invalid skill resource.');
          return data.map(normalizeSkill).filter(skill => Number.isFinite(skill.skill_id) && skill.skill_id > 0);
        })
      ]);
      return {
        characters: characters.map(character => {
          const id = String(character.id), localized = names[String(Math.floor(Number(id) / 100))];
          return { id, title: localized?.name || character.name, detail: localized?.skins?.[id.slice(-2)] || character.subtitle, image: characterImagePath(Number(id)), tags: [] };
        }),
        supports: supports.map(card => ({ id: card.id, title: card.name, image: supportCardImagePath(card.id), tags: [card.type === 'group' ? 'Group' : supportTypeName(card.type), card.rarity === 3 ? 'SSR' : card.rarity === 2 ? 'SR' : 'R'] })),
        skills: skills.map(skill => ({ id: String(skill.skill_id), title: skill.name, image: skillImage(skill.icon), tags: [] }))
      };
    });
  },

  datasets(refresh = false): Promise<StatisticsDataset[]> {
    return cache.get('statistics:datasets', 60 * 60_000, async () => {
      const result = await fetchJsonAsset<{ datasets: StatisticsDataset[] }>('/assets/statistics/datasets.json', { cache: refresh ? 'reload' : 'default' });
      return [...(result.datasets ?? [])].sort((left, right) => Date.parse(right.date ?? right.index.generated_at ?? '') - Date.parse(left.date ?? left.index.generated_at ?? ''));
    }, refresh);
  },

  global(dataset: StatisticsDataset, refresh = false): Promise<GlobalStatistics> {
    const suffix = compressed(dataset) ? '.gz' : '';
    return cache.get(`statistics:global:${dataset.id}`, 60 * 60_000, async () => {
      const stats = await fetchJsonAsset<GlobalStatistics>(`${path(dataset.basePath)}/global/global.json${suffix}`, { cache: refresh ? 'reload' : 'default' });
      if (compressed(dataset)) return stats;
      // Pre-v4 datasets store distances separately; v4 embeds them in global.
      const idsFormat = (dataset.format ?? dataset.index.format) === 'ids-v1' || Number(dataset.format_version ?? dataset.index.format_version ?? 0) >= 2;
      const slugs = ['sprint', 'mile', 'medium', 'long', 'dirt'];
      const distances = await Promise.allSettled((dataset.index.distances ?? []).map(async (distance) => {
        if (stats.by_distance?.[distance]) return [distance, stats.by_distance[distance]] as const;
        const id = Number(statisticsDistanceId(distance));
        const file = idsFormat ? String(id || distance) : slugs[id - 1] ?? distance;
        const data = await fetchJsonAsset<DistanceStatistics>(`${path(dataset.basePath)}/distance/${file}.json`, { cache: refresh ? 'reload' : 'default' });
        return [distance, data] as const;
      }));
      return { ...stats, by_distance: { ...stats.by_distance, ...Object.fromEntries(distances.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])) } };
    }, refresh);
  },

  character(dataset: StatisticsDataset, characterId: string, refresh = false): Promise<CharacterStatistics> {
    if (!dataset.index.character_ids?.includes(characterId)) return Promise.reject(new Error(`Character ${characterId} is not available in this statistics dataset.`));
    const suffix = compressed(dataset) ? '.gz' : '';
    return cache.get(`statistics:character:${dataset.id}:${characterId}`, 60 * 60_000, () => fetchJsonAsset<CharacterStatistics>(`${path(dataset.basePath)}/characters/${characterId}.json${suffix}`, { cache: refresh ? 'reload' : 'default' }), refresh);
  }
};
