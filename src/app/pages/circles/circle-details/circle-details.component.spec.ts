import { CircleMemberMonthlyData } from '../../../models/circle.model';
import { CircleDetailsComponent, CircleDetailsConfig } from './circle-details.component';

describe('CircleDetailsComponent member averages', () => {
  const year = 2026;
  const month = 8;
  const dailyFans = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 2300];

  function createComponent(isCurrentMonth: boolean): CircleDetailsComponent {
    const component = Object.create(CircleDetailsComponent.prototype) as CircleDetailsComponent;
    const config = {
      selectedCalculation: 'monthly_gain',
      includePriorClubData: true,
    } as CircleDetailsConfig;

    Object.defineProperties(component, {
      todayYear: { value: year },
      todayMonth: { value: month },
    });
    Object.assign(component, {
      currentYear: year,
      currentMonth: isCurrentMonth ? month : month - 1,
      config,
      members: [],
      rawMemberData: [],
      history: [],
      memberViewMode: 'chart',
    });

    return component;
  }

  function createMember(monthValue: number): CircleMemberMonthlyData {
    return {
      id: 1,
      circle_id: 10,
      viewer_id: 100,
      trainer_name: 'Test Trainer',
      year,
      month: monthValue,
      daily_fans: dailyFans,
      last_updated: '2026-08-10T12:00:00Z',
    };
  }

  it('excludes the live current-day gain from the monthly and 7-day averages', () => {
    const component = createComponent(true);

    component.processMembersData([createMember(month)]);

    expect(component.members[0].today_gain).toBe(500);
    expect(component.members[0].monthly_gain).toBe(1300);
    expect(component.members[0].daily_avg).toBe(100);
    expect(component.members[0].seven_day_avg).toBe(100);
    expect(component.members[0].weekly_gain).toBe(700);
  });

  it('keeps the final day in averages for a completed month', () => {
    const component = createComponent(false);

    component.processMembersData([createMember(month - 1)]);

    expect(component.members[0].daily_avg).toBeCloseTo(1300 / 9, 8);
    expect(component.members[0].seven_day_avg).toBeCloseTo(1100 / 7, 8);
    expect(component.members[0].weekly_gain).toBe(1100);
  });
});
