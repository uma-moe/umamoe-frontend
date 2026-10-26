import type { MultiRaceHorseEntry } from '@/lib/race/multi-race-analysis';
import {
  skillStyles,
  type SkillBuckets,
  type SkillDetail,
  type SkillOverview,
  type SkillOverviewRow
} from '../../champions-meeting/cm-exploration';

/** CM Data's skill views read details through this id; a session has no server snapshot. */
export const SESSION_SNAPSHOT = 'session';

const BUCKET_COUNT = 100;
const styleKeys = new Map(Object.entries(skillStyles).map(([key, style]) => [style, key]));

/** One running style's learners of one skill, counted the way CM Data's overview rows are. */
interface StyleUse {
  players: Set<string>;
  owned: number;
  activated: number;
  procs: number;
  repeat: number;
  ownWinsActive: number;
  ownWinsInactive: number;
  teamWinsActive: number;
  teamWinsInactive: number;
  /** Per course bucket: activation events, then the learners whose first activation fell there. */
  buckets: Map<number, [procs: number, firstEntries: number, wins: number, teamWins: number]>;
}

/** The session's skills in CM Data's shapes, so its table, lanes and comparison draw them. */
export interface SessionSkillData {
  overview: SkillOverview;
  details: Record<number, SkillDetail>;
}

const emptyUse = (): StyleUse => ({
  players: new Set(),
  owned: 0,
  activated: 0,
  procs: 0,
  repeat: 0,
  ownWinsActive: 0,
  ownWinsInactive: 0,
  teamWinsActive: 0,
  teamWinsInactive: 0,
  buckets: new Map()
});

/** The race distance most entries ran; lanes and timings are drawn against it. */
function sessionDistance(entries: MultiRaceHorseEntry[]) {
  const counts = new Map<number, number>();
  for (const entry of entries) {
    if (entry.raceDistance > 0)
      counts.set(entry.raceDistance, (counts.get(entry.raceDistance) ?? 0) + 1);
  }

  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
}

/** Each race's winning team, so every learner can be credited with a team win. */
function winningTeams(entries: MultiRaceHorseEntry[]) {
  const winners = new Map<string, number>();
  for (const entry of entries) {
    if (entry.finishOrder === 1 && entry.teamId > 0) winners.set(entry.raceId, entry.teamId);
  }

  return winners;
}

/** Positions are bucketed against each entry's own race so mixed distances share one course scale. */
function bucketOf(distance: number, raceDistance: number) {
  const fraction = raceDistance > 0 ? distance / raceDistance : 0;
  return Math.min(BUCKET_COUNT - 1, Math.max(0, Math.floor(fraction * BUCKET_COUNT)));
}

function addBucket(use: StyleUse, bucket: number, values: [number, number, number, number]) {
  const current = use.buckets.get(bucket) ?? [0, 0, 0, 0];
  use.buckets.set(bucket, [
    current[0] + values[0],
    current[1] + values[1],
    current[2] + values[2],
    current[3] + values[3]
  ]);
}

function addLearner(
  use: StyleUse,
  entry: MultiRaceHorseEntry,
  positions: number[],
  results: { won: boolean; teamWon: boolean }
) {
  use.players.add(entry.trainerName);
  use.owned++;

  if (positions.length === 0) {
    use.ownWinsInactive += Number(results.won);
    use.teamWinsInactive += Number(results.teamWon);
    return;
  }

  use.activated++;
  use.procs += positions.length;
  use.repeat += Number(positions.length >= 2);
  use.ownWinsActive += Number(results.won);
  use.teamWinsActive += Number(results.teamWon);

  const buckets = positions.map((distance) => bucketOf(distance, entry.raceDistance));
  for (const bucket of buckets) addBucket(use, bucket, [1, 0, 0, 0]);

  addBucket(use, Math.min(...buckets), [0, 1, Number(results.won), Number(results.teamWon)]);
}

/**
 * Counts every learned skill in the entries as CM Data's overview and per-skill activation detail.
 * Players are distinct trainers, team wins credit every runner of the winning team, and an entry's
 * first activation decides which course bucket its result belongs to.
 */
export function sessionSkillData(entries: MultiRaceHorseEntry[]): SessionSkillData {
  const courseDistance = sessionDistance(entries);
  const teamWinners = winningTeams(entries);
  const skills = new Map<number, Map<string, StyleUse>>();
  const population: Record<string, [entries: number, wins: number]> = {};
  const allPlayers = new Map<number, Set<string>>();

  for (const entry of entries) {
    const styleKey = styleKeys.get(entry.strategy);
    if (!styleKey) continue;

    const won = entry.finishOrder === 1;
    const teamWon = entry.teamId > 0 && teamWinners.get(entry.raceId) === entry.teamId;
    const styleTotal = population[styleKey] ?? [0, 0];
    population[styleKey] = [styleTotal[0] + 1, styleTotal[1] + Number(won)];

    for (const skillId of new Set(entry.learnedSkillIds)) {
      const positions = entry.skillActivations
        .filter((activation) => activation.id === skillId)
        .map((activation) => activation.distance);

      const styles = skills.get(skillId) ?? new Map<string, StyleUse>();
      const use = styles.get(styleKey) ?? emptyUse();
      addLearner(use, entry, positions, { won, teamWon });
      styles.set(styleKey, use);
      skills.set(skillId, styles);

      const players = allPlayers.get(skillId) ?? new Set<string>();
      players.add(entry.trainerName);
      allPlayers.set(skillId, players);
    }
  }

  const rows: SkillOverviewRow[] = [];
  const details: Record<number, SkillDetail> = {};

  for (const [skillId, styles] of skills) {
    const buckets: SkillBuckets = {};

    for (const [styleKey, use] of styles) {
      rows.push([
        skillId,
        styleKey,
        use.players.size,
        use.owned,
        use.activated,
        use.procs,
        use.repeat,
        use.ownWinsActive,
        use.ownWinsInactive,
        use.teamWinsActive,
        use.teamWinsInactive
      ]);
      buckets[styleKey] = [...use.buckets]
        .sort((a, b) => a[0] - b[0])
        .map(([bucket, counts]) => [bucket, ...counts]);
    }

    details[skillId] = {
      snapshotId: SESSION_SNAPSHOT,
      skillId,
      bucketCount: BUCKET_COUNT,
      courseDistance,
      styles: buckets
    };
  }

  return {
    overview: {
      snapshotId: SESSION_SNAPSHOT,
      races: new Set(entries.map((entry) => entry.raceId)).size,
      players: new Set(entries.map((entry) => entry.trainerName)).size,
      courseDistance,
      rows,
      allPlayerCounts: Object.fromEntries(
        [...allPlayers].map(([skillId, players]) => [skillId, players.size])
      ),
      populationByStyle: population
    },
    details
  };
}

/** One skill's learners in the chosen running style, summed from the overview rows. */
export interface SkillUseSummary {
  skillId: number;
  owned: number;
  activated: number;
  repeat: number;
  learnerWins: number;
}

/** Per-skill totals and the population they are read against, for the at-a-glance figures. */
export function skillUseSummaries(overview: SkillOverview, style: string) {
  const inStyle = (styleKey: string) => style === 'all' || skillStyles[styleKey] === Number(style);
  const skills = new Map<number, SkillUseSummary>();

  for (const [
    skillId,
    styleKey,
    ,
    owned,
    activated,
    ,
    repeat,
    winsActive,
    winsInactive
  ] of overview.rows) {
    if (!inStyle(styleKey)) continue;

    const summary = skills.get(skillId) ?? {
      skillId,
      owned: 0,
      activated: 0,
      repeat: 0,
      learnerWins: 0
    };

    summary.owned += owned;
    summary.activated += activated;
    summary.repeat += repeat;
    summary.learnerWins += winsActive + winsInactive;
    skills.set(skillId, summary);
  }

  const population = { entries: 0, wins: 0 };
  for (const [styleKey, [entries, wins]] of Object.entries(overview.populationByStyle ?? {})) {
    if (!inStyle(styleKey)) continue;

    population.entries += entries;
    population.wins += wins;
  }

  return { skills: [...skills.values()], population };
}
