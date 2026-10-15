import { setupCatalogFixtures } from '../../../../tests/fixtures/catalog-setup';
setupCatalogFixtures();
import { expect, it } from 'vitest';
import { loadUqlQueryCatalog } from '@/lib/catalog/uql-catalog';
import { UqlCompiler } from './uql-compiler';
import { validateInheritanceUql } from './uql';
import {
  emptyInheritanceFilters,
  inheritanceSearchQuery,
} from '../inheritance-search';

// Recorded from the running Angular DatabaseFilterComponent, 2026-09-05.
// These are expected source outputs, never computed using the migrated compiler.
const angularQueries = [
  [
    'has Straightaway Adept',
    'overlaps(white_sparks, (2003601, 2003602, 2003603, 2003604, 2003605, 2003606, 2003607, 2003608, 2003609))',
  ],
  [
    'Main has all (Groundwork, Ignited Spirit WIT)',
    '(overlaps(main_white_factors, (2016001, 2016002, 2016003)) and overlaps(main_white_factors, (2100501, 2100502, 2100503)))',
  ],
  [
    'GP1 has any (Speed >= 2, Long >= 1, Groundwork >= 2)',
    '(left_blue_factors in (102, 103) or left_pink_factors in (3401, 3402, 3403) or overlaps(left_white_factors, (2016002, 2016003)))',
  ],
  [
    'GP2 does not have Groundwork',
    'not overlaps(right_white_factors, (2016001, 2016002, 2016003))',
  ],
  [
    'Great parent has all (Groundwork, Straightaway Adept)',
    '(overlaps(left_white_factors, (2016001, 2016002, 2016003)) and overlaps(right_white_factors, (2016001, 2016002, 2016003)) and overlaps(left_white_factors, (2003601, 2003602, 2003603)) and overlaps(right_white_factors, (2003601, 2003602, 2003603)))',
  ],
  [
    'has any (Groundwork, Straightaway Adept)',
    '(overlaps(white_sparks, (2016001, 2016002, 2016003, 2016004, 2016005, 2016006, 2016007, 2016008, 2016009)) or overlaps(white_sparks, (2003601, 2003602, 2003603, 2003604, 2003605, 2003606, 2003607, 2003608, 2003609)))',
  ],
  [
    'has all (Groundwork, Straightaway Adept)',
    '(overlaps(white_sparks, (2016001, 2016002, 2016003, 2016004, 2016005, 2016006, 2016007, 2016008, 2016009)) and overlaps(white_sparks, (2003601, 2003602, 2003603, 2003604, 2003605, 2003606, 2003607, 2003608, 2003609)))',
  ],
  [
    'White factors in (Groundwork >= 2, Straightaway Adept)',
    '(overlaps(white_sparks, (2016002, 2016003, 2016004, 2016005, 2016006, 2016007, 2016008, 2016009)) or overlaps(white_sparks, (2003601, 2003602, 2003603, 2003604, 2003605, 2003606, 2003607, 2003608, 2003609)))',
  ],
  [
    'Main Straightaway Adept >= 2',
    'overlaps(main_white_factors, (2003602, 2003603))',
  ],
  ['GP2 Speed = 0', 'not right_blue_factors in (101, 102, 103)'],
  [
    'Great parent Long != 2',
    '(left_pink_factors != 3402 and right_pink_factors != 3402)',
  ],
  [
    'Main blue sparks >= 2',
    'main_blue_factors in (102, 103, 202, 203, 302, 303, 402, 403, 502, 503)',
  ],
  [
    'Blue factors >= 6',
    'overlaps(blue_sparks, (106, 107, 108, 109, 206, 207, 208, 209, 306, 307, 308, 309, 406, 407, 408, 409, 506, 507, 508, 509))',
  ],
  [
    'Speed + Stamina >= 6',
    'spark_sum(blue_sparks, 10) + spark_sum(blue_sparks, 20) >= 6',
  ],
  [
    '(Speed + Stamina) >= 6',
    '(spark_sum(blue_sparks, 10) + spark_sum(blue_sparks, 20)) >= 6',
  ],
  [
    'Speed * 2 + Stamina >= 9',
    'spark_sum(blue_sparks, 10) * 2 + spark_sum(blue_sparks, 20) >= 9',
  ],
  [
    'optional white in (Groundwork, Ignited Spirit WIT, priority = 0, type_weight = 150, level_weight = 2)',
    'optional_white(201600, 210050, priority = 0, type_weight = 150, level_weight = 2)',
  ],
  [
    'lineage white in (Groundwork, Ignited Spirit WIT, priority = 1, stack_weight = 1200, base = 115, decay = 50)',
    'lineage_white(201600, 210050, priority = 1, stack_weight = 1200, base = 115, decay = 50)',
  ],
  ['optional main white = Groundwork', 'optional_main_white(201600)'],
  [
    'optional_white((Groundwork, Straightaway Adept), group = -1)',
    'optional_white((201600, 200360), priority = 0)',
  ],
  [
    'Characters in (Special Week, Silence Suzuka)',
    '(main_chara_id in (100101, 100201) or left_chara_id in (100101, 100201) or right_chara_id in (100101, 100201))',
  ],
  [
    'GP characters != Mejiro McQueen',
    '(left_chara_id != 101301 and right_chara_id != 101301)',
  ],
  ['Main character = Tokai Teio [Anime Collab]', 'main_chara_id = 100302'],
  ['Main parent = Special Week', 'main_parent_id = 100101'],
  [
    'Support card = Kitasan Black [SSR] (Speed) and limitbreak >= 4',
    'support_card(30028, lb >= 4)',
  ],
  [
    'support_card(Kitasan Black [SSR] (Speed), limit_break_count >= 3)',
    'support_card(30028, lb >= 3)',
  ],
  [
    'Support card not in (Kitasan Black [SSR] (Speed), Super Creek [SSR] (Stamina))',
    '(not support_card(30028) and not support_card(30016))',
  ],
  ['LB >= 4', 'support_card(lb >= 4)'],
  ['Scenario = Unity Cup', 'scenario_id = 2'],
  ['Race wins has Arima Kinen', 'overlaps(main_win_saddles, (2, 6, 10, 146))'],
  [
    'Left race wins has all (Arima Kinen, Japan Cup)',
    '(overlaps(left_win_saddles, (2, 6, 10, 146)) and overlaps(left_win_saddles, (2, 11)))',
  ],
  [
    'Race wins does not have Arima Kinen',
    'not overlaps(main_win_saddles, (2, 6, 10, 146))',
  ],
];

it('preserves Angular query compilation and request serialization across the complete expression families', async () => {
  const compiler = new UqlCompiler(await loadUqlQueryCatalog());
  for (const [query, compiled] of angularQueries) {
    const validation = validateInheritanceUql(query!, compiler);
    expect(validation, query).toMatchObject({ state: 'valid', compiled });
    const filters = { ...emptyInheritanceFilters(), uql: query };
    expect(
      inheritanceSearchQuery(filters, 0, 12, 'uql', validation).get('uql'),
      query,
    ).toBe(compiled);
  }
});

it('retains literal data and blocks unresolved or invalid query payloads instead of dropping the filter', async () => {
  const compiler = new UqlCompiler(await loadUqlQueryCatalog());
  const query = "trainer_name = 'a  b' and Followers >= 1";
  expect(validateInheritanceUql(query, compiler)).toMatchObject({
    state: 'valid',
    compiled: "trainer_name = 'a  b' and follower_num >= 1",
  });
  for (const query of [
    'has Not A Real Skill',
    'main_white_factors in (contains(white_sparks, 2003601))',
    'Support card = Not A Card',
    'Main character = Not A Character',
  ]) {
    const validation = validateInheritanceUql(query, compiler);
    expect(validation.state, query).toBe('invalid');
    expect(() =>
      inheritanceSearchQuery(
        { ...emptyInheritanceFilters(), uql: query },
        0,
        12,
        'uql',
        validation,
      ),
    ).toThrow();
  }
});
