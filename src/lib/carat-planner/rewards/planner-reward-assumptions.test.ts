import { describe, expect, it } from 'vitest';
import {
  conditionalRewardScenarioGroup,
  plannerRewardSelectionEnabled,
  selectedConditionalRewardAmount,
} from './planner-reward-assumptions';

describe('planner conditional reward assumptions', () => {
  it('keeps score rewards while excluding the Trainer Skills Test shop', () => {
    const score = { id: 'score', label: 'Trainer Skills Test score', available_at: '2026-01-01', currency: 'free_jewels' as const, amount: 300, assumption: 'full_score_completion' };
    const shop = { ...score, id: 'shop', label: 'Trainer Skills Test shop', assumption: 'full_exchange' };
    const selections = { trainer_skills_test_rewards: 'score_only' };
    expect(conditionalRewardScenarioGroup(score)).toBe('trainer_skills_test_rewards');
    expect(plannerRewardSelectionEnabled(score, selections)).toBe(true);
    expect(plannerRewardSelectionEnabled(shop, selections)).toBe(false);
  });

  it('scales Masters Challenge rewards to the selected clear count', () => {
    const reward = { id: 'masters', label: 'Masters Challenge', available_at: '2026-01-01', currency: 'free_jewels' as const, amount: 4_500, assumption: 'all_first_clears_high_difficulty' };
    expect(selectedConditionalRewardAmount(reward, 'clear_2')).toBe(1_800);
    expect(selectedConditionalRewardAmount(reward, 'include')).toBe(4_500);
    expect(plannerRewardSelectionEnabled(reward, { masters_challenge_rewards: 'none' })).toBe(false);
  });

  it('lets explicit ids enable only default-off rewards without a scenario owner', () => {
    const reward = { id: 'manual', label: 'Optional gift', available_at: '2026-01-01', currency: 'free_jewels' as const, amount: 100, default_enabled: false };
    expect(plannerRewardSelectionEnabled(reward, {}, false)).toBe(false);
    expect(plannerRewardSelectionEnabled(reward, {}, true)).toBe(true);
    expect(plannerRewardSelectionEnabled(reward, {}, true, true)).toBe(false);
  });
});
