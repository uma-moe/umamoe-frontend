import type { ParsedRaceCapture, RaceRunner } from './race-capture-parser';

export interface MultiRaceHorseEntry {
  raceId: string;
  runnerIndex: number;
  charaKey: string;
  name: string;
  cardId?: number;
  strategy: number;
  finishOrder: number;
  learnedSkillIds: number[];
  activatedSkillIds: number[];
  isPlayer: boolean;
  teamId: number;
  startHp: number;
  finishHp: number;
  lastSpurtStartDistance: number;
  raceDistance: number;
}

export interface MultiRaceCharacterStats {
  key: string;
  name: string;
  races: number;
  wins: number;
  top3: number;
  finishTotal: number;
  playerRaces: number;
}

export interface MultiRaceStrategyStats {
  strategy: number;
  races: number;
  wins: number;
  top3: number;
  finishTotal: number;
  saturation: { count: number; races: number; wins: number }[];
}

export interface MultiRaceSkillStats {
  skillId: number;
  learned: number;
  activations: number;
  activatedRunners: number;
  wins: number;
  finishTotal: number;
  doubleProcRaces: number;
  activationDistances: number[];
}

export interface MultiRaceHpStats {
  key: string;
  name: string;
  races: number;
  wins: number;
  startHpTotal: number;
  finishHpTotal: number;
  survived: number;
  lastSpurtRaces: number;
  lastSpurtDistanceTotal: number;
}

export interface MultiRaceTeamStats {
  key: string;
  members: { name: string; cardId?: number; strategy: number }[];
  appearances: number;
  wins: number;
}

export interface MultiRaceAnalysis {
  races: number;
  entries: MultiRaceHorseEntry[];
  characters: MultiRaceCharacterStats[];
  strategies: MultiRaceStrategyStats[];
  skills: MultiRaceSkillStats[];
  hp: MultiRaceHpStats[];
  teams: MultiRaceTeamStats[];
}

function numeric(raw: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = Number(raw[key]);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function runnerKey(runner: RaceRunner): string {
  return String(runner.cardId ?? runner.charaId ?? runner.trainedCharaId ?? runner.name);
}

function raceId(capture: ParsedRaceCapture, index: number): string {
  return `${capture.courseId ?? 'course'}:${capture.randomSeed ?? capture.fileName}:${index}`;
}

function activatedSkillEvents(capture: ParsedRaceCapture, runnerIndex: number): { id: number; distance: number }[] {
  return capture.events.filter((event) => event.type === 3 && event.params[0] === runnerIndex).map((event) => ({
    id: event.params[1] ?? 0,
    distance: capture.frames.find((frame) => frame.time >= event.frameTime)?.horses[runnerIndex]?.distance ?? capture.frames.at(-1)?.horses[runnerIndex]?.distance ?? 0
  })).filter((event) => event.id > 0);
}

export function multiRaceGroupKey(capture: ParsedRaceCapture): string {
  return [capture.courseId ?? 'unknown', capture.raceDistance ?? 'distance', capture.track.condition ?? 'condition', capture.track.weather ?? 'weather', capture.track.season ?? 'season'].join(':');
}

export function groupMultiRaceCaptures(captures: ParsedRaceCapture[]): { key: string; captures: ParsedRaceCapture[] }[] {
  const groups = new Map<string, ParsedRaceCapture[]>();
  for (const capture of captures) {
    const key = multiRaceGroupKey(capture);
    groups.set(key, [...(groups.get(key) ?? []), capture]);
  }
  return [...groups].map(([key, values]) => ({ key, captures: values })).sort((left, right) => right.captures.length - left.captures.length);
}

export function analyzeMultiRace(captures: ParsedRaceCapture[]): MultiRaceAnalysis {
  const entries: MultiRaceHorseEntry[] = [];
  const characters = new Map<string, MultiRaceCharacterStats>();
  const strategies = new Map<number, MultiRaceStrategyStats>();
  const skills = new Map<number, MultiRaceSkillStats>();
  const hp = new Map<string, MultiRaceHpStats>();
  const teams = new Map<string, MultiRaceTeamStats>();

  captures.forEach((capture, captureIndex) => {
    const id = raceId(capture, captureIndex);
    const strategyCounts = new Map<number, number>();
    for (const runner of capture.runners) strategyCounts.set(runner.result?.runningStyle ?? 0, (strategyCounts.get(runner.result?.runningStyle ?? 0) ?? 0) + 1);
    const raceEntries: MultiRaceHorseEntry[] = [];

    for (const runner of capture.runners) {
      const finishOrder = runner.result?.finishOrder ?? capture.runners.length;
      const strategy = runner.result?.runningStyle ?? 0;
      const key = runnerKey(runner);
      const activations = activatedSkillEvents(capture, runner.index);
      const startHp = capture.frames[0]?.horses[runner.index]?.hp ?? 0;
      const finishHp = capture.frames.at(-1)?.horses[runner.index]?.hp ?? 0;
      const entry: MultiRaceHorseEntry = {
        raceId: id,
        runnerIndex: runner.index,
        charaKey: key,
        name: runner.name,
        cardId: runner.cardId,
        strategy,
        finishOrder,
        learnedSkillIds: runner.skillIds,
        activatedSkillIds: activations.map((activation) => activation.id),
        isPlayer: runner.isPlayer,
        teamId: numeric(runner.raw, 'team_id', 'teamId') ?? 0,
        startHp,
        finishHp,
        lastSpurtStartDistance: runner.result?.lastSpurtStartDistance ?? 0,
        raceDistance: capture.raceDistance ?? Math.max(0, ...capture.frames.at(-1)?.horses.map((horse) => horse.distance) ?? [0])
      };
      entries.push(entry);
      raceEntries.push(entry);

      const character = characters.get(key) ?? { key, name: runner.name, races: 0, wins: 0, top3: 0, finishTotal: 0, playerRaces: 0 };
      character.races += 1; character.wins += finishOrder === 1 ? 1 : 0; character.top3 += finishOrder <= 3 ? 1 : 0; character.finishTotal += finishOrder; character.playerRaces += runner.isPlayer ? 1 : 0;
      characters.set(key, character);

      const strategyStats = strategies.get(strategy) ?? { strategy, races: 0, wins: 0, top3: 0, finishTotal: 0, saturation: [] };
      strategyStats.races += 1; strategyStats.wins += finishOrder === 1 ? 1 : 0; strategyStats.top3 += finishOrder <= 3 ? 1 : 0; strategyStats.finishTotal += finishOrder;
      const count = strategyCounts.get(strategy) ?? 0;
      const saturation = strategyStats.saturation.find((item) => item.count === count) ?? { count, races: 0, wins: 0 };
      saturation.races += 1; saturation.wins += finishOrder === 1 ? 1 : 0;
      if (!strategyStats.saturation.includes(saturation)) strategyStats.saturation.push(saturation);
      strategies.set(strategy, strategyStats);

      const activationCounts = new Map<number, number>();
      for (const activation of activations) activationCounts.set(activation.id, (activationCounts.get(activation.id) ?? 0) + 1);
      for (const skillId of new Set(runner.skillIds)) {
        const skill = skills.get(skillId) ?? { skillId, learned: 0, activations: 0, activatedRunners: 0, wins: 0, finishTotal: 0, doubleProcRaces: 0, activationDistances: [] };
        const countForRunner = activationCounts.get(skillId) ?? 0;
        skill.learned += 1; skill.activations += countForRunner; skill.activatedRunners += countForRunner > 0 ? 1 : 0; skill.wins += finishOrder === 1 ? 1 : 0; skill.finishTotal += finishOrder; skill.doubleProcRaces += countForRunner >= 2 ? 1 : 0;
        skill.activationDistances.push(...activations.filter((activation) => activation.id === skillId).map((activation) => activation.distance));
        skills.set(skillId, skill);
      }

      if (runner.isPlayer) {
        const personal = hp.get(key) ?? { key, name: runner.name, races: 0, wins: 0, startHpTotal: 0, finishHpTotal: 0, survived: 0, lastSpurtRaces: 0, lastSpurtDistanceTotal: 0 };
        personal.races += 1; personal.wins += finishOrder === 1 ? 1 : 0; personal.startHpTotal += startHp; personal.finishHpTotal += finishHp; personal.survived += finishHp > 0 ? 1 : 0;
        if ((runner.result?.lastSpurtStartDistance ?? 0) > 0) { personal.lastSpurtRaces += 1; personal.lastSpurtDistanceTotal += runner.result!.lastSpurtStartDistance; }
        hp.set(key, personal);
      }
    }

    const teamGroups = new Map<number, MultiRaceHorseEntry[]>();
    for (const entry of raceEntries) if (entry.teamId > 0) teamGroups.set(entry.teamId, [...(teamGroups.get(entry.teamId) ?? []), entry]);
    for (const members of teamGroups.values()) {
      const sorted = members.slice().sort((left, right) => left.charaKey.localeCompare(right.charaKey) || left.strategy - right.strategy);
      const key = sorted.map((entry) => `${entry.charaKey}.${entry.strategy}`).join('|');
      const team = teams.get(key) ?? { key, members: sorted.map((entry) => ({ name: entry.name, cardId: entry.cardId, strategy: entry.strategy })), appearances: 0, wins: 0 };
      team.appearances += 1; team.wins += sorted.some((entry) => entry.finishOrder === 1) ? 1 : 0;
      teams.set(key, team);
    }
  });

  return {
    races: captures.length,
    entries,
    characters: [...characters.values()].sort((left, right) => right.wins - left.wins || left.finishTotal / left.races - right.finishTotal / right.races),
    strategies: [...strategies.values()].map((entry) => ({ ...entry, saturation: entry.saturation.sort((left, right) => left.count - right.count) })).sort((left, right) => left.strategy - right.strategy),
    skills: [...skills.values()].sort((left, right) => right.learned - left.learned || right.activations - left.activations),
    hp: [...hp.values()].sort((left, right) => right.races - left.races || right.wins - left.wins),
    teams: [...teams.values()].sort((left, right) => right.appearances - left.appearances || right.wins - left.wins)
  };
}
