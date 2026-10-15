import { afterAll, beforeAll, vi } from 'vitest';
import { resourceFixtures } from './resource-data';
import { loadFactors } from '../../src/lib/game-data/factors/factors';

export function setupResourceFixtures(): void {
  beforeAll(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/manifest.json')) return Response.json({ version: 'test' });
        const name =
          url
            .split('/')
            .at(-1)
            ?.replace(/\.json(?:\.gz)?(?:\?.*)?$/, '') ?? '';

        return name in resourceFixtures
          ? Response.json(resourceFixtures[name])
          : new Response(null, { status: 404 });
      })
    );

    await loadFactors();
  });

  afterAll(() => vi.unstubAllGlobals());
}
