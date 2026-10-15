import type { PlannerStepUp } from '@/lib/carat-planner/carat-planner';

export function plannerStepOptions(stepUp?: PlannerStepUp): { value: string; label: string }[] {
  let pulls = 0,
    cost = 0;
  const options = [{ value: '0', label: 'No pulls' }];
  if (stepUp)
    for (let round = 1; round <= stepUp.rounds; round++) {
      for (const [index, step] of stepUp.steps.entries()) {
        pulls += step.pulls;
        cost += step.cost;
        options.push({
          value: String(pulls),
          label: `${stepUp.rounds > 1 ? 'Round ' + round + ', ' : ''}Step ${index + 1} · ${pulls} pulls · ${cost.toLocaleString()} paid Carats`
        });
      }
    }
  return options;
}
