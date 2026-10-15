import type { CaratPlanCollection, PlannerDataBundle } from '../carat-planner';
import {
  plannerRewardNeedsEnabledOverride,
  plannerRewardSelectionEnabled
} from '../rewards/planner-reward-assumptions';

/** Persist manual exceptions, not resource-derived defaults (Angular's account-sync contract). */
export function compactPlannerCollectionResourceState(
  collection: CaratPlanCollection,
  data: PlannerDataBundle,
  events: readonly { id: string }[] = []
): CaratPlanCollection {
  const incomeById = new Map(data.income.rules.map((rule) => [rule.id, rule]));
  const rewardById = new Map(data.rewards.rewards.map((reward) => [reward.id, reward]));
  const selectors = new Set(
    (data.rewards.event_benefits ?? [])
      .filter(
        (benefit) => benefit.kind === 'trainee_selector' || benefit.kind === 'support_selector'
      )
      .map((benefit) => benefit.event_id)
  );

  const knownEvents = new Set([
    ...data.rewards.rewards.map((reward) => reward.event_id),
    ...(data.rewards.competitive_variants ?? []).map((variant) => variant.event_id),
    ...(data.rewards.event_benefits ?? []).map((benefit) => benefit.event_id),
    ...events.map((event) => event.id)
  ]);

  return {
    ...collection,
    plans: collection.plans.map((plan) => {
      const disabledEvents = new Set(plan.disabledEventIds);
      const disabledRewards = new Set(plan.disabledRewardIds);
      const targetEvents = new Set(plan.targets.map((target) => target.eventId));
      return {
        ...plan,
        enabledIncomeRuleIds: sorted(
          plan.enabledIncomeRuleIds.filter((id) => {
            const rule = incomeById.get(id);
            return rule && !rule.scenario_group;
          })
        ),
        enabledRewardIds: sorted(
          plan.enabledRewardIds.filter((id) => {
            const reward = rewardById.get(id);
            return reward && plannerRewardNeedsEnabledOverride(reward) && !disabledRewards.has(id);
          })
        ),
        disabledRewardIds: sorted(
          plan.disabledRewardIds.filter((id) => {
            const reward = rewardById.get(id);
            return (
              reward &&
              !(reward.event_id && disabledEvents.has(reward.event_id)) &&
              plannerRewardSelectionEnabled(reward, plan.scenarioSelections)
            );
          })
        ),
        enabledRewardEventIds: sorted([...selectors].filter((id) => !disabledEvents.has(id))),
        disabledEventIds: sorted(
          plan.disabledEventIds.filter(
            (id) => !events.length || knownEvents.has(id) || targetEvents.has(id)
          )
        )
      };
    })
  };
}

function sorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}
