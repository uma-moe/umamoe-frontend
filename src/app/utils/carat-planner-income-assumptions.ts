import {
  CaratPlannerTimelineEvent,
  PlannerCurrency,
  PlannerGlobalRewardComparison,
  PlannerIncomeRule,
} from '../models/carat-planner.model';

export const TRAINING_PASS_SCENARIO_GROUP_ID = 'training_pass';
export const MONTHLY_SHOP_SCENARIO_GROUP_ID = 'monthly_shop_tickets';
export const SPECULATIVE_INCOME_SCENARIO_GROUP_ID = 'speculative_income';
export const RANDOM_GAMEPLAY_INCOME_SCENARIO_GROUP_ID = 'random_gameplay_income';
export const TEMPORARY_STORY_REWARDS_SCENARIO_GROUP_ID = 'temporary_story_rewards';
export const RACING_CARNIVAL_MISSION_SCENARIO_GROUP_ID = 'racing_carnival_mission';
export const CONDITIONAL_REWARDS_INCLUDED_OPTION = 'include';
export const CONDITIONAL_REWARDS_NONE_OPTION = 'none';
export const SPECULATIVE_INCOME_INCLUDED_OPTION = 'include';
export const SPECULATIVE_INCOME_MEDIAN_OPTION = 'median';
export const SPECULATIVE_INCOME_NONE_OPTION = 'none';
export const TRAINING_PASS_SOURCE_URL = 'https://umapyoi.net/news/1788?lang=jp';
export const MONTHLY_SHOP_HELP_TEXT = [
  'Counts recurring tickets confirmed in the Global master shop data.',
  '',
  'Includes 1 Uma + 1 support ticket from the Friend Point Exchange and 2 of each from the Clover Exchange every month.',
  'Excludes Cleat exchanges and limited event shops. Requires enough exchange currency.',
].join('\n');
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
      id: TEMPORARY_STORY_REWARDS_SCENARIO_GROUP_ID,
      label: 'Temporary trainee stories',
      icon: 'menu_book',
      scheduleLabel: 'Each new trainee story unlock',
      helpText: 'Counts 20 Carats for each of chapters 1–4 when you read them during the temporary unlock. No trainee ownership is required; previously claimed chapters are not paid twice.',
      options: [{
        value: CONDITIONAL_REWARDS_INCLUDED_OPTION,
        label: 'Read all four chapters',
        amountLabel: '+80 Carats / trainee',
      }],
    },
    {
      id: RACING_CARNIVAL_MISSION_SCENARIO_GROUP_ID,
      label: 'Racing Carnival mission',
      icon: 'flag',
      scheduleLabel: 'Each Racing Carnival',
      helpText: 'Counts the optional 100-Carat mission for obtaining a Carnival Bonus skill and completing a Career.',
      options: [{
        value: CONDITIONAL_REWARDS_INCLUDED_OPTION,
        label: 'Complete bonus-skill mission',
        amountLabel: '+100 Carats / event',
      }],
    },
    {
      id: RANDOM_GAMEPLAY_INCOME_SCENARIO_GROUP_ID,
      label: 'Random gameplay income',
      icon: 'casino',
      scheduleLabel: 'Weekly estimate; requires active play',
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
        ? 'Rolling six completed months; recalculates automatically'
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
    'Rolling mean: average of the last 6 completed months; best for long-term planning.',
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
  const sourceSummary = `${comparison.matched_news?.length ?? 0} matched news use EN−JP delta; ${comparison.en_only_news?.length ?? 0} EN-only; ${comparison.social_reward_posts} deduped X/Twitter; ${formatCount(comparison.social_news_duplicate_reward_items_removed, 'overlapping item')} / ${formatNumber(comparison.social_news_duplicate_carats_removed)} Carats removed`;
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
    return `6-month expected mean ${range} [${values}] = ${formatNumber(comparison.speculative_monthly_carats)}/month; conservative median = ${formatNumber(median)}/month. Sources: ${sourceSummary}`;
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
    return `12-month expected mean ${range} [${values}] = ${formatNumber(comparison.speculative_monthly_carats)}/month; conservative 6-month median ${recentMedianRange} = ${formatNumber(recentMedian)}/month. Sources: ${sourceSummary}`;
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
    return `6-month median ${range} [${values}] = ${formatNumber(comparison.speculative_monthly_carats)}/month; long-run mean ${formatNumber(longRunMean)}/month. Sources: ${sourceSummary}`;
  }
  return `Observed ${comparison.matched_news?.length ?? 0} matched news: EN ${formatNumber(comparison.matched_news_global_carats)} vs JP ${formatNumber(comparison.matched_news_jp_carats)} (${formatSigned(comparison.matched_news_extra_carats)}); ${comparison.en_only_news?.length ?? 0} EN-only +${formatNumber(comparison.en_only_news_carats)}; ${comparison.social_reward_posts} deduped X/Twitter +${formatNumber(comparison.social_carats)} (${formatCount(comparison.social_news_duplicate_reward_items_removed, 'overlapping item')} / ${formatNumber(comparison.social_news_duplicate_carats_removed)} Carats removed) over ${comparison.observed_months.toFixed(1)} months`;
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
