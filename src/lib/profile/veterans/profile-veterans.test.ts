import { setupResourceFixtures } from '../../../../tests/fixtures/resource-setup';

import { describe, expect, it } from 'vitest';
import type { ProfileVeteran } from '@/pages/profile/profile-repository';
import {
  computeVeteranStatBounds,
  filterAndSortVeterans,
  resolveVeteranFactors,
  veteranBaseStat,
  veteranFactorTotals,
  factorStarSum,
  type VeteranFilterState
} from './profile-veterans';

setupResourceFixtures();

const base: ProfileVeteran = {
  id: 1,
  member_id: 1,
  trained_chara_id: 10,
  card_id: 1001,
  distance_type: 4,
  running_style: 2,
  speed: 1210,
  stamina: 900,
  power: 1000,
  guts: 700,
  wiz: 1100,
  rank_score: 12000,
  skills: [1011],
  factors: [103],
  support_cards: [],
  scenario_id: 5,
  rarity: 3,
  talent_level: 3,
  proper_ground_turf: 7,
  proper_ground_dirt: 1,
  proper_distance_short: 2,
  proper_distance_mile: 4,
  proper_distance_middle: 6,
  proper_distance_long: 7,
  proper_running_style_nige: 2,
  proper_running_style_senko: 7,
  proper_running_style_sashi: 4,
  proper_running_style_oikomi: 1
};

function filters(bounds: VeteranFilterState['stats']): VeteranFilterState {
  return {
    query: '',
    distance: null,
    style: null,
    minTotal: 0,
    stats: structuredClone(bounds),
    aptitudes: {},
    skills: [],
    include: {},
    exclude: {},
    factors: [],
    raceIds: []
  };
}

describe('profile Veteran parity logic', () => {
  it('sorts training dates chronologically in both directions and keeps unknown dates last', () => {
    const veterans = [
      { ...base, id: 1, creation_time: null },
      { ...base, id: 2, creation_time: '2026-09-20T01:00:00+02:00' },
      { ...base, id: 3, creation_time: '2026-09-19T23:30:00Z' },
      { ...base, id: 4, creation_time: 'invalid' },
      { ...base, id: 5, creation_time: '2026-01-01' }
    ];

    const state = filters(computeVeteranStatBounds(veterans));
    expect(
      filterAndSortVeterans(veterans, state, 'creation_time', 'desc', new Map()).map((v) => v.id)
    ).toEqual([3, 2, 5, 1, 4]);
    expect(
      filterAndSortVeterans(veterans, state, 'creation_time', 'asc', new Map()).map((v) => v.id)
    ).toEqual([5, 2, 3, 1, 4]);
    expect(veterans.map((v) => v.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('matches multiple distance and style choices, including empty and unrestricted selections', () => {
    const veterans = [
      base,
      { ...base, id: 2, distance_type: 2, running_style: 1 },
      { ...base, id: 3, distance_type: null, running_style: null }
    ];

    const state = filters(computeVeteranStatBounds(veterans));
    const matches = () =>
      filterAndSortVeterans(veterans, state, 'total', 'desc', new Map()).map((item) => item.id);

    expect(matches()).toEqual([1, 2, 3]);
    state.distance = [2, 4];
    expect(matches()).toEqual([1, 2]);
    state.style = [2];
    expect(matches()).toEqual([1]);
    state.style = [];
    expect(matches()).toEqual([]);
    state.style = null;
    state.distance = [];
    expect(matches()).toEqual([]);
    state.distance = 2;
    expect(matches()).toEqual([2]);
    state.distance = null;
    expect(matches()).toEqual([1, 2, 3]);
  });

  it('uses database OR groups, inclusive star ranges and bounded family totals', () => {
    const v: ProfileVeteran = {
      ...base,
      factors: [103, 1202],
      succession_chara_array: [
        {
          position_id: 10,
          card_id: 1002,
          rank: 1,
          rarity: 1,
          talent_level: 1,
          factor_id_array: [103]
        }
      ]
    };

    const state = filters(computeVeteranStatBounds([v]));
    const matches = () => filterAndSortVeterans([v], state, 'total', 'desc', new Map()).length;
    state.factors = [{ factorId: 10, minLevel: 1, maxLevel: 2, scope: 'parent' }];
    expect(matches()).toBe(0);
    state.factors.push({
      factorId: 120,
      minLevel: 2,
      maxLevel: 2,
      scope: 'parent',
      operator: 'or'
    });

    expect(matches()).toBe(1);
    state.factors.push({
      factorId: 10,
      minLevel: 6,
      maxLevel: 6,
      scope: 'family',
      mode: 'total',
      operator: 'and'
    });

    expect(matches()).toBe(1);
    state.factors[2]!.maxLevel = 5;
    expect(matches()).toBe(0);
    state.factors[2]!.maxLevel = 6;
    state.factors[2]!.scope = 'parent';
    expect(matches()).toBe(0);
    state.factors[2]!.scope = 'family';
    state.factors[1]!.operator = 'and';
    expect(matches()).toBe(0);
  });

  it('distinguishes own exact stars from immediate-family totals and keeps card totals consistent', () => {
    const v: ProfileVeteran = {
      ...base,
      succession_chara_array: [
        {
          position_id: 10,
          card_id: 1002,
          rank: 1,
          rarity: 1,
          talent_level: 1,
          factor_id_array: [103]
        },
        {
          position_id: 20,
          card_id: 1003,
          rank: 1,
          rarity: 1,
          talent_level: 1,
          factor_id_array: [102]
        },
        ...[11, 12, 21, 22].map((position_id) => ({
          position_id,
          card_id: 1004,
          rank: 1,
          rarity: 1,
          talent_level: 1,
          factor_id_array: [103, 203]
        }))
      ]
    };

    const state = filters(computeVeteranStatBounds([v]));
    const matches = () => filterAndSortVeterans([v], state, 'blue', 'desc', new Map());
    state.factors = [{ factorId: 10, minLevel: 2, scope: 'parent', mode: 'exact' }];
    expect(matches()).toHaveLength(0);
    state.factors[0]!.scope = 'grandparent';
    expect(matches()).toHaveLength(1);
    state.factors = [{ factorId: 10, minLevel: 8, scope: 'family', mode: 'total' }];
    expect(matches()).toHaveLength(1);
    state.factors[0]!.minLevel = 9;
    expect(matches()).toHaveLength(0);
    state.factors[0]!.scope = 'any';
    expect(matches()).toHaveLength(1);
    expect(
      veteranFactorTotals(v).map(({ id, level, ownStars }) => ({ id, level, ownStars }))
    ).toEqual([{ id: 10, level: 8, ownStars: 3 }]);

    expect(factorStarSum(v, 'blue')).toBe(8);
    expect(v.factors).toEqual([103]);
    state.factors = [];
    state.skills = [1011];
    expect(matches()).toHaveLength(1);
    state.skills = [9999];
    expect(matches()).toHaveLength(0);
  });

  it('previews mood-adjusted base stats without changing raw stats or inventing missing values', () => {
    expect(veteranBaseStat(1000, 0)).toBe(1000);
    expect(veteranBaseStat(1200, 0)).toBe(1200);
    expect(veteranBaseStat(1201, 0)).toBe(1200);
    expect(veteranBaseStat(1301, 0)).toBe(1250);
    expect(veteranBaseStat(1301, 2)).toBe(1300);
    expect(veteranBaseStat(1000, -2)).toBe(960);
    expect(veteranBaseStat(0, 0)).toBe(0);
    for (const missing of [null, undefined, NaN, Infinity, -1])
      expect(veteranBaseStat(missing, 0)).toBeNull();
  });

  it('keeps Angular stat bounds on 50-point steps', () =>
    expect(computeVeteranStatBounds([base]).speed).toEqual([1200, 1250]));
  it('prefers explicit factor levels', () =>
    expect(
      resolveVeteranFactors({ factor_info_array: [{ factor_id: 10, level: 3 }] })[0]
    ).toMatchObject({ id: 10, level: 3, tone: 'blue' }));

  it('decodes profile factor_info_array IDs like Angular without appending the stars twice', () => {
    expect(
      resolveVeteranFactors({
        factor_info_array: [
          { factor_id: 103, level: 3 },
          { factor_id: 9999993, level: 3 }
        ]
      }).map((f) => [f.id, f.level, f.tone])
    ).toEqual([
      [10, 3, 'blue'],
      [999999, 3, 'white']
    ]);
  });

  it('applies minimum aptitudes and encoded skill filters', () => {
    const bounds = computeVeteranStatBounds([base]);
    const state = filters(bounds);
    state.aptitudes.proper_distance_long = 'A';
    state.skills = [101];
    expect(
      filterAndSortVeterans(
        [base],
        state,
        'total',
        'desc',
        new Map([[1001, { id: '1001', name: 'Test Uma', image: 'test.png' }]])
      ).length
    ).toBe(1);

    state.aptitudes.proper_distance_long = 'S';
    expect(filterAndSortVeterans([base], state, 'total', 'desc', new Map()).length).toBe(0);
  });

  it('requires separate matches for duplicate factor filters like Angular', () => {
    const veteran: ProfileVeteran = {
      ...base,
      succession_chara_array: [
        {
          position_id: 10,
          card_id: 1002,
          rank: 1,
          rarity: 1,
          talent_level: 1,
          factor_id_array: [103]
        },
        {
          position_id: 20,
          card_id: 1003,
          rank: 1,
          rarity: 1,
          talent_level: 1,
          factor_id_array: [102]
        }
      ]
    };

    const state = filters(computeVeteranStatBounds([veteran]));
    const factor = { factorId: 10, minLevel: 2, scope: 'grandparent' as const };

    state.factors = [factor, factor];
    expect(filterAndSortVeterans([veteran], state, 'total', 'desc', new Map())).toHaveLength(1);
    state.factors = [factor, factor, factor];
    expect(filterAndSortVeterans([veteran], state, 'total', 'desc', new Map())).toHaveLength(0);
  });
});
