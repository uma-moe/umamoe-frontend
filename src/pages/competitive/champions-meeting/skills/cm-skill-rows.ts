import { skillStyles, type SkillOverview } from '../cm-exploration';

export function skillRows(
  overview: SkillOverview | undefined,
  style: string,
  name: (id: number) => string
) {
  const grouped = new Map<
    number,
    { id: number; players: number; owned: number; active: number; procs: number; wins: number }
  >();
  for (const [id, key, owners, owned, active, procs, , wins] of overview?.rows ?? []) {
    if (style !== 'all' && Number(style) !== skillStyles[key]) continue;
    const row = grouped.get(id) ?? {
      id,
      players: style === 'all' ? (overview?.allPlayerCounts[id] ?? 0) : 0,
      owned: 0,
      active: 0,
      procs: 0,
      wins: 0
    };
    if (style !== 'all') row.players += owners;
    row.owned += owned;
    row.active += active;
    row.procs += procs;
    row.wins += wins;
    grouped.set(id, row);
  }
  return [...grouped.values()]
    .sort((a, b) => b.players - a.players)
    .map((r) => ({
      ...r,
      name: name(r.id),
      activation: r.active / Math.max(1, r.owned),
      winrate: r.wins / Math.max(1, r.active)
    }));
}
