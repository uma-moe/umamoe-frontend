import { expect, it } from 'vitest';
import type { Build } from '../../../hakuraku-types';
import {
  emptyLobby,
  placeRunner,
  placeTeam,
  removeRunners,
  runnerKey,
  swapSlots,
  type LobbyRunner
} from './lobby-slots';

function captured(teamId: string, index: number): LobbyRunner {
  return { key: runnerKey(teamId, index), teamId, index, build: { card: index } as Build };
}

const team = (teamId: string) => [0, 1, 2].map((index) => captured(teamId, index));
const keys = (slots: ReturnType<typeof emptyLobby>) => slots.map((runner) => runner?.key ?? null);

it('places whole teams in the first team with three free places', () => {
  const withSingle = placeRunner(emptyLobby(), captured('solo', 1))!;

  const withTeam = placeTeam(withSingle, team('a'))!;

  expect(keys(withTeam)).toEqual(['solo:1', null, null, 'a:0', 'a:1', 'a:2', null, null, null]);
});

it('refuses a team once no lobby team is empty, and a runner once the room is full', () => {
  const twoTeams = placeTeam(placeTeam(emptyLobby(), team('a'))!, team('b'))!;
  const crowded = placeRunner(twoTeams, captured('c', 0))!;
  const full = placeTeam(twoTeams, team('c'))!;

  expect(placeTeam(crowded, team('d'))).toBeUndefined();
  expect(placeRunner(full, captured('d', 0))).toBeUndefined();
});

it('swaps runners between teams and moves them into empty places', () => {
  const lobby = placeTeam(placeTeam(emptyLobby(), team('a'))!, team('b'))!;

  const swapped = swapSlots(lobby, 0, 4);
  const moved = swapSlots(lobby, 1, 7);

  expect(keys(swapped).slice(0, 6)).toEqual(['b:1', 'a:1', 'a:2', 'b:0', 'a:0', 'b:2']);
  expect(keys(moved)[1]).toBeNull();
  expect(keys(moved)[7]).toBe('a:1');
});

it('removes runners by their captured key', () => {
  const lobby = placeTeam(emptyLobby(), team('a'))!;

  const trimmed = removeRunners(lobby, new Set(['a:1']));

  expect(keys(trimmed).slice(0, 3)).toEqual(['a:0', null, 'a:2']);
});
