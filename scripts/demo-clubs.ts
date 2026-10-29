import { clubProgression, type ClubMemberSnapshot } from '../src/lib/clubs/member-metrics';

/** Deterministic sample observations, including joins, departures and quiet days. */
export function demoClubDetails(id: number, year: number, month: number, now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 3600000);
  const current = year === jst.getUTCFullYear() && month === jst.getUTCMonth() + 1;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const observed = current
    ? jst.getUTCDate()
    : new Date(Date.UTC(year, month - 1)) > jst
      ? 0
      : days;

  const timestamp = current
    ? now.toISOString()
    : new Date(Date.UTC(year, month, 0, 14)).toISOString();

  const names = [
    'McQueen',
    'Gold Ship',
    'Special Week',
    'Suzuka',
    'Tokai Teio',
    'Rice Shower',
    'Grass Wonder',
    'Daiwa Scarlet',
    'Vodka',
    'Agnes Tachyon',
    'メジロマックイーン',
    'Trainer with a longer name',
    'Former member'
  ];

  const members: ClubMemberSnapshot[] = names.map((name, index) => {
    let fans = 18_000_000 + index * 4_300_000 + id * 125_000;
    const daily_fans = Array.from({ length: observed + 1 }, (_, day) => {
      if (day)
        fans +=
          index === 9
            ? 0
            : Math.round(
                (180_000 + index * 9000) *
                  (1 - (id - 7) * 0.2) *
                  (1 + Math.sin(day * 0.7 + index) * 0.4)
              );
      if ((index === 12 && day > Math.min(6, observed - 1)) || (index === 8 && day === 5)) return 0;
      return index === 4 && day < Math.min(4, observed) ? -fans : fans;
    });

    return {
      viewer_id: id * 1000 + index + 1,
      trainer_name: name,
      membership: index === 0 ? 3 : index === 1 ? 2 : 1,
      year,
      month,
      daily_fans,
      last_updated: timestamp
    };
  });

  const history = clubProgression(members, year, month);
  const points = history.at(-1)?.fan_count ?? 0;
  const yesterday = history.at(-2)?.fan_count ?? 0;
  const rank = id === 7 ? 12 : id === 8 ? 83 : 238;
  const tier = id === 7 ? 9 : id === 8 ? 8 : 7;
  const gap = Math.round(points * 0.12);
  return {
    circle: {
      circle_id: id,
      name: id === 7 ? 'Team Sirius' : id === 8 ? 'Closed Track' : 'Northern Lights',
      comment:
        id === 7
          ? 'Daily players welcome · Share shoes and work towards the next tier together.'
          : 'Enjoy the races at your own pace.',
      leader_viewer_id: id * 1000 + 1,
      leader_name: names[0],
      member_count: members.filter((member) => (member.daily_fans.at(-1) ?? 0) > 0).length,
      join_style: id === 7 ? 1 : id === 8 ? 3 : 2,
      policy: id === 7 ? 3 : 2,
      monthly_rank: rank,
      yesterday_rank: rank + 2,
      monthly_point: points,
      yesterday_points: yesterday,
      live_points: points + (current ? 875_000 : 0),
      club_rank: tier,
      last_updated: timestamp,
      last_live_update: current ? timestamp : undefined,
      created_at: '2025-06-26T00:00:00Z',
      last_month_rank: rank + 6,
      last_month_point: points
    },
    members,
    club_rank: tier,
    fans_to_next_tier: gap,
    fans_to_lower_tier: gap * 2,
    yesterday_fans_to_next_tier: gap + 450_000,
    yesterday_fans_to_lower_tier: gap * 2 - 175_000
  };
}
