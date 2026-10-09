import { describe, expect, it } from 'vitest';
import { calculateMemberMetrics, clubProgression, effectiveMemberFans, memberDailyDeltas, type ClubMemberSnapshot } from './member-metrics';
import { clubExportCases, clubExportFixture } from '../../../tests/e2e/fixtures/club-exports';
import reference from '../../../tests/e2e/fixtures/club-exports-reference.json';
import { buildClubCalendar } from './club-progression';

const member = (dailyFans: number[]): ClubMemberSnapshot => ({ viewer_id: 42, trainer_name: 'McQueen Trainer', membership: 3, year: 2026, month: 8, daily_fans: dailyFans, last_updated: '2026-08-20T00:00:00Z' });

describe('club member metrics', () => {
  it('matches recorded calculations and history with departed-member month-end gains corrected', () => {
    for (const name of clubExportCases) {
      const fixture = clubExportFixture(name), expected = reference.cases[name].json;
      const actual = calculateMemberMetrics(fixture.response.members, { year: fixture.year, month: fixture.month, currentMonth: fixture.month === 9, includePrior: fixture.config.includePriorClubData, leaderViewerId: fixture.response.circle.leader_viewer_id });
      expect(actual.length).toBe(expected.members.length);
      for (const member of expected.members) expect(actual.find(value => String(value.viewerId) === member.trainer_id)).toEqual({
        viewerId: Number(member.trainer_id), name: member.name, role: member.role, fanCount: member.fan_count, active: member.isActive,
        todayGain: member.today_gain, dailyGain: member.daily_gain, monthlyGain: member.monthly_gain, weeklyGain: member.weekly_gain,
        sevenDayAverage: member.seven_day_avg, dailyAverage: member.daily_avg, projectedMonthly: member.projected_monthly,
        priorClubGain: member.priorCircleGain, priorInToday: member.priorInToday, priorInDaily: member.priorInDaily, priorInWeekly: member.priorInWeekly,
        hasPriorClubData: member.hasPriorCircleData, lastUpdated: member.last_updated
      });
      // Reference downloads use UTC; source history dates use the browser's local midnight.
      expect(clubProgression(fixture.response.members, fixture.year, fixture.month)).toEqual(expected.history.map(point => ({ ...point, date: new Date(fixture.year, fixture.month - 1, new Date(point.date).getUTCDate()).toISOString() })));
    }
  });

  it('retains role precedence, a first snapshot, and missing-month history fallback', () => {
    const source = { ...member([0, 0, 200]), membership: 1 };
    expect(calculateMemberMetrics([source], { year: 2026, month: 8, currentMonth: true, includePrior: true, leaderViewerId: 42 })[0]).toMatchObject({ role: 'member', todayGain: 200, dailyGain: 0, sevenDayAverage: 0 });
    expect(clubProgression([source], 2026, 9)).toEqual([{ date: new Date(2026, 8, 2).toISOString(), fan_count: 0 }]);
    expect(memberDailyDeltas(source, 31, true)).toEqual([null, null]);
  });

  it('separates the live current-day gain from the latest completed day', () => {
    const [result] = calculateMemberMetrics([member([100, 150, 230, 260])], { year: 2026, month: 8, currentMonth: true, includePrior: true, leaderViewerId: 42 });
    expect(result).toMatchObject({ role: 'leader', active: true, todayGain: 30, dailyGain: 80, monthlyGain: 160 });
  });

  it('can exclude prior-club snapshots from derived data', () => {
    const included = calculateMemberMetrics([member([-100, -150, 220, 300])], { year: 2026, month: 8, currentMonth: false, includePrior: true })[0];
    const excluded = calculateMemberMetrics([member([-100, -150, 220, 300])], { year: 2026, month: 8, currentMonth: false, includePrior: false })[0];
    expect(included?.hasPriorClubData).toBe(true);
    expect(included?.monthlyGain).toBe(200);
    expect(excluded?.monthlyGain).toBe(80);
  });

  it('aggregates club progression without leaking excluded prior-club data', () => {
    expect(clubProgression([member([-100, 150]), { ...member([50, 80]), viewer_id: 43 }], 2026, 8)).toEqual([{ date: new Date(2026, 7, 1).toISOString(), fan_count: 30 }]);
    expect(memberDailyDeltas(member([100, 140, 0, 210]), 31, true).slice(0, 3)).toEqual([40, null, 70]);
    expect(effectiveMemberFans({ ...member([100, 140]), next_month_start: 250 }, 3)).toEqual([100, 140]);
    expect(effectiveMemberFans({ ...member([100, 140, 210]), next_month_start: 250 }, 3)).toEqual([100, 140, 210, 250]);
    expect(effectiveMemberFans({ ...member([100, 140, 0, 210]), next_month_start: 250 }, 3)).toEqual([100, 140, 0, 210]);
  });

  it('excludes departed members\' later lifetime gains from club metrics, calendar, progression and exports', () => {
    const departed = { ...member([1216184214, 1216184214, ...Array(30).fill(0)]), viewer_id: 570323472295, trainer_name: 'LinhYeuAnh', month: 9, next_month_start: 1731597408 };
    const active = { ...member(Array.from({ length: 31 }, (_, i) => 1000 + i * 100)), month: 9 };
    const snapshots = [departed, active];
    const metrics = calculateMemberMetrics(snapshots, { year: 2026, month: 9, currentMonth: false, includePrior: true });
    expect(metrics[0]).toMatchObject({ active: false, fanCount: 1216184214, monthlyGain: 0, dailyAverage: 0 });
    const secondDay = buildClubCalendar(snapshots, 2026, 9).flat().find(day => !day.isOtherMonth && day.day === 2)!;
    expect(secondDay.dailyDelta).toBe(100);
    expect(secondDay.memberDeltas.some(member => member.name === 'LinhYeuAnh')).toBe(false);
    const history = clubProgression(snapshots, 2026, 9);
    expect(history).toHaveLength(30);
    expect(history[29]!.fan_count - history[28]!.fan_count).toBe(100);
    expect(history[29]!.fan_count).toBe(3000);
    expect(effectiveMemberFans(departed, 30)[30]).toBe(0);
    expect(memberDailyDeltas(departed, 30, true)[29]).toBeNull();
  });

  it('retains the recorded contribution of a departed member with truncated snapshots', () => {
    const departed = { ...member([1000, 1100]), next_month_start: 100000 };
    const active = { ...member(Array.from({ length: 32 }, (_, i) => 2000 + i * 100)), viewer_id: 43 };
    const metrics = calculateMemberMetrics([departed, active], { year: 2026, month: 8, currentMonth: false, includePrior: true });
    expect(metrics[0]).toMatchObject({ active: false, fanCount: 1100, monthlyGain: 100 });
    expect(clubProgression([departed, active], 2026, 8).at(-1)!.fan_count).toBe(3200);
  });

  it.each([[2026, 9, 30], [2026, 7, 31], [2026, 2, 28], [2024, 2, 29]])('retains valid month-end gains for %i-%i (%i days)', (year, month, days) => {
    const snapshot = { ...member(Array.from({ length: 32 }, (_, i) => i < days ? 1000 + i * 100 : 0)), year, month, next_month_start: 1000 + days * 100 };
    const [metrics] = calculateMemberMetrics([snapshot], { year, month, currentMonth: false, includePrior: true });
    expect(metrics).toMatchObject({ monthlyGain: days * 100, dailyGain: 100 });
    expect(clubProgression([snapshot], year, month).at(-1)!.fan_count).toBe(days * 100);
    expect(buildClubCalendar([snapshot], year, month).flat().find(day => !day.isOtherMonth && day.day === days)!.dailyDelta).toBe(100);
    expect(memberDailyDeltas(snapshot, days, true)[days - 1]).toBe(100);
  });

  it('rejects club fallbacks for a prior-club final snapshot while retaining lifetime profile data', () => {
    const departed = { ...member(Array.from({ length: 31 }, (_, i) => i === 30 ? -4000 : 1000 + i * 100)), next_month_start: 100000 };
    expect(effectiveMemberFans(departed, 31)).toEqual(departed.daily_fans);
    expect(effectiveMemberFans(departed, 31, true).at(-1)).toBe(100000);
    expect(calculateMemberMetrics([departed], { year: 2026, month: 8, currentMonth: false, includePrior: false })[0]!.monthlyGain).toBe(2900);
  });
});
