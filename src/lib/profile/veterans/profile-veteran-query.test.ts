import { setupResourceFixtures } from '../../../../tests/fixtures/resource-setup';

import { describe, expect, it } from 'vitest';
import {
  compileVeteranQuery,
  veteranQueryRow,
  type VeteranQueryRow
} from './profile-veteran-query';
import { UqlCompiler } from '@/lib/inheritance/uql/uql-compiler';
import { profileVeteranAffinity } from './profile-veteran-metrics';
import { VeteranAffinityEngine } from '@/lib/veterans/affinity/affinity-engine';
import { loadUqlQueryData } from '@/lib/inheritance/uql/query-data';
import { loadSkills, skillPointTotal } from '@/lib/game-data/skills/skills';
import type { ProfileVeteran } from '@/pages/profile/profile-repository';

setupResourceFixtures();
const veteran: ProfileVeteran = {
  id: 1,
  member_id: 1,
  card_id: 101101,
  distance_type: 4,
  running_style: 2,
  speed: 1210,
  stamina: 960,
  power: 1090,
  guts: 720,
  wiz: 1040,
  rank_score: 15900,
  factors: [103, 1203, 10013, 200012],
  inheritance: {
    blue_sparks: [],
    pink_sparks: [],
    green_sparks: [],
    white_sparks: [],
    blue_stars_sum: 0,
    pink_stars_sum: 0,
    green_stars_sum: 0,
    white_stars_sum: 0,
    affinity_score: 83
  },
  succession_chara_array: [
    {
      position_id: 10,
      card_id: 106701,
      rank: 1,
      rarity: 1,
      talent_level: 1,
      factor_id_array: [103]
    },
    {
      position_id: 20,
      card_id: 108801,
      rank: 1,
      rarity: 1,
      talent_level: 1,
      factor_id_array: [1203]
    }
  ]
};

const trainer = {
  account_id: '123456789012',
  name: 'Parity Trainer',
  follower_num: 1,
  own_follow_num: null,
  best_team_class: null,
  team_class: null,
  team_evaluation_point: null,
  rank_score: null,
  comment: null
};

const subject = {
  ...veteran,
  win_saddle_id_array: [1, 2],
  succession_chara_array: veteran.succession_chara_array!.map((p) => ({
    ...p,
    win_saddle_id_array: p.position_id === 10 ? [3] : p.position_id === 20 ? [2] : []
  }))
};

const groups = new Map([
  [1, 1],
  [2, 2],
  [3, 1]
]);

const engine = new VeteranAffinityEngine({
  chars: [1011, 1067, 1088],
  aff2: [0, 10, 15, 10, 0, 20, 15, 20, 0],
  aff3: Array(27).fill(0)
});

describe('veteran card metrics and collection queries', () => {
  it.each<[string, VeteranQueryRow, boolean]>([
    ['not (affinity > 0 and parent_rank = 0)', { affinity: null, parent_rank: 1 }, true],
    ['not (affinity > 0 and parent_rank = 0)', { affinity: null, parent_rank: 0 }, false],
    ['affinity > 0 or parent_rank = 0', { affinity: null, parent_rank: 0 }, true],
    ['not (affinity > 0 or parent_rank = 0)', { affinity: null, parent_rank: 1 }, false],
    ['parent_rank = 0 and white_count = 0', { parent_rank: 0, white_count: 0 }, true]
  ])('preserves null and zero semantics in %s', (source, row, expected) => {
    const query = compileVeteranQuery(source);
    expect(query.validation.state).toBe('valid');
    expect(query.matches(row)).toBe(expected);
  });

  it('matches wildcard star levels in factor arrays without treating race IDs as stars', () => {
    const query = compileVeteranQuery(
      'overlaps(green_sparks, (2,1000101)) and overlaps(green_sparks, (3))'
    );

    expect(query.matches({ green_sparks: [1000102, 1000203] })).toBe(true);
    expect(query.matches({ green_sparks: [1000101] })).toBe(false);
    expect(
      compileVeteranQuery('overlaps(main_win_saddles, (3))').matches({ main_win_saddles: [13] })
    ).toBe(false);
  });

  it('uses database affinity for each source, preserving unknown values and a real zero', () => {
    expect(profileVeteranAffinity(subject, engine, groups)).toMatchObject({
      main: 31,
      p1: 13,
      p2: 18,
      race: 6,
      recorded: false
    });

    expect(profileVeteranAffinity(subject)).toMatchObject({
      main: 83,
      p1: null,
      p2: null,
      recorded: true
    });

    const zero = new VeteranAffinityEngine({
      chars: [1011, 1067, 1088],
      aff2: Array(9).fill(0),
      aff3: Array(27).fill(0)
    });

    expect(profileVeteranAffinity(subject, zero)).toMatchObject({
      main: 0,
      p1: 0,
      p2: 0,
      recorded: false
    });
  });

  it('uses the selected target and keeps unknown target affinity separate from stored scores', () => {
    expect(profileVeteranAffinity(subject, engine, groups, 106701)).toMatchObject({
      main: 16,
      p1: 3,
      p2: 3,
      race: 6,
      recorded: false
    });

    expect(profileVeteranAffinity(subject, engine, groups, 108801)).toMatchObject({
      main: 21,
      p1: 3,
      p2: 3,
      race: 6,
      recorded: false
    });

    expect(profileVeteranAffinity(subject, undefined, groups, 106701)).toMatchObject({
      main: null,
      p1: null,
      p2: null,
      recorded: false
    });

    expect(profileVeteranAffinity(subject, engine, groups, 999901).main).toBeNull();
    expect(
      profileVeteranAffinity({ ...subject, succession_chara_array: [] }, engine, groups, 106701)
        .main
    ).toBeNull();
  });

  it('sums base SP with prerequisites once, ignores native unique costs, and reports missing costs', async () => {
    const catalog = await loadSkills();
    expect(skillPointTotal(catalog, [200011, 100011])).toBe(200);
    expect(skillPointTotal(catalog, [200011, 100011, 9000111, 900011])).toBe(400);
    expect(skillPointTotal(catalog, [200011, 200012, 200011])).toBe(200);
    expect(skillPointTotal(catalog, [201201])).toBe(
      catalog.get(201201)!.baseCost! + catalog.get(201202)!.baseCost!
    );
    expect(skillPointTotal(catalog, [99999999])).toBeNull();
    expect(skillPointTotal(catalog, [])).toBe(0);
  });

  it('runs copied database predicates over the veteran and immediate parents', async () => {
    const compiler = new UqlCompiler(await loadUqlQueryData());
    const row = veteranQueryRow(subject, trainer, groups, 31, 6);
    for (const [source, expected] of [
      ['Main Speed = 3 and GP1 Speed = 3', true],
      ['GP2 Speed >= 1', false],
      ['Speed + Stamina >= 6', true],
      ['Speed * 2 >= 13', false],
      ['GP2 Speed = 0 and (affinity >= 31 or white_count > 99)', true],
      ['main_parent_id in (101101,106701)', true],
      ['main_parent_id not in (101101)', false],
      ['parent_rank between 15000 and 16000', true],
      ['not (parent_rank between 15000 and 16000)', false],
      ["trainer_name ilike '%Trainer%'", true],
      ['main_white_factors has 200012', true],
      ['Race affinity >= 6 and Wins >= 2', true],
      ['sort by = affinity and Main Speed >= 3', true]
    ] as const) {
      const query = compileVeteranQuery(source, compiler);
      expect(query.validation, source).toMatchObject({ state: 'valid' });
      expect(query.matches(row), source).toBe(expected);
    }
  });

  it('rejects incomplete, unsupported and executable text rather than ignoring it', () => {
    for (const source of [
      'main_parent_id =',
      'main_parent_id = 1 2',
      'optional_white(201600)',
      'support_card(30028,lb >= 4)',
      'unknown_field = 1',
      'main_parent_id = 1; alert(1)'
    ]) {
      expect(compileVeteranQuery(source).validation.state, source).not.toBe('valid');
    }

    expect(compileVeteranQuery('').matches({})).toBe(true);
    expect(compileVeteranQuery('not (affinity > 0)').matches({ affinity: null })).toBe(false);
  });

  it('explains only matching UQL branches with actual spark totals and scoped values', async () => {
    const compiler = new UqlCompiler(await loadUqlQueryData());
    const row = veteranQueryRow(subject, trainer, groups, 31, 6);
    const explain = (source: string) => {
      const query = compileVeteranQuery(source, compiler);
      expect(query.validation, source).toMatchObject({ state: 'valid' });
      return query.explain(row);
    };

    expect(explain('where Speed > 4')).toMatchObject([
      { label: 'Speed', factor: { id: 10, level: 6 } }
    ]);

    expect(explain('Main Speed = 3 and GP1 Speed = 3')).toMatchObject([
      { label: 'Main · Speed', factor: { level: 3 } },
      { label: 'P1 · Speed', factor: { level: 3 } }
    ]);

    expect(explain('Speed > 4 or Stamina > 4')).toMatchObject([
      { label: 'Speed', factor: { level: 6 } }
    ]);

    expect(explain('Speed > 8')).toEqual([]);
    expect(explain('GP2 Speed = 0')).toMatchObject([{ label: 'P2 · Speed', factor: { level: 0 } }]);
    expect(explain('not (Stamina > 0)')).toMatchObject([
      { label: 'Stamina', factor: { level: 0 } }
    ]);

    expect(explain('Speed + Stamina >= 6')).toMatchObject([
      { label: 'Speed', factor: { level: 6 } },
      { label: 'Stamina', factor: { level: 0 } }
    ]);

    expect(explain('affinity >= 31')).toMatchObject([{ label: 'Affinity', value: '31' }]);
    expect(compileVeteranQuery('', compiler).explain(row)).toEqual([]);
  });
});
