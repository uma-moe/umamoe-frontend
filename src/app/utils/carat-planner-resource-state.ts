import {
  CaratPlan,
  CaratPlanCollection,
  CaratPlannerDataBundle,
  CaratPlannerTimelineEvent,
} from '../models/carat-planner.model';
import {
  plannerRewardNeedsEnabledOverride,
  plannerRewardSelectionEnabled,
} from './carat-planner-income-assumptions';

/**
 * Removes resource-derived state before account sync.
 *
 * Scenario-controlled income is represented by scenarioSelections, automatic
 * rewards are represented by their resource defaults, and ordinary reward
 * events are active unless listed in disabledEventIds. Only genuine manual
 * exceptions need to survive in persisted planner state.
 */
export function compactPlannerCollectionResourceState(
  collection: CaratPlanCollection,
  data: CaratPlannerDataBundle,
  events: readonly CaratPlannerTimelineEvent[] = [],
): CaratPlanCollection {
  const incomeRuleById = new Map(data.income.rules.map(rule => [rule.id, rule]));
  const rewardById = new Map(data.rewards.rewards.map(reward => [reward.id, reward]));
  const selectorEventIds = new Set((data.rewards.event_benefits ?? [])
    .filter(benefit => benefit.kind === 'trainee_selector' || benefit.kind === 'support_selector')
    .map(benefit => benefit.event_id));
  const knownEventIds = new Set<string>();
  for (const reward of data.rewards.rewards) {
    if (reward.event_id) knownEventIds.add(reward.event_id);
  }
  for (const variant of data.rewards.competitive_variants ?? []) {
    if (variant.event_id) knownEventIds.add(variant.event_id);
  }
  for (const benefit of data.rewards.event_benefits ?? []) {
    if (benefit.event_id) knownEventIds.add(benefit.event_id);
  }
  for (const event of events) knownEventIds.add(event.id);

  return {
    ...collection,
    plans: collection.plans.map(plan => compactPlan(
      plan,
      incomeRuleById,
      rewardById,
      selectorEventIds,
      knownEventIds,
      events.length > 0,
    )),
  };
}

function compactPlan(
  plan: CaratPlan,
  incomeRuleById: ReadonlyMap<string, CaratPlannerDataBundle['income']['rules'][number]>,
  rewardById: ReadonlyMap<string, CaratPlannerDataBundle['rewards']['rewards'][number]>,
  selectorEventIds: ReadonlySet<string>,
  knownEventIds: ReadonlySet<string>,
  timelineReady: boolean,
): CaratPlan {
  const disabledEvents = new Set(plan.disabledEventIds ?? []);
  const explicitlyDisabledRewards = new Set(plan.disabledRewardIds ?? []);
  const disabledRewardIds = uniqueSorted([...explicitlyDisabledRewards].filter(rewardId => {
    const reward = rewardById.get(rewardId);
    return Boolean(reward
      && !(reward.event_id && disabledEvents.has(reward.event_id))
      && plannerRewardSelectionEnabled(
        reward,
        plan.scenarioSelections,
        false,
        false,
      ));
  }));
  const targetEventIds = new Set(plan.targets.map(target => target.eventId));

  return {
    ...plan,
    enabledIncomeRuleIds: uniqueSorted(plan.enabledIncomeRuleIds.filter(ruleId => {
      const rule = incomeRuleById.get(ruleId);
      return Boolean(rule && !rule.scenario_group);
    })),
    enabledRewardIds: uniqueSorted(plan.enabledRewardIds.filter(rewardId => {
      const reward = rewardById.get(rewardId);
      return Boolean(reward
        && plannerRewardNeedsEnabledOverride(reward)
        && !explicitlyDisabledRewards.has(rewardId));
    })),
    disabledRewardIds,
    enabledRewardEventIds: uniqueSorted([...selectorEventIds].filter(eventId => (
      !disabledEvents.has(eventId)
    ))),
    disabledEventIds: uniqueSorted((plan.disabledEventIds ?? []).filter(eventId => (
      !timelineReady || knownEventIds.has(eventId) || targetEventIds.has(eventId)
    ))),
  };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
