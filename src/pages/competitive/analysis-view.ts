import type { ParsedRaceCapture, RaceRunner } from '@/lib/race/capture/race-capture-parser';
import { characterImagePath } from '@/lib/game-data/characters';
import { runningStyleName } from '@/lib/race/replay/race-display';

export const styleColors = ['#929bad', '#e8ad63', '#69b7ee', '#d194df', '#7bc8a0', '#f08383'];
export const statKeys = ['speed', 'stamina', 'power', 'guts', 'wit'] as const;
export const portrait = (card?: number) =>
  card && Number.isFinite(card) ? characterImagePath(card) : undefined;

export const score = (runner: RaceRunner) =>
  Number(runner.raw.rank_score ?? runner.raw.rankScore ?? 0);

export const rate = (wins: number, entries: number) => (entries ? (wins / entries) * 100 : 0);
export const percent = (wins: number, entries: number) => `${rate(wins, entries).toFixed(1)}%`;
export const stats = (runner: RaceRunner) =>
  statKeys.map((id) => ({
    id,
    label: id,
    value: runner.stats[id] ?? '—',
    tone: id,
    icon: `/assets/images/icon/stats/${id}.webp`
  }));

export const identity = (runner: RaceRunner) => ({
  id: String(runner.cardId ?? runner.index),
  name: runner.name,
  image: portrait(runner.cardId),
  rank: '',
  affinity: NaN,
  sparks: [],
  detail:
    Number(runner.raw.analysisStyle) === 6
      ? 'Debuffer'
      : runningStyleName(runner.result?.runningStyle ?? Number(runner.raw.runningStyle)),
  scenario: runner.trainerName
});

/** One runner's build: trainer, card, style, stats, skills and aptitudes. */
export const memberBuildKey = (r: RaceRunner) =>
  `${r.trainerName}:${r.cardId ?? r.name}:${r.result?.runningStyle}:${statKeys.map((k) => r.stats[k]).join('.')}:${[...r.skillIds].sort((a, b) => a - b).join('.')}:${Object.entries(
    r.aptitudes
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + '=' + value)
    .join('.')}`;

export const teamBuildKey = (members: RaceRunner[]) => members.map(memberBuildKey).sort().join('|');

export function histogram(values: number[], bins = 12) {
  if (!values.length) return { labels: [], counts: [] };

  const min = Math.min(...values),
    max = Math.max(...values),
    step = (max - min || 1) / bins;

  const counts = Array<number>(bins).fill(0);
  for (const value of values) counts[Math.min(bins - 1, Math.floor((value - min) / step))]!++;
  return { labels: counts.map((_, i) => min + step * (i + 0.5)), counts };
}

export function teamBuilds(captures: ParsedRaceCapture[]) {
  const teams = new Map<
    string,
    {
      key: string;
      trainer: string;
      members: RaceRunner[];
      appearances: number;
      wins: number;
      /** Races each member won, in `members` order. */
      memberWins: number[];
      races: number[];
    }
  >();

  captures.forEach((capture, raceIndex) => {
    const groups = new Map<number, RaceRunner[]>();
    for (const runner of capture.runners) {
      const id = Number(runner.raw.team_id ?? runner.raw.teamId);
      if (id > 0) groups.set(id, [...(groups.get(id) ?? []), runner]);
    }

    for (const members of groups.values()) {
      const key = teamBuildKey(members);
      const team = teams.get(key) ?? {
        key,
        trainer: members[0]?.trainerName ?? 'Unknown trainer',
        members,
        appearances: 0,
        wins: 0,
        memberWins: members.map(() => 0),
        races: []
      };

      const winner = members.find((r) => r.result?.finishOrder === 1);
      team.appearances++;
      team.races.push(raceIndex);
      if (winner) {
        const winnerKey = memberBuildKey(winner);
        const position = team.members.findIndex((r) => memberBuildKey(r) === winnerKey);

        team.wins++;
        if (position >= 0) team.memberWins[position] = (team.memberWins[position] ?? 0) + 1;
      }
      teams.set(key, team);
    }
  });

  return [...teams.values()].sort(
    (a, b) =>
      rate(b.wins, b.appearances) - rate(a.wins, a.appearances) || b.appearances - a.appearances
  );
}
