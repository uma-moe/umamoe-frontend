import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { buildClubCalendar, buildMemberProgression, formatClubGain, type ClubChartMode } from './club-progression';
import { clubProgressionFixture, clubProgressionCases } from '../../../tests/e2e/fixtures/club-progression';
import reference from '../../../tests/e2e/fixtures/club-progression-reference.json';

it('matches 96 recorded charts and calendars with departed-member month-end gains corrected', () => {
  const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  for (const item of reference.cases) {
    const fixture = clubProgressionFixture(item.name as typeof clubProgressionCases[number]);
    const context = `${item.name}/${item.search}/${item.includePrior}/${item.mode}`;
    expect(digest(buildMemberProgression(fixture.response.members, fixture.year, fixture.month, item.includePrior, item.mode as ClubChartMode, item.search)), context).toBe(item.progression);
    expect(digest(buildClubCalendar(fixture.response.members, fixture.year, fixture.month, item.search)), context).toBe(item.calendar);
  }
});

it('retains Angular compact-gain signs and the 100,000 threshold', () => {
  expect(formatClubGain(0)).toBe('+0');
  expect(formatClubGain(10000)).toBe(`+${(10000).toLocaleString()}`);
  expect(formatClubGain(100000)).toBe('+100K');
  expect(formatClubGain(-1250000)).toBe('-1.3M');
});
