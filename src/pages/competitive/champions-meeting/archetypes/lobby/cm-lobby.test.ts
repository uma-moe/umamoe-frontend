import { beforeEach, expect, it, vi } from 'vitest';
import type { Build, Summary, TeamDetail } from '../../../hakuraku-types';
import { loadTeamDetail } from '../../cm-data';
import { CmLobby } from './cm-lobby.svelte';

vi.mock('../../cm-data', () => ({ loadTeamDetail: vi.fn() }));
vi.mock('@/pages/simulator/simulator-session.svelte', () => ({ openSimulatorField: vi.fn() }));

const data: Summary = {
  snapshotId: 'meeting',
  cards: {},
  styles: [],
  pairs: [],
  archetypes: [],
  saturation: {},
  fieldSaturation: {},
  rooms: { rows: [], average: [], noDisplayedFront: 0 },
  meta: {
    populationRaces: 100,
    populationOwners: 10,
    appearancesPerOwner: 10,
    populationBlocks: 1,
    window: '',
    course: '',
    conditions: '',
    cumulativeSimulations: 100,
    evaluatedTeams: 10,
    evaluatedOwners: 10,
    debufferThreshold: 1
  }
};

function teamDetail(): TeamDetail {
  const members = [0, 1, 2].map<Build>((index) => ({
    id: String(index),
    card: index,
    chara: index,
    style: 1,
    racingStyle: 1,
    score: 1000,
    stats: [1000, 1000, 1000, 1000, 1000],
    aptitudes: ['A', 'A', 'A'],
    skills: [],
    trainedIds: []
  }));

  return {
    snapshotId: data.snapshotId,
    team: {
      id: 'team',
      owner: { id: 'owner', names: [] },
      members,
      wins: 50,
      n: 100,
      ci: [0.4, 0.6],
      memberWins: [20, 20, 10]
    },
    skills: {}
  };
}

function deferredDetail() {
  let resolve = (_value: TeamDetail) => {};
  let reject = (_reason: Error) => {};
  const promise = new Promise<TeamDetail>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.mocked(loadTeamDetail).mockReset();
});

it.each(['clear', 'reset'] as const)(
  'keeps the lobby empty when a pending add finishes after %s',
  async (action) => {
    const detail = deferredDetail();
    vi.mocked(loadTeamDetail).mockReturnValue(detail.promise);
    const lobby = new CmLobby(() => ({ data }));
    const adding = lobby.toggleRunner('team', 0);

    lobby[action]();
    detail.resolve(teamDetail());
    await adding;

    expect(lobby.count).toBe(0);
    expect(lobby.pending).toEqual([]);
  }
);

it('keeps a new pending add visible when an older request finishes after resetting', async () => {
  const oldDetail = deferredDetail();
  const newDetail = deferredDetail();
  vi.mocked(loadTeamDetail)
    .mockReturnValueOnce(oldDetail.promise)
    .mockReturnValueOnce(newDetail.promise);
  const lobby = new CmLobby(() => ({ data }));
  const oldAdd = lobby.toggleRunner('team', 0);

  lobby.reset();
  const newAdd = lobby.toggleRunner('team', 0);
  oldDetail.resolve(teamDetail());
  await oldAdd;

  expect(lobby.pending).toEqual(['team:0']);

  newDetail.resolve(teamDetail());
  await newAdd;

  expect(lobby.count).toBe(1);
  expect(lobby.pending).toEqual([]);
});

it('ignores a load failure from the lobby that was cleared', async () => {
  const detail = deferredDetail();
  vi.mocked(loadTeamDetail).mockReturnValue(detail.promise);
  const lobby = new CmLobby(() => ({ data }));
  const adding = lobby.toggleTeam('team');

  lobby.clear();
  const result = expect(adding).resolves.toBeUndefined();
  detail.reject(new Error('Offline'));
  await result;

  expect(lobby.error).toBe('');
  expect(lobby.count).toBe(0);
});

it('prevents overlapping clicks from adding the same captured runner twice', async () => {
  const detail = deferredDetail();
  vi.mocked(loadTeamDetail).mockReturnValue(detail.promise);
  const lobby = new CmLobby(() => ({ data }));
  const adding = lobby.toggleRunner('team', 0);
  const duplicate = lobby.toggleRunner('team', 0);
  const wholeTeam = lobby.toggleTeam('team');

  detail.resolve(teamDetail());
  await Promise.all([adding, duplicate, wholeTeam]);

  expect(loadTeamDetail).toHaveBeenCalledTimes(1);
  expect(lobby.slots.filter((runner) => runner?.key === 'team:0')).toHaveLength(1);
});

it('clears stale selection and capacity errors when a runner is removed', async () => {
  vi.mocked(loadTeamDetail).mockResolvedValue(teamDetail());
  const lobby = new CmLobby(() => ({ data }));
  await lobby.toggleTeam('team');
  lobby.pick(0);
  lobby.error = 'The lobby is full.';

  lobby.remove(0);

  expect(lobby.selected).toBeNull();
  expect(lobby.error).toBe('');
  expect(lobby.count).toBe(2);
});
