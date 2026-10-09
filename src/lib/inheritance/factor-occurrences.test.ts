import { setupCatalogFixtures } from '../../../tests/fixtures/catalog-setup';
setupCatalogFixtures();
import { expect, it } from 'vitest';
import { occurrenceComparison } from './factor-occurrences';
import { emptyInheritanceFilters, inheritanceSearchQuery, normalizeInheritanceRecord } from './inheritance-search';
import { validateInheritanceUql } from './uql';
import { compactStateFromFilters, filtersFromCompactState } from '@/pages/database/database-preferences';
import { bookmarkMatchesFilters } from '@/pages/database/database-local-results';

it('counts all parent-presence combinations independently of stars', () => {
  for (const operator of ['=', '!=', '<', '<=', '>', '>=']) {
    for (let count = 0; count <= 4; count++) {
      const compiled = occurrenceComparison(10, ['blue_sparks'], operator, count);
      expect(validateInheritanceUql(compiled).state).toBe('valid');
      for (let mask = 0; mask < 8; mask++) {
        const total = [0, 1, 2].filter(index => mask & (1 << index)).length;
        const expression = compiled.replace(/(main|left|right)_blue_factors in \([^)]*\)/g, (_, scope: string) => String(!!(mask & (1 << ['main', 'left', 'right'].indexOf(scope)))))
          .replace(/\band\b/g, '&&').replace(/\bor\b/g, '||').replace(/\bnot\b/g, '!').replace(/ = /g, ' === ');
        expect(Function(`return ${expression}`)(), `${operator} ${count}, mask ${mask}`).toBe(Function(`return ${total} ${operator === '=' ? '===' : operator} ${count}`)());
      }
    }
  }
});

it('accepts x/× in named, scoped, negated, and list predicates', () => {
  for (const query of [
    'Groundwork > 6 and Groundwork = 3x',
    'Groundwork = 3x and Groundwork > 6',
    'Main Speed = 1x or Main Stamina = 1x',
    'Main Groundwork = 0x',
    'GP has Groundwork = 2x and not Main Groundwork = 1x',
    'has all (Groundwork >= 2x, Speed = 3×)',
    'overlaps(white_sparks, (Groundwork = 2x, Straightaway Adept))',
    'where not Groundwork = 3x',
  ]) {
    const result = validateInheritanceUql(query);
    expect(result, query).toMatchObject({ state: 'valid' });
    expect(result.compiled).not.toMatch(/\d\s*[x×]/);
  }
  expect(validateInheritanceUql('Main Groundwork = 1x').compiled).not.toMatch(/left_|right_/);
  for (const invalid of ['Groundwork = 1.5x', 'Groundwork = 3xyz']) expect(validateInheritanceUql(invalid).state).toBe('invalid');
});

it('retains both ranges but applies only the selected metric to requests and bookmarks', () => {
  const filters = emptyInheritanceFilters();
  filters.white = [{ factorId: 201600, minimumStars: 7, maximumStars: 9, minimumOccurrences: 3, maximumOccurrences: 3, metric: 'occurrences' }];
  filters.mainBlue = [{ factorId: 0, minimumStars: 2, maximumStars: 2 }, { factorId: 20, minimumStars: 3, maximumStars: 3, operator: 'or' }];
  const restored = filtersFromCompactState(JSON.parse(JSON.stringify(compactStateFromFilters(filters, {}))), 'advanced');
  expect(restored.white).toEqual(filters.white);
  expect(restored.mainBlue).toEqual(filters.mainBlue);
  const query = inheritanceSearchQuery(restored, 0, 12);
  expect(query.has('white_sparks')).toBe(false);
  expect(query.has('main_parent_blue_sparks')).toBe(false);
  expect(query.get('uql')).not.toContain('2016007, 2016008, 2016009');
  expect(query.get('uql')).toContain('main_white_factors');
  expect(query.get('uql')).toContain('main_blue_factors in (2) or main_blue_factors in (203)');
  expect(validateInheritanceUql(query.get('uql')!).state).toBe('valid');
  const record = normalizeInheritanceRecord({ account_id: 'a', trainer_name: 'Trainer', inheritance: {
    inheritance_id: 1, main_parent_id: 1001, parent_left_id: 1002, parent_right_id: 1003, parent_rank: 100, parent_rarity: 3,
    white_sparks: [2016007], main_white_factors: [2016003], left_white_factors: [2016002], right_white_factors: [2016002], main_blue_factors: 102,
  } })!;
  expect(bookmarkMatchesFilters(record, restored, true)).toBe(true);
  expect(bookmarkMatchesFilters({ ...record, rightWhite: [] }, restored, true)).toBe(false);
  expect(bookmarkMatchesFilters({ ...record, whiteSparks: [2016006] }, restored, true)).toBe(true);
  expect(bookmarkMatchesFilters({ ...record, mainBlue: 103 }, restored, true)).toBe(false);

  restored.white[0]!.metric = 'stars';
  expect(inheritanceSearchQuery(restored, 0, 12).get('white_sparks')).toBe('2016007,2016008,2016009');
  expect(inheritanceSearchQuery(restored, 0, 12).get('uql')).not.toContain('white_factors');
  expect(bookmarkMatchesFilters({ ...record, rightWhite: [] }, restored, true)).toBe(true);
  expect(bookmarkMatchesFilters({ ...record, whiteSparks: [2016006] }, restored, true)).toBe(false);

  restored.white.push({ ...filters.white[0]! });
  expect(inheritanceSearchQuery(restored, 0, 12).get('uql')).toContain('2016007, 2016008, 2016009');
  expect(bookmarkMatchesFilters(record, restored, true)).toBe(true);
  expect(bookmarkMatchesFilters({ ...record, rightWhite: [] }, restored, true)).toBe(false);
  expect(bookmarkMatchesFilters({ ...record, whiteSparks: [2016006] }, restored, true)).toBe(false);

  restored.white = [];
  restored.mainWhite = [{ factorId: 201600, minimumStars: 1, maximumStars: 3, minimumOccurrences: 0, maximumOccurrences: 0, metric: 'occurrences' }];
  expect(bookmarkMatchesFilters({ ...record, mainWhite: [] }, restored, true)).toBe(true);
  expect(bookmarkMatchesFilters(record, restored, true)).toBe(false);
  restored.mainBlue.push({ factorId: 20, minimumStars: 3, maximumStars: 3, operator: 'and' });
  expect(bookmarkMatchesFilters({ ...record, mainWhite: [] }, restored, true)).toBe(false);
  restored.mainBlue = [];
  restored.mainWhite = [];
  restored.blue = [{ factorId: 0, minimumStars: 3, maximumStars: 3, minimumOccurrences: 3, maximumOccurrences: 3, metric: 'occurrences' }];
  expect(inheritanceSearchQuery(restored, 0, 12).get('uql')).toBe('(any_spark(blue_sparks, 1, 9, 3, 3))');
  expect(validateInheritanceUql(inheritanceSearchQuery(restored, 0, 12).get('uql')!).state).toBe('valid');
  expect(bookmarkMatchesFilters({ ...record, blueSparks: [103, 206], mainBlue: 103, leftBlue: 202, rightBlue: 202 }, restored, true)).toBe(false);
  expect(bookmarkMatchesFilters({ ...record, blueSparks: [103], mainBlue: 101, leftBlue: 101, rightBlue: 101 }, restored, true)).toBe(true);

  restored.blue = [];
  restored.white = [{ factorId: 201600, minimumStars: 9, maximumStars: 9, metric: 'occurrences' }];
  expect(validateInheritanceUql(inheritanceSearchQuery(restored, 0, 12).get('uql')!).state).toBe('valid');
  expect(bookmarkMatchesFilters({ ...record, whiteSparks: [], mainWhite: [], leftWhite: [], rightWhite: [] }, restored, true)).toBe(true);
});
