import {
  clubSnapshotsForPeriod,
  latestClubSnapshotIndex,
  legacyMonthTally,
  type ClubMemberSnapshot
} from './member-metrics';

export type ClubChartMode = 'cumulative' | 'delta';
export type ClubChartSegment = 'club' | 'prior' | 'untracked';
export interface ClubChartMember {
  viewerId: number;
  name: string;
  color: string;
  values: Array<number | null>;
  carriedForward: boolean[];
  // segments[i] styles the line from point i - 1 to point i.
  segments: ClubChartSegment[];
  // Days of the untracked span a point was spread or interpolated over; 0 when measured.
  untrackedDays: number[];
}

interface FanObservation {
  fans: number;
  prior: boolean;
}

interface IndexedObservation extends FanObservation {
  index: number;
}

interface WindowBounds {
  before?: IndexedObservation;
  after?: IndexedObservation;
}

export interface ClubCalendarDay {
  day: number;
  totalFans: number;
  dailyDelta: number;
  hasData: boolean;
  isOtherMonth: boolean;
  memberDeltas: Array<{ name: string; delta: number }>;
}

function matches(member: ClubMemberSnapshot, query: string) {
  return (
    member.trainer_name.toLowerCase().includes(query) || String(member.viewer_id).includes(query)
  );
}

export function buildMemberProgression(
  snapshots: ClubMemberSnapshot[],
  year: number,
  month: number,
  includePrior: boolean,
  mode: ClubChartMode,
  search = ''
) {
  const source = clubSnapshotsForPeriod(snapshots, year, month),
    latest = latestClubSnapshotIndex(source);

  // Chart order is backend order, independent of the selected member-list metric.
  const active = source.filter(
    (member) => (member.daily_fans[latest] ?? 0) > 0 && matches(member, search.trim().toLowerCase())
  );

  const days = new Date(year, month, 0).getDate();
  const length = active.some((member) => legacyMonthTally(member, days) !== undefined)
    ? days
    : latestClubSnapshotIndex(active);

  const labels = Array.from(
    { length },
    (_, i) => `${String(i + 1).padStart(2, '0')}.${String(month).padStart(2, '0')}`
  );

  const members: ClubChartMember[] = active.map((member, index) => {
    const observations = fanObservations(member, days, includePrior);
    const chart =
      mode === 'delta'
        ? dailyGainChart(observations, length)
        : totalGainChart(observations, length);

    return {
      viewerId: member.viewer_id,
      name: member.trainer_name,
      color: `hsl(${(index * 137.508) % 360}, 70%, 60%)`,
      ...chart
    };
  });

  return { labels, members };
}

type MemberChartSeries = Pick<
  ClubChartMember,
  'values' | 'carriedForward' | 'segments' | 'untrackedDays'
>;

function fanObservations(
  member: ClubMemberSnapshot,
  days: number,
  includePrior: boolean
): Array<FanObservation | undefined> {
  const observations: Array<FanObservation | undefined> = member.daily_fans.map((value) => {
    const tracked = value > 0 || (includePrior && value < 0);
    return tracked ? { fans: Math.abs(value), prior: value < 0 } : undefined;
  });

  const tally = legacyMonthTally(member, days);
  if (tally !== undefined && observations[days] === undefined)
    observations[days] = { fans: tally, prior: false };

  return observations;
}

// A window spans snapshot `day` to `day + 1`; its bounds are the nearest observations around it.
function windowBounds(observations: Array<FanObservation | undefined>, day: number): WindowBounds {
  const before = observations.findLastIndex(
    (observation, index) => index <= day && observation !== undefined
  );

  const after = observations.findIndex(
    (observation, index) => index > day && observation !== undefined
  );

  return { before: indexed(observations, before), after: indexed(observations, after) };
}

function indexed(
  observations: Array<FanObservation | undefined>,
  index: number
): IndexedObservation | undefined {
  const observation = observations[index];
  return observation === undefined ? undefined : { ...observation, index };
}

function untrackedSpan({ before, after }: WindowBounds): number {
  if (before === undefined || after === undefined) return 0;

  const span = after.index - before.index;
  return span > 1 ? span : 0;
}

function windowSegment(
  observations: Array<FanObservation | undefined>,
  day: number,
  bounds: WindowBounds
): ClubChartSegment {
  if (untrackedSpan(bounds)) return 'untracked';

  const touchesPriorClub = Boolean(observations[day]?.prior || observations[day + 1]?.prior);
  return touchesPriorClub ? 'prior' : 'club';
}

// Integer share of `gain` reached after `elapsed` of `span` days; shares always sum to `gain`.
function spreadGain(gain: number, elapsed: number, span: number): number {
  return Math.round((gain * elapsed) / span);
}

function dailyGainChart(
  observations: Array<FanObservation | undefined>,
  length: number
): MemberChartSeries {
  const values: Array<number | null> = [],
    windows: ClubChartSegment[] = [],
    untrackedDays: number[] = [];

  for (let day = 0; day < length; day++) {
    const bounds = windowBounds(observations, day),
      span = untrackedSpan(bounds);

    windows.push(windowSegment(observations, day, bounds));
    untrackedDays.push(span);

    const { before, after } = bounds;
    if (before === undefined) {
      values.push(null);
      continue;
    }

    if (after === undefined) {
      values.push(before.index === day ? 0 : null);
      continue;
    }

    const gain = after.fans - before.fans,
      elapsed = day - before.index,
      spanDays = after.index - before.index;

    values.push(spreadGain(gain, elapsed + 1, spanDays) - spreadGain(gain, elapsed, spanDays));
  }

  // A line between two daily points takes the strongest style of either day.
  const segments = windows.map((window, day): ClubChartSegment => {
    const previous = windows[day - 1] ?? window;
    if (window === 'untracked' || previous === 'untracked') return 'untracked';
    if (window === 'prior' || previous === 'prior') return 'prior';
    return 'club';
  });

  return { values, carriedForward: Array(length).fill(false), segments, untrackedDays };
}

function totalGainChart(
  observations: Array<FanObservation | undefined>,
  length: number
): MemberChartSeries {
  const baseline = observations.find((observation) => observation !== undefined)?.fans ?? 0;
  const values: Array<number | null> = [],
    carriedForward: boolean[] = [],
    segments: ClubChartSegment[] = [],
    untrackedDays: number[] = [];

  for (let day = 0; day < length; day++) {
    const bounds = windowBounds(observations, day),
      measured = observations[day + 1];

    segments.push(windowSegment(observations, day, bounds));

    if (measured !== undefined) {
      values.push(measured.fans - baseline);
      carriedForward.push(false);
      untrackedDays.push(0);
      continue;
    }

    const { before, after } = bounds;
    if (before === undefined) {
      values.push(null);
      carriedForward.push(false);
      untrackedDays.push(0);
      continue;
    }

    if (after === undefined) {
      values.push(before.fans - baseline);
      carriedForward.push(true);
      untrackedDays.push(0);
      continue;
    }

    const spanDays = after.index - before.index,
      interpolated =
        before.fans + spreadGain(after.fans - before.fans, day + 1 - before.index, spanDays);

    values.push(interpolated - baseline);
    carriedForward.push(false);
    untrackedDays.push(spanDays);
  }

  return { values, carriedForward, segments, untrackedDays };
}

export function buildClubCalendar(
  snapshots: ClubMemberSnapshot[],
  year: number,
  month: number,
  search = ''
): ClubCalendarDay[][] {
  const source = clubSnapshotsForPeriod(snapshots, year, month).filter((member) =>
    matches(member, search.trim().toLowerCase())
  );

  const days = new Date(year, month, 0).getDate(),
    offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;

  const blank = (day: number): ClubCalendarDay => ({
    day,
    totalFans: 0,
    dailyDelta: 0,
    hasData: false,
    memberDeltas: [],
    isOtherMonth: true
  });

  const cells = Array.from({ length: offset }, (_, i) =>
    blank(new Date(year, month - 1, 0).getDate() - offset + i + 1)
  );

  for (let i = 0; i < days; i++) {
    let totalFans = 0;
    const memberDeltas: ClubCalendarDay['memberDeltas'] = [];
    for (const member of source) {
      const current = member.daily_fans[i];
      // The calendar includes former members, but never prior-club snapshots or carried gaps.
      if (!(current! > 0)) continue;
      totalFans += current!;
      const following =
        member.daily_fans.slice(i + 1).find((value) => value > 0) ?? legacyMonthTally(member, days);

      if (following !== undefined)
        memberDeltas.push({ name: member.trainer_name, delta: following - current! });
    }

    memberDeltas.sort((a, b) => b.delta - a.delta);
    cells.push({
      day: i + 1,
      totalFans,
      dailyDelta: memberDeltas.reduce((sum, member) => sum + member.delta, 0),
      hasData: totalFans > 0,
      memberDeltas,
      isOtherMonth: false
    });
  }

  for (let day = 1; cells.length % 7; day++) cells.push(blank(day));
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}

export function formatClubGain(value: number): string {
  return `${value >= 0 ? '+' : ''}${Math.abs(value) >= 100000 ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value) : value.toLocaleString()}`;
}
