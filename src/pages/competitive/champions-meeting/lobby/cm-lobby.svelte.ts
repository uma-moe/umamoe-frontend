import type { Summary, Performer, Build, TeamDetail } from '../../hakuraku-types';
import { cmGet, snapshotPath } from '../cm-data';

export type LobbyDraft = {
  mood: string;
  seed: string;
  gates: Record<string, string>;
  edits: Record<string, Build>;
};

export class CmLobbyState {
  lobby = $state<Performer[]>([]);
  pendingTeams = $state<string[]>([]);
  teamDraft = $state<{ key: string; build: Build }[]>([]);
  pendingRunners = $state<string[]>([]);
  teamError = $state('');
  draft = $state<LobbyDraft>({ mood: '5', seed: '', gates: {}, edits: {} });

  #customTeamId = 0;
  #data: () => Summary | undefined;

  constructor(data: () => Summary | undefined) {
    this.#data = data;
  }

  reset() {
    this.lobby = [];
    this.pendingTeams = [];
    this.teamDraft = [];
    this.pendingRunners = [];
    this.teamError = '';
    this.draft = { mood: '5', seed: '', gates: {}, edits: {} };
  }

  clear = () => {
    this.lobby = [];
    this.pendingTeams = [];
    this.draft.gates = {};
    this.draft.edits = {};
  };

  removeTeam = (team: Performer) => {
    this.lobby = this.lobby.filter((t) => t.id !== team.id);
    this.draft.gates = Object.fromEntries(
      Object.entries(this.draft.gates).filter(([key]) => !key.startsWith(team.id + ':'))
    );
    this.draft.edits = Object.fromEntries(
      Object.entries(this.draft.edits).filter(([key]) => !key.startsWith(team.id + ':'))
    );
  };

  moveRunner = (sourceId: string, sourceIndex: number, targetId: string, targetIndex: number) => {
    const source = this.lobby.find((team) => team.id === sourceId),
      target = this.lobby.find((team) => team.id === targetId);
    if (
      !source ||
      !target ||
      source === target ||
      !source.members[sourceIndex] ||
      !target.members[targetIndex]
    )
      return;
    const nextSourceId = source.custom ? source.id : 'custom:' + ++this.#customTeamId,
      nextTargetId = target.custom ? target.id : 'custom:' + ++this.#customTeamId;
    const sourceKey = source.id + ':' + sourceIndex,
      targetKey = target.id + ':' + targetIndex;
    const movedKey = (key: string) =>
      key === sourceKey
        ? nextTargetId + ':' + targetIndex
        : key === targetKey
          ? nextSourceId + ':' + sourceIndex
          : key.startsWith(source.id + ':')
            ? nextSourceId + key.slice(source.id.length)
            : key.startsWith(target.id + ':')
              ? nextTargetId + key.slice(target.id.length)
              : key;
    this.lobby = this.lobby.map((team) => {
      if (team !== source && team !== target) return team;
      const members = team.members.map((member, index) =>
        team === source && index === sourceIndex
          ? target.members[targetIndex]!
          : team === target && index === targetIndex
            ? source.members[sourceIndex]!
            : member
      );
      return {
        ...team,
        id: team === source ? nextSourceId : nextTargetId,
        members,
        custom: true,
        wins: 0,
        n: 0,
        ci: [0, 0],
        memberWins: members.map(() => 0)
      };
    });
    this.draft.gates = Object.fromEntries(
      Object.entries(this.draft.gates).map(([key, value]) => [movedKey(key), value])
    );
    this.draft.edits = Object.fromEntries(
      Object.entries(this.draft.edits).map(([key, value]) => [movedKey(key), value])
    );
  };

  toggleTeam = async (team: Performer) => {
    if (this.lobby.some((t) => t.id === team.id)) {
      this.removeTeam(team);
      return;
    }
    const data = this.#data();
    if (
      !data ||
      this.lobby.length + this.pendingTeams.length >= 3 ||
      this.pendingTeams.includes(team.id)
    )
      return;
    const snapshot = data.snapshotId;
    this.pendingTeams = [...this.pendingTeams, team.id];
    this.teamError = '';
    try {
      const detail = await cmGet<TeamDetail>(
        snapshotPath(snapshot, 'teams/' + encodeURIComponent(team.id)),
        new AbortController().signal,
        snapshot
      );
      if (
        this.#data()?.snapshotId === snapshot &&
        this.pendingTeams.includes(team.id) &&
        this.lobby.length < 3
      )
        this.lobby = [...this.lobby, detail.team];
    } catch (error) {
      if (this.#data()?.snapshotId === snapshot)
        this.teamError =
          error instanceof Error ? error.message : 'Could not load the captured team.';
    } finally {
      if (this.#data()?.snapshotId === snapshot)
        this.pendingTeams = this.pendingTeams.filter((id) => id !== team.id);
    }
  };

  toggleRunner = async (team: Performer, index: number) => {
    const key = team.id + ':' + index;
    if (this.teamDraft.some((r) => r.key === key)) {
      this.teamDraft = this.teamDraft.filter((r) => r.key !== key);
      return;
    }
    const data = this.#data();
    if (
      this.teamDraft.length + this.pendingRunners.length >= 3 ||
      this.pendingRunners.includes(key) ||
      !data
    )
      return;
    const snapshot = data.snapshotId;
    this.pendingRunners = [...this.pendingRunners, key];
    this.teamError = '';
    try {
      const detail = await cmGet<TeamDetail>(
        snapshotPath(snapshot, 'teams/' + encodeURIComponent(team.id)),
        new AbortController().signal,
        snapshot
      );
      const build = detail.team.members[index];
      if (!build) throw new Error('This captured runner is unavailable.');
      if (this.#data()?.snapshotId === snapshot && this.pendingRunners.includes(key))
        this.teamDraft = [...this.teamDraft, { key, build }];
    } catch (error) {
      if (this.#data()?.snapshotId === snapshot)
        this.teamError =
          error instanceof Error ? error.message : 'Could not load the captured build.';
    } finally {
      if (this.#data()?.snapshotId === snapshot)
        this.pendingRunners = this.pendingRunners.filter((r) => r !== key);
    }
  };

  removeRunner = (key: string) => {
    this.teamDraft = this.teamDraft.filter((r) => r.key !== key);
  };

  addCustomTeam = () => {
    if (
      this.teamDraft.length !== 3 ||
      this.lobby.length + this.pendingTeams.length >= 3 ||
      this.pendingRunners.length
    )
      return false;
    this.lobby = [
      ...this.lobby,
      {
        id: 'custom:' + ++this.#customTeamId,
        owner: { id: 'custom', names: ['Custom team'] },
        members: this.teamDraft.map((r) => r.build),
        wins: 0,
        n: 0,
        ci: [0, 0],
        memberWins: [0, 0, 0],
        custom: true
      }
    ];
    this.teamDraft = [];
    return true;
  };
}
