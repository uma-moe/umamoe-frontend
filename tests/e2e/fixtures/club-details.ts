export function clubDetailsFixture(year = 2026, month = 9) {
  return {
    circle: {
      circle_id: 7, name: 'Team Sirius', leader_name: 'McQueen', leader_viewer_id: 7001,
      member_count: 29, join_style: 1, monthly_rank: 12, monthly_point: 1000000,
      last_month_rank: 18, last_month_point: 700000, live_points: 1100000,
      last_live_update: '2026-09-06T11:55:00Z', last_updated: '2026-09-06T10:00:00Z',
      comment: 'Daily players welcome - discord.gg/parity'
    },
    club_rank: 5,
    fans_to_lower_tier: 500000 as number | null | undefined,
    fans_to_next_tier: 250000 as number | null | undefined,
    yesterday_fans_to_lower_tier: 400000 as number | null | undefined,
    yesterday_fans_to_next_tier: 300000 as number | null | undefined,
    members: [
      { viewer_id: 7001, trainer_name: 'McQueen', membership: 3, year, month, daily_fans: [100000, 140000, 190000], last_updated: '2026-09-06T11:59:00Z' },
      { viewer_id: 7002, trainer_name: 'Gold Ship', membership: 1, year, month, daily_fans: [80000, 120000, 165000], last_updated: 'invalid' },
      { viewer_id: 7001, trainer_name: 'McQueen', membership: 3, year: year - 1, month, daily_fans: [100000], last_updated: '2026-09-06T12:01:00Z' }
    ]
  };
}
