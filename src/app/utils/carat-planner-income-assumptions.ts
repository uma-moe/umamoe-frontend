import {
  CaratPlannerTimelineEvent,
  PlannerCurrency,
  PlannerGlobalRewardComparison,
  PlannerIncomeRule,
  PlannerRewardEntry,
} from '../models/carat-planner.model';

export const TRAINING_PASS_SCENARIO_GROUP_ID = 'training_pass';
export const MONTHLY_SHOP_SCENARIO_GROUP_ID = 'monthly_shop_tickets';
export const MONTHLY_SHOP_FRIEND_POINTS_OPTION = 'friend_points';
export const MONTHLY_SHOP_ALL_OPTION = 'include';
export const SPECULATIVE_INCOME_SCENARIO_GROUP_ID = 'speculative_income';
export const RANDOM_GAMEPLAY_INCOME_SCENARIO_GROUP_ID = 'random_gameplay_income';
export const TEMPORARY_STORY_REWARDS_SCENARIO_GROUP_ID = 'temporary_story_rewards';
export const RACING_CARNIVAL_MISSION_SCENARIO_GROUP_ID = 'racing_carnival_mission';
export const MASTERS_CHALLENGE_SCENARIO_GROUP_ID = 'masters_challenge_rewards';
export const MASTERS_CHALLENGE_ONE_CLEAR_OPTION = 'clear_1';
export const MASTERS_CHALLENGE_TWO_CLEARS_OPTION = 'clear_2';
export const MASTERS_CHALLENGE_THREE_CLEARS_OPTION = 'clear_3';
export const STORY_EVENT_REWARDS_SCENARIO_GROUP_ID = 'story_event_rewards';
export const FACTOR_RESEARCH_REWARDS_SCENARIO_GROUP_ID = 'factor_research_rewards';
export const TRAINER_SKILLS_TEST_REWARDS_SCENARIO_GROUP_ID = 'trainer_skills_test_rewards';
export const RACING_CARNIVAL_REWARDS_SCENARIO_GROUP_ID = 'racing_carnival_rewards';
export const SCENARIO_EVALUATION_REWARDS_SCENARIO_GROUP_ID = 'scenario_evaluation_rewards';
export const MAIN_STORY_REWARDS_SCENARIO_GROUP_ID = 'main_story_rewards';
export const LIMITED_LOGIN_REWARDS_SCENARIO_GROUP_ID = 'limited_login_rewards';
export const LOGIN_MILESTONE_REWARDS_SCENARIO_GROUP_ID = 'login_milestone_rewards';
export const SEASONAL_GIFT_REWARDS_SCENARIO_GROUP_ID = 'seasonal_gift_rewards';
export const LIMITED_MISSION_REWARDS_SCENARIO_GROUP_ID = 'limited_mission_rewards';
export const CONDITIONAL_REWARDS_INCLUDED_OPTION = 'include';
export const CONDITIONAL_REWARDS_NONE_OPTION = 'none';
export const TRAINER_SKILLS_TEST_SCORE_ONLY_OPTION = 'score_only';
export const RACING_CARNIVAL_CLEARS_ONLY_OPTION = 'clears_only';
export const SPECULATIVE_INCOME_INCLUDED_OPTION = 'include';
export const SPECULATIVE_INCOME_MEDIAN_OPTION = 'median';
export const SPECULATIVE_INCOME_NONE_OPTION = 'none';
export const TRAINING_PASS_SOURCE_URL = 'https://umapyoi.net/news/1788?lang=jp';
export const MONTHLY_SHOP_HELP_TEXT = [
  'Counts recurring tickets confirmed in the Global master shop data.',
  '',
  'Friend Points only: 1 Uma + 1 support ticket each month.',
  'Friend Points + Clovers: adds 2 of each ticket, costing 800 Clovers per month.',
  '',
  'Excludes Cleat exchanges and limited event shops.',
].join('\n');

export function incomeRuleScenarioSelectionMatches(
  rule: Pick<PlannerIncomeRule, 'id' | 'label' | 'scenario_group' | 'scenario_option'>,
  selections: Readonly<Record<string, string>>,
): boolean {
  if (!rule.scenario_group) return true;
  const selected = selections[rule.scenario_group];
  if (rule.scenario_group !== MONTHLY_SHOP_SCENARIO_GROUP_ID) {
    return selected === rule.scenario_option;
  }
  if (selected === MONTHLY_SHOP_ALL_OPTION) return true;
  if (selected !== MONTHLY_SHOP_FRIEND_POINTS_OPTION) return false;
  return rule.scenario_option === MONTHLY_SHOP_FRIEND_POINTS_OPTION
    || /friend/i.test(`${rule.id} ${rule.label}`);
}
export const RANDOM_GAMEPLAY_INCOME_HELP_TEXT = [
  'Estimated random Carats from Team Trials win boxes and Career race rewards.',
  '',
  'Low: about 1 Team Trials attempt/day and 3 Careers/week.',
  'Medium: about 5 Team Trials attempts/day and 2 Careers/day.',
  'High: natural RP plus about 6 Career or Independent Training runs/day.',
  '',
  'Career estimates use the Global master rate: 5 Carats at 5% per eligible race win. Team Trials uses a conservative normal-play estimate below published boosted-campaign samples.',
  '',
  'Independent Training still requires collecting and restarting each run. Temporary drop boosts, Carat refills, and rare jackpots are excluded.',
].join('\n');

export const CONDITIONAL_REWARD_DEFAULT_SELECTIONS: Readonly<Record<string, string>> = {
  [TEMPORARY_STORY_REWARDS_SCENARIO_GROUP_ID]: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  [STORY_EVENT_REWARDS_SCENARIO_GROUP_ID]: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  [FACTOR_RESEARCH_REWARDS_SCENARIO_GROUP_ID]: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  [TRAINER_SKILLS_TEST_REWARDS_SCENARIO_GROUP_ID]: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  [RACING_CARNIVAL_REWARDS_SCENARIO_GROUP_ID]: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  [RACING_CARNIVAL_MISSION_SCENARIO_GROUP_ID]: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  [SCENARIO_EVALUATION_REWARDS_SCENARIO_GROUP_ID]: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  [MAIN_STORY_REWARDS_SCENARIO_GROUP_ID]: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  [LIMITED_LOGIN_REWARDS_SCENARIO_GROUP_ID]: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  [LOGIN_MILESTONE_REWARDS_SCENARIO_GROUP_ID]: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  [SEASONAL_GIFT_REWARDS_SCENARIO_GROUP_ID]: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  [LIMITED_MISSION_REWARDS_SCENARIO_GROUP_ID]: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  [MASTERS_CHALLENGE_SCENARIO_GROUP_ID]: CONDITIONAL_REWARDS_NONE_OPTION,
};

export const CONDITIONAL_REWARD_SCENARIO_GROUP_IDS = new Set(
  Object.keys(CONDITIONAL_REWARD_DEFAULT_SELECTIONS),
);

/** Maps rewards that require player action to the visible planner toggle that controls them. */
export function conditionalRewardScenarioGroup(
  reward: Pick<PlannerRewardEntry, 'assumption' | 'category' | 'evidence' | 'label'>,
): string | undefined {
  const assumption = reward.assumption ?? '';
  const label = reward.label ?? '';
  const searchable = `${label} ${assumption} ${reward.evidence ?? ''}`;
  if (reward.category === 'login_milestone') {
    return LOGIN_MILESTONE_REWARDS_SCENARIO_GROUP_ID;
  }
  if (reward.category === 'seasonal_gift'
    || /(?:valentine|white\s*day|christmas|xmas|バレンタイン|ホワイトデー|クリスマス)/i.test(searchable)) {
    return SEASONAL_GIFT_REWARDS_SCENARIO_GROUP_ID;
  }
  if (assumption === 'temporary_character_story_read') {
    return TEMPORARY_STORY_REWARDS_SCENARIO_GROUP_ID;
  }
  if (assumption === 'racing_carnival_bonus_skill_mission') {
    return RACING_CARNIVAL_MISSION_SCENARIO_GROUP_ID;
  }
  if (assumption === 'all_first_clears_high_difficulty') {
    return MASTERS_CHALLENGE_SCENARIO_GROUP_ID;
  }
  if (assumption === 'full_completion' || assumption === 'jp_reward_parity_full_completion') {
    return STORY_EVENT_REWARDS_SCENARIO_GROUP_ID;
  }
  if (assumption === 'all_reward_boxes') {
    return FACTOR_RESEARCH_REWARDS_SCENARIO_GROUP_ID;
  }
  if (assumption === 'scenario_evaluation_thresholds'
    || assumption === 'jp_reward_parity_scenario_evaluation_thresholds') {
    return SCENARIO_EVALUATION_REWARDS_SCENARIO_GROUP_ID;
  }
  if (assumption === 'all_story_episodes_viewed') {
    return MAIN_STORY_REWARDS_SCENARIO_GROUP_ID;
  }
  if (assumption === 'all_login_days'
    || assumption === 'all_login_days_global'
    || assumption === 'all_login_days_jp_parity') {
    return LIMITED_LOGIN_REWARDS_SCENARIO_GROUP_ID;
  }
  if (assumption === 'jp_reward_parity' && /(?:mission|ミッション)/i.test(label)) {
    return LIMITED_MISSION_REWARDS_SCENARIO_GROUP_ID;
  }
  if (assumption === 'all_first_clears') {
    return RACING_CARNIVAL_REWARDS_SCENARIO_GROUP_ID;
  }
  if (assumption === 'all_limited_shop_exchanges'
    || assumption === 'full_exchange'
    || assumption === 'jp_reward_parity_full_exchange'
    || assumption === 'full_score_completion') {
    if (/racing carnival/i.test(label)) return RACING_CARNIVAL_REWARDS_SCENARIO_GROUP_ID;
    if (/trainer skills test/i.test(label)) return TRAINER_SKILLS_TEST_REWARDS_SCENARIO_GROUP_ID;
  }
  return undefined;
}

/** Resolves progressive completion options without treating every conditional reward as all-or-nothing. */
export function conditionalRewardScenarioSelectionMatches(
  reward: Pick<PlannerRewardEntry, 'assumption' | 'category' | 'evidence' | 'label'>,
  selection: string | undefined,
): boolean {
  const group = conditionalRewardScenarioGroup(reward);
  if (!group) return true;
  if (selection === CONDITIONAL_REWARDS_INCLUDED_OPTION) return true;

  if (group === MASTERS_CHALLENGE_SCENARIO_GROUP_ID) {
    return mastersChallengeClearLimit(selection) !== null;
  }

  if (group === TRAINER_SKILLS_TEST_REWARDS_SCENARIO_GROUP_ID) {
    return selection === TRAINER_SKILLS_TEST_SCORE_ONLY_OPTION
      && reward.assumption === 'full_score_completion';
  }
  if (group === RACING_CARNIVAL_REWARDS_SCENARIO_GROUP_ID) {
    return selection === RACING_CARNIVAL_CLEARS_ONLY_OPTION
      && reward.assumption === 'all_first_clears';
  }
  return false;
}

/** Resolves a reward from its group selection plus sparse per-reward overrides. */
export function plannerRewardSelectionEnabled(
  reward: Pick<PlannerRewardEntry, 'id' | 'assumption' | 'category' | 'evidence' | 'label' | 'default_enabled'>,
  scenarioSelections: Readonly<Record<string, string>>,
  explicitlyEnabled = false,
  explicitlyDisabled = false,
): boolean {
  if (explicitlyDisabled) return false;
  const group = conditionalRewardScenarioGroup(reward);
  if (group) {
    return conditionalRewardScenarioSelectionMatches(reward, scenarioSelections[group]);
  }
  return reward.default_enabled !== false || explicitlyEnabled;
}

/** Only default-off rewards without a controlling group need an enabled id override. */
export function plannerRewardNeedsEnabledOverride(
  reward: Pick<PlannerRewardEntry, 'assumption' | 'category' | 'evidence' | 'label' | 'default_enabled'>,
): boolean {
  return reward.default_enabled === false && !conditionalRewardScenarioGroup(reward);
}

export function selectedConditionalRewardAmount(
  reward: Pick<PlannerRewardEntry, 'amount' | 'assumption' | 'category' | 'currency' | 'evidence' | 'label' | 'source_items'>,
  selection: string | undefined,
): number {
  const amount = Math.max(0, Math.trunc(Number(reward.amount) || 0));
  if (conditionalRewardScenarioGroup(reward) !== MASTERS_CHALLENGE_SCENARIO_GROUP_ID
    || selection === CONDITIONAL_REWARDS_INCLUDED_OPTION) {
    return amount;
  }
  const clearLimit = mastersChallengeClearLimit(selection);
  if (clearLimit === null) return 0;
  const totalClears = mastersChallengeTotalClears(reward, amount);
  if (totalClears <= 0) return amount;
  return Math.trunc(amount * Math.min(clearLimit, totalClears) / totalClears);
}

function mastersChallengeClearLimit(selection: string | undefined): number | null {
  if (selection === MASTERS_CHALLENGE_ONE_CLEAR_OPTION) return 1;
  if (selection === MASTERS_CHALLENGE_TWO_CLEARS_OPTION) return 2;
  if (selection === MASTERS_CHALLENGE_THREE_CLEARS_OPTION) return 3;
  return null;
}

function mastersChallengeTotalClears(
  reward: Pick<PlannerRewardEntry, 'currency' | 'source_items'>,
  amount: number,
): number {
  if (reward.currency === 'rainbow_crystal' || reward.currency === 'gold_crystal') return amount;
  if ((reward.currency === 'free_jewels' || reward.currency === 'paid_jewels')
    && amount > 0 && amount % 900 === 0) {
    return amount / 900;
  }
  for (const item of reward.source_items ?? []) {
    const itemAmount = Math.max(0, Math.trunc(Number(item.amount) || 0));
    if (item.item_category === 164 && (item.item_id === 149 || item.item_id === 150)) return itemAmount;
    if (item.item_category === 90 && item.item_id === 43 && itemAmount % 900 === 0) return itemAmount / 900;
  }
  return 0;
}

const TRAINING_PASS_TIMELINE_EVENT_ID = 'campaign-632';
const TRAINING_PASS_JP_RELEASE_DATE = '2024-02-24';
const TRAINING_PASS_FALLBACK_GLOBAL_DATE = '2027-08-20';

export interface PlannerIncomeAssumptionOption {
  value: string;
  label: string;
  amountLabel: string;
  amounts?: Readonly<Partial<Record<PlannerCurrency, number>>>;
}

export interface PlannerIncomeAssumptionGroup {
  id: string;
  label: string;
  icon: string;
  scheduleLabel: string;
  helpText?: string;
  sourceUrl?: string;
  options: readonly PlannerIncomeAssumptionOption[];
}

export const TRAINING_PASS_OPTIONS: readonly PlannerIncomeAssumptionOption[] = [
  {
    value: 'free',
    label: 'Free',
    amountLabel: '+500 + 4 tix / month',
    amounts: {
      free_jewels: 500,
      uma_ticket: 2,
      support_ticket: 2,
    },
  },
  {
    value: 'premium',
    label: 'Premium',
    amountLabel: '+2,200 + 8 tix + 1 rainbow shard / month',
    amounts: {
      free_jewels: 1_850,
      paid_jewels: 350,
      uma_ticket: 4,
      support_ticket: 4,
      rainbow_crystal: 1,
    },
  },
] as const;

export const RANDOM_GAMEPLAY_INCOME_OPTIONS: readonly PlannerIncomeAssumptionOption[] = [
  {
    value: 'low',
    label: 'Low commitment',
    amountLabel: '+20 Carats / week',
    amounts: { free_jewels: 20 },
  },
  {
    value: 'medium',
    label: 'Medium commitment',
    amountLabel: '+90 Carats / week',
    amounts: { free_jewels: 90 },
  },
  {
    value: 'high',
    label: 'High commitment',
    amountLabel: '+250 Carats / week',
    amounts: { free_jewels: 250 },
  },
] as const;

export function plannerIncomeAssumptionGroups(
  events: readonly CaratPlannerTimelineEvent[],
  comparison?: PlannerGlobalRewardComparison,
): readonly PlannerIncomeAssumptionGroup[] {
  const trainingPassStart = resolveTrainingPassStartDate(events);
  const speculativeMonthlyCarats = Math.max(0, Math.round(
    Number(comparison?.speculative_monthly_carats) || 0,
  ));
  const speculativeMedianCarats = Math.max(0, Math.round(
    Number(comparison?.speculative_recent_median_monthly_carats) || 0,
  ));
  const comparisonLabel = speculativeComparisonLabel(comparison);
  const speculativeHelp = speculativeHelpText(comparison);
  return [
    {
      id: MASTERS_CHALLENGE_SCENARIO_GROUP_ID,
      label: 'Masters Challenges',
      icon: 'military_tech',
      scheduleLabel: 'Each matching event',
      helpText: 'Counts first-clear rewards from the JP master tables. Each cleared race gives 900 Carats plus 1 Rainbow and 1 Gold crystal shard. The first set has 3 races and later sets have 5, so a selected clear count is capped at the races available in that event.',
      options: [
        {
          value: MASTERS_CHALLENGE_ONE_CLEAR_OPTION,
          label: 'Clear 1 race',
          amountLabel: '+900 + 1R/1G shards / event',
        },
        {
          value: MASTERS_CHALLENGE_TWO_CLEARS_OPTION,
          label: 'Clear 2 races',
          amountLabel: '+1,800 + 2R/2G shards / event',
        },
        {
          value: MASTERS_CHALLENGE_THREE_CLEARS_OPTION,
          label: 'Clear 3 races',
          amountLabel: '+2,700 + 3R/3G shards / event',
        },
        {
          value: CONDITIONAL_REWARDS_INCLUDED_OPTION,
          label: 'Clear every race',
          amountLabel: 'Up to +4,500 + 5R/5G shards / event',
        },
      ],
    },
    {
      id: STORY_EVENT_REWARDS_SCENARIO_GROUP_ID,
      label: 'Story event rewards',
      icon: 'auto_stories',
      scheduleLabel: 'Each Story Event',
      helpText: 'Counts the event, shop, mission, and finite bingo rewards represented by the JP reward tables. Turn this off if you do not expect to complete Story Events.',
      options: [{
        value: CONDITIONAL_REWARDS_INCLUDED_OPTION,
        label: 'Complete all rewards',
        amountLabel: 'Varies by event',
      }],
    },
    {
      id: TEMPORARY_STORY_REWARDS_SCENARIO_GROUP_ID,
      label: 'Temporary trainee stories',
      icon: 'menu_book',
      scheduleLabel: 'Each new trainee story unlock',
      helpText: 'Counts 20 Carats for each of chapters 1–4 when you read them during the temporary unlock. No trainee ownership is required. Previously claimed chapters are not paid twice.',
      options: [{
        value: CONDITIONAL_REWARDS_INCLUDED_OPTION,
        label: 'Read all four chapters',
        amountLabel: '+80 Carats / trainee',
      }],
    },
    {
      id: MAIN_STORY_REWARDS_SCENARIO_GROUP_ID,
      label: 'Main Story chapters',
      icon: 'library_books',
      scheduleLabel: 'Each projected chapter release',
      helpText: 'Counts chapter-viewing rewards from the Main Story. Direct gifts tied to a release remain separate.',
      options: [{
        value: CONDITIONAL_REWARDS_INCLUDED_OPTION,
        label: 'Read all chapters',
        amountLabel: 'Varies by release',
      }],
    },
    {
      id: LIMITED_LOGIN_REWARDS_SCENARIO_GROUP_ID,
      label: 'Limited login bonuses',
      icon: 'event_available',
      scheduleLabel: 'Each limited login campaign',
      helpText: 'Counts every day of limited login-bonus campaigns. One-time gifts that do not require repeated logins remain automatic.',
      options: [{
        value: CONDITIONAL_REWARDS_INCLUDED_OPTION,
        label: 'Claim every login day',
        amountLabel: 'Varies by campaign',
      }],
    },
    {
      id: LOGIN_MILESTONE_REWARDS_SCENARIO_GROUP_ID,
      label: 'Cumulative login milestones',
      icon: 'calendar_month',
      scheduleLabel: 'Every 50 cumulative login days',
      helpText: 'Counts the permanent missions that award 150 Carats every 50 cumulative login days. Every 1,000-day milestone awards 1,500 instead. Dates assume a launch-day Global account with no missed login days, so turn this off if the displayed day does not match your account.',
      options: [{
        value: CONDITIONAL_REWARDS_INCLUDED_OPTION,
        label: 'Include login milestones',
        amountLabel: '+150 every 50 days',
      }],
    },
    {
      id: SEASONAL_GIFT_REWARDS_SCENARIO_GROUP_ID,
      label: 'Seasonal gifts',
      icon: 'redeem',
      scheduleLabel: 'Valentine\'s Day, White Day, and Christmas',
      helpText: 'Counts 500-Carat seasonal gifts based on the recurring JP rewards. These are JP-parity estimates until an exact Global reward is published, at which point the sourced reward replaces the estimate.',
      options: [{
        value: CONDITIONAL_REWARDS_INCLUDED_OPTION,
        label: 'Include seasonal gifts',
        amountLabel: '+500 per expected gift',
      }],
    },
    {
      id: LIMITED_MISSION_REWARDS_SCENARIO_GROUP_ID,
      label: 'Limited mission campaigns',
      icon: 'task_alt',
      scheduleLabel: 'Anniversary, scenario, and G1 missions',
      helpText: 'Counts mission rewards that require completion. Direct celebration gifts and broadcasts gifts remain automatic.',
      options: [{
        value: CONDITIONAL_REWARDS_INCLUDED_OPTION,
        label: 'Complete all missions',
        amountLabel: 'Varies by campaign',
      }],
    },
    {
      id: FACTOR_RESEARCH_REWARDS_SCENARIO_GROUP_ID,
      label: 'Factor Research boxes',
      icon: 'science',
      scheduleLabel: 'Each Factor Research event',
      helpText: 'Counts every reward box in Agnes Tachyon\'s Factor Research.',
      options: [{
        value: CONDITIONAL_REWARDS_INCLUDED_OPTION,
        label: 'Claim every box',
        amountLabel: 'Varies by event',
      }],
    },
    {
      id: TRAINER_SKILLS_TEST_REWARDS_SCENARIO_GROUP_ID,
      label: 'Trainer Skills Tests',
      icon: 'quiz',
      scheduleLabel: 'Each Trainer Skills Test',
      helpText: 'Counts score milestones and the limited shop/exchange rewards. Requires enough event currency and score completion.',
      options: [
        {
          value: TRAINER_SKILLS_TEST_SCORE_ONLY_OPTION,
          label: 'Score rewards only',
          amountLabel: 'Excludes the event shop',
        },
        {
          value: CONDITIONAL_REWARDS_INCLUDED_OPTION,
          label: 'Score + shop',
          amountLabel: 'All available rewards',
        },
      ],
    },
    {
      id: RACING_CARNIVAL_REWARDS_SCENARIO_GROUP_ID,
      label: 'Racing Carnival rewards',
      icon: 'emoji_events',
      scheduleLabel: 'Each Racing Carnival',
      helpText: 'Counts first-clear and limited shop/exchange rewards. The bonus-skill Career mission is controlled separately.',
      options: [
        {
          value: RACING_CARNIVAL_CLEARS_ONLY_OPTION,
          label: 'First clears only',
          amountLabel: 'Excludes the event shop',
        },
        {
          value: CONDITIONAL_REWARDS_INCLUDED_OPTION,
          label: 'Clears + shop',
          amountLabel: 'All available rewards',
        },
      ],
    },
    {
      id: RACING_CARNIVAL_MISSION_SCENARIO_GROUP_ID,
      label: 'Racing Carnival mission',
      icon: 'flag',
      scheduleLabel: 'Each Racing Carnival',
      helpText: 'Counts the optional event missions: 100 Carats plus 1 Rainbow and 1 Gold crystal shard per Racing Carnival.',
      options: [{
        value: CONDITIONAL_REWARDS_INCLUDED_OPTION,
        label: 'Complete all event missions',
        amountLabel: '+100 Carats + 1/1 shards / event',
      }],
    },
    {
      id: SCENARIO_EVALUATION_REWARDS_SCENARIO_GROUP_ID,
      label: 'Scenario evaluation rewards',
      icon: 'workspace_premium',
      scheduleLabel: 'Each new training scenario',
      helpText: 'Counts all evaluation-score threshold rewards for new training scenarios.',
      options: [{
        value: CONDITIONAL_REWARDS_INCLUDED_OPTION,
        label: 'Clear every threshold',
        amountLabel: 'Varies by scenario',
      }],
    },
    {
      id: RANDOM_GAMEPLAY_INCOME_SCENARIO_GROUP_ID,
      label: 'Random gameplay income',
      icon: 'casino',
      scheduleLabel: 'Weekly estimate based on active play',
      helpText: RANDOM_GAMEPLAY_INCOME_HELP_TEXT,
      options: RANDOM_GAMEPLAY_INCOME_OPTIONS,
    },
    {
      id: TRAINING_PASS_SCENARIO_GROUP_ID,
      label: 'Training Pass',
      icon: 'fact_check',
      scheduleLabel: `Monthly from projected ${formatDateLabel(trainingPassStart)}`,
      sourceUrl: TRAINING_PASS_SOURCE_URL,
      options: TRAINING_PASS_OPTIONS,
    },
    {
      id: SPECULATIVE_INCOME_SCENARIO_GROUP_ID,
      label: 'Speculative income',
      icon: 'auto_graph',
      scheduleLabel: comparison
        ? 'Rolling average of the last six completed months'
        : comparisonLabel,
      helpText: speculativeHelp,
      options: [
        {
          value: SPECULATIVE_INCOME_INCLUDED_OPTION,
          label: 'Rolling mean',
          amountLabel: speculativeMonthlyCarats > 0
            ? `+${formatNumber(speculativeMonthlyCarats)} Carats / month`
            : 'No observed uplift available',
        },
        {
          value: SPECULATIVE_INCOME_MEDIAN_OPTION,
          label: 'Conservative median',
          amountLabel: speculativeMedianCarats > 0
            ? `+${formatNumber(speculativeMedianCarats)} Carats / month`
            : 'No observed uplift available',
        },
      ],
    },
  ];
}

function speculativeHelpText(
  comparison: PlannerGlobalRewardComparison | undefined,
): string | undefined {
  if (!comparison) return undefined;
  return [
    'Estimates extra Global-only Carats not already counted as confirmed income.',
    '',
    'Rolling mean averages the last 6 completed months and works best for long-term planning.',
    'Conservative median: reduces the effect of unusually generous months.',
    'None: confirmed income only.',
    '',
    'Updates automatically. Duplicate EN/JP and X/news rewards are removed.',
  ].join('\n');
}

function speculativeComparisonLabel(
  comparison: PlannerGlobalRewardComparison | undefined,
): string {
  if (!comparison) return 'Awaiting EN/JP and official social comparison data';
  const months = comparison.speculative_months ?? [];
  const sourceSummary = `${comparison.matched_news?.length ?? 0} matched news use EN−JP delta · ${comparison.en_only_news?.length ?? 0} EN-only · ${comparison.social_reward_posts} deduped X/Twitter · ${formatCount(comparison.social_news_duplicate_reward_items_removed, 'overlapping item')} / ${formatNumber(comparison.social_news_duplicate_carats_removed)} Carats removed`;
  if (comparison.speculative_method === 'mean_last_6_complete_calendar_months'
    && months.length > 0) {
    const range = formatMonthRange(
      comparison.speculative_window_start ?? months[0].month,
      comparison.speculative_window_end ?? months[months.length - 1].month,
    );
    const values = months.map(month => formatNumber(month.total_carats)).join(', ');
    const median = Math.max(0, Math.round(
      Number(comparison.speculative_recent_median_monthly_carats) || 0,
    ));
    return `6-month expected mean ${range} [${values}] = ${formatNumber(comparison.speculative_monthly_carats)}/month. Conservative median = ${formatNumber(median)}/month. Sources: ${sourceSummary}`;
  }
  if (comparison.speculative_method === 'mean_last_12_complete_calendar_months'
    && months.length > 0) {
    const range = formatMonthRange(
      comparison.speculative_window_start ?? months[0].month,
      comparison.speculative_window_end ?? months[months.length - 1].month,
    );
    const values = months.map(month => formatNumber(month.total_carats)).join(', ');
    const recentMedian = Math.max(0, Math.round(
      Number(comparison.speculative_recent_median_monthly_carats) || 0,
    ));
    const recentMedianRange = formatMonthRange(
      comparison.speculative_recent_median_window_start ?? months[Math.max(0, months.length - 6)].month,
      comparison.speculative_recent_median_window_end ?? months[months.length - 1].month,
    );
    return `12-month expected mean ${range} [${values}] = ${formatNumber(comparison.speculative_monthly_carats)}/month. Conservative 6-month median ${recentMedianRange} = ${formatNumber(recentMedian)}/month. Sources: ${sourceSummary}`;
  }
  if (comparison.speculative_method === 'median_last_6_complete_calendar_months'
    && months.length > 0) {
    const range = formatMonthRange(
      comparison.speculative_window_start ?? months[0].month,
      comparison.speculative_window_end ?? months[months.length - 1].month,
    );
    const values = months.map(month => formatNumber(month.total_carats)).join(', ');
    const longRunMean = Math.max(0, Math.round(
      Number(comparison.speculative_mean_monthly_carats) || 0,
    ));
    return `6-month median ${range} [${values}] = ${formatNumber(comparison.speculative_monthly_carats)}/month. Long-run mean ${formatNumber(longRunMean)}/month. Sources: ${sourceSummary}`;
  }
  return `Observed ${comparison.matched_news?.length ?? 0} matched news: EN ${formatNumber(comparison.matched_news_global_carats)} vs JP ${formatNumber(comparison.matched_news_jp_carats)} (${formatSigned(comparison.matched_news_extra_carats)}). ${comparison.en_only_news?.length ?? 0} EN-only +${formatNumber(comparison.en_only_news_carats)}. ${comparison.social_reward_posts} deduped X/Twitter +${formatNumber(comparison.social_carats)} (${formatCount(comparison.social_news_duplicate_reward_items_removed, 'overlapping item')} / ${formatNumber(comparison.social_news_duplicate_carats_removed)} Carats removed) over ${comparison.observed_months.toFixed(1)} months`;
}

function formatMonthRange(start: string, end: string): string {
  const startDate = new Date(`${start}-01T00:00:00Z`);
  const endDate = new Date(`${end}-01T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return `${start}–${end}`;
  }
  const startMonth = startDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const endMonth = endDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const startYear = startDate.getUTCFullYear();
  const endYear = endDate.getUTCFullYear();
  return startYear === endYear
    ? `${startMonth}–${endMonth} ${endYear}`
    : `${startMonth} ${startYear}–${endMonth} ${endYear}`;
}

function formatNumber(value: number): string {
  return Math.round(Number(value) || 0).toLocaleString('en-US');
}

function formatCount(value: number, label: string): string {
  const rounded = Math.max(0, Math.round(Number(value) || 0));
  return `${rounded.toLocaleString('en-US')} ${label}${rounded === 1 ? '' : 's'}`;
}

function formatSigned(value: number): string {
  const rounded = Math.round(Number(value) || 0);
  return `${rounded >= 0 ? '+' : '-'}${Math.abs(rounded).toLocaleString('en-US')}`;
}

export function resolveTrainingPassStartDate(
  events: readonly CaratPlannerTimelineEvent[],
): string {
  const exact = events.find(event => event.id === TRAINING_PASS_TIMELINE_EVENT_ID);
  const anniversaryPartTwo = events.find(event =>
    dateKey(event.jpReleaseDate) === TRAINING_PASS_JP_RELEASE_DATE
    && event.type === 'campaign'
    && /3rd anniversary/i.test(event.title)
    && /(?:vol(?:ume)?\.?|part|phase)\s*2/i.test(event.title));
  const sameReleaseCampaign = events.find(event =>
    dateKey(event.jpReleaseDate) === TRAINING_PASS_JP_RELEASE_DATE
    && event.type === 'campaign');
  const source = exact ?? anniversaryPartTwo ?? sameReleaseCampaign;
  return dateKey(source?.globalReleaseDate ?? source?.estimatedGlobalDate)
    || TRAINING_PASS_FALLBACK_GLOBAL_DATE;
}

export function trainingPassIncomeRules(
  selection: string | undefined,
  events: readonly CaratPlannerTimelineEvent[],
): PlannerIncomeRule[] {
  const option = TRAINING_PASS_OPTIONS.find(item => item.value === selection);
  if (!option?.amounts) return [];

  const startDate = resolveTrainingPassStartDate(events);
  return (Object.entries(option.amounts) as [PlannerCurrency, number][])
    .filter(([, amount]) => Number.isFinite(amount) && amount > 0)
    .map(([currency, amount]) => ({
      id: `training-pass-${option.value}-${currency}`,
      label: `Training Pass (${option.label})`,
      description: 'Full monthly Training Pass track rewards, projected from its Global timeline launch.',
      category: 'training_pass',
      currency,
      amount,
      cadence: 'monthly' as const,
      start_date: startDate,
      day_of_month: Number(startDate.slice(8, 10)),
      provenance: 'jp_news' as const,
    }));
}

export function randomGameplayIncomeRules(
  selection: string | undefined,
  startDate: string,
): PlannerIncomeRule[] {
  const option = RANDOM_GAMEPLAY_INCOME_OPTIONS.find(item => item.value === selection);
  const amount = Number(option?.amounts?.free_jewels) || 0;
  const normalizedStart = dateKey(startDate);
  if (!option || amount <= 0 || !normalizedStart) return [];

  return [{
    id: `random-gameplay-income-${option.value}`,
    label: `Random gameplay income (${option.label})`,
    description: 'Estimated Team Trials win-box and Career race Carats for the selected activity level.',
    category: 'estimated_gameplay',
    currency: 'free_jewels',
    amount,
    cadence: 'weekly',
    start_date: normalizedStart,
    provenance: 'configured',
  }];
}

export function isLegacyTrainingPassIncomeRule(rule: Pick<PlannerIncomeRule, 'id'>): boolean {
  return rule.id === 'premium-training-pass';
}

function dateKey(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function formatDateLabel(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
