import { expect, it } from 'vitest';
import { clubDataStatus, clubInitialPeriod, formatClubTimeAgo } from './club-display';
import type { ClubMemberSnapshot } from './member-metrics';

it('bounds initial month/year parameters independently, as Angular does', () => {
  const fallback = { year: 2026, month: 9 };

  for (const query of [
    {},
    { year: '', month: '' },
    { year: 'Infinity', month: '1.5' },
    { year: '1999', month: '13' },
    { year: '2101', month: '0' }
  ])
    expect(clubInitialPeriod(query, fallback)).toEqual(fallback);
  expect(clubInitialPeriod({ year: '2000', month: '12' }, fallback)).toEqual({
    year: 2000,
    month: 12
  });

  expect(clubInitialPeriod({ year: '2100', month: 'invalid' }, fallback)).toEqual({
    year: 2100,
    month: 9
  });
});

it('preserves Angular JST freshness and selected-period timestamp precedence', () => {
  const now = Date.parse('2026-09-06T12:00:00Z');
  const period = { year: 2026, month: 9, currentMonth: true };

  const club = {
    liveFans: 10,
    lastLiveUpdate: '2026-09-05T15:00:00Z',
    lastUpdated: '2026-09-06T10:00:00Z'
  };

  const members: ClubMemberSnapshot[] = [
    {
      viewer_id: 1,
      trainer_name: 'A',
      year: 2026,
      month: 9,
      daily_fans: [],
      last_updated: '2026-09-06T11:59:00Z'
    },
    {
      viewer_id: 2,
      trainer_name: 'B',
      year: 2025,
      month: 9,
      daily_fans: [],
      last_updated: '2026-09-06T12:01:00Z'
    },
    {
      viewer_id: 3,
      trainer_name: 'C',
      year: 2026,
      month: 9,
      daily_fans: [],
      last_updated: 'invalid'
    }
  ];

  expect(clubDataStatus(club, members, period, now)).toEqual({
    liveFresh: true,
    updatedAt: club.lastLiveUpdate
  });

  expect(
    clubDataStatus({ ...club, lastLiveUpdate: '2026-09-05T14:59:59Z' }, members, period, now)
      .liveFresh
  ).toBe(false);

  expect(clubDataStatus({ ...club, liveFans: 0 }, members, period, now).liveFresh).toBe(false);
  expect(clubDataStatus(club, members, { ...period, currentMonth: false }, now).updatedAt).toBe(
    members[0]!.last_updated
  );

  expect(clubDataStatus({ ...club, lastLiveUpdate: 'invalid' }, members, period, now)).toEqual({
    liveFresh: false,
    updatedAt: members[0]!.last_updated
  });

  expect(clubDataStatus({ lastUpdated: 'invalid' }, [], period, now)).toEqual({
    liveFresh: false,
    updatedAt: undefined
  });
});

it('matches Angular elapsed-time boundaries, missing values and future timestamps', () => {
  const now = Date.parse('2026-09-06T12:00:00Z');
  for (const [seconds, expected] of [
    [-10, 'just now'],
    [9, 'just now'],
    [10, '10s ago'],
    [59, '59s ago'],
    [60, '1m ago'],
    [3599, '59m ago'],
    [3600, '1h ago'],
    [86400, '1d ago'],
    [30 * 86400, '1mo ago'],
    [359 * 86400, '11mo ago'],
    [360 * 86400, '0y ago'],
    [365 * 86400, '1y ago']
  ] as const) {
    expect(formatClubTimeAgo(new Date(now - seconds * 1000).toISOString(), now)).toBe(expected);
  }

  expect(formatClubTimeAgo(undefined, now)).toBe('unknown');
  expect(formatClubTimeAgo('invalid', now)).toBe('unknown');
});
