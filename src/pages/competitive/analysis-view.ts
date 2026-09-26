import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/race-capture-parser';
import { characterImagePath } from '@/lib/catalog/character-catalog';
import { runningStyleName } from '@/lib/race/race-display';

export const styleColors = ['#929bad', '#e8ad63', '#69b7ee', '#d194df', '#7bc8a0', '#f08383'];
export const statKeys = ['speed', 'stamina', 'power', 'guts', 'wit'] as const;
export const portrait = (card?: number) => card ? characterImagePath(card) : undefined;
export const score = (runner: RaceRunner) => Number(runner.raw.rank_score ?? runner.raw.rankScore ?? 0);
export const rate = (wins: number, entries: number) => entries ? wins / entries * 100 : 0;
export const percent = (wins: number, entries: number) => `${rate(wins, entries).toFixed(1)}%`;
export const stats = (runner: RaceRunner) => statKeys.map(id => ({ id, label: id, value: runner.stats[id] ?? '—', tone: id, icon: `/assets/images/icon/stats/${id}.webp` }));
export const identity = (runner: RaceRunner) => ({ id: String(runner.cardId ?? runner.index), name: runner.name, image: portrait(runner.cardId), rank: '', affinity: NaN, sparks: [], detail: Number(runner.raw.analysisStyle) === 6 ? 'Debuffer' : runningStyleName(runner.result?.runningStyle ?? Number(runner.raw.runningStyle)), scenario: runner.trainerName });
export const teamBuildKey = (members:RaceRunner[]) => members.map(r => `${r.trainerName}:${r.cardId ?? r.name}:${r.result?.runningStyle}:${statKeys.map(k => r.stats[k]).join('.')}:${[...r.skillIds].sort((a,b)=>a-b).join('.')}:${Object.values(r.aptitudes).join('.')}`).sort().join('|');

export function histogram(values: number[], bins = 12) {
  if (!values.length) return { labels: [], counts: [] };
  const min = Math.min(...values), max = Math.max(...values), step = (max - min || 1) / bins;
  const counts = Array<number>(bins).fill(0);
  for (const value of values) counts[Math.min(bins - 1, Math.floor((value - min) / step))]!++;
  return { labels: counts.map((_, i) => min + step * (i + .5)), counts };
}

export function teamBuilds(captures: ParsedRaceCapture[]) {
  const teams = new Map<string, { key: string; trainer: string; members: RaceRunner[]; appearances: number; wins: number; races: number[] }>();
  captures.forEach((capture, raceIndex) => {
    const groups = new Map<number, RaceRunner[]>();
    for (const runner of capture.runners) {
      const id = Number(runner.raw.team_id ?? runner.raw.teamId);
      if (id > 0) groups.set(id, [...(groups.get(id) ?? []), runner]);
    }
    for (const members of groups.values()) {
      const key = teamBuildKey(members);
      const team = teams.get(key) ?? { key, trainer: members[0]?.trainerName ?? 'Unknown trainer', members, appearances: 0, wins: 0, races: [] };
      team.appearances++; team.wins += Number(members.some(r => r.result?.finishOrder === 1)); team.races.push(raceIndex);
      teams.set(key, team);
    }
  });
  return [...teams.values()].sort((a, b) => rate(b.wins, b.appearances) - rate(a.wins, a.appearances) || b.appearances - a.appearances);
}

