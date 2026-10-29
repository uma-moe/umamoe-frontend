import { openSimulatorField } from '@/pages/simulator/simulator-session.svelte';
import { simulatorUmaFromCm } from '@/pages/simulator/simulator-uma';
import type { Build, Snapshot, Summary, TeamDetail } from '../../../hakuraku-types';
import { loadTeamDetail } from '../../cm-data';
import {
  emptyLobby,
  lobbyTeamOf,
  placeRunner,
  placeTeam,
  removeRunners,
  runnerKey,
  swapSlots,
  teamSlots,
  TEAM_SIZE,
  type LobbyRunner,
  type LobbySlots
} from './lobby-slots';

interface LobbySource {
  data: Summary;
  snapshot?: Snapshot;
}

/**
 * The room a reader assembles on CM Data before racing it: whole captured teams and single runners in three teams of
 * three. Opening it replaces the race simulator's field, one simulator team per lobby team.
 */
export class CmLobby {
  slots = $state<LobbySlots>(emptyLobby());
  /** Team ids and runner keys whose builds are loading. */
  pending = $state<string[]>([]);
  /** The place picked first when swapping two runners. */
  selected = $state<number | null>(null);
  error = $state('');
  opening = $state(false);

  readonly count = $derived(this.slots.filter((runner) => runner !== null).length);

  #details = new Map<string, Promise<TeamDetail>>();
  #source: () => LobbySource;
  #revision = 0;

  constructor(source: () => LobbySource) {
    this.#source = source;
  }

  hasRunner(teamId: string, index: number): boolean {
    const key = runnerKey(teamId, index);
    return this.slots.some((runner) => runner?.key === key);
  }

  hasTeam(teamId: string): boolean {
    return Array.from({ length: TEAM_SIZE }, (_, index) => this.hasRunner(teamId, index)).every(
      Boolean
    );
  }

  toggleTeam = async (teamId: string) => {
    const teamKeys = new Set(
      Array.from({ length: TEAM_SIZE }, (_, index) => runnerKey(teamId, index))
    );

    if (this.pending.some((key) => key === teamId || teamKeys.has(key))) return;

    this.error = '';
    this.selected = null;

    if (this.hasTeam(teamId)) {
      this.slots = removeRunners(this.slots, teamKeys);
      return;
    }

    const builds = await this.#load(teamId, teamId);
    if (!builds) return;

    // Runners already picked one by one join their full team instead of appearing twice.
    const withoutTeam = removeRunners(this.slots, teamKeys);
    const runners = builds.map((build, index) => captured(teamId, index, build));
    const placed = placeTeam(withoutTeam, runners);
    if (!placed) {
      this.error =
        'A captured team needs three places together. Clear one team or move its Uma to make room.';
      return;
    }

    this.slots = placed;
  };

  toggleRunner = async (teamId: string, index: number) => {
    const key = runnerKey(teamId, index);

    if (this.pending.includes(key) || this.pending.includes(teamId)) return;

    this.error = '';
    this.selected = null;

    if (this.hasRunner(teamId, index)) {
      this.slots = removeRunners(this.slots, new Set([key]));
      return;
    }

    const builds = await this.#load(teamId, key);
    const build = builds?.[index];
    if (!build) return;

    const placed = placeRunner(this.slots, captured(teamId, index, build));
    if (!placed) {
      this.error = 'The lobby is full. Remove a runner to add another.';
      return;
    }

    this.slots = placed;
  };

  /** The first pick marks a place; the second swaps the two, or moves the runner into an empty place. */
  pick = (slot: number) => {
    this.error = '';

    if (this.selected === null) {
      if (this.slots[slot]) this.selected = slot;
      return;
    }

    if (this.selected !== slot) this.slots = swapSlots(this.slots, this.selected, slot);
    this.selected = null;
  };

  remove = (slot: number) => {
    const next = [...this.slots];
    next[slot] = null;
    this.slots = next;
    this.selected = null;
    this.error = '';
  };

  removeTeam = (team: number) => {
    const next = [...this.slots];
    for (const slot of teamSlots(team)) next[slot] = null;
    this.slots = next;
    this.selected = null;
    this.error = '';
  };

  clear = () => {
    this.#revision++;
    this.slots = emptyLobby();
    this.pending = [];
    this.selected = null;
    this.error = '';
  };

  openInSimulator = async () => {
    const { data, snapshot } = this.#source();
    const umas = this.slots.flatMap((runner, slot) =>
      runner ? [simulatorUmaFromCm(runner.build, data, lobbyTeamOf(slot) + 1)] : []
    );

    if (!umas.length) return;

    this.opening = true;
    this.error = '';
    try {
      await openSimulatorField(umas, {
        replace: true,
        raceInstanceId: snapshot?.raceInstanceId,
        startTimeType: snapshot?.startTimeType
      });
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not open the lobby.';
    } finally {
      this.opening = false;
    }
  };

  /** A new dataset starts a new lobby; its builds belong to a different meeting. */
  reset() {
    this.clear();
    this.#details.clear();
  }

  async #load(teamId: string, pendingKey: string): Promise<Build[] | undefined> {
    const snapshotId = this.#source().data.snapshotId;
    const revision = this.#revision;
    const cacheKey = snapshotId + '/' + teamId;
    let detail = this.#details.get(cacheKey);

    this.pending = [...this.pending, pendingKey];
    this.error = '';

    try {
      if (!detail) {
        detail = loadTeamDetail(snapshotId, teamId);
        this.#details.set(cacheKey, detail);
      }

      const members = (await detail).team.members;
      const current = this.#source().data.snapshotId === snapshotId && this.#revision === revision;

      return current ? members : undefined;
    } catch (error) {
      if (this.#details.get(cacheKey) === detail) this.#details.delete(cacheKey);

      if (this.#revision === revision && this.#source().data.snapshotId === snapshotId) {
        this.error = error instanceof Error ? error.message : 'Could not load the captured build.';
      }

      return undefined;
    } finally {
      if (this.#revision === revision) {
        this.pending = this.pending.filter((key) => key !== pendingKey);
      }
    }
  }
}

function captured(teamId: string, index: number, build: Build): LobbyRunner {
  return { key: runnerKey(teamId, index), teamId, index, build };
}
