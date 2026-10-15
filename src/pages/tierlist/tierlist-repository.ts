import { fetchJsonResource } from '@/services/resources/json-response';
import type { TierlistData } from '@/lib/tierlist/tierlist';
import { RequestCache } from '@/services/cache/request-cache';
const cache = new RequestCache();
export const tierlistRepository = {
  load(refresh = false): Promise<TierlistData> {
    return cache.get(
      'tierlist:data',
      24 * 60 * 60_000,
      () =>
        fetchJsonResource<TierlistData>('/assets/data/precomputed-tierlist.json', {
          cache: refresh ? 'reload' : 'default'
        }),
      refresh
    );
  }
};
