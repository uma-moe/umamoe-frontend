import type { PlannerRewardEntry } from './carat-planner';

export const CONDITIONAL_REWARDS_INCLUDED_OPTION = 'include';
export const CONDITIONAL_REWARDS_NONE_OPTION = 'none';
export const TRAINER_SKILLS_TEST_SCORE_ONLY_OPTION = 'score_only';
export const RACING_CARNIVAL_CLEARS_ONLY_OPTION = 'clears_only';

export const CONDITIONAL_REWARD_DEFAULT_SELECTIONS: Readonly<Record<string, string>> = {
  temporary_story_rewards: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  story_event_rewards: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  factor_research_rewards: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  trainer_skills_test_rewards: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  racing_carnival_rewards: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  racing_carnival_mission: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  scenario_evaluation_rewards: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  main_story_rewards: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  limited_login_rewards: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  login_milestone_rewards: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  valentines_gift_rewards: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  white_day_gift_rewards: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  christmas_gift_rewards: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  limited_mission_rewards: CONDITIONAL_REWARDS_INCLUDED_OPTION,
  masters_challenge_rewards: CONDITIONAL_REWARDS_NONE_OPTION,
};

type RewardAssumptionFields = Pick<
  PlannerRewardEntry,
  'assumption' | 'category' | 'evidence' | 'label'
>;

/** Angular is authoritative for this mapping. These groups are user outcomes,
 * not separate reward records, so they remain independent from feature state. */
export function conditionalRewardScenarioGroup(reward: RewardAssumptionFields): string | undefined {
  const assumption = reward.assumption ?? '';
  const label = reward.label ?? '';
  const searchable = `${label} ${assumption} ${reward.evidence ?? ''}`;
  if (reward.category === 'login_milestone') return 'login_milestone_rewards';
  if (/valentine|バレンタイン/i.test(searchable)) return 'valentines_gift_rewards';
  if (/white\s*day|ホワイトデー/i.test(searchable)) return 'white_day_gift_rewards';
  if (/christmas|xmas|クリスマス/i.test(searchable)) return 'christmas_gift_rewards';
  if (assumption === 'temporary_character_story_read') return 'temporary_story_rewards';
  if (assumption === 'racing_carnival_bonus_skill_mission') return 'racing_carnival_mission';
  if (assumption === 'all_first_clears_high_difficulty') return 'masters_challenge_rewards';
  if (assumption === 'full_completion' || assumption === 'jp_reward_parity_full_completion') return 'story_event_rewards';
  if (assumption === 'all_reward_boxes') return 'factor_research_rewards';
  if (assumption === 'scenario_evaluation_thresholds' || assumption === 'jp_reward_parity_scenario_evaluation_thresholds') return 'scenario_evaluation_rewards';
  if (assumption === 'all_story_episodes_viewed') return 'main_story_rewards';
  if (assumption === 'all_login_days' || assumption === 'all_login_days_global' || assumption === 'all_login_days_jp_parity') return 'limited_login_rewards';
  if (assumption === 'jp_reward_parity' && /(?:mission|ミッション)/i.test(label)) return 'limited_mission_rewards';
  if (assumption === 'all_first_clears') return 'racing_carnival_rewards';
  if (['all_limited_shop_exchanges', 'full_exchange', 'jp_reward_parity_full_exchange', 'full_score_completion'].includes(assumption)) {
    if (/racing carnival/i.test(label)) return 'racing_carnival_rewards';
    if (/trainer skills test/i.test(label)) return 'trainer_skills_test_rewards';
  }
  return undefined;
}

export function conditionalRewardScenarioSelectionMatches(
  reward: RewardAssumptionFields,
  selection: string | undefined,
): boolean {
  const group = conditionalRewardScenarioGroup(reward);
  if (!group) return true;
  if (selection === CONDITIONAL_REWARDS_INCLUDED_OPTION) return true;
  if (group === 'masters_challenge_rewards') return mastersChallengeClearLimit(selection) !== null;
  if (group === 'trainer_skills_test_rewards') {
    return selection === TRAINER_SKILLS_TEST_SCORE_ONLY_OPTION && reward.assumption === 'full_score_completion';
  }
  if (group === 'racing_carnival_rewards') {
    return selection === RACING_CARNIVAL_CLEARS_ONLY_OPTION && reward.assumption === 'all_first_clears';
  }
  return false;
}

export function plannerRewardSelectionEnabled(
  reward: RewardAssumptionFields & Pick<PlannerRewardEntry, 'default_enabled'>,
  scenarioSelections: Readonly<Record<string, string>>,
  explicitlyEnabled = false,
  explicitlyDisabled = false,
): boolean {
  if (explicitlyDisabled) return false;
  const group = conditionalRewardScenarioGroup(reward);
  if (group) return conditionalRewardScenarioSelectionMatches(reward, scenarioSelections[group]);
  return reward.default_enabled !== false || explicitlyEnabled;
}

export function plannerRewardNeedsEnabledOverride(
  reward: RewardAssumptionFields & Pick<PlannerRewardEntry, 'default_enabled'>,
): boolean {
  return reward.default_enabled === false && !conditionalRewardScenarioGroup(reward);
}

export function selectedConditionalRewardAmount(
  reward: RewardAssumptionFields & Pick<PlannerRewardEntry, 'amount' | 'currency' | 'source_items'>,
  selection: string | undefined,
): number {
  const amount = Math.max(0, Math.trunc(Number(reward.amount) || 0));
  if (conditionalRewardScenarioGroup(reward) !== 'masters_challenge_rewards' || selection === CONDITIONAL_REWARDS_INCLUDED_OPTION) return amount;
  const clearLimit = mastersChallengeClearLimit(selection);
  if (clearLimit === null) return 0;
  const totalClears = mastersChallengeTotalClears(reward, amount);
  return totalClears <= 0 ? amount : Math.trunc(amount * Math.min(clearLimit, totalClears) / totalClears);
}

function mastersChallengeClearLimit(selection: string | undefined): number | null {
  if (selection === 'clear_1') return 1;
  if (selection === 'clear_2') return 2;
  if (selection === 'clear_3') return 3;
  return null;
}

function mastersChallengeTotalClears(
  reward: Pick<PlannerRewardEntry, 'currency' | 'source_items'>,
  amount: number,
): number {
  if (reward.currency === 'rainbow_crystal' || reward.currency === 'gold_crystal') return amount;
  if ((reward.currency === 'free_jewels' || reward.currency === 'paid_jewels') && amount > 0 && amount % 900 === 0) return amount / 900;
  for (const item of reward.source_items ?? []) {
    const itemAmount = Math.max(0, Math.trunc(Number(item.amount) || 0));
    if (item.item_category === 164 && (item.item_id === 149 || item.item_id === 150)) return itemAmount;
    if (item.item_category === 90 && item.item_id === 43 && itemAmount % 900 === 0) return itemAmount / 900;
  }
  return 0;
}
