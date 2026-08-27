import {
  PlannerCompetitiveRewardVariant,
  PlannerCurrency,
  PlannerRewardEntry,
  PlannerSourceItem,
} from '../models/carat-planner.model';

export interface PlannerRewardBundle {
  id: string;
  eventId?: string;
  label: string;
  availableAt: string;
  availableUntil?: string;
  totals: Map<PlannerCurrency, number>;
}

export function plannerCurrencyForSourceItem(
  item: Pick<PlannerSourceItem, 'item_category' | 'item_id'>,
): PlannerCurrency | undefined {
  if (item.item_category === 90 && item.item_id === 43) return 'free_jewels';
  if (item.item_category === 40 && item.item_id === 41) return 'uma_ticket';
  if (item.item_category === 40 && item.item_id === 111) return 'support_ticket';
  if (item.item_category === 164 && item.item_id === 144) return 'rainbow_full_crystal';
  if (item.item_category === 164 && item.item_id === 145) return 'gold_full_crystal';
  if (item.item_category === 164 && item.item_id === 149) return 'rainbow_crystal';
  if (item.item_category === 164 && item.item_id === 150) return 'gold_crystal';
  return undefined;
}

export function plannerSourceItemAmount(
  item: Pick<PlannerSourceItem, 'amount'>,
): number {
  // Generated mission source rows already contain SUM(item_num). mission_count
  // describes how many missions contributed to that sum; it is not a multiplier.
  return Number.isFinite(item.amount) ? Math.max(0, Math.trunc(item.amount)) : 0;
}

export function plannerRewardBundleId(
  reward: Pick<PlannerRewardEntry, 'id'>,
): string {
  return reward.id.replace(
    /-(?:free_jewels|paid_jewels|uma_ticket|support_ticket|rainbow_crystal|gold_crystal|rainbow_full_crystal|gold_full_crystal|items)$/,
    '',
  );
}

/**
 * Collapses the generator's sibling rows for one structured reward bundle.
 * Older artifacts copied the same source_items array onto every currency row,
 * so consuming source_items per row could count crystals two or four times.
 */
export function plannerRewardBundles(
  rewards: readonly PlannerRewardEntry[],
): PlannerRewardBundle[] {
  const grouped = new Map<string, PlannerRewardEntry[]>();
  for (const reward of rewards) {
    const baseId = plannerRewardBundleId(reward);
    const key = `${reward.event_id ?? ''}|${reward.available_at}|${reward.available_until ?? ''}|${baseId}`;
    const rows = grouped.get(key) ?? [];
    rows.push(reward);
    grouped.set(key, rows);
  }

  return [...grouped.values()].map(rows => {
    const totals = new Map<PlannerCurrency, number>();
    const represented = new Set<PlannerCurrency>();
    const sourceItems = new Map<string, PlannerSourceItem>();

    for (const reward of rows) {
      const amount = Number.isFinite(reward.amount) ? Math.trunc(Number(reward.amount)) : 0;
      if (amount !== 0) {
        totals.set(reward.currency, (totals.get(reward.currency) ?? 0) + amount);
        represented.add(reward.currency);
      }
      for (const item of reward.source_items ?? []) {
        const itemKey = [
          item.item_category,
          item.item_id,
          item.amount,
          item.mission_count ?? '',
          item.order_min ?? '',
          item.order_max ?? '',
          item.bonus ?? '',
        ].join(':');
        sourceItems.set(itemKey, item);
      }
    }

    for (const [currency, amount] of plannerSourceItemTotals([...sourceItems.values()])) {
      if (!represented.has(currency)) totals.set(currency, (totals.get(currency) ?? 0) + amount);
    }

    return {
      id: plannerRewardBundleId(rows[0]),
      eventId: rows[0]?.event_id,
      label: rows[0]?.label ?? 'Event rewards',
      availableAt: rows[0]?.available_at ?? '',
      availableUntil: rows[0]?.available_until,
      totals,
    };
  });
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
 * Whether a competitive row contains resources the planner understands. These
 * rows are selectable outcomes; they must not all be added automatically.
 */
export function isProjectableCompetitiveVariant(
  variant: Pick<PlannerCompetitiveRewardVariant, 'competition' | 'default_enabled' | 'source_items'>,
): boolean {
  return hasProjectableSourceItems(variant.source_items);
}

export function isAutomaticCompetitiveVariant(
  variant: Pick<PlannerCompetitiveRewardVariant, 'default_enabled' | 'source_items'>,
): boolean {
  return variant.default_enabled === true && hasProjectableSourceItems(variant.source_items);
}
