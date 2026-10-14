import { describe, expect, it } from 'vitest';
import { applyGlobalRewardPrecedence } from './planner-reward-precedence';
import type { PlannerRewardEntry } from './carat-planner';

describe('planner reward precedence', () => {
  it('replaces only matching login bonuses within 45 days, keeping other components and currencies', () => {
    const reward = (id: string, extra: Partial<PlannerRewardEntry> = {}): PlannerRewardEntry => ({ id, label: 'Login bonus', currency: 'free_jewels', amount: 150, available_at: '2026-01-01', provenance: 'jp_fallback', ...extra });
    const rewards = [
      reward('global', { provenance: 'global_news' }),
      reward('boundary', { available_at: '2026-02-15' }),
      reward('outside', { available_at: '2026-02-16' }),
      reward('missions', { label: 'Event missions' }),
      reward('currency', { currency: 'paid_jewels' }),
      reward('amount', { amount: 300 }),
      reward('invalid', { available_at: 'invalid' }),
      reward('scoped-global', { provenance: 'global_news', event_id: 'event', amount: 400 }),
      reward('unrelated', { amount: 400 }),
    ];
    expect(applyGlobalRewardPrecedence({ rewards }).rewards.map(reward => reward.id)).toEqual(rewards.filter(reward => reward.id !== 'boundary').map(reward => reward.id));
  });
  it('keeps the Global event reward and removes its matched JP prediction', () => {
    const resource = applyGlobalRewardPrecedence({ rewards: [
      { id: 'global', label: 'Gift', event_id: 'event', currency: 'free_jewels', amount: 500, available_at: '2026-01-01', provenance: 'global_news' },
      { id: 'jp', label: 'Gift', event_id: 'event', currency: 'free_jewels', amount: 500, available_at: '2026-01-01', provenance: 'jp_news' }
    ] });
    expect(resource.rewards.map((reward) => reward.id)).toEqual(['global']);
  });
});
