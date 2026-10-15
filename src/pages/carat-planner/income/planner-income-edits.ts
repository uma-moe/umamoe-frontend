import type { CaratPlan } from '@/lib/carat-planner/carat-planner';
import type { summarizePlannerIncome } from './planner-income-view';

export type PlannerIncomeProjection = ReturnType<typeof summarizePlannerIncome> & {
  through: string;
  preview: boolean;
};

export function markIncomeEdited(value: CaratPlan): void {
  if (value.incomePresetId) value.incomePresetEdited = true;
}
