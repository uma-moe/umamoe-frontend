import { describe, expect, it } from 'vitest';
import { createPlan, loadPlanCollection, savePlanCollection } from './carat-planner';
import { applyIncomePreset, applyScenarioSelection, reconcileIncomePreset, scenarioSelectionToEnable } from './planner-income-presets';

describe('Angular planner income presets', () => {
  it('reconciles unedited presets idempotently, preserves edits, and restores valid section choices', () => {
    const plan = createPlan(); plan.incomePresetId = 'conservative'; plan.incomePresetEdited = false;
    const groups = { limited_login_rewards: ['include'], limited_mission_rewards: ['include'], story_event_rewards: ['include'], team_trials_class: ['class_1','class_3','class_6'] };
    plan.scenarioSelections = { limited_login_rewards:'none',limited_mission_rewards:'none',story_event_rewards:'include' };
    expect(reconcileIncomePreset(plan, groups, [], [])).toBe(true);
    expect(plan.scenarioSelections).toMatchObject({ limited_login_rewards:'include', limited_mission_rewards:'include', story_event_rewards:'none', team_trials_class:'class_3' });
    expect(reconcileIncomePreset(plan, groups, [], [])).toBe(false);
    plan.incomePresetEdited = true; plan.scenarioSelections.team_trials_class = 'class_1';
    expect(reconcileIncomePreset(plan, groups, [], [])).toBe(false);
    expect(plan.scenarioSelections.team_trials_class).toBe('class_1');
    expect(scenarioSelectionToEnable('team_trials_class', groups.team_trials_class)).toBe('class_3');
    expect(scenarioSelectionToEnable('team_trials_class', groups.team_trials_class, 'class_6')).toBe('class_6');
    expect(scenarioSelectionToEnable('team_trials_class', ['class_1'], 'retired')).toBe('class_1');
    expect(scenarioSelectionToEnable('champions_meeting_result', ['champion','open_third'])).toBe('open_third');
    expect(scenarioSelectionToEnable('training_pass', ['free','premium'])).toBe('free');
    expect(scenarioSelectionToEnable('empty', [])).toBe('');
  });
  it('persists excluded assumptions and clears only affected competition overrides for manual and preset changes', () => {
    const plan = createPlan();
    plan.scenarioSelections.monthly_shop_tickets = 'include';
    const variants = [
      { id: 'strongest', event_id: 'team', competition: 'strongest_team', label: 'Team', source_items: [] },
      { id: 'legend', event_id: 'legend', competition: 'legend_race', label: 'Legend', source_items: [] },
    ];
    const selection = { optionId: 'custom', label: 'Saved choice', availableAt: '2026-09-01', amounts: { free_jewels: 150 } };
    plan.variableRewardSelections = { team: selection, legend: selection, unrelated: selection };
    for (const group of ['speculative_income', 'story_event_rewards', 'monthly_shop_tickets']) applyScenarioSelection(plan, group, '');
    applyScenarioSelection(plan, 'strongest_team_reward_tier', 'all', variants);
    expect(plan.variableRewardSelections).toEqual({ legend: selection, unrelated: selection });
    expect(plan.scenarioSelections.monthly_shop_tickets).toBeUndefined();
    let stored = '';
    savePlanCollection({ version: 1, activePlanId: plan.id, plans: [plan] }, { setItem: (_, value) => stored = value });
    expect(loadPlanCollection({ getItem: () => stored }).plans[0]!.scenarioSelections).toMatchObject({ speculative_income: 'none', story_event_rewards: 'none' });
    applyIncomePreset(plan, [], 'conservative', { legend_race_clears: ['all'], story_event_rewards: ['include'] }, [], variants);
    expect(plan.variableRewardSelections).toEqual({ unrelated: selection });
    expect(plan.scenarioSelections.story_event_rewards).toBe('none');
  });

  it('migrates Angular seasonal selections without replacing individual choices or explicit exclusions', () => {
    const plan = createPlan();
    plan.scenarioSelections = { seasonal_gift_rewards: 'none', valentines_gift_rewards: 'include', speculative_income: '' };
    const saved = JSON.stringify({ version: 1, activePlanId: plan.id, plans: [plan] });
    const migrated = loadPlanCollection({ getItem: () => saved });
    expect(migrated.plans[0]!.scenarioSelections).toMatchObject({ speculative_income: 'none', valentines_gift_rewards: 'include', white_day_gift_rewards: 'none', christmas_gift_rewards: 'none', story_event_rewards: 'include' });
    expect(migrated.plans[0]!.scenarioSelections.seasonal_gift_rewards).toBeUndefined();
    let stored = '';
    savePlanCollection(migrated, { setItem: (_, value) => stored = value });
    expect(loadPlanCollection({ getItem: () => stored })).toEqual(migrated);
    expect(plan.scenarioSelections).toEqual({ seasonal_gift_rewards: 'none', valentines_gift_rewards: 'include', speculative_income: '' });
  });

  it('uses the exact monthly-shop and speculative selections without rewriting recurring sources', () => {
    const plan = createPlan(); plan.enabledIncomeRuleIds = ['published-default'];
    const rules = [
      { id: 'friend', label: 'Friend', currency: 'uma_ticket' as const, amount: 1, cadence: 'monthly' as const, start_date: '2026-01-01', scenario_group: 'monthly_shop_tickets', scenario_option: 'friend_points' },
      { id: 'all', label: 'All', currency: 'uma_ticket' as const, amount: 2, cadence: 'monthly' as const, start_date: '2026-01-01', scenario_group: 'monthly_shop_tickets', scenario_option: 'clovers' },
      { id: 'mean', label: 'Estimate', currency: 'free_jewels' as const, amount: 100, cadence: 'monthly' as const, start_date: '2026-01-01', scenario_group: 'speculative_income', scenario_option: 'include' },
      { id: 'median', label: 'Median', currency: 'free_jewels' as const, amount: 80, cadence: 'monthly' as const, start_date: '2026-01-01', scenario_group: 'speculative_income', scenario_option: 'median' }
    ];
    applyIncomePreset(plan, rules, 'casual');
    expect(plan.scenarioSelections).toMatchObject({ monthly_shop_friend_points: 'include', speculative_income: 'median' });
    expect(plan.scenarioSelections.monthly_shop_clovers).toBeUndefined();
    expect(plan.enabledIncomeRuleIds).toEqual(['published-default']);
  });

  it('matches Angular completionist reward overrides and preserves disabled targets', () => {
    const plan = createPlan();
    plan.disabledRewardIds = ['optional-gift'];
    plan.disabledEventIds = ['reward-event', 'target-event'];
    plan.targets.push({ id: 'target', eventId: 'target-event', title: 'Target', bannerKind: 'support', plannedPulls: 200, desiredCopies: 1, pullTiming: 'end', useTickets: true, allowPaidJewels: false });
    const rewards = [
      { id: 'optional-gift', label: 'Optional gift', currency: 'free_jewels' as const, amount: 3000, available_at: '2030-02-01', event_id: 'reward-event', default_enabled: false },
      { id: 'optional-gift-items', label: 'Optional gift item details', currency: 'free_jewels' as const, amount: null, available_at: '2030-02-01', event_id: 'reward-event', default_enabled: false },
    ];

    applyIncomePreset(plan, [], 'completionist', {}, rewards);

    expect(plan.enabledRewardIds).toEqual(['optional-gift']);
    expect(plan.disabledRewardIds).toEqual([]);
    expect(plan.disabledEventIds).toEqual(['target-event']);
  });
});
