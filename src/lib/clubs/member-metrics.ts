export interface ClubMemberSnapshot {
  viewer_id: number;
  trainer_name: string;
  membership?: number;
  year: number;
  month: number;
  daily_fans: number[];
  next_month_start?: number;
  last_updated: string;
}
export interface ClubMemberMetric {
  viewerId: number;
  name: string;
  role: 'leader' | 'officer' | 'member';
  fanCount: number;
  active: boolean;
  todayGain: number;
  dailyGain: number;
  monthlyGain: number;
  weeklyGain: number;
  sevenDayAverage: number;
  dailyAverage: number;
  projectedMonthly: number;
  priorClubGain: number;
  priorInToday: number;
  priorInDaily: number;
  priorInWeekly: number;
  hasPriorClubData: boolean;
  lastUpdated: string;
}
export interface MemberMetricOptions { year: number; month: number; currentMonth: boolean; includePrior: boolean; leaderViewerId?: number; }

export function clubSnapshotsForPeriod(snapshots: ClubMemberSnapshot[], year: number, month: number): ClubMemberSnapshot[] {
  const matching = snapshots.filter(item => item.year === year && item.month === month);
  return matching.length ? matching : snapshots;
}
export function latestClubSnapshotIndex(snapshots: ClubMemberSnapshot[]): number {
  return Math.max(0, ...snapshots.map(member => member.daily_fans.findLastIndex(value => value !== 0)));
}
export function legacyMonthTally(member: ClubMemberSnapshot, days: number, includeDeparted = false): number | undefined {
  // Lifetime totals recorded after departure cannot complete this club's month.
  if (!includeDeparted && !((member.daily_fans[days - 1] ?? 0) > 0)) return undefined;
  return Math.abs(member.daily_fans[days] ?? 0) > 0 || !(member.next_month_start! > 0) ? undefined : member.next_month_start;
}

function lastNonZero(values: number[], before = values.length): { index: number; value: number } | undefined {
  for (let index = Math.min(before - 1, values.length - 1); index >= 0; index -= 1) { const value = values[index] ?? 0; if (value > 0) return { index, value }; }
  return undefined;
}
function firstNonZero(values: number[]): { index: number; value: number } | undefined {
  for (let index = 0; index < values.length; index += 1) { const value = values[index] ?? 0; if (value > 0) return { index, value }; }
  return undefined;
}
function role(snapshot: ClubMemberSnapshot, leaderViewerId?: number): ClubMemberMetric['role'] {
  if (snapshot.membership === 3 || !snapshot.membership && snapshot.viewer_id === leaderViewerId) return 'leader';
  return snapshot.membership === 2 ? 'officer' : 'member';
}

export function calculateMemberMetrics(snapshots: ClubMemberSnapshot[], options: MemberMetricOptions): ClubMemberMetric[] {
  const source = clubSnapshotsForPeriod(snapshots, options.year, options.month);
  const latestDataIndex = latestClubSnapshotIndex(source);
  const daysInMonth = new Date(options.year, options.month, 0).getDate();

  return source.map((snapshot) => {
    const raw = snapshot.daily_fans ?? [];
    const values = raw.map((value) => value < 0 ? options.includePrior ? Math.abs(value) : 0 : Math.abs(value));
    const first = firstNonZero(values) ?? { index: -1, value: 0 };
    const storedLast = lastNonZero(values) ?? { index: -1, value: 0 };
    const useLegacyTally = legacyMonthTally(snapshot, daysInMonth) !== undefined;
    const latest = useLegacyTally ? { index: daysInMonth, value: snapshot.next_month_start! } : storedLast;
    const active = raw.length > latestDataIndex && (raw[latestDataIndex] ?? 0) > 0;
    const previous = lastNonZero(values, storedLast.index);
    const todayGain = !active ? 0 : useLegacyTally ? latest.value - storedLast.value : storedLast.value - (previous?.value ?? 0);
    const priorInToday = active && ((raw[storedLast.index] ?? 0) < 0 || !useLegacyTally && (raw[previous?.index ?? -1] ?? 0) < 0) ? todayGain : 0;
    const completed = options.currentMonth && !useLegacyTally ? previous ?? { index: -1, value: 0 } : latest;
    const completedPrevious = lastNonZero(values, completed.index);
    const dailyGain = options.currentMonth && !useLegacyTally ? active && completedPrevious ? completed.value - completedPrevious.value : 0 : todayGain;
    const priorInDaily = options.currentMonth && !useLegacyTally ? (raw[completed.index] ?? 0) < 0 || (raw[completedPrevious?.index ?? -1] ?? 0) < 0 ? dailyGain : 0 : priorInToday;
    const monthlyGain = latest.value > 0 && first.value > 0 ? latest.value - first.value : 0;
    const daySpan = Math.max(0, completed.index - first.index);
    const dailyAverage = daySpan ? Math.max(0, completed.value - first.value) / daySpan : 0;
    const lastPriorIndex = raw.findLastIndex((value) => value < 0);
    const firstCurrentIndex = raw.findIndex((value) => value > 0);
    const priorClubGain = lastPriorIndex >= 0 && firstCurrentIndex >= 0 ? (values[firstCurrentIndex] ?? 0) - first.value : 0;
    let weeklyGain = 0, sevenDayAverage = 0, priorInWeekly = 0;
    if (active && completed.index >= 0) {
      const weekPoints: Array<{ index: number; value: number }> = useLegacyTally ? [latest] : [];
      for (let index = Math.min(completed.index, storedLast.index); index >= 0 && weekPoints.length < 8; index--) if ((values[index] ?? 0) > 0) weekPoints.push({ index, value: values[index]! });
      const latestWeek = weekPoints[0], weekAgo = weekPoints[Math.min(7, weekPoints.length - 1)];
      if (latestWeek && weekAgo && latestWeek.index > weekAgo.index) {
        weeklyGain = latestWeek.value - weekAgo.value;
        sevenDayAverage = weeklyGain / (latestWeek.index - weekAgo.index);
        const priorStart = Math.max(weekAgo.index, first.index);
        const priorValues = values.slice(priorStart, Math.min(lastPriorIndex, latestWeek.index) + 1).filter((value, i) => value > 0 && (raw[priorStart + i] ?? 0) < 0);
        if (lastPriorIndex >= weekAgo.index && priorValues.length > 1) priorInWeekly = Math.max(0, priorValues.at(-1)! - priorValues[0]!);
      } else if (first.index >= 0 && completed.index > first.index) {
        weeklyGain = completed.value - first.value;
        sevenDayAverage = weeklyGain / (completed.index - first.index);
        if (lastPriorIndex >= 0) priorInWeekly = priorClubGain;
      }
    }
    const remainingDays = Math.max(0, daysInMonth - (latest.index + 1));
    const projectedMonthly = sevenDayAverage > 0 ? monthlyGain + sevenDayAverage * remainingDays : monthlyGain > 0 && latest.index > first.index ? monthlyGain + monthlyGain / (latest.index - first.index) * remainingDays : 0;
    return { viewerId: snapshot.viewer_id, name: snapshot.trainer_name, role: role(snapshot, options.leaderViewerId), fanCount: latest.value, active, todayGain, dailyGain, monthlyGain, weeklyGain, sevenDayAverage, dailyAverage, projectedMonthly, priorClubGain, priorInToday, priorInDaily, priorInWeekly, hasPriorClubData: lastPriorIndex >= 0, lastUpdated: snapshot.last_updated };
  });
}

export function clubProgression(snapshots: ClubMemberSnapshot[], year: number, month: number): Array<{ date: string; fan_count: number }> {
  // Club history always counts current-club gains, never a member's lifetime
  // total. Summing totals creates false jumps when someone joins or leaves.
  const days = new Date(year, month, 0).getDate();
  const source = clubSnapshotsForPeriod(snapshots, year, month);
  const series = source.map(member => effectiveMemberFans(member, days));
  let total = 0;
  return Array.from({ length: days }, (_, index) => index + 1).flatMap(day => {
    if (!series.some(values => (values[day] ?? 0) > 0)) return [];
    total += series.reduce((sum, values) => { const previous = lastNonZero(values, day); return sum + ((values[day] ?? 0) > 0 && previous ? values[day]! - previous.value : 0); }, 0);
    return [{ date: new Date(year, month - 1, day).toISOString(), fan_count: total }];
  });
}

export function effectiveMemberFans(member: ClubMemberSnapshot, daysInMonth: number, includeDeparted = false): number[] {
  if (Math.abs(member.daily_fans[daysInMonth] ?? 0) > 0) return member.daily_fans.slice(0, daysInMonth + 1);
  const values = [...member.daily_fans];
  const tally = legacyMonthTally(member, daysInMonth, includeDeparted);
  if (tally !== undefined) {
    while (values.length <= daysInMonth) values.push(0);
    values[daysInMonth] = tally;
  }
  return values;
}

export function memberDailyDeltas(member: ClubMemberSnapshot, daysInMonth: number, includePrior: boolean): Array<number | null> {
  const values = effectiveMemberFans(member, daysInMonth).map((value) => value < 0 && !includePrior ? 0 : Math.abs(value));
  return Array.from({ length: Math.max(0, values.length - 1) }, (_, index) => {
    const current = values[index + 1];
    if (!current) return null;
    const previous = lastNonZero(values, index + 1);
    return previous ? current - previous.value : null;
  });
}
