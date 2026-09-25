import type { CaratPlan, PlannerCurrency, PlannerGlobalRewardComparison, PlannerIncomeRule, PlannerCompetitiveRewardVariant } from '@/lib/timeline/carat-planner';
import { dailyCaratPackPurchaseRule, incomeRuleScenarioSelectionMatches, isLegacyTrainingPassIncomeRule, randomGameplayIncomeRules, resolveTrainingPassStartDate, trainingPassIncomeRules, RANDOM_GAMEPLAY_INCOME_OPTIONS, TRAINING_PASS_OPTIONS } from '@/lib/timeline/planner-income-assumptions';
import { buildDataDrivenCompetitionOptions, COMPETITION_GROUPS, resolveDataDrivenCompetitionOption } from '@/lib/timeline/planner-competition-assumptions';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';
import type { IconName } from '@/components/icon-types';
import { clubRankIcon } from '@/lib/clubs/club-display';

export interface PlannerIncomeOption { value: string; label: string; amountLabel?: string; image?: string; icon?: IconName; }
export interface PlannerIncomeGroup { id: string; label: string; icon: IconName; scheduleLabel: string; helpText?: string; sourceUrl?: string; options: readonly PlannerIncomeOption[]; }
export interface PlannerIncomeSection { id: string; label: string; description: string; icon: IconName; groups: PlannerIncomeGroup[]; }
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function incomeRuleScheduleLabel(rule: PlannerIncomeRule): string {
  const purchase = dailyCaratPackPurchaseRule(rule, rule.start_date);
  if (purchase) return `Every day · +${purchase.amount} paid at projection start, then every ${purchase.every} days`;
  switch (rule.cadence) {
    case 'daily': return 'Every day';
    case 'weekly': return Number.isInteger(rule.weekday) && rule.weekday! >= 0 && rule.weekday! < 7 ? `Every ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][rule.weekday!]}` : 'Every week';
    case 'monthly': return rule.day_of_month ? `Day ${rule.day_of_month} each month` : 'Every month';
    case 'interval': return `Every ${Math.max(1, Number(rule.every) || 1)} days`;
    case 'once': return 'One-time income';
  }
}

export function buildPlannerIncomeGroups(rules: readonly PlannerIncomeRule[], variants: readonly PlannerCompetitiveRewardVariant[], events: readonly TimelineRecord[], comparison?: PlannerGlobalRewardComparison): PlannerIncomeGroup[] {
  const resourceGroups = new Map<string, Set<string>>();
  for (const rule of rules) {
    if (!rule.scenario_group || !rule.scenario_option) continue;
    const options = resourceGroups.get(rule.scenario_group) ?? new Set();
    options.add(rule.scenario_option); resourceGroups.set(rule.scenario_group, options);
  }
  const number = (value: string) => Number(value.match(/\d+/)?.[0]) || Number.MAX_SAFE_INTEGER;
  const humanize = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, value => value.toUpperCase());
  const groups: PlannerIncomeGroup[] = [...resourceGroups].map(([id, options]) => {
    const shop = id === 'monthly_shop_tickets';
    const rule = rules.find(rule => rule.scenario_group === id)!;
    return {
      id, label: id === 'team_trials_class' ? 'Team Trials class' : id === 'club_rank' ? 'Club rank' : shop ? 'Monthly shop tickets' : humanize(id),
      icon: id === 'club_rank' ? 'users' : id === 'team_trials_class' ? 'race' : shop ? 'database' : 'tune',
      scheduleLabel: shop ? 'Monthly, choose which exchange currencies to spend' : ({ weekly: 'Weekly payout', monthly: 'Monthly payout', daily: 'Daily payout' } as Record<string, string>)[rule.cadence] ?? incomeRuleScheduleLabel(rule),
      helpText: shop ? MONTHLY_SHOP_HELP_TEXT : undefined,
      options: (shop ? ['friend_points', 'include'] : [...options].sort((a,b) => number(a)-number(b))).map(value => ({
        value,
        label: shop ? value === 'friend_points' ? 'Friend Points only' : 'Friend Points + Clovers' : id === 'team_trials_class' ? `Class ${number(value)}` : id === 'club_rank' ? ['D','D+','C','C+','B','B+','A','A+','S','S+','SS'][number(value)-1] ?? humanize(value) : humanize(value),
        image: id === 'club_rank' ? clubRankIcon(number(value)) : undefined,
        amountLabel: scenarioAmountLabel(rules, id, value),
      })),
    };
  });
  for (const group of COMPETITION_GROUPS) {
    const rounds = group.id === 'champions_meeting_round_income';
    groups.push({ ...group, icon: rounds ? 'race' : 'trophy',
      scheduleLabel: rounds ? 'Round 1 + Round 2 of each event' : group.id === 'champions_meeting_result' ? 'Final placement reward only' : 'Each matching event',
      helpText: rounds ? [
        'Estimated Graded League Carats from the two qualifying rounds. Final placement rewards are counted separately.', '',
        'Low investment: 6 entries per round, averaging 1–2 wins; Round 2 uses Group B payouts (105 + 150 = 255).',
        'Competitive: all 8 entries per round, averaging 3 wins; Round 2 uses Group A payouts (240 + 400 = 640).',
        'Meta highroller: all 8 entries per round, averaging 4–5 wins; Round 2 uses Group A payouts (360 + 900 = 1,260).',
      ].join('\n') : undefined,
      sourceUrl: rounds ? 'https://game8.jp/umamusume/390471' : undefined,
      options: group.options.map(option => ({ ...option, amountLabel: competitionAmountLabel(option.amounts), icon: rounds ? option.value === 'low_investment' ? 'shield' : option.value === 'competitive' ? 'trophy' : 'star' : undefined })),
    });
  }
  for (const [id, label, competition] of [['strongest_team_reward_tier','Strongest Team','strongest_team'], ['legend_race_clears','Legend Races','legend_race']] as const) {
    const byEvent = new Map<string, PlannerCompetitiveRewardVariant[]>();
    for (const variant of variants) if (variant.competition === competition) byEvent.set(variant.event_id, [...(byEvent.get(variant.event_id) ?? []), variant]);
    const eventVariants = [...byEvent.values()].filter(items => buildDataDrivenCompetitionOptions(items).length);
    if (!eventVariants.length) continue;
    const options = competition === 'legend_race'
      ? [...[1,2,3].map(count => ({ value: `opponents_${count}`, label: `${count} ${count === 1 ? 'opponent' : 'opponents'} cleared` })), { value: 'all', label: eventVariants.some(items => items.some(item => /event(?: participation)? missions/i.test(item.label))) ? 'All opponents + event missions' : 'All opponents cleared' }]
      : eventVariants.map(items => buildDataDrivenCompetitionOptions(items)).sort((a,b) => b.length-a.length)[0]!.map((option,index) => ({ value: option.selectionValue ?? (/all (?:milestones|rewards)/i.test(option.label) ? 'all' : `tier_${index+1}`), label: option.label }));
    groups.push({ id, label, icon: competition === 'strongest_team' ? 'users' : 'trophy', scheduleLabel: 'Each matching event', options: options.map(option => {
      const amounts = new Set(eventVariants.map(items => resolveDataDrivenCompetitionOption(id, option.value, items)).filter(item => Boolean(item)).map(item => competitionAmountLabel(item!.amounts)).filter(Boolean));
      return { ...option, amountLabel: amounts.size > 1 ? 'Varies by event' : [...amounts][0] ?? '' };
    }) });
  }
  return [...groups, ...optionalIncomeGroups(events, comparison)];
}

export function buildPlannerIncomeSections(groups: readonly PlannerIncomeGroup[]): PlannerIncomeSection[] {
  const sections: Array<Omit<PlannerIncomeSection, 'groups'> & { ids: string[] }> = [
    { id: 'account', label: 'Account & recurring', description: 'Account payouts, shops, and the Training Pass', icon: 'id-card', ids: ['team_trials_class','club_rank','monthly_shop_tickets','training_pass'] },
    { id: 'competitive', label: 'Competitive & challenge events', description: 'Choose the results you expect to achieve', icon: 'trophy', ids: ['champions_meeting_result','champions_meeting_round_income','league_of_heroes_rank','strongest_team_reward_tier','legend_race_clears','masters_challenge_rewards'] },
    { id: 'event_completion', label: 'Event completion', description: 'Story Events, event shops, missions, and score rewards', icon: 'calendar', ids: ['story_event_rewards','factor_research_rewards','trainer_skills_test_rewards','racing_carnival_rewards','racing_carnival_mission','scenario_evaluation_rewards','limited_mission_rewards'] },
    { id: 'stories_login', label: 'Stories & login bonuses', description: 'Rewards that require reading or logging in', icon: 'book', ids: ['temporary_story_rewards','main_story_rewards','limited_login_rewards','login_milestone_rewards','valentines_gift_rewards','white_day_gift_rewards','christmas_gift_rewards'] },
    { id: 'estimates', label: 'Estimated income', description: 'Optional projections that are not fixed dated rewards', icon: 'chart', ids: ['random_gameplay_income','speculative_income'] },
  ];
  const result = sections.map(({ ids, ...section }) => ({ ...section, groups: groups.filter(group => ids.includes(group.id)) })).filter(section => section.groups.length);
  const unmatched = groups.filter(group => !sections.some(section => section.ids.includes(group.id)));
  if (unmatched.length) result.push({ id: 'other', label: 'Other assumptions', description: 'Additional income and reward settings', icon: 'tune', groups: unmatched });
  return result;
}

function scenarioAmountLabel(rules: readonly PlannerIncomeRule[], group: string, value: string): string {
  const selected = rules.filter(rule => rule.scenario_group === group && incomeRuleScenarioSelectionMatches(rule, { [group]: value }));
  const total = (currency: PlannerCurrency) => selected.filter(rule => rule.currency === currency).reduce((sum,rule) => sum + Math.max(0, Number(rule.amount) || 0), 0);
  if (group === 'monthly_shop_tickets') return total('uma_ticket') || total('support_ticket') ? `+${integer.format(total('uma_ticket'))} Uma + ${integer.format(total('support_ticket'))} support / mo` : '';
  const jewels = selected.filter(rule => rule.currency === 'free_jewels' || rule.currency === 'paid_jewels');
  const amount = total('free_jewels') + total('paid_jewels');
  return amount > 0 ? `+${integer.format(amount)}${({ daily: '/day', weekly: '/wk', monthly: '/mo', interval: '/period' } as Record<string,string>)[jewels[0]!.cadence] ?? ''}` : '';
}

function competitionAmountLabel(amounts: Readonly<Partial<Record<PlannerCurrency,number>>>): string {
  const carats = (amounts.free_jewels ?? 0) + (amounts.paid_jewels ?? 0);
  const tickets = (amounts.uma_ticket ?? 0) + (amounts.support_ticket ?? 0);
  const parts = carats > 0 ? [`+${integer.format(carats)}`] : [];
  if (tickets > 0) parts.push(`${integer.format(tickets)} tix`);
  const rainbow = Math.max(0, Math.trunc(amounts.rainbow_crystal ?? 0)); const gold = Math.max(0, Math.trunc(amounts.gold_crystal ?? 0));
  if (rainbow || gold) parts.push(`${integer.format(rainbow)}R/${integer.format(gold)}G shards`);
  return `${parts.join(' + ')} / event`;
}

export function activeIncomeAssumptionCount(plan: CaratPlan, rules: readonly PlannerIncomeRule[]): number {
  return rules.filter(rule => !rule.scenario_group && !isLegacyTrainingPassIncomeRule(rule) && plan.enabledIncomeRuleIds.includes(rule.id)).length
    + Object.values(plan.scenarioSelections).filter(value => value && value !== 'none').length
    + plan.customIncome.filter(item => Number(item.amount) > 0).length;
}

export function enabledIncomeTotalLabel(plan: CaratPlan, rules: readonly PlannerIncomeRule[], events: readonly TimelineRecord[], comparison?: PlannerGlobalRewardComparison): string {
  const totals = new Map<string, number>();
  const add = (currency: string, cadence: string, amount: number) => { if (currency === 'free_jewels' || currency === 'paid_jewels') totals.set(cadence, (totals.get(cadence) ?? 0) + Math.max(0, Number(amount) || 0)); };
  for (const rule of rules) {
    if (isLegacyTrainingPassIncomeRule(rule) || (!rule.scenario_group && !plan.enabledIncomeRuleIds.includes(rule.id)) || !incomeRuleScenarioSelectionMatches(rule, plan.scenarioSelections)) continue;
    add(rule.currency, rule.cadence, rule.amount);
    const purchase = dailyCaratPackPurchaseRule(rule, plan.projectionStartDate);
    if (purchase) add(purchase.currency, 'paid-pack', purchase.amount);
  }
  for (const rule of [...trainingPassIncomeRules(plan.scenarioSelections.training_pass, events), ...randomGameplayIncomeRules(plan.scenarioSelections.random_gameplay_income, plan.projectionStartDate)]) add(rule.currency, rule.cadence, rule.amount);
  add('free_jewels','monthly', plan.scenarioSelections.speculative_income === 'include' ? comparison?.speculative_monthly_carats ?? 0 : plan.scenarioSelections.speculative_income === 'median' ? comparison?.speculative_recent_median_monthly_carats ?? 0 : 0);
  for (const item of plan.customIncome) add(item.currency, item.cadence, item.amount);
  return [['daily','/ day'],['weekly','/ week'],['monthly','/ month'],['interval','/ interval'],['once','one-time'],['paid-pack','paid / 30 days']].flatMap(([cadence,label]) => (totals.get(cadence!) ?? 0) > 0 ? [`+${integer.format(totals.get(cadence!)!)} ${label}`] : []).join(' · ');
}

const MONTHLY_SHOP_HELP_TEXT = [
  'Counts recurring tickets confirmed in the Global master shop data.',
  '',
  'Friend Points only: 1 Uma + 1 support ticket each month.',
  'Friend Points + Clovers: adds 2 of each ticket, costing 800 Clovers per month.',
  '',
  'Excludes Cleat exchanges and limited event shops.',
].join('\n');

const RANDOM_GAMEPLAY_INCOME_HELP_TEXT = [
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

function optionalIncomeGroups(
  events: readonly TimelineRecord[],
  comparison?: PlannerGlobalRewardComparison,
): readonly PlannerIncomeGroup[] {
  const trainingPassStart = resolveTrainingPassStartDate(events);
  // Do not keep projecting the old EN-minus-JP calculation while a browser
  // still has the previous resource cached. Only the explicitly versioned
  // Global-only gift method is safe to use as speculative income.
  const globalOnlyComparison = comparison?.speculative_method
    === 'mean_last_6_complete_calendar_months_global_only_gifts'
    ? comparison
    : undefined;
  const speculativeMonthlyCarats = Math.max(0, Math.round(
    Number(globalOnlyComparison?.speculative_monthly_carats) || 0,
  ));
  const speculativeMedianCarats = Math.max(0, Math.round(
    Number(globalOnlyComparison?.speculative_recent_median_monthly_carats) || 0,
  ));
  const comparisonLabel = 'Awaiting Global-only gift comparison data';
  const speculativeHelp = speculativeHelpText(globalOnlyComparison);
  return [
    {
      id: 'masters_challenge_rewards',
      label: 'Masters Challenges',
      icon: 'trophy',
      scheduleLabel: 'Each matching event',
      helpText: 'Counts first-clear rewards from the JP master tables. Each cleared race gives 900 Carats plus 1 Rainbow and 1 Gold crystal shard. The first set has 3 races and later sets have 5, so a selected clear count is capped at the races available in that event.',
      options: [
        {
          value: 'clear_1',
          label: 'Clear 1 race',
          amountLabel: '+900 + 1R/1G shards / event',
        },
        {
          value: 'clear_2',
          label: 'Clear 2 races',
          amountLabel: '+1,800 + 2R/2G shards / event',
        },
        {
          value: 'clear_3',
          label: 'Clear 3 races',
          amountLabel: '+2,700 + 3R/3G shards / event',
        },
        {
          value: 'include',
          label: 'Clear every race',
          amountLabel: 'Up to +4,500 + 5R/5G shards / event',
        },
      ],
    },
    {
      id: 'story_event_rewards',
      label: 'Story event rewards',
      icon: 'book',
      scheduleLabel: 'Each Story Event',
      helpText: 'Counts the event, shop, mission, and finite bingo rewards represented by the JP reward tables. Turn this off if you do not expect to complete Story Events.',
      options: [{
        value: 'include',
        label: 'Complete all rewards',
        amountLabel: 'Varies by event',
      }],
    },
    {
      id: 'temporary_story_rewards',
      label: 'Temporary trainee stories',
      icon: 'book',
      scheduleLabel: 'Each new trainee story unlock',
      helpText: 'Counts 20 Carats for each of chapters 1–4 when you read them during the temporary unlock. No trainee ownership is required. Previously claimed chapters are not paid twice.',
      options: [{
        value: 'include',
        label: 'Read all four chapters',
        amountLabel: '+80 Carats / trainee',
      }],
    },
    {
      id: 'main_story_rewards',
      label: 'Main Story chapters',
      icon: 'book',
      scheduleLabel: 'Each projected chapter release',
      helpText: 'Counts chapter-viewing rewards from the Main Story. Direct gifts tied to a release remain separate.',
      options: [{
        value: 'include',
        label: 'Read all chapters',
        amountLabel: 'Varies by release',
      }],
    },
    {
      id: 'limited_login_rewards',
      label: 'Limited login bonuses',
      icon: 'calendar',
      scheduleLabel: 'Each limited login campaign',
      helpText: 'Counts every day of limited login-bonus campaigns. One-time gifts that do not require repeated logins remain automatic.',
      options: [{
        value: 'include',
        label: 'Claim every login day',
        amountLabel: 'Varies by campaign',
      }],
    },
    {
      id: 'login_milestone_rewards',
      label: 'Cumulative login milestones',
      icon: 'calendar',
      scheduleLabel: 'Every 50 cumulative login days',
      helpText: 'Counts the permanent missions that award 150 Carats every 50 cumulative login days. Every 1,000-day milestone awards 1,500 instead. Dates assume a launch-day Global account with no missed login days, so turn this off if the displayed day does not match your account.',
      options: [{
        value: 'include',
        label: 'Include login milestones',
        amountLabel: '+150 every 50 days',
      }],
    },
    {
      id: 'valentines_gift_rewards',
      label: 'Valentine\'s Day gift',
      icon: 'heart',
      scheduleLabel: 'Expected each February 14',
      helpText: 'Counts the recurring 500-Carat Valentine\'s Day gift from JP. This is a JP-parity estimate until an exact Global reward is published, at which point the sourced reward replaces it.',
      sourceUrl: 'https://umamusume.jp/news/detail?id=3048',
      options: [{
        value: 'include',
        label: 'Include Valentine\'s gift',
        amountLabel: '+500 Carats / year',
      }],
    },
    {
      id: 'white_day_gift_rewards',
      label: 'White Day gift',
      icon: 'star',
      scheduleLabel: 'Expected each March 14',
      helpText: 'Counts the recurring 500-Carat White Day gift from JP. This is a JP-parity estimate until an exact Global reward is published, at which point the sourced reward replaces it.',
      sourceUrl: 'https://umamusume.jp/news/detail?id=3117',
      options: [{
        value: 'include',
        label: 'Include White Day gift',
        amountLabel: '+500 Carats / year',
      }],
    },
    {
      id: 'christmas_gift_rewards',
      label: 'Christmas gift',
      icon: 'star',
      scheduleLabel: 'Expected each December',
      helpText: 'Counts the recurring 500-Carat Christmas gift from JP. This is a JP-parity estimate until an exact Global reward is published, at which point the sourced reward replaces it.',
      sourceUrl: 'https://umamusume.jp/news/detail?id=2945',
      options: [{
        value: 'include',
        label: 'Include Christmas gift',
        amountLabel: '+500 Carats / year',
      }],
    },
    {
      id: 'limited_mission_rewards',
      label: 'Limited mission campaigns',
      icon: 'check',
      scheduleLabel: 'Anniversary, scenario, and G1 missions',
      helpText: 'Counts mission rewards that require completion. Direct celebration gifts and broadcasts gifts remain automatic.',
      options: [{
        value: 'include',
        label: 'Complete all missions',
        amountLabel: 'Varies by campaign',
      }],
    },
    {
      id: 'factor_research_rewards',
      label: 'Factor Research boxes',
      icon: 'filter',
      scheduleLabel: 'Each Factor Research event',
      helpText: 'Counts every reward box in Agnes Tachyon\'s Factor Research.',
      options: [{
        value: 'include',
        label: 'Claim every box',
        amountLabel: 'Varies by event',
      }],
    },
    {
      id: 'trainer_skills_test_rewards',
      label: 'Trainer Skills Tests',
      icon: 'tune',
      scheduleLabel: 'Each Trainer Skills Test',
      helpText: 'Counts score milestones and the limited shop/exchange rewards. Requires enough event currency and score completion.',
      options: [
        {
          value: 'score_only',
          label: 'Score rewards only',
          amountLabel: 'Excludes the event shop',
        },
        {
          value: 'include',
          label: 'Score + shop',
          amountLabel: 'All available rewards',
        },
      ],
    },
    {
      id: 'racing_carnival_rewards',
      label: 'Racing Carnival rewards',
      icon: 'trophy',
      scheduleLabel: 'Each Racing Carnival',
      helpText: 'Counts first-clear and limited shop/exchange rewards. The bonus-skill Career mission is controlled separately.',
      options: [
        {
          value: 'clears_only',
          label: 'First clears only',
          amountLabel: 'Excludes the event shop',
        },
        {
          value: 'include',
          label: 'Clears + shop',
          amountLabel: 'All available rewards',
        },
      ],
    },
    {
      id: 'racing_carnival_mission',
      label: 'Racing Carnival mission',
      icon: 'race',
      scheduleLabel: 'Each Racing Carnival',
      helpText: 'Counts the optional event missions: 100 Carats plus 1 Rainbow and 1 Gold crystal shard per Racing Carnival.',
      options: [{
        value: 'include',
        label: 'Complete all event missions',
        amountLabel: '+100 Carats + 1/1 shards / event',
      }],
    },
    {
      id: 'scenario_evaluation_rewards',
      label: 'Scenario evaluation rewards',
      icon: 'star',
      scheduleLabel: 'Each new training scenario',
      helpText: 'Counts all evaluation-score threshold rewards for new training scenarios.',
      options: [{
        value: 'include',
        label: 'Clear every threshold',
        amountLabel: 'Varies by scenario',
      }],
    },
    {
      id: 'random_gameplay_income',
      label: 'Random gameplay income',
      icon: 'activity',
      scheduleLabel: 'Weekly estimate based on active play',
      helpText: RANDOM_GAMEPLAY_INCOME_HELP_TEXT,
      options: RANDOM_GAMEPLAY_INCOME_OPTIONS,
    },
    {
      id: 'training_pass',
      label: 'Training Pass',
      icon: 'check',
      scheduleLabel: `Monthly from projected ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(trainingPassStart))}`,
      sourceUrl: 'https://umapyoi.net/news/1788?lang=jp',
      options: TRAINING_PASS_OPTIONS,
    },
    {
      id: 'speculative_income',
      label: 'Speculative income',
      icon: 'chart',
      scheduleLabel: globalOnlyComparison
        ? 'Rolling average of Global-only gifts from the last six completed months'
        : comparisonLabel,
      helpText: speculativeHelp,
      options: [
        {
          value: 'include',
          label: 'Rolling mean',
          amountLabel: speculativeMonthlyCarats > 0
            ? `+${integer.format(speculativeMonthlyCarats)} Carats / month`
            : 'No observed uplift available',
        },
        {
          value: 'median',
          label: 'Conservative median',
          amountLabel: speculativeMedianCarats > 0
            ? `+${integer.format(speculativeMedianCarats)} Carats / month`
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
    'Estimates only extra Carats that Cygames gave to Global without a JP counterpart.',
    '',
    'Matched EN/JP rewards, login bonuses, and recurring JP campaigns are excluded in full.',
    'Only Global-only gifts, compensation, and deduplicated official Global social giveaways are included.',
    '',
    'Rolling mean averages the last 6 completed months and works best for long-term planning.',
    'Conservative median: reduces the effect of unusually generous months.',
    'None: confirmed income only.',
    '',
    'Updates automatically. Duplicate X/news rewards are removed.',
  ].join('\n');
}
