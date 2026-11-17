import { describe, expect, it } from 'vitest';
import {
  artUrl,
  loadRacecourseModels,
  racecourseModels,
  selectVariants
} from './racecourse-models';

const ROOT = 'https://assets.uma.moe';

describe('artUrl', () => {
  it('resolves rooted and relative links against the art root', () => {
    expect(artUrl('/art/umas/100101/model.glb', '/art/index.json')).toBe(
      `${ROOT}/art/umas/100101/model.glb`
    );
    expect(artUrl('model.glb', '/art/racecourses/10006/index.json')).toBe(
      `${ROOT}/art/racecourses/10006/model.glb`
    );
  });
});

describe('selectVariants', () => {
  const parts = [
    '0000_002.glb',
    '0001_002.glb',
    '2000_000.glb',
    '4000_100.glb',
    '4000_200.glb',
    '6000_100.glb',
    '6000_442.glb',
    '7001_010.glb',
    '7001_030.glb',
    '7013_000.glb'
  ].map((file) => `/art/racecourses/10001/parts/${file}`);

  it('keeps one variant per slot, closest to the wanted season, weather and time', () => {
    expect(selectVariants(parts).map((link) => link.split('/').pop())).toEqual([
      '0000_002.glb',
      '0001_002.glb',
      '6000_100.glb',
      '7001_010.glb'
    ]);
  });

  it('leaves out the rails, signs and flower beds the game places at runtime', () => {
    expect(selectVariants(parts).some((link) => link.includes('_2000_'))).toBe(false);
    expect(selectVariants(parts).some((link) => link.includes('_4000_'))).toBe(false);
  });

  it('drops the spectator markers the course model leaves out', () => {
    expect(selectVariants(parts).some((link) => link.includes('7013'))).toBe(false);
  });
});

describe('racecourseModels', () => {
  it('skips listing entries that only point at a document, which the loader reads', () => {
    const models = racecourseModels({
      schema: 1,
      racecourses: [{ id: 10001, name: 'Sapporo', index: '/art/racecourses/10001/index.json' }]
    });

    expect(models).toEqual([]);
  });

  it('takes a whole-course model when the entry names one', () => {
    const models = racecourseModels({
      racecourses: [{ id: 10006, name: 'Tokyo', model: '/art/racecourses/10006/model.glb' }]
    });

    expect(models[0]).toMatchObject({
      trackId: 10006,
      slug: '10006',
      url: `${ROOT}/art/racecourses/10006/model.glb`,
      parts: []
    });
  });
});

describe('loadRacecourseModels', () => {
  const respond = (bodies: Record<string, unknown>) =>
    (async (input: RequestInfo | URL) => {
      const body = bodies[String(input)];
      return body === undefined
        ? new Response('missing', { status: 404 })
        : new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;

  it('says plainly that the tree has no courses yet', () => {
    const fetchImpl = respond({ [`${ROOT}/art/index.json`]: { sections: {} } });

    return expect(loadRacecourseModels(fetchImpl)).rejects.toThrow('no racecourses section');
  });

  it('assembles a course from its parts when no whole model is published', async () => {
    const fetchImpl = respond({
      [`${ROOT}/art/index.json`]: {
        schema: 1,
        sections: { racecourses: '/art/racecourses/index.json' }
      },
      [`${ROOT}/art/racecourses/index.json`]: {
        schema: 1,
        racecourses: [{ id: 10001, name: 'Sapporo', index: '/art/racecourses/10001/index.json' }]
      },
      [`${ROOT}/art/racecourses/10001/index.json`]: {
        schema: 1,
        id: 10001,
        name: 'Sapporo',
        parts: [
          '/art/racecourses/10001/parts/0000_002.glb',
          '/art/racecourses/10001/parts/0001_002.glb'
        ]
      }
    });

    const models = await loadRacecourseModels(fetchImpl);

    expect(models).toEqual([
      {
        trackId: 10001,
        name: 'Sapporo',
        slug: '10001',
        parts: [
          `${ROOT}/art/racecourses/10001/parts/0000_002.glb`,
          `${ROOT}/art/racecourses/10001/parts/0001_002.glb`
        ]
      }
    ]);
  });
});
