import { QueryCache } from '@/services/data/query-cache';
import { appHttp } from '@/services/http/app-http';

export interface ShopItemStat { itemId: number; batches: number; appearanceRate: number; avgCopies: number; avgPrice: number; maxCopies: number; }
export interface ShopGroup { kind: string; groupId: number | string; event: string | null; raceGrade: number | null; samples: number; avgItems: number; itemCountDistribution: { itemCount: number; samples: number }[]; items: ShopItemStat[]; }
export interface ShopSummary { totals: { scheduledSamples: number; raceSamples: number }; scheduledShops: ShopGroup[]; raceGrades: ShopGroup[]; }

export interface FactorDistribution { count: number; samples: number; }
export interface FactorSourceSummary {
  eventId: number;
  label: string;
  samples: number;
  contributors: number;
  averages: { totalFactors: number; parentFactors: number; grandparentFactors: number; totalThreeStars: number; blueThreeStars: number; parentBlueThreeStars: number; grandparentBlueThreeStars: number };
  distributions: { totalFactors: FactorDistribution[]; totalThreeStars: FactorDistribution[]; blueThreeStars: FactorDistribution[]; parentBlueThreeStars: FactorDistribution[]; grandparentBlueThreeStars: FactorDistribution[] };
  topFactors: { factorId: number; copies: number; samplesWithAny: number; appearanceRate: number; avgCopies: number; category: number; stars: number }[];
  shapes: { shape: string; samples: number; percentage: number }[];
}
export interface InheritanceResearchSummary { totals: { samples: number; contributors: number }; sources: FactorSourceSummary[]; }

const cache = new QueryCache();
function assertObject<T>(value: T, key: keyof T, message: string): T {
  if (!value || typeof value !== 'object' || !Array.isArray(value[key])) throw new Error(message);
  return value;
}

export const hakurakuResearchRepository = {
  shopRefresh(refresh = false): Promise<ShopSummary> {
    return cache.get('haku:shop-refresh', 15 * 60_000, async () => {
      const data = await appHttp.request<ShopSummary>('/api/shop-refresh');
      if (!data?.totals) throw new Error('Shop Refresh returned an invalid summary.');
      return assertObject(data, 'scheduledShops', 'Shop Refresh returned an invalid group list.');
    }, refresh);
  },
  inheritanceFactors(refresh = false): Promise<InheritanceResearchSummary> {
    return cache.get('haku:inheritance-factors', 15 * 60_000, async () => assertObject(await appHttp.request<InheritanceResearchSummary>('/api/inheritance-factors'), 'sources', 'Inheritance research returned an invalid source list.'), refresh);
  }
};
