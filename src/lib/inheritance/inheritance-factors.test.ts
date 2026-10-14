import { setupCatalogFixtures } from '../../../tests/fixtures/catalog-setup';
setupCatalogFixtures();
import { describe, expect, it } from 'vitest';
import { decodeFactor } from '@/lib/catalog/factor-catalog';
import { inheritanceAffinity, inheritanceFactors, inheritanceFactorMatched, type InheritanceFactor } from './inheritance-factors';
import { normalizeInheritanceSearch, emptyInheritanceFilters } from './inheritance-search';
import { VeteranAffinityEngine } from '@/lib/veterans/affinity-engine';
import type { VeteranRecord } from '@/lib/veterans/generated/veteran-record';
import { validateInheritanceUql } from './uql';
import { buildUqlSparkHighlight } from './uql-spark-highlight';

describe('Angular factor encoding and owner display', () => {
  it('keeps main-parent sparks first even when grandparents have more stars or earlier names', () => {
    const record = normalizeInheritanceSearch({ items: [{ account_id: '123', trainer_name: 'Trainer', inheritance: {
      inheritance_id: 1, main_parent_id: 100101, parent_left_id: 100201, parent_right_id: 100301, parent_rank: 10000, parent_rarity: 10,
      main_pink_factors: 1102, left_pink_factors: 3403, right_pink_factors: 3402,
      main_green_factors: 10030102, left_green_factors: 10010103, right_green_factors: 10020102,
      main_white_factors: [2016001], left_white_factors: [2003603, 2016002], right_white_factors: [2003603]
    } }], total: 1, page: 1, limit: 20, total_pages: 1 }).records[0]!;
    const factors = inheritanceFactors(record);
    expect(factors.filter(factor => factor.group === 1).map(factor => [factor.id, factor.level])).toEqual([[110, 2], [340, 5]]);
    expect(factors.filter(factor => factor.group === 5).map(factor => factor.id)).toEqual([1003010, 1001010, 1002010]);
    expect(factors.filter(factor => factor.group === 3).map(factor => [factor.id, factor.level])).toEqual([[201600, 3], [200360, 6]]);
  });
  it('highlights compiled UQL totals, scoped requirements and optional whites in combined and split views', () => {
    const record = normalizeInheritanceSearch({ items: [{ account_id: '123', trainer_name: 'Trainer', inheritance: {
      inheritance_id: 1, main_parent_id: 100101, parent_left_id: 100201, parent_right_id: 100301, parent_rank: 10000, parent_rarity: 10,
      main_blue_factors: 203, left_blue_factors: 203, right_blue_factors: 202,
      main_pink_factors: 3402, left_pink_factors: 3403,
      main_white_factors: [2016001, 2003602], left_white_factors: [2016003, 2003601], right_white_factors: [2000102]
    } }], total: 1, page: 1, limit: 20, total_pages: 1 }).records[0]!;
    const validation = validateInheritanceUql('where Long >= 4 and Stamina >= 7 and Optional main white in (Straightaway Adept) and main white factors has all (Groundwork)');
    expect(validation.state).toBe('valid');
    const highlight = buildUqlSparkHighlight(validation.compiled);
    const matched = (factor: InheritanceFactor) => inheritanceFactorMatched(factor, undefined, highlight);
    expect(inheritanceFactors(record).filter(matched).map(factor => factor.id)).toEqual([20, 340, 201600, 200360]);
    expect(inheritanceFactors(record, true).filter(matched).map(factor => [factor.owner, factor.id])).toEqual([['main', 201600], ['main', 200360]]);
    expect(inheritanceFactors(record, false, 'left').filter(matched)).toEqual([]);
    const mainWhite = inheritanceFactors(record, false, 'main').find(factor => factor.id === 200360)!;
    expect(matched({ ...mainWhite, sources: [{ side: 'p2', owner: 'main', level: 2 }] })).toBe(false);
    const gpHighlight = buildUqlSparkHighlight(validateInheritanceUql('GP1 Groundwork >= 3 or GP2 Stamina >= 2').compiled);
    expect(inheritanceFactors(record, true).filter(factor => inheritanceFactorMatched(factor, undefined, gpHighlight)).map(factor => [factor.owner, factor.id])).toEqual([['left', 201600], ['right', 20]]);
  });
  it('orders sparks by parent, stars, occurrences or name without changing their totals', () => {
    const record = normalizeInheritanceSearch({ items: [{ account_id: '123', trainer_name: 'Trainer', inheritance: {
      inheritance_id: 1, main_parent_id: 100101, parent_left_id: 100201, parent_right_id: 100301, parent_rank: 10000, parent_rarity: 10,
      main_white_factors: [2003603, 2016001, 2000101], left_white_factors: [2016001, 2000101], right_white_factors: [2000101]
    } }], total: 1, page: 1, limit: 20, total_pages: 1 }).records[0]!;
    for (const [order, ids] of [
      ['main', [200360, 201600, 200010]], ['stars', [200010, 200360, 201600]],
      ['occurrences', [200010, 201600, 200360]], ['alphabetical', [201600, 200010, 200360]]
    ] as const) {
      const factors = inheritanceFactors(record, false, undefined, undefined, order);
      expect(factors.map(factor => factor.id), order).toEqual(ids);
      expect(factors.reduce((sum, factor) => sum + factor.level, 0)).toBe(8);
      expect(factors.reduce((sum, factor) => sum + factor.copies, 0)).toBe(6);
    }
    expect(inheritanceFactors(record, true, undefined, undefined, 'occurrences').map(factor => factor.id)).toEqual([200010, 200010, 200010, 201600, 201600, 200360]);
    expect(inheritanceFactors(record, true, undefined, undefined, 'stars').map(factor => factor.level)).toEqual([3, 1, 1, 1, 1, 1]);
    expect(inheritanceFactors(record, false, 'main', undefined, 'alphabetical').map(factor => factor.id)).toEqual([201600, 200010, 200360]);
    const partner = { factors: [{ id: 200360, level: 1 }], parents: [{ positionId: 10, factors: [{ id: 200360, level: 1 }] }] } as unknown as VeteranRecord;
    expect(inheritanceFactors(record, false, undefined, partner, 'occurrences').map(factor => factor.id)).toEqual([200360, 200010, 201600]);
    expect(inheritanceFactors(record).map(factor => factor.id)).toEqual([200360, 201600, 200010]);
  });
  it('extracts raw UQL ranges and scoring lists without highlighting exclusions, strings or scoring weights', () => {
    const highlight = buildUqlSparkHighlight("main_blue_factors >= 102 and contains(white_sparks, 2000102) and optional_main_white((200360, 201600), priority = 1) and optional_white(200020, type_weight = 999999) and lineage_white(200030) and optional_any_white(200040)");
    expect([...highlight.main]).toEqual([102, 103, 104, 105, 106, 107, 108, 109]);
    expect([...highlight.global]).toEqual([2000102]);
    expect([...highlight.optionalMainWhite]).toEqual([200360, 201600]);
    expect([...highlight.optionalWhite]).toEqual([200020, 200040]);
    expect([...highlight.lineageWhite]).toEqual([200030]);
    for (const query of [
      'not overlaps(white_sparks, (2000101, 2000102, 2000103))',
      'not main_blue_factors in (101, 102, 103)', 'main_blue_factors not in (101, 102, 103)', 'main_blue_factors != 103',
      'not (main_blue_factors = 103 or (overlaps(white_sparks, (2000101)) and optional_white(200010)))',
      "trainer_name = 'optional_white(200010) and main_blue_factors = 103'"
    ]) expect(Object.values(buildUqlSparkHighlight(query)).every(ids => ids.size === 0), query).toBe(true);
    expect([...buildUqlSparkHighlight('not (main_blue_factors = 103) and left_blue_factors = 102').left]).toEqual([102]);
  });
  it('highlights Any by star range and limits main-parent Any to its matching contribution', () => {
    for (const [color, main, group] of [['blue', 'mainBlue', 0], ['pink', 'mainPink', 1], ['green', 'mainGreen', 5]] as const) {
      const filters = emptyInheritanceFilters();
      const factor: InheritanceFactor = { ...decodeFactor(1000103), group, copies: 1, mainStars: 3, sources: [{ side: 'p1', owner: 'main', level: 3 }] };
      filters[color] = [{ factorId: 0, minimumStars: 2, maximumStars: 3 }];
      expect(inheritanceFactorMatched(factor, filters)).toBe(true);
      expect(inheritanceFactorMatched({ ...factor, level: 1 }, filters)).toBe(false);
      expect(inheritanceFactorMatched({ ...factor, level: 4 }, filters)).toBe(false);
      filters[color] = [];
      filters[main] = [{ factorId: 0, minimumStars: 3, maximumStars: 3 }];
      expect(inheritanceFactorMatched({ ...factor, level: 6 }, filters)).toBe(true);
      for (const source of [{ side: 'p1', owner: 'main', level: 2 }, { side: 'p1', owner: 'left', level: 3 }, { side: 'p2', owner: 'main', level: 3 }] as const) {
        expect(inheritanceFactorMatched({ ...factor, sources: [source] }, filters)).toBe(false);
      }
    }
    const filters = emptyInheritanceFilters();
    filters.white = filters.mainWhite = [{ factorId: 0, minimumStars: 1 }];
    expect(inheritanceFactorMatched({ ...decodeFactor(2000103), group: 3, copies: 1, mainStars: 3, sources: [{ side: 'p1', owner: 'main', level: 3 }] }, filters)).toBe(false);
  });
  it('preserves nine-star totals and separates the three original contributions', () => {
    expect(decodeFactor(109)).toMatchObject({ id: 10, level: 9, name: 'Speed' });
    const record = normalizeInheritanceSearch({ items: [{ account_id: '123', trainer_name: 'Trainer', inheritance: { inheritance_id: 1, main_parent_id: 100101, parent_left_id: 100201, parent_right_id: 100301, parent_rank: 10000, parent_rarity: 10, blue_sparks: [109], main_blue_factors: 103, left_blue_factors: 103, right_blue_factors: 103 } }], total: 1, page: 1, limit: 20, total_pages: 1 }).records[0]!;
    expect(inheritanceFactors(record)).toMatchObject([{ id: 10, level: 9, copies: 3, mainStars: 3 }]);
    expect(inheritanceFactors(record, true).map(({ owner, level }) => [owner, level])).toEqual([['main', 3], ['left', 3], ['right', 3]]);
    expect(inheritanceFactors(record, false, 'left')).toMatchObject([{ owner: 'left', level: 3 }]);
  });
  it('keeps source and total affinity aligned with the planner, including explicit P2 race wins', () => {
    const record = normalizeInheritanceSearch({ items: [{ account_id: '123', trainer_name: 'Trainer', inheritance: { inheritance_id: 1, main_parent_id: 100201, parent_left_id: 100401, parent_right_id: 100501, parent_rank: 10000, parent_rarity: 10, affinity_score: 83, main_win_saddles: [1, 3], left_win_saddles: [2] } }], total: 1, page: 1, limit: 20, total_pages: 1 }).records[0]!;
    const partner = { cardId: 100301, factors: [], parents: [{ positionId: 10, cardId: 100601, factors: [] }, { positionId: 20, cardId: 100701, factors: [] }], rawSource: { win_saddle_id_array: [99] } } as unknown as VeteranRecord;
    const engine = new VeteranAffinityEngine({ chars: [1001,1002,1003,1004,1005,1006,1007], aff2: Array(49).fill(2), aff3: Array(343).fill(3) });
    const groups = new Map([[1,100],[2,100],[3,100],[99,200]]);
    const affinity = inheritanceAffinity(record, 100101, partner, engine, groups, [2]);
    expect(affinity).toMatchObject({ total: 24, base: 18, race: 6, crossRace: 3 });
    expect(affinity.detail('main')).toEqual({ total: 16, base: 8, cross: 2, race: 6 });
    expect(affinity.detail('left')).toEqual({ total: 6, base: 3, cross: 0, race: 3 });
    for (const owner of ['main', 'left', 'right'] as const) expect(affinity.source({ side: 'p1', owner, level: 3 })).toBe(affinity.detail(owner)?.total);
    const breeding = inheritanceAffinity(record, undefined, partner, engine, groups);
    expect(breeding.total).toBe(7);
    expect(breeding.detail('main')).toEqual({ total: 7, base: 4, cross: 0, race: 3 });
    expect(inheritanceAffinity(record, undefined, partner, undefined, groups).total).toBe(83);
    expect(inheritanceAffinity(record, 100101, partner, undefined, groups).total).toBeNull();
  });
  it('retains P2-only grandparent contributions when the selected Veteran has no own sparks', () => {
    const record = normalizeInheritanceSearch({ items: [{ account_id: '123', trainer_name: 'Trainer', inheritance: { inheritance_id: 1, main_parent_id: 100101, parent_left_id: 100201, parent_right_id: 100301, parent_rank: 10000, parent_rarity: 10, main_blue_factors: 103 } }], total: 1, page: 1, limit: 20, total_pages: 1 }).records[0]!;
    const partner = { factors: [], parents: [{ positionId: 10, factors: [{ id: 10, level: 2 }] }, { positionId: 20, factors: [{ id: 10, level: 1 }] }] } as unknown as VeteranRecord;
    expect(inheritanceFactors(record, false, undefined, partner)[0]).toMatchObject({ level: 6, copies: 3, mainStars: 3, sources: [{ side: 'p1', owner: 'main', level: 3 }, { side: 'p2', owner: 'left', level: 2 }, { side: 'p2', owner: 'right', level: 1 }] });
    expect(inheritanceFactors(record, false, 'main', partner)[0]).toMatchObject({ level: 3, copies: 1 });
  });
  it('highlights the Angular global star range and main-parent or preferred-white requirements', () => {
    const filters = emptyInheritanceFilters();
    filters.blue = [{ factorId: 10, minimumStars: 6, maximumStars: 9 }];
    const factor: InheritanceFactor = { ...decodeFactor(109), group: 0, copies: 3, mainStars: 3, sources: [{ side: 'p1', owner: 'main', level: 3 }] };
    expect(inheritanceFactorMatched(factor, filters)).toBe(true);
    expect(inheritanceFactorMatched({ ...factor, level: 5 }, filters)).toBe(false);
    filters.mainBlue = [{ factorId: 10, minimumStars: 3 }];
    expect(inheritanceFactorMatched({ ...factor, level: 5 }, filters)).toBe(true);
    expect(inheritanceFactorMatched({ ...factor, level: 5, sources: [{ side: 'p2', owner: 'main', level: 3 }] }, filters)).toBe(false);
    const white = { ...factor, id: 20001, group: 3 };
    filters.optionalMainWhite = [{ factorId: 20001, minimumStars: 1 }];
    expect(inheritanceFactorMatched(white, filters)).toBe(true);
    expect(inheritanceFactorMatched({ ...white, sources: [{ side: 'p1', owner: 'left', level: 3 }] }, filters)).toBe(false);
    filters.lineageWhiteIds = [20001];
    expect(inheritanceFactorMatched({ ...white, sources: [{ side: 'p1', owner: 'left', level: 3 }] }, filters)).toBe(true);
  });
});
