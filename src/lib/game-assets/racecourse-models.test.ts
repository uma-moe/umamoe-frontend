import { describe, expect, it } from 'vitest';
import { racecourseModels, type RacecourseModel } from './racecourse-models';

const record = (files: Record<string, unknown>) => ({ resource_version: '1', files });

const course = (...outputs: string[]) => ({ region: 'global', checksum: 1, converter: 2, outputs });

const keys = (models: RacecourseModel[]) => models.map((model) => model.trackId);

describe('racecourseModels', () => {
  it('reads one course per game folder, sorted by the name the site shows', () => {
    const models = racecourseModels(
      record({
        '3d/env/race/race10006': course('game-assets/racetracks/tokyo.glb'),
        '3d/env/race/race10201': course('game-assets/racetracks/longchamp.glb')
      })
    );

    expect(keys(models)).toEqual([10201, 10006]);
    expect(models.map((model) => model.name)).toEqual(['Longchamp', 'Tokyo']);
    expect(models[1]).toEqual({
      trackId: 10006,
      name: 'Tokyo',
      slug: 'tokyo',
      url: 'https://assets.uma.moe/game-assets/racetracks/tokyo.glb'
    });
  });

  it('takes the published file name as the slug, not the track name', () => {
    const models = racecourseModels(
      record({
        '3d/env/race/race10101': course('game-assets/racetracks/ooi-night.glb')
      })
    );

    expect(models.map((model) => model.slug)).toEqual(['ooi-night']);
  });

  it('skips parts, textures and records with nothing to draw', () => {
    const models = racecourseModels(
      record({
        '3d/env/race/race10001/race10001_0000/pfb_env_race10001_0000_002': course(
          'game-assets/3d/env/race/race10001/race10001_0000/pfb_env_race10001_0000_002.glb'
        ),
        '3d/env/race/race10002': course('game-assets/3d/env/race/race10002/textures/turf.webp'),
        '3d/env/race/race10003': { region: 'global' },
        '3d/env/race/race10004': course()
      })
    );

    expect(models).toEqual([]);
  });

  it('keeps the courses it can read when another record is malformed', () => {
    const models = racecourseModels({
      files: {
        '3d/env/race/race10007': course('game-assets/racetracks/chukyo.glb'),
        '3d/env/race/race10008': 'not a record'
      }
    });

    expect(keys(models)).toEqual([10007]);
  });

  it('returns nothing for a record that is not a shard', () => {
    expect(racecourseModels(null)).toEqual([]);
    expect(racecourseModels({ shards: [] })).toEqual([]);
  });
});
