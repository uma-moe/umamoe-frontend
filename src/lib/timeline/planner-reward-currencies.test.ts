import { describe, expect, it } from 'vitest';
import { plannerRewardBundles } from './planner-reward-currencies';

describe('planner reward currency bundles', () => {
  it('does not multiply shared source items across generated sibling rows', () => {
    const source_items = [{ item_category: 164, item_id: 149, amount: 2 }];
    const bundles = plannerRewardBundles([
      { id: 'event-free_jewels', label: 'Event', event_id: 'e', available_at: '2026-01-01', currency: 'free_jewels', amount: 500, source_items },
      { id: 'event-items', label: 'Event', event_id: 'e', available_at: '2026-01-01', currency: 'rainbow_crystal', amount: null, source_items }
    ]);
    expect(bundles[0]?.totals.get('free_jewels')).toBe(500);
    expect(bundles[0]?.totals.get('rainbow_crystal')).toBe(2);
  });
});
