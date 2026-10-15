import { clubDetailsFixture } from './club-details';
import { defaultClubConfig } from '../../../src/lib/clubs/club-display';

export const clubExportCases = [
  'current',
  'prior-excluded',
  'legacy',
  'embedded',
  'incomplete'
] as const;

export type ClubExportCase = (typeof clubExportCases)[number];

export function clubExportFixture(name: ClubExportCase) {
  const year = name === 'embedded' ? 2024 : 2026;
  const month = name === 'embedded' ? 2 : name === 'current' || name === 'prior-excluded' ? 9 : 8;
  const days = new Date(year, month, 0).getDate();
  const base = clubDetailsFixture(year, month);
  const config = {
    ...defaultClubConfig,
    showRole: true,
    showDailyAvg: true,
    showWeeklyGain: true,
    showProjectedMonthly: true,
    showMonthlyGain: true,
    includePriorClubData: name !== 'prior-excluded',
    selectedCalculation:
      name === 'prior-excluded'
        ? 'daily_avg'
        : name === 'embedded'
          ? 'avg_daily_gain'
          : 'monthly_gain'
  };

  const member = (
    viewerId: number,
    trainerName: string,
    dailyFans: number[],
    membership = 1,
    nextMonthStart?: number
  ) => ({
    viewer_id: viewerId,
    trainer_name: trainerName,
    membership,
    year,
    month,
    daily_fans: dailyFans,
    last_updated: '2026-09-06T11:59:00Z',
    ...(nextMonthStart ? { next_month_start: nextMonthStart } : {})
  });

  const monthly = Array.from({ length: days }, (_, i) => (i === 3 ? 0 : 1000 + 100 * i));
  const members =
    name === 'legacy' || name === 'embedded'
      ? [
          member(7001, 'McQueen', name === 'embedded' ? [...monthly, 5000] : monthly, 3, 6000),
          member(7002, 'Gold Ship', [-100, -150, 0, 220, 280], 2, 700),
          member(7003, 'Left trainer', [100, 160, 180]),
          member(7004, 'New trainer', [0, 0, 0, 0, 200])
        ]
      : [
          member(7001, 'McQueen', [-100, -150, 0, 220, 300], 3),
          member(7002, 'Gold "Ship", Jr.', [100, 150, 180, 250, 370], 2),
          member(7003, 'Left trainer', [100, 160, 180]),
          member(7004, 'New trainer', [0, 0, 0, 0, 200]),
          member(7005, 'Correction', [500, 490, 450, 430, 400]),
          member(7006, 'No data', [0, 0, 0, 0, 0])
        ];

  const response = {
    ...base,
    circle: {
      ...base.circle,
      policy: 3,
      created_at: '2025-06-26T00:00:00Z',
      archived: false,
      yesterday_updated: '2026-09-05T00:00:00Z',
      yesterday_points: 950000,
      yesterday_rank: 13,
      live_rank: 11,
      club_rank: 5
    },
    members
  };

  return { year, month, config, response };
}
