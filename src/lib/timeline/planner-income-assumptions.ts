import type {
  PlannerCurrency,
  PlannerGlobalRewardComparison,
  PlannerIncomeRule,
  PlannerLedgerEntry,
} from './carat-planner';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
import { plannerUtcDay as utcDay, plannerDayKey, plannerCalendarMonthFrom as calendarMonthFrom } from './planner-calendar';

export const TRAINING_PASS_SCENARIO_GROUP_ID = 'training_pass';
export const RANDOM_GAMEPLAY_INCOME_SCENARIO_GROUP_ID = 'random_gameplay_income';
export const SPECULATIVE_INCOME_SCENARIO_GROUP_ID = 'speculative_income';

export function isLegacyTrainingPassIncomeRule(rule: Pick<PlannerIncomeRule, 'id'>): boolean { return rule.id === 'premium-training-pass'; }

export const MONTHLY_SHOP_EXCHANGES = [
  { id: 'monthly_shop_friend_points', label: 'Friend Points', pattern: /friend/i, cost: '40,000 Friend Points', tickets: 1 },
  { id: 'monthly_shop_clovers', label: 'Clovers', pattern: /clover/i, cost: '800 Clovers', tickets: 2 },
  { id: 'monthly_shop_silver_cleats', label: 'Silver Cleats / Horseshoes', pattern: /silver/i, cost: '200 Silver Cleats', tickets: 2 },
  { id: 'monthly_shop_gold_cleats', label: 'Gold Cleats / Horseshoes', pattern: /gold/i, cost: '40 Gold Cleats', tickets: 2 },
  { id: 'monthly_shop_rainbow_cleats', label: 'Rainbow Cleats / Horseshoes', pattern: /rainbow/i, cost: '8 Rainbow Cleats', tickets: 2 },
] as const;

export function monthlyShopExchange(rule: Pick<PlannerIncomeRule, 'id' | 'label' | 'scenario_group' | 'scenario_option'>) {
  return MONTHLY_SHOP_EXCHANGES.find(shop => shop.id === rule.scenario_group
    || (rule.scenario_group === 'monthly_shop_tickets'
      && shop.pattern.test(`${rule.id} ${rule.label} ${rule.scenario_option ?? ''}`)));
}

// Legacy and shop-specific IDs describe the same renewable pack.
export function canonicalIncomeRuleId(id: string): string { return id.replace(/^daily-jewel-pack-\d+$/, 'daily-jewel-pack'); }

export function normalizePlannerIncomeRules(rules: readonly PlannerIncomeRule[]): PlannerIncomeRule[] {
  const normalized = rules.map(rule => {
    rule = { ...rule, id: canonicalIncomeRuleId(rule.id) };
    const shop = monthlyShopExchange(rule);
    return shop ? { ...rule, scenario_group: shop.id, scenario_option: 'include' } : rule;
  });
  // Global master item_exchange 70202/3, 71202/3, 72202/3: two of each scout
  // ticket per month. ponytail: fixed stock fallback; remove once the generated
  // income artifact includes all Cleat exchanges.
  for (const shop of MONTHLY_SHOP_EXCHANGES.slice(2)) {
    for (const currency of ['uma_ticket', 'support_ticket'] as const) {
      if (normalized.some(rule => rule.scenario_group === shop.id && rule.currency === currency)) continue;
      normalized.push({
        id: `${shop.id}-${currency}`, label: `${shop.label} tickets`,
        currency, amount: shop.tickets, cadence: 'monthly', day_of_month: 1,
        start_date: '2025-06-26T00:00:00Z', default_enabled: false, category: 'shop',
        scenario_group: shop.id, scenario_option: 'include', provenance: 'global_master',
      });
    }
  }
  // Global master team_stadium_class_reward types 2/4: repeat promotion/demotion.
  // ponytail: fixed payouts until the income artifact publishes these outcomes.
  for (const [lower, promotion, demotion] of [[3, 150, 75], [4, 225, 150], [5, 300, 225]] as const) {
    const base = normalized.find(rule => rule.scenario_group === 'team_trials_class' && rule.scenario_option === `class_${lower}` && rule.currency === 'free_jewels' && rule.cadence === 'weekly');
    const option = `class_${lower}.5`;
    if (!base || !normalized.some(rule => rule.scenario_group === 'team_trials_class' && rule.scenario_option === `class_${lower + 1}`)
      || normalized.some(rule => rule.scenario_group === 'team_trials_class' && rule.scenario_option === option)) continue;
    const start = utcDay(base.start_date);
    if (start === undefined) continue;
    for (const [index, amount] of [promotion, demotion].entries()) normalized.push({
      ...base, id: `team-trials-${option}-${index}`, label: `Team Trials Class ${lower}.5 (${index ? 'demotion' : 'promotion'})`,
      amount, every: 2, start_date: plannerDayKey(start + index * 7),
      scenario_option: option, default_enabled: false, provenance: 'configured',
      description: `Alternates repeat promotion to Class ${lower + 1} and demotion to Class ${lower}; excludes first-time promotion bonuses.`,
    });
  }
  return [...new Map(normalized.map(rule => [rule.id, rule])).values()];
}

export function incomeRuleScenarioSelectionMatches(rule: Pick<PlannerIncomeRule, 'id' | 'label' | 'scenario_group' | 'scenario_option'>, selections: Readonly<Record<string, string>>): boolean {
  if (!rule.scenario_group) return true;
  const shop = monthlyShopExchange(rule);
  if (shop) {
    const selected = selections[shop.id];
    if (selected !== undefined) return selected === 'include';
    const legacy = selections.monthly_shop_tickets;
    return (shop.id === 'monthly_shop_friend_points' && (legacy === 'friend_points' || legacy === 'include'))
      || (shop.id === 'monthly_shop_clovers' && legacy === 'include');
  }
  return selections[rule.scenario_group] === rule.scenario_option;
}

export interface PlannerIncomeAssumptionOption {
  value: string;
  label: string;
  amountLabel: string;
  amounts?: Readonly<Partial<Record<PlannerCurrency, number>>>;
}

export const TRAINING_PASS_OPTIONS: readonly PlannerIncomeAssumptionOption[] = [
  { value: 'free', label: 'Free', amountLabel: '+500 + 4 tix / month', amounts: { free_jewels: 500, uma_ticket: 2, support_ticket: 2 } },
  { value: 'premium', label: 'Premium', amountLabel: '+2,200 + 8 tix + 1 rainbow shard / month', amounts: { free_jewels: 1_850, paid_jewels: 350, uma_ticket: 4, support_ticket: 4, rainbow_crystal: 1 } },
];

export const RANDOM_GAMEPLAY_INCOME_OPTIONS: readonly PlannerIncomeAssumptionOption[] = [
  { value: 'low', label: 'Low commitment', amountLabel: '+20 Carats / week', amounts: { free_jewels: 20 } },
  { value: 'medium', label: 'Medium commitment', amountLabel: '+90 Carats / week', amounts: { free_jewels: 90 } },
  { value: 'high', label: 'High commitment', amountLabel: '+250 Carats / week', amounts: { free_jewels: 250 } },
];

const TRAINING_PASS_EVENT_ID = 'campaign-632';
const TRAINING_PASS_JP_DATE = '2024-02-24';
const TRAINING_PASS_FALLBACK_GLOBAL_DATE = '2027-08-20';

export function resolveTrainingPassStartDate(events: readonly TimelineRecord[]): string {
  const exact = events.find((event) => event.id === TRAINING_PASS_EVENT_ID);
  const anniversaryPartTwo = events.find((event) =>
    dateKey(event.jpReleaseDate) === TRAINING_PASS_JP_DATE
    && event.eventType === 'campaign'
    && /3rd anniversary/i.test(event.title)
    && /(?:vol(?:ume)?\.?|part|phase)\s*2/i.test(event.title));
  const sameReleaseCampaign = events.find((event) => dateKey(event.jpReleaseDate) === TRAINING_PASS_JP_DATE && event.eventType === 'campaign');
  return dateKey((exact ?? anniversaryPartTwo ?? sameReleaseCampaign)?.date) || TRAINING_PASS_FALLBACK_GLOBAL_DATE;
}

export function dailyCaratPackPurchaseRule(rule: PlannerIncomeRule, projectionStartDate: string): PlannerIncomeRule | undefined {
  if (canonicalIncomeRuleId(rule.id) !== 'daily-jewel-pack'
    || rule.currency !== 'free_jewels' || rule.cadence !== 'daily') return undefined;
  const startDate = dateKey(projectionStartDate);
  const availableFrom = dateKey(rule.start_date);
  if (!startDate || !availableFrom) return undefined;

  // ponytail: assumes purchase at projection start; add a purchase date if renewal timing needs precision.
  return {
    ...rule,
    id: `${rule.id}-purchase`,
    label: 'Daily Carats Pack purchase',
    description: '500 paid Carats at projection start, then on renewal every 30 days.',
    currency: 'paid_jewels',
    amount: 500,
    cadence: 'interval',
    every: 30,
    start_date: availableFrom > startDate ? availableFrom : startDate,
  };
}

export function trainingPassIncomeRules(selection: string | undefined, events: readonly TimelineRecord[]): PlannerIncomeRule[] {
  const option = TRAINING_PASS_OPTIONS.find((item) => item.value === selection);
  if (!option?.amounts) return [];
  const startDate = resolveTrainingPassStartDate(events);
  return (Object.entries(option.amounts) as [PlannerCurrency, number][]).flatMap(([currency, amount]) => amount > 0 ? [{
    id: `training-pass-${option.value}-${currency}`,
    label: `Training Pass (${option.label})`,
    description: 'Full monthly Training Pass track rewards, projected from its Global timeline launch.',
    category: 'training_pass',
    currency,
    amount,
    cadence: 'monthly' as const,
    start_date: startDate,
    day_of_month: Number(startDate.slice(8, 10)),
    provenance: 'jp_news',
  }] : []);
}

export function randomGameplayIncomeRules(selection: string | undefined, startDate: string): PlannerIncomeRule[] {
  const option = RANDOM_GAMEPLAY_INCOME_OPTIONS.find((item) => item.value === selection);
  const amount = Number(option?.amounts?.free_jewels) || 0;
  if (!option || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return [];
  return [{
    id: `random-gameplay-income-${option.value}`,
    label: `Random gameplay income (${option.label})`,
    description: 'Estimated Team Trials win-box and Career race Carats for the selected activity level.',
    category: 'estimated_gameplay',
    currency: 'free_jewels',
    amount,
    cadence: 'weekly',
    start_date: startDate,
    provenance: 'configured',
  }];
}

/** Returns the incremental speculative uplift between two planner checkpoints.
 * Angular accrues it continuously by real calendar-month length, anchored after
 * the last observed reward date, rather than as a fixed 30-day recurrence. */
export function speculativeIncomeBetween(
  comparison: PlannerGlobalRewardComparison | undefined,
  selection: string | undefined,
  projectionStartDay: number,
  fromExclusiveDay: number,
  throughDay: number,
): number {
  const rawMonthly = selection === 'median'
    ? comparison?.speculative_recent_median_monthly_carats
    : selection === 'include' ? comparison?.speculative_monthly_carats : 0;
  const monthly = Number.isFinite(rawMonthly) ? Math.max(0, Math.trunc(rawMonthly!)) : 0;
  const observationDay = utcDay(comparison?.observation_end);
  if (!monthly || observationDay === undefined || throughDay <= Math.max(projectionStartDay, observationDay)) return 0;
  const anchorDay = Math.max(projectionStartDay, observationDay);
  const cumulative = (day: number) => Math.round(monthly * elapsedCalendarMonths(anchorDay, Math.max(anchorDay, day)));
  return Math.max(0, cumulative(throughDay) - cumulative(Math.max(fromExclusiveDay, anchorDay)));
}

export function speculativeIncomeEntries(
  comparison: PlannerGlobalRewardComparison | undefined,
  selection: string | undefined,
  start: number,
  through: number,
  pullDates: readonly string[],
): PlannerLedgerEntry[] {
  if (!speculativeIncomeBetween(comparison, selection, start, start, through)) return [];
  const anchor = Math.max(start, utcDay(comparison?.observation_end)!);
  const checkpoints = new Set<number>([through]);
  for (let month = 1; month < 2400; month++) {
    const checkpoint = utcDay(calendarMonthFrom(new Date(anchor * 86_400_000), month))!;
    if (checkpoint > through) break;
    checkpoints.add(checkpoint);
  }
  for (const date of pullDates) {
    const day = utcDay(date);
    if (day !== undefined && day > anchor && day <= through) checkpoints.add(day);
  }
  let previous = anchor;
  return [...checkpoints].sort((a, b) => a - b).flatMap(day => {
    const amount = speculativeIncomeBetween(comparison, selection, start, previous, day);
    previous = day;
    const date = plannerDayKey(day);
    return amount > 0 ? [{ id: `speculative-income:${date}`, label: 'Speculative Global reward uplift', date, currency: 'free_jewels' as const, amount, source: 'rule' as const }] : [];
  });
}

function elapsedCalendarMonths(startDay: number, endDay: number): number {
  if (endDay <= startDay) return 0;
  const start = new Date(startDay * 86_400_000);
  const end = new Date(endDay * 86_400_000);
  let wholeMonths = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  let anchor = calendarMonthFrom(start, wholeMonths);
  if (anchor > end) {
    wholeMonths -= 1;
    anchor = calendarMonthFrom(start, wholeMonths);
  }
  const next = calendarMonthFrom(start, wholeMonths + 1);
  const fraction = Math.max(0, Math.min(1, (end.getTime() - anchor.getTime()) / Math.max(86_400_000, next.getTime() - anchor.getTime())));
  return Math.max(0, wholeMonths + fraction);
}

function dateKey(value: Date | string | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}
