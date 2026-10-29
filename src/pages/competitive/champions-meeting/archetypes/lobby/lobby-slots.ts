import type { Build } from '../../../hakuraku-types';

/** A Champions Meeting room: three teams of three. */
export const LOBBY_TEAMS = 3;
export const TEAM_SIZE = 3;
export const LOBBY_SIZE = LOBBY_TEAMS * TEAM_SIZE;

export interface LobbyRunner {
  /** `teamId:index`, the captured runner this build came from. */
  key: string;
  teamId: string;
  index: number;
  build: Build;
}

/** Room places in order: places 0–2 are team 1, 3–5 team 2, 6–8 team 3. */
export type LobbySlots = (LobbyRunner | null)[];

export function emptyLobby(): LobbySlots {
  return Array.from({ length: LOBBY_SIZE }, () => null);
}

export function runnerKey(teamId: string, index: number): string {
  return teamId + ':' + index;
}

export function lobbyTeamOf(slot: number): number {
  return Math.floor(slot / TEAM_SIZE);
}

export function teamSlots(team: number): number[] {
  return Array.from({ length: TEAM_SIZE }, (_, offset) => team * TEAM_SIZE + offset);
}

/** A captured team takes the first lobby team with all three places free. */
export function placeTeam(slots: LobbySlots, runners: LobbyRunner[]): LobbySlots | undefined {
  for (let team = 0; team < LOBBY_TEAMS; team++) {
    const places = teamSlots(team);
    if (places.some((slot) => slots[slot] !== null)) continue;

    const next = [...slots];
    runners.slice(0, TEAM_SIZE).forEach((runner, offset) => (next[places[offset]!] = runner));
    return next;
  }

  return undefined;
}

/** A single runner takes the first free place, so picks from different teams form a team of their own. */
export function placeRunner(slots: LobbySlots, runner: LobbyRunner): LobbySlots | undefined {
  const free = slots.indexOf(null);
  if (free < 0) return undefined;

  const next = [...slots];
  next[free] = runner;
  return next;
}

/** Exchanges two places; with an empty target this moves the runner. */
export function swapSlots(slots: LobbySlots, from: number, to: number): LobbySlots {
  const next = [...slots];
  next[from] = slots[to] ?? null;
  next[to] = slots[from] ?? null;
  return next;
}

export function removeRunners(slots: LobbySlots, keys: ReadonlySet<string>): LobbySlots {
  return slots.map((runner) => (runner && keys.has(runner.key) ? null : runner));
}
