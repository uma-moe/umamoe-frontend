import { PlannerGlobalRewardComparison } from '../models/carat-planner.model';
import {
  conditionalRewardScenarioGroup,
  conditionalRewardScenarioSelectionMatches,
  MASTERS_CHALLENGE_SCENARIO_GROUP_ID,
  plannerIncomeAssumptionGroups,
  RACING_CARNIVAL_CLEARS_ONLY_OPTION,
  RANDOM_GAMEPLAY_INCOME_SCENARIO_GROUP_ID,
  randomGameplayIncomeRules,
  SPECULATIVE_INCOME_SCENARIO_GROUP_ID,
  TRAINER_SKILLS_TEST_SCORE_ONLY_OPTION,
} from './carat-planner-income-assumptions';

describe('plannerIncomeAssumptionGroups', () => {
  it('shows the audited Global uplift buckets and derived monthly rate', () => {
    const comparison: PlannerGlobalRewardComparison = {
      news_match_method: 'same_announce_id',
      speculative_method: 'mean_last_6_complete_calendar_months',
      archive_as_of: '2026-08-07',
      observation_start: '2025-06-26',
      observation_end: '2026-08-06',
      observation_days: 407,
      observed_months: 13.372,
      matched_news_global_carats: 10_200,
      matched_news_jp_carats: 10_200,
      matched_news_extra_carats: 0,
      en_only_news_carats: 2850,
      social_carats: 33_600,
      social_reward_posts: 26,
      social_news_duplicate_reward_items_removed: 1,
      social_news_duplicate_carats_removed: 1500,
      speculative_observed_carats: 36_450,
      speculative_mean_monthly_carats: 2726,
      speculative_recent_median_monthly_carats: 775,
      speculative_recent_median_window_start: '2026-02',
      speculative_recent_median_window_end: '2026-07',
      speculative_monthly_carats: 1233,
      speculative_window_start: '2026-02',
      speculative_window_end: '2026-07',
      speculative_months: [2100, 600, 2700, 450, 600, 950]
        .map((total_carats, index) => ({
          month: `2026-${String(index + 2).padStart(2, '0')}`,
          matched_news_extra_carats: 0,
          en_only_news_carats: index === 5 ? 350 : 0,
          social_carats: total_carats - (index === 5 ? 350 : 0),
          total_carats,
        })),
      matched_news: [{
        announce_id: 902,
        title: 'Matched',
        global_carats: 6000,
        jp_carats: 6000,
        extra_carats: 0,
        global_url: 'https://umamusume.com/news/902/',
        jp_url: 'https://umapyoi.net/news/902?lang=jp',
      }, { announce_id: 887, title: 'Matched', global_carats: 1200, jp_carats: 1200, extra_carats: 0, global_url: '' }, { announce_id: 860, title: 'Matched', global_carats: 1500, jp_carats: 1500, extra_carats: 0, global_url: '' }, { announce_id: 813, title: 'Matched', global_carats: 1500, jp_carats: 1500, extra_carats: 0, global_url: '' }],
      en_only_news: Array.from({ length: 7 }, (_, index) => ({
        announce_id: 100_000 + index,
        title: 'EN-only',
        global_carats: 1,
        jp_carats: 0,
        extra_carats: 1,
        global_url: '',
      })),
    };

    const group = plannerIncomeAssumptionGroups([], comparison)
      .find(candidate => candidate.id === SPECULATIVE_INCOME_SCENARIO_GROUP_ID);

    expect(group?.scheduleLabel).toBe(
      'Rolling average of the last six completed months',
    );
    expect(group?.helpText).toBe([
      'Estimates extra Global-only Carats not already counted as confirmed income.',
      '',
      'Rolling mean averages the last 6 completed months and works best for long-term planning.',
      'Conservative median: reduces the effect of unusually generous months.',
      'None: confirmed income only.',
      '',
      'Updates automatically. Duplicate EN/JP and X/news rewards are removed.',
    ].join('\n'));
    expect(group?.options).toEqual([
      { value: 'include', label: 'Rolling mean', amountLabel: '+1,233 Carats / month' },
      { value: 'median', label: 'Conservative median', amountLabel: '+775 Carats / month' },
    ]);
  });

  it('exposes every player-dependent dated reward family as an explicit toggle', () => {
    const cases = [
      ['Story event rewards', 'jp_reward_parity_full_completion', 'story_event_rewards'],
      ["Agnes Tachyon's Factor Research box rewards", 'all_reward_boxes', 'factor_research_rewards'],
      ['Trainer Skills Test score rewards', 'full_score_completion', 'trainer_skills_test_rewards'],
      ['Racing Carnival shop exchanges', 'all_limited_shop_exchanges', 'racing_carnival_rewards'],
      ['Training scenario evaluation rewards', 'jp_reward_parity_scenario_evaluation_thresholds', 'scenario_evaluation_rewards'],
      ['Main Story episode rewards', 'all_story_episodes_viewed', 'main_story_rewards'],
      ['Limited login bonus', 'all_login_days', 'limited_login_rewards'],
      ['5th Anniversary 記念ミッション 第2弾', 'jp_reward_parity', 'limited_mission_rewards'],
      ['Masters Challenge first-clear rewards', 'all_first_clears_high_difficulty', MASTERS_CHALLENGE_SCENARIO_GROUP_ID],
    ] as const;

    for (const [label, assumption, expectedGroup] of cases) {
      expect(conditionalRewardScenarioGroup({ label, assumption })).toBe(expectedGroup);
    }
    expect(conditionalRewardScenarioGroup({
      label: 'Broadcast celebration gift',
      assumption: 'jp_reward_parity',
    })).toBeUndefined();

    const groups = plannerIncomeAssumptionGroups([]);
    for (const [, , expectedGroup] of cases) {
      expect(groups.some(group => group.id === expectedGroup)).toBeTrue();
    }
  });

  it('supports truthful partial completion for reward families with separate sources', () => {
    const skillsScore = {
      label: 'Trainer Skills Test score rewards',
      assumption: 'full_score_completion',
    };
    const skillsShop = {
      label: 'Trainer Skills Test shop exchanges',
      assumption: 'full_exchange',
    };
    const carnivalClears = {
      label: 'Racing Carnival first-clear rewards',
      assumption: 'all_first_clears',
    };
    const carnivalShop = {
      label: 'Racing Carnival shop exchanges',
      assumption: 'all_limited_shop_exchanges',
    };

    expect(conditionalRewardScenarioSelectionMatches(
      skillsScore,
      TRAINER_SKILLS_TEST_SCORE_ONLY_OPTION,
    )).toBeTrue();
    expect(conditionalRewardScenarioSelectionMatches(
      skillsShop,
      TRAINER_SKILLS_TEST_SCORE_ONLY_OPTION,
    )).toBeFalse();
    expect(conditionalRewardScenarioSelectionMatches(
      carnivalClears,
      RACING_CARNIVAL_CLEARS_ONLY_OPTION,
    )).toBeTrue();
    expect(conditionalRewardScenarioSelectionMatches(
      carnivalShop,
      RACING_CARNIVAL_CLEARS_ONLY_OPTION,
    )).toBeFalse();
    expect(conditionalRewardScenarioSelectionMatches(skillsShop, 'include')).toBeTrue();
    expect(conditionalRewardScenarioSelectionMatches(carnivalShop, 'none')).toBeFalse();
  });

  it('offers transparent activity-based random gameplay estimates', () => {
    const group = plannerIncomeAssumptionGroups([])
      .find(candidate => candidate.id === RANDOM_GAMEPLAY_INCOME_SCENARIO_GROUP_ID);

    expect(group?.scheduleLabel).toBe('Weekly estimate based on active play');
    expect(group?.options).toEqual([
      { value: 'low', label: 'Low commitment', amountLabel: '+20 Carats / week', amounts: { free_jewels: 20 } },
      { value: 'medium', label: 'Medium commitment', amountLabel: '+90 Carats / week', amounts: { free_jewels: 90 } },
      { value: 'high', label: 'High commitment', amountLabel: '+250 Carats / week', amounts: { free_jewels: 250 } },
    ]);
    expect(group?.helpText).toContain('Independent Training still requires collecting and restarting each run.');
    expect(randomGameplayIncomeRules('medium', '2026-08-15')).toEqual([
      jasmine.objectContaining({
        id: 'random-gameplay-income-medium',
        amount: 90,
        cadence: 'weekly',
        start_date: '2026-08-15',
      }),
    ]);
    expect(randomGameplayIncomeRules(undefined, '2026-08-15')).toEqual([]);
  });
});
