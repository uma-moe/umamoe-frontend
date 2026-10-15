import {
  plannerPickupGoals,
  type PlannerGachaEntry,
  type PlannerGoalProjection,
  type PlannerStepUp,
  type PlannerTarget,
  type TargetProjection
} from '@/lib/carat-planner/carat-planner';
import { plannerPickupOptions } from '@/lib/carat-planner/planner-presentation';
import type { TimelinePickupCatalog } from '@/lib/timeline/timeline-pickups';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';

export function plannerGoalOptions(
  target: PlannerTarget,
  gacha: PlannerGachaEntry | undefined,
  cardKind: 'support' | 'character',
  events: TimelineRecord[],
  catalog: TimelinePickupCatalog
) {
  const stepUp = gacha?.step_up;
  return stepUp
    ? [
        {
          id: 'step-up-choice',
          pickupId: 0,
          kind: cardKind,
          image: '',
          name: 'Chosen card',
          subLabel: stepUp.selection_pool_size
            ? `From your pool of ${stepUp.selection_pool_size}`
            : 'From your selected pool',
          rate: stepUp.selection_pickup_rate,
          exchangeable: false
        }
      ]
    : plannerPickupOptions(target, gacha, events, catalog);
}

export type PlannerGoalOption = ReturnType<typeof plannerGoalOptions>[number];

export function plannerGoalViews(
  target: PlannerTarget,
  stepUp: PlannerStepUp | undefined,
  options: PlannerGoalOption[],
  projection: TargetProjection
) {
  return (
    stepUp ? [{ pickupId: 0, desiredCopies: target.desiredCopies }] : plannerPickupGoals(target)
  ).map((goal) => {
    const odds = projection.pickupGoals.find((odds) => odds.pickupId === goal.pickupId);
    const actualCopies = target.actualCopies?.[stepUp ? 'chosen' : String(goal.pickupId)];
    return {
      ...goal,
      option: options.find((option) => option.pickupId === goal.pickupId)!,
      odds,
      actualCopies,
      met:
        actualCopies !== undefined &&
        actualCopies >= (odds?.copiesNeededFromPulls ?? goal.desiredCopies)
    };
  });
}

export type PlannerGoalView = ReturnType<typeof plannerGoalViews>[number];

export function percent(value?: number, digits = 1): string {
  return value === undefined || !Number.isFinite(value)
    ? 'Unavailable'
    : `${(value * 100).toFixed(value > 0 && value < 0.001 ? 2 : digits)}%`;
}

export function copies(value: number): string {
  return value.toFixed(value >= 10 ? 1 : 2).replace(/\.?0+$/, '');
}

export function resultLabel(goal: PlannerGoalView): string {
  return goal.actualCopies === undefined ? 'Not recorded' : goal.met ? 'Met' : 'Not met';
}

export function requirement(goal: PlannerGoalView): string {
  const count = goal.odds?.copiesNeededFromPulls ?? goal.desiredCopies;
  return `${count} ${count === 1 ? 'copy' : 'copies'} required${goal.odds?.crystalCopiesApplied ? ` + ${goal.odds.crystalCopiesApplied} ${goal.odds.crystalKind === 'gold' ? 'Gold' : 'Rainbow'} Uncap` : ''}`;
}

export function oddsLabel(name: string, odds?: PlannerGoalProjection): string {
  if (odds?.probability === undefined) return `Odds unavailable for ${name}`;
  return `${percent(odds.probability)} chance of at least ${odds.copiesNeededFromPulls} ${odds.copiesNeededFromPulls === 1 ? 'copy' : 'copies'} of ${name}${odds.crystalCopiesApplied ? `; ${odds.crystalCopiesApplied} ${odds.crystalKind === 'gold' ? 'Gold' : 'Rainbow'} Uncap Crystals supply the remaining limit breaks toward ${odds.desiredCopies} copies` : ''}`;
}
