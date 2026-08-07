import { PlannerGlobalRewardComparison } from '../models/carat-planner.model';
import {
  plannerIncomeAssumptionGroups,
  SPECULATIVE_INCOME_SCENARIO_GROUP_ID,
} from './carat-planner-income-assumptions';

describe('plannerIncomeAssumptionGroups', () => {
  it('shows the audited Global uplift buckets and derived monthly rate', () => {
    const comparison: PlannerGlobalRewardComparison = {
      news_match_method: 'same_announce_id',
      speculative_method: 'mean_last_12_complete_calendar_months',
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
      speculative_monthly_carats: 1517,
      speculative_window_start: '2025-08',
      speculative_window_end: '2026-07',
      speculative_months: [300, 1800, 300, 4500, 3000, 900, 2100, 600, 2700, 450, 600, 950]
        .map((total_carats, index) => ({
          month: index < 5
            ? `2025-${String(index + 8).padStart(2, '0')}`
            : `2026-${String(index - 4).padStart(2, '0')}`,
          matched_news_extra_carats: 0,
          en_only_news_carats: index === 11 ? 350 : 0,
          social_carats: total_carats - (index === 11 ? 350 : 0),
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
      '12-month expected mean Aug 2025–Jul 2026 [300, 1,800, 300, 4,500, 3,000, 900, 2,100, 600, 2,700, 450, 600, 950] = 1,517/month; conservative 6-month median Feb–Jul 2026 = 775/month. Sources: 4 matched news use EN−JP delta; 7 EN-only; 26 deduped X/Twitter; 1 overlapping item / 1,500 Carats removed',
    );
    expect(group?.options[0].amountLabel).toBe('+1,517 Carats / month');
  });
});
