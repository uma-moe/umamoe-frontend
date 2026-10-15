import type { PlannerCurrency, PlannerRewardEntry, PlannerSourceItem } from '../carat-planner';

export interface PlannerRewardBundle { id: string; eventId?: string; label: string; availableAt: string; availableUntil?: string; totals: Map<PlannerCurrency, number>; }

export function plannerCurrencyForSourceItem(item: Pick<PlannerSourceItem, 'item_category' | 'item_id'>): PlannerCurrency | undefined {
  if (item.item_category === 90 && item.item_id === 43) return 'free_jewels';
  if (item.item_category === 40 && item.item_id === 41) return 'uma_ticket';
  if (item.item_category === 40 && item.item_id === 111) return 'support_ticket';
  if (item.item_category === 164 && item.item_id === 144) return 'rainbow_full_crystal';
  if (item.item_category === 164 && item.item_id === 145) return 'gold_full_crystal';
  if (item.item_category === 164 && item.item_id === 149) return 'rainbow_crystal';
  if (item.item_category === 164 && item.item_id === 150) return 'gold_crystal';
  return undefined;
}
export function plannerRewardBundleId(reward: Pick<PlannerRewardEntry, 'id'>): string { return reward.id.replace(/-(?:free_jewels|paid_jewels|uma_ticket|support_ticket|rainbow_crystal|gold_crystal|rainbow_full_crystal|gold_full_crystal|items)$/, ''); }

/** Generated sibling rows may contain the same source_items. Collapse them
 * before projection so crystals and tickets are never double-counted. */
export function plannerRewardBundles(rewards: readonly PlannerRewardEntry[]): PlannerRewardBundle[] {
  const grouped = new Map<string, PlannerRewardEntry[]>();
  for (const reward of rewards) {
    const key = `${reward.event_id ?? ''}|${reward.available_at}|${reward.available_until ?? ''}|${plannerRewardBundleId(reward)}`;
    grouped.set(key, [...(grouped.get(key) ?? []), reward]);
  }
  return [...grouped.values()].map((rows) => {
    const totals = new Map<PlannerCurrency, number>();
    const represented = new Set<PlannerCurrency>();
    const sourceItems = new Map<string, PlannerSourceItem>();
    for (const reward of rows) {
      const amount = Number.isFinite(reward.amount) ? Math.trunc(Number(reward.amount)) : 0;
      if (amount) { totals.set(reward.currency, (totals.get(reward.currency) ?? 0) + amount); represented.add(reward.currency); }
      for (const item of reward.source_items ?? []) sourceItems.set([item.item_category,item.item_id,item.amount,item.mission_count ?? '',item.order_min ?? '',item.order_max ?? '',item.bonus ?? ''].join(':'), item);
    }
    for (const [currency, amount] of plannerSourceItemTotals([...sourceItems.values()])) if (!represented.has(currency)) totals.set(currency, (totals.get(currency) ?? 0) + amount);
    return { id: plannerRewardBundleId(rows[0]!), eventId: rows[0]?.event_id, label: rows[0]?.label ?? 'Event rewards', availableAt: rows[0]?.available_at ?? '', availableUntil: rows[0]?.available_until, totals };
  });
}

export function plannerSourceItemTotals(items: readonly PlannerSourceItem[]): Map<PlannerCurrency, number> {
  const totals = new Map<PlannerCurrency, number>();
  for (const item of items) {
    const currency = plannerCurrencyForSourceItem(item);
    const amount = Number.isFinite(item.amount) ? Math.max(0, Math.trunc(item.amount)) : 0;
    if (currency && amount) totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }
  return totals;
}

/** Matches Angular's ledger eligibility check. Qualitative companion rows stay
 * visible in reward details, but never become selectable balance entries. */
export function plannerRewardIsProjectable(reward: PlannerRewardEntry): boolean {
  if (/-items$/i.test(reward.id) || / item details$/i.test(reward.label)) return false;
  if (Number.isFinite(reward.amount) && Number(reward.amount) > 0) return true;
  return [...plannerSourceItemTotals(reward.source_items ?? []).values()].some((amount) => amount > 0);
}
