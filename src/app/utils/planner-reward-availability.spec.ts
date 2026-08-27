import { plannerRewardAvailabilityWindow } from './planner-reward-availability';

describe('plannerRewardAvailabilityWindow', () => {
  it('uses an exact reward start and end without requiring a timeline event', () => {
    expect(plannerRewardAvailabilityWindow(
      undefined,
      ['2026-08-26T22:00:00Z'],
      [],
      ['2026-09-02T14:59:00Z'],
    )).toEqual({ startsAt: '2026-08-26', endsAt: '2026-09-02' });
  });

  it('keeps separate explicit login periods separate', () => {
    const periods = [
      ['2026-08-26T22:00:00Z', '2026-09-02T14:59:00Z'],
      ['2026-08-30T15:00:00Z', '2026-09-06T14:59:00Z'],
    ];

    expect(periods.map(([start, end]) => plannerRewardAvailabilityWindow(
      undefined,
      [start],
      [],
      [end],
    ))).toEqual([
      { startsAt: '2026-08-26', endsAt: '2026-09-02' },
      { startsAt: '2026-08-30', endsAt: '2026-09-06' },
    ]);
  });
});
