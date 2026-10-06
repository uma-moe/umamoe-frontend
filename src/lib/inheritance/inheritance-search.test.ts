import { describe, expect, it } from 'vitest';
import { activeInheritanceFilterCount, emptyInheritanceFilters, inheritanceSearchQuery, normalizeInheritanceSearch } from './inheritance-search';
import { validateInheritanceUql } from './uql';

describe('inheritance search contract', () => {
  it('sends Any star levels without enumerating factor IDs, including mixed groups', () => {
    const filters = emptyInheritanceFilters();
    filters.green = [{ factorId: 0, minimumStars: 2, maximumStars: 3 }];
    filters.mainGreen = [{ factorId: 0, minimumStars: 2, maximumStars: 3 }];
    filters.white = [{ factorId: 0, minimumStars: 1 }];
    let query = inheritanceSearchQuery(filters, 0, 12);
    expect(query.get('green_sparks')).toBe('2,3');
    expect(query.get('main_parent_green_sparks')).toBeNull();
    expect(query.get('uql')).toBe('(main_green_factors in (2, 3))');
    expect(query.has('white_sparks')).toBe(false);
    expect(activeInheritanceFilterCount(filters)).toBe(2);
    filters.green.push({ factorId: 100010, minimumStars: 1, maximumStars: 1, operator: 'or' }, { factorId: 0, minimumStars: 3, maximumStars: 3 });
    query = inheritanceSearchQuery(filters, 0, 12);
    expect(query.get('uql')).toBe('overlaps(green_sparks, (2,3,1000101)) and overlaps(green_sparks, (3)) and (main_green_factors in (2, 3))');
  });
  it('keeps UQL requests independent of structured controls while retaining target and legacy context', () => {
    const filters = emptyInheritanceFilters();
    filters.blue = [{ factorId: 10, minimumStars: 2, maximumStars: 2 }]; filters.minWinCount = 9; filters.supportCardId = 30137; filters.trainerName = 'Hidden form value';
    filters.playerCharaId = 1013; filters.p2MainCharaId = 1006; filters.p2WinSaddle = [100]; filters.uql = 'Main Speed >= 3 and Followers = 1000'; filters.sortBy = 'affinity_score';
    expect(Object.fromEntries(inheritanceSearchQuery(filters, 0, 12, 'uql'))).toEqual({
      page: '0', limit: '12', search_type: 'inheritance', player_chara_id: '1013', exclude_main_parent_id: '1006',
      p2_main_chara_id: '1006', p2_win_saddle: '100', max_follower_num: '1000',
      uql: 'main_blue_factors = 103 and follower_num = 1000', sort_by: 'affinity_score', sort_order: 'desc'
    });
    const structured = inheritanceSearchQuery(filters, 0, 12, 'advanced');
    expect(structured.get('uql')).toBeNull(); expect(structured.get('blue_sparks')).toBe('102'); expect(structured.get('min_win_count')).toBe('9');
    expect(structured.get('max_follower_num')).toBe('999');
    expect(filters.uql).toBe('Main Speed >= 3 and Followers = 1000'); expect(filters.minWinCount).toBe(9);
  });
  it('excludes the selected legacy without mutating explicit exclusions or duplicating costume aliases', () => {
    const filters = emptyInheritanceFilters(); filters.p2MainCharaId = 101301; filters.p2WinSaddle = [100, 101]; filters.excludeMainParentIds = [1001];
    const query = inheritanceSearchQuery(filters, 0, 12);
    expect(query.get('exclude_main_parent_id')).toBe('1001,1013');
    expect(query.get('p2_win_saddle')).toBe('100,101');
    expect(filters.excludeMainParentIds).toEqual([1001]);
    filters.excludeMainParentIds.push(101302);
    expect(inheritanceSearchQuery(filters, 0, 12).get('exclude_main_parent_id')).toBe('1001,101302');
    filters.p2MainCharaId = undefined;
    expect(inheritanceSearchQuery(filters, 0, 12).get('exclude_main_parent_id')).toBe('1001,101302');
  });
  it('serializes repeated factor groups and structured filters like the Angular API', () => {
    const filters = emptyInheritanceFilters();
    filters.mainParentIds = [1010, 1020];
    filters.blue = [{ factorId: 10, minimumStars: 3, maximumStars: 5 }, { factorId: 20, minimumStars: 2, maximumStars: 2 }];
    filters.white = [{ factorId: 200010, minimumStars: 1, maximumStars: 1 }];
    filters.minWinCount = 6;
    const query = inheritanceSearchQuery(filters, 2, 20);
    expect(query.get('main_parent_id')).toBe('1010,1020');
    expect(query.getAll('blue_sparks')).toEqual(['103,104,105', '202']);
    expect(query.getAll('white_sparks')).toEqual(['2000101']);
    expect(query.get('min_win_count')).toBe('6');
    expect(query.get('page')).toBe('2');
  });

  it('uses an explicit predicate for mixed AND/OR groups without also sending the legacy count filter', () => {
    const filters = emptyInheritanceFilters();
    filters.blue = [
      { factorId: 10, minimumStars: 3, maximumStars: 3 },
      { factorId: 20, minimumStars: 2, maximumStars: 2, operator: 'or' },
      { factorId: 30, minimumStars: 1, maximumStars: 1, operator: 'and' }
    ];
    const query = inheritanceSearchQuery(filters, 1, 20);
    expect(query.getAll('blue_sparks')).toEqual([]);
    expect(query.get('uql')).toBe('overlaps(blue_sparks, (103,202)) and overlaps(blue_sparks, (301))');
    expect(validateInheritanceUql(query.get('uql')!).state).toBe('valid');
    filters.blue[2]!.operator = 'or';
    const alternatives = inheritanceSearchQuery(filters, 1, 20);
    expect(alternatives.getAll('blue_sparks')).toEqual(['103,202,301']);
    expect(alternatives.has('uql')).toBe(false);
  });

  it('keeps overlapping alternatives independent across every toggleable factor section', () => {
    const filters = emptyInheritanceFilters();
    for (const key of ['blue', 'pink', 'green', 'white', 'mainWhite'] as const) {
      filters[key] = [
        { factorId: 10, minimumStars: 3, maximumStars: 3 },
        { factorId: 20, minimumStars: 2, maximumStars: 2, operator: 'or' },
        { factorId: 10, minimumStars: 3, maximumStars: 3, operator: 'and' }
      ];
    }
    const query = inheritanceSearchQuery(filters, 0, 12, 'advanced');
    const fields = ['blue_sparks', 'pink_sparks', 'green_sparks', 'white_sparks', 'main_white_factors'];
    expect(query.get('uql')).toBe(fields.map((field) => `overlaps(${field}, (103,202)) and overlaps(${field}, (103))`).join(' and '));
    expect(validateInheritanceUql(query.get('uql')!).state).toBe('valid');
    for (const parameter of [...fields.slice(0, 4), 'main_parent_white_sparks']) expect(query.has(parameter)).toBe(false);
    filters.uql = 'win_count >= 10';
    expect(inheritanceSearchQuery(filters, 0, 12, 'uql').get('uql')).toBe('win_count >= 10');
  });

  it('normalizes only accounts that contain inheritance data', () => {
    const result = normalizeInheritanceSearch({ total: 2, page: 0, limit: 20, total_pages: 1, items: [
      { account_id: 'a', trainer_name: 'Trainer', inheritance: { inheritance_id: 7, main_parent_id: 1010, parent_left_id: 1020, parent_right_id: 1030, parent_rank: 24000, parent_rarity: 3, blue_sparks: [103], affinity_score: 84 } },
      { account_id: 'b', trainer_name: 'No legacy', inheritance: null }
    ] });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({ id: 7, trainerName: 'Trainer', blueSparks: [103], affinity: 84 });
  });

  it('counts user-facing filters but ignores default sort and follower cap', () => {
    const filters = emptyInheritanceFilters();
    filters.trainerName = 'Liz';
    filters.pink = [{ factorId: 340, minimumStars: 2 }];
    expect(activeInheritanceFilterCount(filters)).toBe(2);
  });
});
