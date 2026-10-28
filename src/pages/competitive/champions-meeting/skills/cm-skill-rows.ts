import {
  activationBins,
  skillStyles,
  type SkillOverview,
  type SkillDetail
} from '../cm-exploration';
import { activationTiming } from './cm-skill-analysis';

export type SkillPlayerUsage = {
  snapshotId: string;
  totalPlayers: number;
  skills?: { id: number; style: number; players: number }[];
};

export function skillRows(
  overview: SkillOverview | undefined,
  style: string,
  name: (id: number) => string,
  options: {
    details?: Record<number, SkillDetail>;
    usage?: SkillPlayerUsage;
    playersPending?: boolean;
  } = {}
) {
  const playersBySkill = options.usage?.skills
    ? new Map(
        options.usage.skills
          .filter((entry) => entry.style === (style === 'all' ? 0 : Number(style)))
          .map((entry) => [entry.id, entry.players])
      )
    : undefined;
  const grouped = new Map<
    number,
    {
      id: number;
      players: number;
      owned: number;
      active: number;
      procs: number;
      wins: number;
      repeat: number;
      teamWins: number;
    }
  >();

  for (const [id, key, owners, owned, active, procs, repeat, wins, , teamWins] of overview?.rows ??
    []) {
    if (style !== 'all' && Number(style) !== skillStyles[key]) continue;
    const row = grouped.get(id) ?? {
      id,
      players: style === 'all' ? (overview?.allPlayerCounts[id] ?? 0) : 0,
      owned: 0,
      active: 0,
      procs: 0,
      wins: 0,
      repeat: 0,
      teamWins: 0
    };

    if (style !== 'all') row.players += owners;
    row.owned += owned;
    row.active += active;
    row.procs += procs;
    row.wins += wins;
    row.repeat += repeat;
    row.teamWins += teamWins;
    grouped.set(id, row);
  }

  return [...grouped.values()]
    .sort((a, b) => b.players - a.players)
    .map((r) => {
      const detail = options.details?.[r.id];
      const timing = detail
        ? activationTiming(activationBins(detail, style), detail.courseDistance)
        : undefined;
      let players = playersBySkill ? (playersBySkill.get(r.id) ?? 0) : r.players;
      if (options.playersPending) players = NaN;
      return {
        ...r,
        players,
        meanDistance: timing?.mean ?? NaN,
        medianDistance: timing?.median ?? NaN,
        name: name(r.id),
        variantCount: overview?.variants?.[r.id]?.length ?? 1,
        variants: (overview?.variants?.[r.id] ?? [r.id])
          .map((id) => name(id) + ' ' + id)
          .join(' · '),
        activation: r.active / Math.max(1, r.owned),
        winrate: r.active ? r.wins / r.active : NaN,
        teamWinrate: r.active ? r.teamWins / r.active : NaN,
        repeatRate: r.owned ? r.repeat / r.owned : NaN
      };
    });
}

export function validateSkillPlayerUsage(value: SkillPlayerUsage) {
  if (
    !Number.isSafeInteger(value.totalPlayers) ||
    value.totalPlayers < 0 ||
    !Array.isArray(value.skills)
  ) {
    throw new Error('Skill player usage is unavailable.');
  }

  for (const row of value.skills) {
    if (
      !Number.isSafeInteger(row.id) ||
      row.id <= 0 ||
      ![0, 1, 2, 3, 4, 5].includes(row.style) ||
      !Number.isSafeInteger(row.players) ||
      row.players < 0 ||
      row.players > value.totalPlayers
    ) {
      throw new Error('Invalid skill player counts.');
    }
  }
}
