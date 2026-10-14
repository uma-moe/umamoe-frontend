import { describe, expect, it } from 'vitest';
import { aptitudeGrade, buildCircleMemberships, buildProfileDailyFans, groupStadiumMembers, profileInheritanceRecord, totalStats } from './profile-display';
import type { ProfileResponse } from '@/pages/profile/profile-repository';

describe('Angular profile display parity', () => {
  it('plots recorded daily totals, preserves gaps and handles prior-circle values and month-end tallies', () => {
    const member = { viewer_id:42, trainer_name:'Trainer', year:2026, month:8, daily_fans:[-100, 0, 140, NaN, 150, 0], last_updated:'' };
    expect(buildProfileDailyFans([member], 2026).filter(point => point.label.startsWith('Aug')).slice(0, 5)).toEqual([
      {label:'Aug 01', total:100, gain:null}, {label:'Aug 02', total:null, gain:null},
      {label:'Aug 03', total:140, gain:40}, {label:'Aug 04', total:null, gain:null},
      {label:'Aug 05', total:150, gain:10}
    ]);
    expect(buildProfileDailyFans([{...member, next_month_start:200}], 2026).find(point => point.label === 'Sep 01')).toEqual({label:'Sep 01', total:200, gain:50});
    expect(buildProfileDailyFans([member], 2026).at(-1)).toEqual({label:'Aug 05', total:150, gain:10});
    expect(buildProfileDailyFans([{...member, daily_fans:[0, NaN, 0]}], 2026)).toEqual([]);
    expect(member.daily_fans).toEqual([-100, 0, 140, NaN, 150, 0]);
  });
  it('joins a whole leap year, prefers the next month at boundaries and leaves unrecorded days empty', () => {
    const january = {viewer_id:42, trainer_name:'Trainer', year:2024, month:1, daily_fans:[100, 0, 110], next_month_start:200, last_updated:''};
    const february = {...january, month:2, daily_fans:[210, 0, 230], next_month_start:300};
    const december = {...january, month:12, daily_fans:Array.from({length:31}, (_, day) => day === 30 ? 500 : 0), next_month_start:900};
    const points = buildProfileDailyFans([december, february, {...january, year:2023, daily_fans:[9999]}, january], 2024);
    expect(points).toHaveLength(366);
    expect(new Set(points.map(point => point.label)).size).toBe(366);
    expect(points[0]).toEqual({label:'Jan 01', total:100, gain:null});
    expect(points.find(point => point.label === 'Feb 01')).toEqual({label:'Feb 01', total:210, gain:100});
    expect(points.find(point => point.label === 'Feb 29')?.total).toBeNull();
    expect(points.find(point => point.label === 'Mar 01')).toEqual({label:'Mar 01', total:300, gain:70});
    expect(points.at(-1)).toEqual({label:'Dec 31', total:500, gain:200});
    expect(points.some(point => point.total === 900 || point.total === 9999)).toBe(false);
    expect(buildProfileDailyFans([{...december, year:2025}], 2025)).toHaveLength(365);
    expect(buildProfileDailyFans([], 2025)).toEqual([]);
  });
  it('normalizes inheritance once and counts distinct G1 groups, preserving absent values', () => {
    const profile = {
      trainer: { account_id: '123', name: 'Trainer' }, borrow_stats: { view_count: 8, copy_count: 3 },
      support_card: { support_card_id: 30028, limit_break_count: 4, experience: 45000 },
      inheritance: { inheritance_id: 9, main_parent_id: 101301, parent_left_id: 100601, parent_right_id: 106701,
        main_win_saddles: ['16', 16, 17, 30, 9999, 'invalid'], main_white_factors: ['200012', 'invalid', 200023],
        race_results: ['102', 'invalid'], win_count: 12, white_stars_sum: 18 }
    } as unknown as ProfileResponse;
    const groups = new Map([[16, 1], [17, 1], [30, 2]]);
    const normalized = profileInheritanceRecord(profile, groups)!;
    expect(normalized).toMatchObject({ accountId: '123', id: 9, winCount: 2, whiteCount: undefined,
      rankScore: 0, rarity: 0, borrowViews: 8, borrowCopies: 3, mainWhite: [200012, 200023], raceResults: [102],
      supportCardId: 30028, supportLimitBreak: 4, supportExperience: 45000 });
    profile.inheritance!.main_win_saddles = [];
    expect(profileInheritanceRecord(profile, groups)?.winCount).toBe(0);
    delete profile.inheritance!.main_win_saddles;
    expect(profileInheritanceRecord(profile, groups)?.winCount).toBe(12);
    profile.inheritance = null;
    expect(profileInheritanceRecord(profile, groups)).toBeNull();
  });
  it('coalesces consecutive circle months and marks the current membership', () => {
    const memberships = buildCircleMemberships([
      { year: 2025, month: 3, circle_id: 2, circle_name: 'B', circle_rank: null, circle_points: null },
      { year: 2025, month: 1, circle_id: 1, circle_name: 'A', circle_rank: null, circle_points: null },
      { year: 2025, month: 2, circle_id: 1, circle_name: 'A', circle_rank: null, circle_points: null },
      { year: 2025, month: 4, circle_id: 2, circle_name: 'B', circle_rank: null, circle_points: null }
    ], 2);
    expect(memberships).toEqual([
      { circleId: 2, circleName: 'B', from: { year: 2025, month: 3 }, to: { year: 2025, month: 4 }, months: 2, current: true },
      { circleId: 1, circleName: 'A', from: { year: 2025, month: 1 }, to: { year: 2025, month: 2 }, months: 2, current: false }
    ]);
  });

  it('keeps Angular aptitude, distance ordering, and total-stat rules', () => {
    expect([0, 1, 7, 8, 99].map(aptitudeGrade)).toEqual(['G', 'G', 'A', 'S', 'S']);
    expect(groupStadiumMembers([{ id: 2, distance_type: 4 } as never, { id: 1, distance_type: 1 } as never]).map((group) => group.distance)).toEqual(['Sprint', 'Long']);
    expect(totalStats({ speed: 1200, stamina: 900, power: 1000, guts: null, wiz: 800 })).toBe(3900);
  });
});
