import { setupCatalogFixtures } from '../../../../tests/fixtures/catalog-setup';
setupCatalogFixtures();
import { describe, expect, it } from 'vitest';
import { validateInheritanceUql } from './uql';

describe('Angular UQL boundary', () => {
  it('shares Angular readable field names with the editor without shortening larger names', () => {
    for (const [query, compiled] of [
      ['White count >= 12', 'white_count >= 12'],
      ['Main common white stars >= 4 and Scenario white count >= 1', 'main_common_white_stars_sum >= 4 and scenario_white_count >= 1'],
      ['Wins >= 30 and Followers < 1000', 'win_count >= 30 and follower_num < 1000'],
      ['Total red sparks >= 6', 'pink_stars_sum >= 6'],
      ["Trainer ID = 'name and followers'", "account_id = 'name and followers'"]
    ]) expect(validateInheritanceUql(query!), query).toMatchObject({ state: 'valid', compiled });
  });
  it('normalizes where and friendly field aliases', () => expect(validateInheritanceUql('where total affinity >= 80 and G1 wins >= 6')).toMatchObject({ state: 'valid', compiled: 'affinity >= 80 and win_count >= 6' }));
  it('compiles Angular spark shorthand and accepts support-card parameters', () => {
    expect(validateInheritanceUql('Speed >= 6 and Long >= 3')).toMatchObject({ state: 'valid', compiled: 'overlaps(blue_sparks, (106, 107, 108, 109)) and overlaps(pink_sparks, (3403, 3404, 3405, 3406, 3407, 3408, 3409))' });
    expect(validateInheritanceUql('support_card(30137, lb >= 4)')).toMatchObject({ state: 'valid' });
  });
  it('matches Angular scoped and named factor comparisons, including absence and alternative grandparents', () => {
    // Source: DatabaseFilterComponent.buildScopedSparkComparison and buildZeroSparkComparisonClause.
    const cases = [
      ['Main Speed >= 3', 'main_blue_factors = 103'],
      ['parent Speed > 1', 'main_blue_factors in (102, 103)'],
      ['GP1 Long = 2', 'left_pink_factors = 3402'],
      ['great parent 2 Long != 1', 'right_pink_factors != 3401'],
      ['Any grandparent Speed >= 3', '(left_blue_factors = 103 or right_blue_factors = 103)'],
      ['Any GP Speed != 3', '(left_blue_factors != 103 and right_blue_factors != 103)'],
      ['Main Speed = 0', 'not main_blue_factors in (101, 102, 103)'],
      ['Main Speed > 0', 'main_blue_factors in (101, 102, 103)'],
      ['Main Speed >= 0', '(1 = 1)'],
      ['Main Speed < 0', '(1 = 0)'],
      ['Main Speed > 3', '(1 = 0)'],
      ['Main Straightaway Adept >= 2', 'overlaps(main_white_factors, (2003602, 2003603))'],
      ['Straightaway Adept != 2', 'not contains(white_sparks, 2003602)'],
      ["trainer_name = 'Main Speed' and Main Speed >= 3", "trainer_name = 'Main Speed' and main_blue_factors = 103"],
      ['not (Main Speed = 3 or GP1 Long = 2)', 'not (main_blue_factors = 103 or left_pink_factors = 3402)']
    ];
    for (const [query, compiled] of cases) expect(validateInheritanceUql(query!), query).toMatchObject({ state: 'valid', compiled });
  });
  it('extracts the editor-only sort directive', () => expect(validateInheritanceUql('sort by = affinity and white_count >= 10')).toMatchObject({ state: 'valid', sortBy: 'affinity_score', compiled: 'white_count >= 10' }));
  it('keeps explicit follower queries able to include capped accounts', () => expect(validateInheritanceUql('Followers = 1000')).toMatchObject({ state: 'valid', explicitFollowerFilter: true }));
  it('preserves quoted values without interpreting them as fields or expressions', () => {
    for (const query of ["trainer_name = 'blue stars'", "trainer_name = 'followers'", "trainer_name = 'Speed >= 6 and Long >= 3'", "trainer_name = 'Uma''s blue stars in []'", 'trainer_name = "white stars and followers"']) {
      expect(validateInheritanceUql(query)).toMatchObject({ state: 'valid', compiled: query, explicitFollowerFilter: false });
    }
    expect(validateInheritanceUql("trainer_name = 'followers' and followers < 1000")).toMatchObject({ state: 'valid', compiled: "trainer_name = 'followers' and follower_num < 1000", explicitFollowerFilter: true });
  });
  it('compiles white-category aliases before their shorter white-stars alias', () => {
    expect(validateInheritanceUql('Common white stars >= 3 and Scenario white stars >= 2 and Race white stars >= 1 and White stars >= 6')).toMatchObject({ state: 'valid', compiled: 'common_white_stars_sum >= 3 and scenario_white_stars_sum >= 2 and race_white_stars_sum >= 1 and white_stars_sum >= 6' });
  });
  it('blocks incomplete delimiters and unknown fields', () => {
    expect(validateInheritanceUql("trainer_name ilike 'Uma").state).toBe('incomplete');
    expect(validateInheritanceUql('mystery_score > 4')).toMatchObject({ state: 'invalid', message: 'Unknown field or function: mystery_score' });
    expect(validateInheritanceUql('Spe')).toMatchObject({ state: 'invalid', message: 'Unknown field or function: Spe' });
    expect(validateInheritanceUql('unknown(3)')).toMatchObject({ state: 'invalid', message: 'Unknown field or function: unknown()' });
    expect(validateInheritanceUql('main_white_factors in (contains(white_sparks, 2003601))')).toMatchObject({ state: 'invalid', message: 'IN lists only accept literal values, not nested functions' });
    expect(validateInheritanceUql("trainer_name in ('a(b)', 'Uma')").state).toBe('valid');
    expect(validateInheritanceUql('Speed >= 3 an')).toMatchObject({ state: 'incomplete', message: 'Finish the boolean operator' });
    expect(validateInheritanceUql('Main has all ()')).toMatchObject({ state: 'incomplete', message: 'Choose at least one skill' });
    for (const query of ['Speed +', 'has any', 'does not have', 'contains all']) expect(validateInheritanceUql(query).state).toBe('incomplete');
  });
});
