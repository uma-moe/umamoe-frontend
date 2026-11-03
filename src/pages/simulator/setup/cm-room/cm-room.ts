import { cmGet, snapshotPath, type Manifest } from '@/pages/competitive/champions-meeting/cm-data';
import { TEAM_SIZE } from '@/pages/competitive/champions-meeting/archetypes/lobby/lobby-slots';
import type {
  Build,
  Performer,
  Runner,
  Snapshot,
  TeamSearchResponse
} from '@/pages/competitive/hakuraku-types';
import { resolveRaceCourseIds } from '@/pages/competitive/race-analysis/replay/replay-course';
import {
  SURFACE_NAMES,
  loadCourses,
  trackName,
  type RaceCourse
} from '@/lib/game-data/racing/courses';
import { simulatorUmaFromCm, type SimulatorUma } from '../../simulator-uma';

export interface CmDataset {
  snapshot: Snapshot;
  /** The course the meeting was raced on; its captured aptitudes are for this course. */
  course: RaceCourse;
}

type TrainedRunner = Runner & Pick<Build, 'stats' | 'aptitudes' | 'skills'>;

export type CapturedTeam = Omit<Performer, 'members'> & { members: TrainedRunner[] };

/** Pages tried before giving up on finding enough teams from different players. */
const MAX_DRAW_ROUNDS = 4;

/** The CM Data page's page size, so a draw and that page share cached pages of the same list. */
const PLAYER_PAGE_SIZE = 30;

/** Player counts by dataset, so drawing again costs one request. */
const playerCounts = new Map<string, number>();

/** Fans of 3,590 runners in 400 captured CM19 races, from the 5th to the 95th percentile in even steps. */
const CM_FAN_COUNTS = [
  234_188, 270_752, 290_302, 303_919, 315_944, 328_223, 340_095, 355_951, 378_753, 431_151
];

/** Every CM dataset with an exact simulator course, newest first as the manifest lists them. */
export async function loadCmDatasets(signal: AbortSignal): Promise<CmDataset[]> {
  const manifest = await cmGet<Manifest>('/manifest', signal);
  const snapshots = Array.isArray(manifest.snapshots) ? manifest.snapshots : [];
  const [courseIds, courses] = await Promise.all([
    resolveRaceCourseIds(snapshots.map((snapshot) => snapshot.raceInstanceId)),
    loadCourses()
  ]);

  return snapshots.flatMap((snapshot) => {
    const courseId =
      snapshot.raceInstanceId === undefined ? undefined : courseIds.get(snapshot.raceInstanceId);
    const course = courseId === undefined ? undefined : courses.get(courseId);

    return course ? [{ snapshot, course }] : [];
  });
}

/**
 * The dataset raced on this course, or else the closest one: same surface first, then the same distance category,
 * the nearest distance and the same racetrack. Ties go to the newest meeting.
 */
export function closestCmDataset(datasets: CmDataset[], course: RaceCourse): CmDataset | undefined {
  let closest: CmDataset | undefined;
  for (const dataset of datasets) {
    if (!closest || compareCloseness(dataset.course, closest.course, course) < 0) closest = dataset;
  }

  return closest;
}

function compareCloseness(candidate: RaceCourse, current: RaceCourse, target: RaceCourse): number {
  const candidateKey = closenessKey(candidate, target);
  const currentKey = closenessKey(current, target);
  const difference = candidateKey.findIndex((value, index) => value !== currentKey[index]);

  return difference < 0 ? 0 : candidateKey[difference]! - currentKey[difference]!;
}

/** Lower is closer, compared in order. */
function closenessKey(candidate: RaceCourse, target: RaceCourse): number[] {
  return [
    Number(candidate.course_id !== target.course_id),
    Number(candidate.surface !== target.surface),
    Number(candidate.distance_type !== target.distance_type),
    Math.abs(candidate.distance - target.distance),
    Number(candidate.race_track_id !== target.race_track_id)
  ];
}

/** What the filled room is: real CM Uma, and from which meeting when the course has none of its own. */
export function fillNotice(dataset: CmDataset, course: RaceCourse, teams: number): string {
  const meeting = meetingName(dataset.snapshot);
  const drawn = teams === 1 ? 'a real team' : teams + ' real teams';
  const source =
    dataset.course.course_id === course.course_id
      ? 'Drew ' + drawn + ' at random from ' + meeting + ', each from a different player.'
      : 'No CM has been captured on this course yet, so ' +
        drawn +
        ' were drawn at random from ' +
        meeting +
        ' on ' +
        courseName(dataset.course) +
        ', the closest course with data, each from a different player. Their aptitudes were captured for that course.';

  return (
    source +
    ' These are real players’ Champions Meeting Uma as Hakuraku captured them; their fans weren’t captured, so each has a fan count typical of CM runners. Redraw CM teams for three new ones.'
  );
}

export function courseName(course: RaceCourse): string {
  return (
    trackName(course.race_track_id) +
    ' ' +
    (SURFACE_NAMES[course.surface] ?? '') +
    ' ' +
    course.distance.toLocaleString('en-US') +
    ' m'
  );
}

/** The meeting a dataset belongs to, as its label starts: "CM21". */
export function meetingName(snapshot: Snapshot): string {
  return snapshot.label.split(' - ')[0] ?? snapshot.label;
}

/**
 * Real teams the way matchmaking seats a room: players from one random stretch of the players' best teams, so they are
 * of similar strength and none appears twice. The CM Data page and the simulator's CM opponents read the same list.
 */
export async function drawCmTeams({
  snapshotId,
  count,
  signal,
  random = Math.random
}: {
  snapshotId: string;
  count: number;
  signal: AbortSignal;
  random?: () => number;
}): Promise<CapturedTeam[]> {
  const players = await countPlayers(snapshotId, signal);
  const pages = Math.ceil(players / PLAYER_PAGE_SIZE);
  const tried = new Set<number>();

  for (let round = 0; round < MAX_DRAW_ROUNDS && tried.size < pages; round++) {
    let page = Math.floor(random() * pages);
    while (tried.has(page)) page = (page + 1) % pages;
    tried.add(page);

    const { teams } = await searchPlayers(snapshotId, page * PLAYER_PAGE_SIZE, signal);
    const byPlayer = new Map(teams.filter(hasTrainedBuilds).map((team) => [team.owner.id, team]));
    if (byPlayer.size >= count) return pickRandom([...byPlayer.values()], count, random);
  }

  throw new Error('Could not draw enough teams from different players. Try again.');
}

/** Drawn teams as simulator runners; a captured build records its distance and surface aptitudes for this course. */
export function simulatorTeams({
  teams,
  data,
  course,
  random = Math.random
}: {
  teams: CapturedTeam[];
  data: Parameters<typeof simulatorUmaFromCm>[1];
  course: RaceCourse;
  random?: () => number;
}): SimulatorUma[][] {
  return teams.map((team) =>
    team.members.map((build) => {
      const uma = simulatorUmaFromCm(build, data);
      uma.trainee.distanceAptitudes[course.distance_type - 1] = build.aptitudes[0];
      uma.trainee.groundAptitudes[course.surface - 1] = build.aptitudes[1];
      uma.fanCount = plausibleFanCount(random);
      return uma;
    })
  );
}

/** Captured builds carry no fans, so each gets a count as common among real CM runners as the draw. */
export function plausibleFanCount(random: () => number): number {
  const position = random() * (CM_FAN_COUNTS.length - 1);
  const below = Math.floor(position);
  const lower = CM_FAN_COUNTS[below]!;
  const upper = CM_FAN_COUNTS[Math.min(below + 1, CM_FAN_COUNTS.length - 1)]!;

  return Math.round(lower + (upper - lower) * (position - below));
}

function pickRandom<T>(items: T[], count: number, random: () => number): T[] {
  const pool = [...items];
  for (let index = 0; index < count; index++) {
    const swap = index + Math.floor(random() * (pool.length - index));
    [pool[index], pool[swap]] = [pool[swap]!, pool[index]!];
  }

  return pool.slice(0, count);
}

async function countPlayers(snapshotId: string, signal: AbortSignal): Promise<number> {
  const known = playerCounts.get(snapshotId);
  if (known !== undefined) return known;

  const { totalOwners } = await searchPlayers(snapshotId, 0, signal);
  playerCounts.set(snapshotId, totalOwners);
  return totalOwners;
}

/** A page of the players' best teams, in the CM Data page's query shape. */
async function searchPlayers(
  snapshotId: string,
  offset: number,
  signal: AbortSignal
): Promise<TeamSearchResponse> {
  const query = new URLSearchParams({
    slots: '[{},{},{}]',
    players: 'unique',
    sort: 'lower',
    limit: String(PLAYER_PAGE_SIZE),
    offset: String(offset)
  });

  const page = await cmGet<TeamSearchResponse>(
    snapshotPath(snapshotId, 'teams?' + query),
    signal,
    snapshotId
  );

  if (!Array.isArray(page.teams) || !Number.isSafeInteger(page.totalOwners))
    throw new Error('Hakuraku returned an unexpected team list. Try again later.');

  return page;
}

function hasTrainedBuilds(team: Performer): team is CapturedTeam {
  return team.members.length === TEAM_SIZE && team.members.every(isTrainedRunner);
}

function isTrainedRunner(member: Runner): member is TrainedRunner {
  return (
    Array.isArray(member.stats) &&
    member.stats.length === 5 &&
    Array.isArray(member.skills) &&
    'aptitudes' in member &&
    Array.isArray(member.aptitudes) &&
    member.aptitudes.length === 3
  );
}
