import type { CaratPlan, PlannerCompetitiveRewardVariant, PlannerIncomeRule } from './carat-planner';
import type { PlannerRewardEntry } from './carat-planner';
import { CONDITIONAL_REWARD_DEFAULT_SELECTIONS, plannerRewardNeedsEnabledOverride } from './planner-reward-assumptions';
import { plannerRewardIsProjectable } from './planner-reward-currencies';
import { monthlyShopExchange } from './planner-income-assumptions';

export type PlannerIncomePresetId = 'conservative' | 'casual' | 'active' | 'completionist';

export const PLANNER_INCOME_PRESETS = [
  { id: 'conservative', label: 'Conservative', description: 'Low results, partial event clears, no estimates' },
  { id: 'casual', label: 'Casual', description: 'Regular play without grind-heavy completion' },
  { id: 'active', label: 'Active', description: 'Most event rewards and competitive results' },
  { id: 'completionist', label: 'Completionist', description: 'Highest results and every optional reward' }
] as const;

const preferences: Readonly<Record<string, readonly string[]>> = {
  team_trials_class: ['class_3', 'class_4', 'class_5', 'class_6'],
  club_rank: ['rank_3', 'rank_5', 'rank_7', 'rank_11'],
  monthly_shop_friend_points: ['', 'include', 'include', 'include'],
  monthly_shop_clovers: ['', '', '', 'include'],
  monthly_shop_silver_cleats: ['', '', '', ''],
  monthly_shop_gold_cleats: ['', '', '', ''],
  monthly_shop_rainbow_cleats: ['', '', '', ''],
  training_pass: ['', 'free', 'free', 'free'],
  champions_meeting_result: ['open_third', 'open_first', 'group_b_second', 'champion'],
  champions_meeting_round_income: ['', 'low_investment', 'competitive', 'meta_highroller'],
  league_of_heroes_rank: ['silver_4', 'silver_4', 'gold_4', 'platinum_4'],
  strongest_team_reward_tier: ['@lowest', '@middle', '@highest', '@highest'],
  legend_race_clears: ['opponents_1', 'opponents_2', 'all', 'all'],
  masters_challenge_rewards: ['', 'clear_1', 'clear_3', 'include'],
  story_event_rewards: ['', 'include', 'include', 'include'],
  factor_research_rewards: ['', '', 'include', 'include'],
  trainer_skills_test_rewards: ['score_only', 'score_only', 'include', 'include'],
  racing_carnival_rewards: ['clears_only', 'clears_only', 'include', 'include'],
  racing_carnival_mission: ['', '', 'include', 'include'],
  scenario_evaluation_rewards: ['', '', 'include', 'include'],
  limited_mission_rewards: ['include', 'include', 'include', 'include'],
  temporary_story_rewards: ['', 'include', 'include', 'include'],
  main_story_rewards: ['', 'include', 'include', 'include'],
  limited_login_rewards: ['include', 'include', 'include', 'include'],
  login_milestone_rewards: ['', 'include', 'include', 'include'],
  valentines_gift_rewards: ['', 'include', 'include', 'include'],
  white_day_gift_rewards: ['', 'include', 'include', 'include'],
  christmas_gift_rewards: ['', 'include', 'include', 'include'],
  random_gameplay_income: ['', 'low', 'medium', 'high'],
  speculative_income: ['none', 'median', 'include', 'include']
};

export function applyIncomePreset(
  plan: CaratPlan,
  rules: readonly PlannerIncomeRule[],
  presetId: PlannerIncomePresetId,
  additionalGroups: Readonly<Record<string, readonly string[]>> = {},
  rewards: readonly PlannerRewardEntry[] = [],
  competitiveVariants: readonly PlannerCompetitiveRewardVariant[] = [],
): void {
  const presetIndex = PLANNER_INCOME_PRESETS.findIndex((preset) => preset.id === presetId);
  if (presetIndex < 0) return;
  const groups = new Map<string, string[]>();
  for (const rule of rules) {
    if (!rule.scenario_group || !rule.scenario_option) continue;
    const shop = monthlyShopExchange(rule);
    const group = shop?.id ?? rule.scenario_group;
    const option = shop ? 'include' : rule.scenario_option;
    const options = groups.get(group) ?? [];
    if (!options.includes(option)) options.push(option);
    groups.set(group, options);
  }
  for (const [group, options] of Object.entries(additionalGroups)) groups.set(group, [...options]);
  for (const [group, options] of groups) {
    const selected = presetSelection(group, options, presetIndex);
    applyScenarioSelection(plan, group, selected, competitiveVariants);
  }
  applyPresetRewardOverrides(plan, rewards, presetId);
  plan.incomePresetId = presetId;
  plan.incomePresetEdited = false;
}

export function applyScenarioSelection(
  plan: CaratPlan,
  group: string,
  selected: string,
  competitiveVariants: readonly PlannerCompetitiveRewardVariant[] = [],
): void {
  if (selected) plan.scenarioSelections[group] = selected;
  else if (group === 'speculative_income' || Object.hasOwn(CONDITIONAL_REWARD_DEFAULT_SELECTIONS, group)) plan.scenarioSelections[group] = 'none';
  else delete plan.scenarioSelections[group];
  const competition = group === 'strongest_team_reward_tier' ? 'strongest_team' : group === 'legend_race_clears' ? 'legend_race' : undefined;
  if (competition) {
    for (const variant of competitiveVariants) {
      if (variant.competition === competition) delete plan.variableRewardSelections[variant.event_id];
    }
  }
}

export function scenarioSelectionToEnable(group: string, options: readonly string[], remembered?: string): string {
  if (remembered && options.includes(remembered)) return remembered;
  if (group === 'team_trials_class' && options.includes('class_3')) return 'class_3';
  if (group === 'club_rank' && options.includes('rank_3')) return 'rank_3';
  if (['champions_meeting_result','league_of_heroes_rank','strongest_team_reward_tier'].includes(group)) return options.at(-1) ?? '';
  return options[0] ?? '';
}

export function reconcileIncomePreset(plan: CaratPlan, groups: Readonly<Record<string, readonly string[]>>, rewards: readonly PlannerRewardEntry[], variants: readonly PlannerCompetitiveRewardVariant[]): boolean {
  const before = JSON.stringify(plan);
  const anchors = { team_trials_class: 'class_6', club_rank: 'rank_11', champions_meeting_result: 'champion', league_of_heroes_rank: 'platinum_4', strongest_team_reward_tier: 'all', legend_race_clears: 'all', masters_challenge_rewards: 'include', story_event_rewards: 'include', random_gameplay_income: 'high', speculative_income: 'include' };
  if (!plan.incomePresetId && Object.entries(anchors).every(([group, value]) => plan.scenarioSelections[group] === value)) {
    plan.incomePresetId = 'completionist'; plan.incomePresetEdited = false;
  }
  if (!plan.incomePresetId || plan.incomePresetEdited) return false;
  const index = PLANNER_INCOME_PRESETS.findIndex(preset => preset.id === plan.incomePresetId);
  if (index < 0) return false;
  for (const [group, options] of Object.entries(groups)) {
    const expected = presetSelection(group, [...options], index);
    if ((plan.scenarioSelections[group] ?? '') !== expected) applyScenarioSelection(plan, group, expected, variants);
  }
  applyPresetRewardOverrides(plan, rewards, plan.incomePresetId);
  return JSON.stringify(plan) !== before;
}

export function applyPresetRewardOverrides(
  plan: CaratPlan,
  rewards: readonly PlannerRewardEntry[],
  presetId: PlannerIncomePresetId,
): void {
  plan.enabledRewardIds = presetId === 'completionist'
    ? rewards
      .filter((reward) => plannerRewardIsProjectable(reward) && plannerRewardNeedsEnabledOverride(reward))
      .map((reward) => reward.id)
      .sort()
    : [];
  const loadedRewardEvents = new Set(rewards.map((reward) => reward.event_id).filter((eventId): eventId is string => Boolean(eventId)));
  const targetEvents = new Set(plan.targets.map((target) => target.eventId));
  plan.disabledRewardIds = [];
  plan.disabledEventIds = plan.disabledEventIds.filter((eventId) => targetEvents.has(eventId) || !loadedRewardEvents.has(eventId));
}

export function presetSelection(group: string, options: readonly string[], presetIndex: number): string {
  const preferred = preferences[group]?.[presetIndex] ?? (presetIndex === 0 ? '' : options[0] ?? '');
  if (!preferred) return '';
  if (preferred === 'none') return preferred;
  if (preferred === '@lowest') return options.at(-1) ?? '';
  if (preferred === '@middle') return options[Math.floor((options.length - 1) / 2)] ?? '';
  if (preferred === '@highest') return options.includes('all') ? 'all' : options[0] ?? '';
  if (options.includes(preferred)) return preferred;
  if (presetIndex === 0) return options.at(-1) ?? '';
  if (presetIndex === 3) return options[0] ?? '';
  return options[Math.floor((options.length - 1) * (presetIndex / 3))] ?? '';
}
