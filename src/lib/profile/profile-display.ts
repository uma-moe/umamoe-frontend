import type { CircleHistory, ProfileResponse, StadiumMember } from '@/pages/profile/profile-repository';
import { normalizeInheritanceRecord } from '@/lib/inheritance/inheritance-search';
import { effectiveMemberFans, type ClubMemberSnapshot } from '@/lib/clubs/member-metrics';

export function profileInheritanceRecord(profile: ProfileResponse, raceGroups: ReadonlyMap<number, number>) {
  const inheritance = profile.inheritance;
  if (!inheritance) return null;
  const record = normalizeInheritanceRecord({
    account_id: inheritance.account_id ?? profile.trainer.account_id,
    trainer_name: profile.trainer.name,
    borrow_view_count: profile.borrow_stats?.view_count,
    borrow_copy_count: profile.borrow_stats?.copy_count,
    inheritance: { ...inheritance, parent_rank: inheritance.parent_rank ?? 0, parent_rarity: inheritance.parent_rarity ?? 0, affinity_score: inheritance.affinity_score ?? undefined },
    support_card: profile.support_card
  })!;
  if (Array.isArray(inheritance.main_win_saddles)) {
    record.winCount = new Set(record.mainWinSaddles.map((id) => raceGroups.get(id)).filter((group) => group !== undefined)).size;
  }
  return record;
}

const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export function formatProfileNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100_000 ? compactNumber.format(value) : value.toLocaleString();
}
export function signedProfileGain(value: number): string { return `${value >= 0 ? '+' : ''}${formatProfileNumber(value)}`; }
export function profileGainColor(value: number): string { return value > 0 ? 'var(--color-success)' : value < 0 ? 'var(--color-danger)' : 'var(--color-text-subtle)'; }

export interface ProfileFanPoint { label: string; total: number | null; gain: number | null; }

export function buildProfileDailyFans(members: ClubMemberSnapshot[], year: number): ProfileFanPoint[] {
  const totals = new Map<number, number>();
  for (const member of [...members].filter(member => member.year === year).sort((a, b) => a.month - b.month)) {
    const days = new Date(Date.UTC(year, member.month, 0)).getUTCDate();
    // Profile history tracks lifetime fans, including gains after a club departure.
    effectiveMemberFans(member, days, true).slice(0, days + 1).forEach((value, index) => {
      // Zero means no snapshot; negative values carry this trainer's prior-circle total.
      if (Number.isFinite(value) && value !== 0) totals.set(Date.UTC(year, member.month - 1, index + 1), Math.abs(value));
    });
  }
  const start = Date.UTC(year, 0, 1), end = Date.UTC(year + 1, 0, 1), day = 86_400_000;
  let previous: number | null = null;
  const points = Array.from({ length:(end - start) / day }, (_, index) => {
    const date = start + index * day;
    const total = totals.get(date) ?? null;
    const gain = total !== null && previous !== null ? total - previous : null;
    if (total !== null) previous = total;
    return { label:new Date(date).toLocaleDateString('en', { day:'2-digit', month:'short', timeZone:'UTC' }), total, gain };
  });
  return points.slice(0, points.findLastIndex(point => point.total !== null) + 1);
}

export interface CircleMembership {
  circleId: number;
  circleName: string;
  from: { year: number; month: number };
  to: { year: number; month: number };
  months: number;
  current: boolean;
}

export function buildCircleMemberships(history: CircleHistory[], currentCircleId?: number): CircleMembership[] {
  const sorted = [...history].sort((left, right) => left.year - right.year || left.month - right.month);
  const memberships: CircleMembership[] = [];
  for (const entry of sorted) {
    const current = memberships.at(-1);
    if (current?.circleId === entry.circle_id) {
      current.to = { year: entry.year, month: entry.month };
      current.months += 1;
    } else {
      memberships.push({ circleId: entry.circle_id, circleName: entry.circle_name, from: { year: entry.year, month: entry.month }, to: { year: entry.year, month: entry.month }, months: 1, current: false });
    }
  }
  const last = memberships.at(-1);
  if (last && last.circleId === currentCircleId) last.current = true;
  return memberships.reverse();
}

export function distanceName(value: number | null): string {
  return ({ 1: 'Sprint', 2: 'Mile', 3: 'Middle', 4: 'Long', 5: 'Dirt' } as Record<number, string>)[value ?? 0] ?? (value == null ? '-' : `Dist ${value}`);
}

export function runningStyleName(value: number | null): string {
  return ({ 1: 'Front', 2: 'Pace', 3: 'Late', 4: 'End' } as Record<number, string>)[value ?? 0] ?? (value == null ? '-' : `Style ${value}`);
}

export function scenarioName(value: number | null | undefined): string {
  return ({ 1: 'URA', 2: 'Aoharu', 3: 'GL', 4: 'MANT', 5: 'Grand Masters', 6: 'LArc', 7: 'U.A.F.' } as Record<number, string>)[value ?? 0] ?? (value == null ? '-' : `Scenario ${value}`);
}

export function aptitudeGrade(value: number | null | undefined): 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' {
  if (value == null || value < 1) return 'G';
  return (['G', 'F', 'E', 'D', 'C', 'B', 'A', 'S'] as const)[Math.min(value - 1, 7)]!;
}

export function totalStats(member: Pick<StadiumMember, 'speed' | 'stamina' | 'power' | 'guts' | 'wiz'>): number {
  return (member.speed ?? 0) + (member.stamina ?? 0) + (member.power ?? 0) + (member.guts ?? 0) + (member.wiz ?? 0);
}

export function groupStadiumMembers(members: StadiumMember[]): Array<{ distance: string; members: StadiumMember[] }> {
  const order = [1, 2, 3, 4, 5];
  const grouped = new Map<number, StadiumMember[]>();
  for (const member of members) grouped.set(member.distance_type ?? 0, [...(grouped.get(member.distance_type ?? 0) ?? []), member]);
  const keys = [...order.filter((key) => grouped.has(key)), ...[...grouped.keys()].filter((key) => !order.includes(key))];
  return keys.map((key) => ({ distance: distanceName(key), members: grouped.get(key)! }));
}
