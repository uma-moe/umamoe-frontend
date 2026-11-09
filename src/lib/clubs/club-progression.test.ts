import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  buildClubCalendar,
  buildMemberProgression,
  formatClubGain,
  type ClubChartMode
} from './club-progression';
import type { ClubMemberSnapshot } from './member-metrics';
import {
  clubProgressionFixture,
  clubProgressionCases
} from '../../../tests/e2e/fixtures/club-progression';
import reference from '../../../tests/e2e/fixtures/club-progression-reference.json';

it('matches 96 recorded charts and calendars with departed-member month-end gains and untracked gaps corrected', () => {
  const digest = (value: unknown) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');

  for (const item of reference.cases) {
    const fixture = clubProgressionFixture(item.name as (typeof clubProgressionCases)[number]);
    const context = `${item.name}/${item.search}/${item.includePrior}/${item.mode}`;
    expect(
      digest(
        buildMemberProgression(
          fixture.response.members,
          fixture.year,
          fixture.month,
          item.includePrior,
          item.mode as ClubChartMode,
          item.search
        )
      ),
      context
    ).toBe(item.progression);
    expect(
      digest(buildClubCalendar(fixture.response.members, fixture.year, fixture.month, item.search)),
      context
    ).toBe(item.calendar);
  }
});

function switchingMember(dailyFans: number[]): ClubMemberSnapshot {
  return {
    viewer_id: 1,
    trainer_name: 'Switcher',
    year: 2026,
    month: 10,
    daily_fans: dailyFans,
    last_updated: ''
  };
}

// Days 1-2 in a prior club, no club on days 3-5, joined this club on day 6.
const clubSwitch = [-100, -110, 0, 0, 0, 170, 180];

it('spreads a clubless gap gain over every untracked day instead of one day', () => {
  const { members } = buildMemberProgression(
    [switchingMember(clubSwitch)],
    2026,
    10,
    true,
    'delta'
  );

  const [switcher] = members;
  expect(switcher!.values).toEqual([10, 15, 15, 15, 15, 10]);
  expect(switcher!.untrackedDays).toEqual([0, 4, 4, 4, 4, 0]);
  expect(switcher!.segments).toEqual([
    'prior',
    'untracked',
    'untracked',
    'untracked',
    'untracked',
    'untracked'
  ]);
});

it('interpolates cumulative gains across a clubless gap without counting it as this club', () => {
  const { members } = buildMemberProgression(
    [switchingMember(clubSwitch)],
    2026,
    10,
    true,
    'cumulative'
  );

  const [switcher] = members;
  expect(switcher!.values).toEqual([10, 25, 40, 55, 70, 80]);
  expect(switcher!.segments).toEqual([
    'prior',
    'untracked',
    'untracked',
    'untracked',
    'untracked',
    'club'
  ]);
});

it('keeps fan losses as negative daily gains', () => {
  const { members } = buildMemberProgression(
    [switchingMember([100, 120, 90, 110])],
    2026,
    10,
    false,
    'delta'
  );

  expect(members[0]!.values).toEqual([20, -30, 20]);
});

it('retains Angular compact-gain signs and the 100,000 threshold', () => {
  expect(formatClubGain(0)).toBe('+0');
  expect(formatClubGain(10000)).toBe(`+${(10000).toLocaleString()}`);
  expect(formatClubGain(100000)).toBe('+100K');
  expect(formatClubGain(-1250000)).toBe('-1.3M');
});
