import { clubExportCases, clubExportFixture, type ClubExportCase } from './club-exports';

export const clubProgressionCases = [
  ...clubExportCases,
  'mixed-tally',
  'all-missing',
  'wrong-period'
] as const;

export function clubProgressionFixture(name: (typeof clubProgressionCases)[number]) {
  if (clubExportCases.includes(name as ClubExportCase))
    return clubExportFixture(name as ClubExportCase);
  const fixture = clubExportFixture('current');
  if (name === 'wrong-period') return { ...fixture, year: 2025 };

  if (name === 'all-missing') {
    fixture.response.members = [];
    return fixture;
  }

  fixture.response.members = [
    {
      ...fixture.response.members[0]!,
      trainer_name: 'Sparse member',
      daily_fans: [100, 0, 150, 0, 200],
      next_month_start: 300
    },
    {
      ...fixture.response.members[1]!,
      trainer_name: 'Steady member',
      daily_fans: [100, 120, 140, 160, 200]
    },
    { ...fixture.response.members[2]!, daily_fans: [100, 160, 180] },
    { ...fixture.response.members[3]!, daily_fans: [0, 0, -200, -250, 300], next_month_start: 450 }
  ];

  return fixture;
}
