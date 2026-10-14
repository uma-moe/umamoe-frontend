import { clubSnapshotsForPeriod, latestClubSnapshotIndex, legacyMonthTally, type ClubMemberSnapshot } from './member-metrics';

export type ClubChartMode = 'cumulative' | 'delta';
export interface ClubChartMember {
  viewerId: number; name: string; color: string;
  values: Array<number | null>; carriedForward: boolean[]; priorClub: boolean[];
}
export interface ClubCalendarDay {
  day: number; totalFans: number; dailyDelta: number; hasData: boolean; isOtherMonth: boolean;
  memberDeltas: Array<{ name: string; delta: number }>;
}
function matches(member: ClubMemberSnapshot, query: string) { return member.trainer_name.toLowerCase().includes(query) || String(member.viewer_id).includes(query); }

export function buildMemberProgression(snapshots: ClubMemberSnapshot[], year: number, month: number, includePrior: boolean, mode: ClubChartMode, search = '') {
  const source = clubSnapshotsForPeriod(snapshots, year, month), latest = latestClubSnapshotIndex(source);
  // Chart order is backend order, independent of the selected member-list metric.
  const active = source.filter(member => (member.daily_fans[latest] ?? 0) > 0 && matches(member, search.trim().toLowerCase()));
  const days = new Date(year, month, 0).getDate();
  const length = active.some(member => legacyMonthTally(member, days) !== undefined) ? days : latestClubSnapshotIndex(active);
  const labels = Array.from({ length }, (_, i) => `${String(i + 1).padStart(2, '0')}.${String(month).padStart(2, '0')}`);
  const members: ClubChartMember[] = active.map((member, index) => {
    const raw = member.daily_fans, tally = legacyMonthTally(member, days);
    const valid = (value: number) => value > 0 || includePrior && value < 0;
    const next = (after: number) => raw.slice(after + 1).find(valid);
    const baseline = Math.abs(raw.find(valid) ?? 0);
    const values: Array<number | null> = [], carriedForward: boolean[] = [], priorClub: boolean[] = [];
    let last: number | null = null;
    for (let i = 0; i < length; i++) {
      const at = mode === 'delta' ? i : i + 1, future = next(at);
      let value = raw[at] ?? 0;
      if (mode === 'cumulative' && !value && future === undefined && tally !== undefined) value = tally;
      const present = valid(value), hasFuture = future !== undefined || tally !== undefined;
      if (mode === 'delta') {
        const following = future === undefined ? tally : Math.abs(future);
        values.push(present ? following === undefined ? 0 : following - Math.abs(value) : hasFuture ? values.at(-1) ?? null : null);
        carriedForward.push(false);
        priorClub.push(present && includePrior && (raw[i + 1] ?? 0) < 0);
      } else {
        if (present) last = Math.abs(value) - baseline;
        values.push(last);
        carriedForward.push(!present && last !== null && !hasFuture);
        priorClub.push(present && includePrior && value < 0);
      }
    }
    return { viewerId: member.viewer_id, name: member.trainer_name, color: `hsl(${index * 137.508 % 360}, 70%, 60%)`, values, carriedForward, priorClub };
  });
  return { labels, members };
}

export function buildClubCalendar(snapshots: ClubMemberSnapshot[], year: number, month: number, search = ''): ClubCalendarDay[][] {
  const source = clubSnapshotsForPeriod(snapshots, year, month).filter(member => matches(member, search.trim().toLowerCase()));
  const days = new Date(year, month, 0).getDate(), offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const blank = (day: number): ClubCalendarDay => ({ day, totalFans: 0, dailyDelta: 0, hasData: false, memberDeltas: [], isOtherMonth: true });
  const cells = Array.from({ length: offset }, (_, i) => blank(new Date(year, month - 1, 0).getDate() - offset + i + 1));
  for (let i = 0; i < days; i++) {
    let totalFans = 0;
    const memberDeltas: ClubCalendarDay['memberDeltas'] = [];
    for (const member of source) {
      const current = member.daily_fans[i];
      // The calendar includes former members, but never prior-club snapshots or carried gaps.
      if (!(current! > 0)) continue;
      totalFans += current!;
      const following = member.daily_fans.slice(i + 1).find(value => value > 0) ?? legacyMonthTally(member, days);
      if (following !== undefined) memberDeltas.push({ name: member.trainer_name, delta: following - current! });
    }
    memberDeltas.sort((a, b) => b.delta - a.delta);
    cells.push({ day: i + 1, totalFans, dailyDelta: memberDeltas.reduce((sum, member) => sum + member.delta, 0), hasData: totalFans > 0, memberDeltas, isOtherMonth: false });
  }
  for (let day = 1; cells.length % 7; day++) cells.push(blank(day));
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}

export function formatClubGain(value: number): string {
  return `${value >= 0 ? '+' : ''}${Math.abs(value) >= 100000 ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value) : value.toLocaleString()}`;
}
