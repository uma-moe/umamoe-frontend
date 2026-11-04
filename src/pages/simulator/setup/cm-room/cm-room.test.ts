import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RaceCourse } from '@/lib/game-data/racing/courses';
import type { Performer, Runner, Snapshot } from '@/pages/competitive/hakuraku-types';
import {
  closestCmDataset,
  drawCmTeams,
  fillNotice,
  plausibleFanCount,
  simulatorTeams,
  type CapturedTeam,
  type CmDataset
} from './cm-room';

const request = vi.hoisted(() => vi.fn());
vi.mock('@/pages/competitive/champions-meeting/cm-data', () => ({
  cmGet: request,
  snapshotPath: (id: string, path: string) => '/snapshots/' + id + '/' + path
}));

const tokyoMile: RaceCourse = {
  course_id: 10501,
  distance: 1600,
  distance_type: 2,
  surface: 2,
  race_track_id: 10006,
  turn: 2,
  course: 1
};

const course = (
  course_id: number,
  surface: number,
  distance: number,
  distance_type: number,
  race_track_id = 10001
): RaceCourse => ({
  course_id,
  surface,
  distance,
  distance_type,
  race_track_id,
  turn: 1,
  course: 1
});

function dataset(label: string, raced: RaceCourse): CmDataset {
  const snapshot = { snapshotId: label.toLowerCase(), label: label + ' - 2026-11-02' } as Snapshot;
  return { snapshot, course: raced };
}

function trained(card: number): CapturedTeam['members'][number] {
  return {
    id: String(card),
    card,
    chara: Math.floor(card / 100),
    style: 1,
    racingStyle: 1,
    score: 1000,
    stats: [1200, 800, 1000, 600, 900],
    skills: [[200331, 1]],
    aptitudes: ['S', 'A', 'B']
  };
}

const trainedMembers = [100101, 100201, 100301].map(trained);

function team(id: string, owner: string, members: Runner[] = trainedMembers): Performer {
  return {
    id,
    owner: { id: owner, names: [] },
    members,
    wins: 1,
    n: 10,
    ci: [0, 1],
    memberWins: [1, 0, 0]
  };
}

/** Each player's best team in ranking order, paged as the team search pages them. */
function servePlayers(teams: Performer[]) {
  request.mockImplementation(async (path: string) => {
    const query = new URLSearchParams(path.split('?')[1]);
    const offset = Number(query.get('offset'));
    const page = teams.slice(offset, offset + Number(query.get('limit')));
    return { snapshotId: 'cm', totalTeams: teams.length, totalOwners: teams.length, teams: page };
  });
}

const players = (count: number) =>
  Array.from({ length: count }, (_, index) => team('t' + index, 'p' + index));

/** Random draws in order, repeating. */
function sequence(...values: number[]) {
  let next = 0;
  return () => values[next++ % values.length]!;
}

beforeEach(() => {
  request.mockReset();
});

describe('drawing a CM room', () => {
  it('draws three players from one random page of the players’ best teams', async () => {
    servePlayers(players(60));

    const teams = await drawCmTeams({
      snapshotId: 'two-pages',
      count: 3,
      signal: new AbortController().signal,
      random: sequence(0.6, 0, 0, 0)
    });

    const drawQuery = new URLSearchParams(String(request.mock.lastCall?.[0]).split('?')[1]);
    expect(teams.map((drawn) => drawn.id)).toEqual(['t30', 't31', 't32']);
    expect(drawQuery.get('players')).toBe('unique');
    expect(drawQuery.get('offset')).toBe('30');
  });

  it('draws again with a single request', async () => {
    servePlayers(players(60));
    const draw = () =>
      drawCmTeams({ snapshotId: 'redraw', count: 3, signal: new AbortController().signal });
    await draw();
    request.mockClear();

    await draw();

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('passes over a captured team without trained builds', async () => {
    const untrained: Runner = {
      id: 'x',
      card: 100201,
      chara: 1002,
      style: 1,
      racingStyle: 1,
      score: 1000
    };
    servePlayers([
      team('a', 'p1'),
      team('b', 'p2', [trained(100101), untrained, trained(100301)]),
      team('c', 'p3'),
      team('d', 'p4')
    ]);

    const teams = await drawCmTeams({
      snapshotId: 'untrained',
      count: 3,
      signal: new AbortController().signal,
      random: sequence(0)
    });

    expect(teams.map((drawn) => drawn.id)).toEqual(['a', 'c', 'd']);
  });

  it('gives up when the dataset has too few players', async () => {
    servePlayers(players(2));

    const draw = drawCmTeams({
      snapshotId: 'two-players',
      count: 3,
      signal: new AbortController().signal,
      random: sequence(0)
    });

    await expect(draw).rejects.toThrow('different players');
  });

  it('applies each build’s captured aptitudes to the course and gives her fans', () => {
    const drawn: CapturedTeam = { ...team('a', 'p1'), members: trainedMembers };

    const [runners] = simulatorTeams({
      teams: [drawn],
      data: { cards: {}, meta: { courseDistance: 'Mile', courseSurface: 'Dirt' } },
      course: tokyoMile,
      random: () => 0.5
    });

    expect(runners).toHaveLength(3);
    expect(runners?.[0]?.trainee.distanceAptitudes[1]).toBe('S');
    expect(runners?.[0]?.trainee.groundAptitudes[1]).toBe('A');
    expect(runners?.[0]?.fanCount).toBe(322_084);
  });

  it('keeps fan counts within the spread of real CM runners', () => {
    expect(plausibleFanCount(() => 0)).toBe(234_188);
    expect(plausibleFanCount(() => 0.999999)).toBeLessThanOrEqual(431_151);
  });
});

describe('choosing the CM data for a course', () => {
  const nakayama2500 = course(10604, 1, 2500, 4, 10005);
  const kyoto2200 = course(10811, 1, 2200, 3, 10008);
  const ooi2000 = course(11104, 2, 2000, 3, 10101);
  const datasets = [
    dataset('CM22', course(10507, 2, 1600, 2, 10006)),
    dataset('CM20', nakayama2500),
    dataset('CM19', kyoto2200),
    dataset('CM17', ooi2000)
  ];

  it('takes the meeting raced on the course itself', () => {
    expect(closestCmDataset(datasets, kyoto2200)?.snapshot.snapshotId).toBe('cm19');
  });

  it('falls back to the same surface and distance category, nearest distance first', () => {
    const tokyo2400 = course(10510, 1, 2400, 3, 10006);

    expect(closestCmDataset(datasets, tokyo2400)?.snapshot.snapshotId).toBe('cm19');
  });

  it('keeps the surface ahead of the distance', () => {
    const hanshinDirt1800 = course(10912, 2, 1800, 3, 10009);

    expect(closestCmDataset(datasets, hanshinDirt1800)?.snapshot.snapshotId).toBe('cm17');
  });

  it('prefers the newest meeting between equally close courses', () => {
    const twins = [dataset('CM23', kyoto2200), dataset('CM19', kyoto2200)];

    expect(closestCmDataset(twins, kyoto2200)?.snapshot.snapshotId).toBe('cm23');
  });

  it('says which meeting and course a fallback room came from', () => {
    const tokyo2400 = course(10510, 1, 2400, 3, 10006);

    const notice = fillNotice(datasets[2]!, tokyo2400, 3);

    expect(notice).toContain('3 real teams were drawn at random from CM19 on Kyoto Turf 2,200 m');
    expect(notice).toContain('real players’ Champions Meeting Uma');
  });
});
