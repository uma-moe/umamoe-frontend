import { describe, expect, it } from 'vitest';
import {
  emptyInheritanceFilters,
  type InheritanceRecord
} from '@/lib/inheritance/search/inheritance-search';
import {
  automaticInheritanceSort,
  filterAndSortBookmarks,
  hasMeaningfulInheritanceFilters
} from './database-local-results';

function record(patch: Partial<InheritanceRecord> = {}): InheritanceRecord {
  return {
    id: 1,
    accountId: '123456789012',
    trainerName: 'Trainer',
    borrowViews: 5,
    borrowCopies: 2,
    mainParentId: 1001,
    leftParentId: 1002,
    rightParentId: 1003,
    rankScore: 100,
    rarity: 5,
    blueSparks: [103],
    pinkSparks: [202],
    greenSparks: [],
    whiteSparks: [202161],
    mainWhite: [202161],
    leftWhite: [],
    rightWhite: [],
    winCount: 5,
    whiteCount: 1,
    affinity: 40,
    mainWinSaddles: [7],
    leftWinSaddles: [],
    rightWinSaddles: [],
    raceResults: [],
    ...patch
  };
}

describe('Angular Database local result behavior', () => {
  it('applies Any green star ranges to bookmarks and excludes missing factors', () => {
    const filters = emptyInheritanceFilters();
    filters.green = [{ factorId: 0, minimumStars: 2, maximumStars: 2 }];
    const records = [
      record({ id: 1 }),
      record({ id: 2, greenSparks: [1000101] }),
      record({ id: 3, greenSparks: [1000102] }),
      record({ id: 4, greenSparks: [1000203] })
    ];

    expect(filterAndSortBookmarks(records, filters, 'all', true).map((item) => item.id)).toEqual([
      3
    ]);
  });

  it('excludes every costume of the selected legacy from local bookmarks', () => {
    const filters = emptyInheritanceFilters();
    filters.p2MainCharaId = 1001;
    const records = [
      record({ id: 1, mainParentId: 100101 }),
      record({ id: 2, mainParentId: 100102 }),
      record({ id: 3, mainParentId: 100201 })
    ];

    expect(filterAndSortBookmarks(records, filters, 'all', true).map((item) => item.id)).toEqual([
      3
    ]);
    filters.p2MainCharaId = undefined;
    expect(filterAndSortBookmarks(records, filters, 'all', true)).toHaveLength(3);
  });

  it('switches the untouched sort between Trending and Affinity', () => {
    const filters = emptyInheritanceFilters();
    expect(hasMeaningfulInheritanceFilters(filters)).toBe(false);
    expect(automaticInheritanceSort(filters)).toBe('trending');
    filters.playerCharaId = 1001;
    expect(automaticInheritanceSort(filters)).toBe('affinity_score');
  });

  it('applies active filters to bookmarks instead of only the stale chip', () => {
    const filters = emptyInheritanceFilters();
    filters.blue = [{ factorId: 10, minimumStars: 3 }];
    filters.sortBy = 'affinity_score';
    const result = filterAndSortBookmarks(
      [record({ id: 1, affinity: 20 }), record({ id: 2, blueSparks: [102], affinity: 90 })],
      filters,
      'all',
      true
    );

    expect(result.map((item) => item.id)).toEqual([1]);
  });

  it('sorts bookmark results locally and respects max followers', () => {
    const filters = emptyInheritanceFilters();
    filters.sortBy = 'affinity_score';
    const result = filterAndSortBookmarks(
      [
        record({ id: 1, affinity: 20 }),
        record({ id: 2, affinity: 90, followerCount: 1000 }),
        record({ id: 3, affinity: 50 })
      ],
      filters,
      'all',
      false
    );

    expect(result.map((item) => item.id)).toEqual([3, 1]);
  });

  it('matches OR-chained spark requirements as one alternative group', () => {
    const filters = emptyInheritanceFilters();
    filters.blue = [
      { factorId: 10, minimumStars: 3 },
      { factorId: 20, minimumStars: 2, operator: 'or' }
    ];

    const result = filterAndSortBookmarks(
      [
        record({ id: 1, blueSparks: [103] }),
        record({ id: 2, blueSparks: [202] }),
        record({ id: 3, blueSparks: [301] })
      ],
      filters,
      'all',
      true
    );

    expect(result.map((item) => item.id)).toEqual([1, 2]);
    filters.blue.push({ factorId: 10, minimumStars: 3, operator: 'and' });
    const overlapping = filterAndSortBookmarks(
      [
        record({ id: 1, blueSparks: [103] }),
        record({ id: 2, blueSparks: [202, 203] }),
        record({ id: 3, blueSparks: [103, 202] })
      ],
      filters,
      'all',
      true
    );

    expect(overlapping.map((item) => item.id)).toEqual([1, 3]);
  });
});
