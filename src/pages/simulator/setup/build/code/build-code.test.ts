import { readFileSync } from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';
import type { RaceCourse } from '@/lib/game-data/racing/courses';
import {
  buildCodeConditions,
  buildCodeGoal,
  buildCodeOffers,
  buildCodeRunner,
  buildCodeUma,
  codePage,
  decodeBuildCode,
  encodeBuildCode,
  looksLikeBuildCode,
  sameRunner,
  type BuildCode
} from './build-code';
import { createSimulatorUma } from '../../../simulator-uma';

// A code with no uma.moe additions, as the umalator writes its state: Tokyo dirt 1,600 m, a Nige runner and 51
// skills on offer with hints. URL-encoded, as it was copied.
const PLAIN =
  'H4sIAAAAAAAC%2F%2B1UTYvbMBD9LzrnIMmRnPiWLmUp3ZbCHksPIpkkpvFHbXmXEva%2Fd0aakbfnXhsweXqa73noro7DMs3w6aQao70xG9XPoRtvMKvGab1RywzfhvkzwKiaOC2wUVM4wgnOqrmryzQsPblu1CuEeIUp4RnCPPQJxrYD1VQbNA0noCT6DYN2wZD%2FsMRzGym5Mtp6bRU6xzA9YNiomi2eRgBK4Pw2XXVtH%2FBoNB7H4TUl1MZh%2FCViybXfYSntfBo6OjjymUKEy29M8bW9ACY4tRinP8JhjG1cqCj1gfIu0zn8xT6q1f0dfUA68BFTflcPSFAEunjm%2F4%2F4PfJ3SP8%2FMNjP9nZLLobaNchbrStPbe%2B1ttqQ1dK3vxZ4ekn9d8OA7VtqdlxuYWojdmLyCO3%2FEf7TCI%2FXMMXnEhDj6C0H1FubgRHGFEaSGi%2FMTpgdM1UlwEmFTpiawbYyAoQRGyeMk%2BxOsjuxqYWpCyP17Lgegz8BlkEtDJdhrBYgNtYK4OwIhBF3W9z3DCprBDDjhHGFqYThBo3XzHhfQL6i2BnIxOw2X%2BETkssgwHv3qeU97SAJ4Nr28QlegDZ7l83Se8S7ZWhW1rxj%2Fcr6lcUUJCfeM0PaND1vvGu2pW03ruybxMcbZwPauUBXII2FbWnzjS675xS0fTag%2FQtcI5AG2JZUkNmkg8wmJQisV4NaIiQ95LhJEQLtalBmlnQhcA1G2sjTSergbKQPZkkhDEkjbEAqEUiDckUpDEkrbEBqKVDckmJyDUkzOUVSTeoi6ybZZuVQXNYOsaye9Wn4MqTHaoYbHCM%2BoW9%2FAHwb3JouBwAA';

const TOKYO_DIRT_MILE = {
  course_id: 10611,
  distance: 1600,
  distance_type: 2,
  surface: 2
} as RaceCourse;

const schema = JSON.parse(
  readFileSync(path.join(process.cwd(), 'contracts', 'build-code.schema.json'), 'utf8')
);

const validate = new Ajv2020({ strict: false }).compile(schema);

describe('build codes', () => {
  it('reads a code, URL-encoded or not, and the JSON inside one', async () => {
    const code = await decodeBuildCode(PLAIN);
    expect(code.courseId).toBe(10611);
    expect(code.uma1?.outfitId).toBe('102602');
    expect(code.chartSkills).toHaveLength(51);
    expect(validate(code), JSON.stringify(validate.errors)).toBe(true);
    expect((await decodeBuildCode(decodeURIComponent(PLAIN))).courseId).toBe(10611);
    expect((await decodeBuildCode(JSON.stringify(code))).courseId).toBe(10611);
    expect(looksLikeBuildCode(PLAIN)).toBe(true);
    expect(looksLikeBuildCode('Special Week')).toBe(false);
  });

  it('says what is wrong with a code it cannot read', async () => {
    await expect(decodeBuildCode('')).rejects.toThrow('Paste a build code.');
    await expect(decodeBuildCode('https://example.com/#' + PLAIN)).rejects.toThrow('not a link');
    await expect(decodeBuildCode('Special Week')).rejects.toThrow('starts with H4sI');
    await expect(decodeBuildCode(PLAIN.slice(0, -40))).rejects.toThrow('cut off');
    await expect(decodeBuildCode('{"courseId":1}')).rejects.toThrow('no runner');
    await expect(decodeBuildCode('{"version":9,"uma1":{}}')).rejects.toThrow('newer version');
  });

  it('treats a null second runner as absent and rejects non-object alternatives', async () => {
    const code = await decodeBuildCode('{"uma1":{"outfitId":"100101"},"uma2":null}');
    expect(code.uma2).toBeUndefined();
    expect(buildCodeUma(code.uma1!).uma.cardId).toBe(100101);
    await expect(decodeBuildCode('{"uma1":{},"uma2":"not a runner"}')).rejects.toThrow(
      'second runner'
    );
  });

  it('turns a runner into the simulator’s build, with the course aptitudes', async () => {
    const code = await decodeBuildCode(PLAIN);
    const { uma, dropped } = buildCodeUma(
      { ...code.uma1!, fans: 254000 },
      { name: 'Mihono Bourbon', course: TOKYO_DIRT_MILE, knownSkill: (id) => id !== 900201 }
    );

    expect(uma).toMatchObject({ name: 'Mihono Bourbon', cardId: 102602, fanCount: 254000 });
    expect(uma.trainee).toMatchObject({
      speed: '1564',
      stamina: '1104',
      power: '1015',
      guts: '768',
      wisdom: '765',
      runningStyle: 'Nige',
      motivation: '5',
      distanceAptitudes: ['C', 'B', 'A', 'S'],
      styleAptitudes: ['A', 'E', 'G', 'G'],
      groundAptitudes: ['A', 'G']
    });

    // Her unique keeps its level; a skill the catalog does not know is left out and counted.
    expect(uma.skills).toEqual([
      { skillId: 110261, level: 4 },
      { skillId: 200362, level: 1 }
    ]);

    expect(dropped).toBe(1);
    expect(sameRunner(code.uma1, code.uma2)).toBe(true);
    const edited = buildCodeUma(
      { ...code.uma1!, distanceAptitude: 'S', strategy: 'Oonige' },
      { course: TOKYO_DIRT_MILE }
    ).uma;

    expect(edited.trainee.distanceAptitudes[1]).toBe('S');
    expect(edited.trainee.runningStyle).toBe('Oonige');
  });

  it('takes the conditions, the skills on offer with their hints, and the goal', async () => {
    const code = await decodeBuildCode(PLAIN);
    expect(buildCodeConditions(code.racedef)).toEqual({
      ground: '1',
      weather: '1',
      season: '1',
      startTime: '3'
    });

    expect(buildCodeConditions({ season: 5, time: 1 }).season).toBe('1');
    const offers = buildCodeOffers(code, [200362, 900201]);
    expect(offers).toHaveLength(51);
    expect(offers).toContainEqual({ skillId: 200352, hint: 5 });
    expect(
      buildCodeOffers({ ...code, chartSkills: ['200362', '200352', '110261'] }, [200362])
    ).toEqual([{ skillId: 200352, hint: 5 }]);

    expect(buildCodeGoal(code)).toEqual({
      sp: undefined,
      fastLearner: undefined,
      mode: undefined,
      tracks: undefined,
      seed: undefined
    });

    expect(
      buildCodeGoal({
        ...code,
        seed: 42,
        mode: 'tt_mile',
        opponents: 'mirror',
        tracks: [10101, 10101, 10602, -3],
        scoring: {
          selfEvaluate: 30000,
          opponentEvaluate: 28000,
          supportCardBonus: 5,
          winsBefore: 2
        },
        uma1: { ...code.uma1!, sp: 1450, fastLearner: true }
      })
    ).toEqual({
      sp: 1450,
      fastLearner: true,
      mode: 'tt_mile',
      tracks: [10101, 10602],
      seed: 42
    });
  });

  it('writes a code that reads back and fits the schema', async () => {
    const plain = await decodeBuildCode(PLAIN);
    const { uma } = buildCodeUma({ ...plain.uma1!, fans: 254000 }, { course: TOKYO_DIRT_MILE });
    const code: BuildCode = {
      version: 1,
      courseId: 10611,
      racedef: { ground: 1, weather: 1, season: 1, time: 3 },
      seed: 7,
      mode: 'cm',
      uma1: buildCodeRunner(uma, TOKYO_DIRT_MILE, { sp: 1450, fastLearner: true }),
      chartSkills: ['200352', '201601'],
      hintLevels: { '200352': 5 }
    };

    expect(validate(code), JSON.stringify(validate.errors)).toBe(true);
    const text = await encodeBuildCode(code);
    expect(looksLikeBuildCode(text)).toBe(true);
    const read = await decodeBuildCode(text);
    expect(read).toEqual(code);
    expect(read.uma1).toMatchObject({
      strategy: 'Nige',
      distanceAptitude: 'B',
      surfaceAptitude: 'G',
      uniqueLv: 4,
      mood: 2,
      fans: 254000
    });

    // Reading the written runner gives the same build back.
    expect(buildCodeUma(read.uma1!, { course: TOKYO_DIRT_MILE }).uma.trainee).toEqual(uma.trainee);
  });

  it('carries a whole tab that reads back for that tab alone and fits the schema', async () => {
    const page = {
      tab: 'race' as const,
      field: [{ name: 'Seiun Sky', trainee: { speed: '1500' }, skills: [] }],
      teamColors: { '1': '#69b7ee' },
      seed: '42',
      raceInstanceId: 0,
      raceType: '0',
      runs: '100'
    };
    const code: BuildCode = {
      version: 1,
      uma1: buildCodeRunner(createSimulatorUma('Seiun Sky')),
      page
    };

    const read = await decodeBuildCode(await encodeBuildCode(code));

    expect(validate(read), JSON.stringify(validate.errors)).toBe(true);
    expect(codePage(read, 'race')).toEqual(page);
    expect(codePage(read, 'build')).toBeUndefined();
    expect(codePage({ uma1: {}, page: { tab: 'race', field: [] } }, 'race')).toBeUndefined();
    expect(codePage({ uma1: {}, page: { tab: 'build', setup: 'x' } }, 'build')).toBeUndefined();
  });
});
