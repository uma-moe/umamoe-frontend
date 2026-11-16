import { describe, expect, it } from 'vitest';
import { artUrl, loadRacecourseModels, racecourseModels } from './racecourse-models';

const listing = (entries: unknown[]) => ({ schema: 1, racecourses: entries });

describe('artUrl', () => {
  it('resolves rooted and relative links against the art root', () => {
    expect(artUrl('/art/umas/100101/model.glb', '/art/index.json')).toBe(
      'https://assets.uma.moe/art/umas/100101/model.glb'
    );
    expect(artUrl('model.glb', '/art/racecourses/10006/index.json')).toBe(
      'https://assets.uma.moe/art/racecourses/10006/model.glb'
    );
  });
});

describe('racecourseModels', () => {
  it('reads the courses a listing names directly', () => {
    const models = racecourseModels(
      listing([
        { id: 10006, name: 'Tokyo', model: '/art/racecourses/10006/model.glb' },
        { id: 10201, name: 'Longchamp', model: '/art/racecourses/10201/model.glb' }
      ])
    );

    expect(models.map((model) => model.trackId)).toEqual([10201, 10006]);
    expect(models.map((model) => model.name)).toEqual(['Longchamp', 'Tokyo']);
    expect(models[1]).toEqual({
      trackId: 10006,
      name: 'Tokyo',
      slug: 'model',
      url: 'https://assets.uma.moe/art/racecourses/10006/model.glb'
    });
  });

  it('accepts a model given as a file inside the course folder', () => {
    const models = racecourseModels(
      listing([{ id: 10007, name: 'Chukyo', model: { file: 'tokyo-course.glb' } }])
    );

    expect(models).toHaveLength(1);
    expect(models[0]?.url).toBe('https://assets.uma.moe/art/racecourses/10007/tokyo-course.glb');
    expect(models[0]?.slug).toBe('tokyo-course');
  });

  it('falls back to the site name for a track the table does not know', () => {
    const models = racecourseModels(
      listing([{ id: 99999, name: 'Somewhere Downs', model: 'somewhere.glb' }])
    );

    expect(models[0]?.name).toBe('Somewhere Downs');
  });

  it('skips entries that name no model and cannot be read further', () => {
    const models = racecourseModels(
      listing([{ id: 10006, index: '/art/racecourses/10006/index.json' }, { name: 'no id' }, null])
    );

    expect(models).toEqual([]);
  });

  it('returns nothing for a listing that is not the shape', () => {
    expect(racecourseModels(null)).toEqual([]);
    expect(racecourseModels({ schema: 1 })).toEqual([]);
  });
});

describe('loadRacecourseModels', () => {
  const respond = (bodies: Record<string, unknown>) =>
    (async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = bodies[url];
      if (body === undefined) return new Response('missing', { status: 404 });
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;

  it('says plainly that the tree has no courses yet', () => {
    const fetchImpl = respond({ 'https://assets.uma.moe/art/index.json': { sections: {} } });

    return expect(loadRacecourseModels(fetchImpl)).rejects.toThrow('no racecourses section');
  });

  it('follows a listing that only points at course documents', async () => {
    const fetchImpl = respond({
      'https://assets.uma.moe/art/index.json': {
        schema: 1,
        sections: { racecourses: '/art/racecourses/index.json' }
      },
      'https://assets.uma.moe/art/racecourses/index.json': listing([
        { id: 10006, name: 'Tokyo', index: '/art/racecourses/10006/index.json' }
      ]),
      'https://assets.uma.moe/art/racecourses/10006/index.json': {
        schema: 1,
        id: 10006,
        name: 'Tokyo',
        model: { file: 'model.glb' }
      }
    });

    const models = await loadRacecourseModels(fetchImpl);

    expect(models).toEqual([
      {
        trackId: 10006,
        name: 'Tokyo',
        slug: 'model',
        url: 'https://assets.uma.moe/art/racecourses/10006/model.glb'
      }
    ]);
  });
});
