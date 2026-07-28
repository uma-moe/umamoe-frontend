import {
  PlannerCompetitiveRewardVariant,
  PlannerCurrency,
  PlannerSourceItem,
} from '../models/carat-planner.model';

export function plannerCurrencyForSourceItem(
  item: Pick<PlannerSourceItem, 'item_category' | 'item_id'>,
): PlannerCurrency | undefined {
  if (item.item_category === 90 && item.item_id === 43) return 'free_jewels';
  if (item.item_category === 40 && item.item_id === 41) return 'uma_ticket';
  if (item.item_category === 40 && item.item_id === 111) return 'support_ticket';
  if (item.item_category === 164 && item.item_id === 149) return 'rainbow_crystal';
  if (item.item_category === 164 && item.item_id === 150) return 'gold_crystal';
  return undefined;
}

export function plannerSourceItemAmount(
  item: Pick<PlannerSourceItem, 'amount' | 'mission_count'>,
): number {
  const amount = Number.isFinite(item.amount) ? Math.max(0, Math.trunc(item.amount)) : 0;
  const missions = Number.isFinite(item.mission_count)
    ? Math.max(1, Math.trunc(item.mission_count ?? 1))
    : 1;
  return amount * missions;
}

export function plannerSourceItemTotals(
  items: readonly PlannerSourceItem[],
): Map<PlannerCurrency, number> {
  const totals = new Map<PlannerCurrency, number>();
  for (const item of items) {
    const currency = plannerCurrencyForSourceItem(item);
    const amount = plannerSourceItemAmount(item);
    if (!currency || amount <= 0) continue;
    totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }
  return totals;
}

export function hasProjectableSourceItems(items: readonly PlannerSourceItem[] | undefined): boolean {
  return items?.some(item => Boolean(plannerCurrencyForSourceItem(item)) && plannerSourceItemAmount(item) > 0) === true;
}

/**
 * Competitive master rows are cumulative/per-opponent for every currently
 * extracted competition except Champions Meeting, whose rows are alternative
 * placements and therefore cannot safely be added to a balance automatically.
 */
export function isProjectableCompetitiveVariant(
  variant: Pick<PlannerCompetitiveRewardVariant, 'competition' | 'default_enabled' | 'source_items'>,
): boolean {
  return variant.competition !== 'champions_meeting'
    && variant.default_enabled !== false
    && hasProjectableSourceItems(variant.source_items);
}
