import { describe, expect, it } from 'vitest';
import {
  randomGameplayIncomeRules,
  speculativeIncomeBetween,
  trainingPassIncomeRules
} from './planner-income-assumptions';
import type { TimelineRecord } from '@/pages/timeline/timeline-repository';

describe('planner synthetic income assumptions', () => {
  it('uses the projected Global Training Pass launch and exact monthly currencies', () => {
    const event = { id: 'campaign-632', date: new Date('2027-08-24T22:00:00Z') } as TimelineRecord;
    const rules = trainingPassIncomeRules('premium', [event]);
    expect(rules.map((rule) => [rule.currency, rule.amount])).toEqual([
      ['free_jewels', 1_850],
      ['paid_jewels', 350],
      ['uma_ticket', 4],
      ['support_ticket', 4],
      ['rainbow_crystal', 1]
    ]);
    expect(rules[0]?.start_date).toBe('2027-08-24');
  });

  it('ports Angular random gameplay levels as weekly rules', () => {
    expect(randomGameplayIncomeRules('medium', '2026-01-01')[0]).toMatchObject({
      amount: 90,
      cadence: 'weekly'
    });
  });

  it('accrues speculative income using real calendar-month fractions', () => {
    const comparison = {
      speculative_method: 'mean_last_6_complete_calendar_months_global_only_gifts',
      observation_end: '2026-01-31',
      speculative_monthly_carats: 2_800,
      speculative_recent_median_monthly_carats: 1_400
    };

    const day = (value: string) => Math.trunc(Date.parse(`${value}T00:00:00Z`) / 86_400_000);
    expect(
      speculativeIncomeBetween(
        comparison,
        'include',
        day('2026-01-01'),
        day('2026-01-31'),
        day('2026-02-28')
      )
    ).toBe(2_800);
    expect(
      speculativeIncomeBetween(
        comparison,
        'median',
        day('2026-01-01'),
        day('2026-01-31'),
        day('2026-02-28')
      )
    ).toBe(1_400);
    expect(
      speculativeIncomeBetween(
        { ...comparison, speculative_method: 'mean_last_6_complete_calendar_months' },
        'include',
        day('2026-01-01'),
        day('2026-01-31'),
        day('2026-02-28')
      )
    ).toBe(2_800);
  });
});
