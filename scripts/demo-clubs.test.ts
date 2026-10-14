import { expect, test } from 'vitest';
import { demoClubDetails } from './demo-clubs';
import { calculateMemberMetrics, clubProgression } from '../src/lib/clubs/member-metrics';

test('Demo clubs expose coherent totals, tier data and varied member states', () => {
  const now = new Date('2026-09-17T12:00:00Z');
  for (const id of [7, 8, 9]) {
    for (const month of [8, 9, 10]) {
      const data = demoClubDetails(id, 2026, month, now);
      const metrics = calculateMemberMetrics(data.members, { year:2026, month, currentMonth:month === 9, includePrior:true });
      expect(data.circle.member_count).toBe(metrics.filter(member => member.active).length);
      expect(data.circle.monthly_point).toBe(clubProgression(data.members, 2026, month).at(-1)?.fan_count ?? 0);
      expect(data.club_rank).toBeGreaterThan(1);
      expect(data.yesterday_fans_to_next_tier).toBeTypeOf('number');
      if (month === 9) {
        expect(metrics.some(member => member.hasPriorClubData)).toBe(true);
        expect(metrics.some(member => !member.active)).toBe(true);
        expect(metrics.some(member => member.active && member.monthlyGain === 0)).toBe(true);
        expect(new Set(metrics.map(member => member.role)).size).toBe(3);
        expect(data.circle.last_live_update).toBe(now.toISOString());
      }
    }
  }
});
