import {
  CaratPlannerTimelineEvent,
  PlannerCurrency,
  PlannerGlobalRewardComparison,
  PlannerIncomeRule,
} from '../models/carat-planner.model';
import {
  SPECULATIVE_INCOME_INCLUDED_OPTION,
  SPECULATIVE_INCOME_MEDIAN_OPTION,
  SPECULATIVE_INCOME_NONE_OPTION,
  SPECULATIVE_INCOME_SCENARIO_GROUP_ID,
  TRAINING_PASS_SCENARIO_GROUP_ID,
} from './carat-planner-income-defaults';

export {
  SPECULATIVE_INCOME_INCLUDED_OPTION,
  SPECULATIVE_INCOME_MEDIAN_OPTION,
  SPECULATIVE_INCOME_NONE_OPTION,
  SPECULATIVE_INCOME_SCENARIO_GROUP_ID,
  TRAINING_PASS_SCENARIO_GROUP_ID,
} from './carat-planner-income-defaults';
export const TRAINING_PASS_SOURCE_URL = 'https://umapyoi.net/news/1788?lang=jp';

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
    amountLabel: '+2,200 + 8 tix + 1 rainbow / month',
    amounts: {
      free_jewels: 1_850,
      paid_jewels: 350,
      uma_ticket: 4,
      support_ticket: 4,
      rainbow_crystal: 1,
    },
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
  const speculativeHelp = speculativeHelpText(comparison);
  return [
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
        : 'Awaiting EN/JP and official social comparison data',
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

function formatNumber(value: number): string {
  return Math.round(Number(value) || 0).toLocaleString('en-US');
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
