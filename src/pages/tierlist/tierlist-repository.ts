import { fetchJsonAsset } from '@/lib/catalog/json-asset';
import type { TierlistData } from '@/lib/tierlist/tierlist';
import { QueryCache } from '@/services/data/query-cache';
const cache = new QueryCache();
export const tierlistRepository = { load(refresh = false): Promise<TierlistData> { return cache.get('tierlist:data', 24 * 60 * 60_000, () => fetchJsonAsset<TierlistData>('/assets/data/precomputed-tierlist.json', { cache: refresh ? 'reload' : 'default' }), refresh); } };
