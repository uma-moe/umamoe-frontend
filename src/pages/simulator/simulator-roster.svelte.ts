import { createSimulatorUma, restoreSimulatorUma, type SimulatorUma } from './simulator-uma';
import { loadReleasedCharacters, type CharacterData } from '@/lib/game-data/characters';
import { EXAMPLE_SOURCE } from './simulator-example';

/** A populated CM room's player runners and its mobs; the next populate replaces both, imports keep them. */
export const GENERATED_FIELD_SOURCE = 'Simulator field';
export const MOB_SOURCE = 'Mob';

let characters: CharacterData[] = [];

/** The most runners a race takes. */
export const MAX_FIELD = 18;

const FIELD_STORAGE_KEY = 'uma.simulator.field';

const kept = restoreField();

export const simulatorRoster = $state<{ umas: SimulatorUma[]; configured: boolean }>(
  kept ? { umas: kept.umas, configured: kept.configured } : { umas: [], configured: true }
);

/** Manual runners start with distinct characters from the released resource catalog. */
export function createRosterUma(fallbackName = 'Uma'): SimulatorUma {
  const used = new Set(simulatorRoster.umas.map((uma) => Math.floor((uma.cardId ?? 0) / 100)));
  const character =
    characters.find((character) => !used.has(Math.floor(Number(character.id) / 100))) ??
    characters[0];

  return {
    ...createSimulatorUma(character?.name ?? fallbackName),
    cardId: character ? Number(character.id) : undefined
  };
}

export async function ensureSimulatorRoster(): Promise<void> {
  characters = await loadReleasedCharacters();
  if (simulatorRoster.configured) return;
  for (const uma of simulatorRoster.umas) {
    if (uma.cardId) continue;
    const selected = createRosterUma(uma.name);
    uma.cardId = selected.cardId;
    uma.name = selected.name;
  }
}

export function isExampleRunner(uma: SimulatorUma): boolean {
  return uma.source === EXAMPLE_SOURCE;
}

/** A runner an auto-populated field supplied, rather than one the user made. */
export function isGeneratedRunner(uma: SimulatorUma): boolean {
  return uma.source === GENERATED_FIELD_SOURCE || uma.source === MOB_SOURCE;
}

export const POPULATED_TAG = '[Populated]';
const POPULATED_SUFFIX = ' ' + POPULATED_TAG;

/** A populated runner's name carries the tag, so the field, results and codes all show where she came from. */
export function populatedName(name: string): string {
  return name + POPULATED_SUFFIX;
}

export function untaggedName(name: string): string {
  return name.endsWith(POPULATED_SUFFIX) ? name.slice(0, -POPULATED_SUFFIX.length) : name;
}

export function isPlaceholderRunner(uma: SimulatorUma): boolean {
  return isExampleRunner(uma) || isGeneratedRunner(uma);
}

export function isMobRunner(uma: SimulatorUma): boolean {
  return uma.source === MOB_SOURCE;
}

export function isDrawnOpponent(uma: SimulatorUma): boolean {
  return uma.drawnFrom !== undefined;
}

/** A runner the user edits or copies is theirs from then on: populates and room draws keep her, without the tag. */
export function claimRunner(uma: SimulatorUma): void {
  if (isGeneratedRunner(uma)) uma.name = untaggedName(uma.name);
  if (isPlaceholderRunner(uma)) delete uma.source;
  delete uma.drawnFrom;
}

/** Saves a runner from the editor: in her place when she is already in the field, otherwise added. */
export function saveFieldRunner(uma: SimulatorUma): void {
  claimRunner(uma);

  const placed = simulatorRoster.umas.some((item) => item.id === uma.id);
  if (placed) {
    simulatorRoster.umas = simulatorRoster.umas.map((item) => (item.id === uma.id ? uma : item));
  } else if (simulatorRoster.umas.length < MAX_FIELD) {
    simulatorRoster.umas.push(uma);
  }

  simulatorRoster.configured = true;
}

/** The runners the user placed: neither the example field nor a populated CM room. */
export function ownRunners(): SimulatorUma[] {
  return simulatorRoster.umas.filter((uma) => !isPlaceholderRunner(uma));
}

/** The runners an import joins: everyone but the example field, so populated CM runners stay. */
export function importKeeps(): SimulatorUma[] {
  return simulatorRoster.umas.filter((uma) => !isExampleRunner(uma));
}

/** A whole team/lobby explicitly replaces the current field. Individual builds take the example runners' place. */
export function importSimulatorUmas(umas: SimulatorUma[], replace = false): void {
  const existing = replace ? [] : importKeeps();
  if (existing.length + umas.length > MAX_FIELD)
    throw new Error('A race can contain at most 18 Uma. Remove a runner first.');
  simulatorRoster.umas = [...existing, ...umas];
  if (simulatorRoster.umas.length === 1) simulatorRoster.umas.push(createRosterUma('Opponent'));
  simulatorRoster.configured = true;
}

/** The runners a room draw keeps: the user's own, without the example field or the last draw. */
export function roomRunners(): SimulatorUma[] {
  return ownRunners().filter((uma) => !isDrawnOpponent(uma));
}

/** `teams` in order, each moved to the lowest team number `kept` and the teams before it leave free. */
function teamsBeside(kept: SimulatorUma[], teams: SimulatorUma[][]): SimulatorUma[][] {
  const usedTeams = new Set(kept.map((uma) => uma.teamId ?? 0));

  return teams.map((team) => {
    let teamId = 1;
    while (usedTeams.has(teamId)) teamId++;
    usedTeams.add(teamId);

    return team.map((uma) => ({ ...uma, teamId }));
  });
}

function seatBeside(kept: SimulatorUma[], seated: SimulatorUma[]): void {
  if (kept.length + seated.length > MAX_FIELD)
    throw new Error('A race can contain at most 18 Uma. Remove a runner first.');

  simulatorRoster.umas = [...kept, ...seated];
  simulatorRoster.configured = true;
}

/** Seats drawn teams beside the kept runners, each team on the lowest team number the kept runners leave free. */
export function seatCmRoom(teams: SimulatorUma[][], snapshotId: string): void {
  const kept = roomRunners();
  const seated = teamsBeside(kept, teams)
    .flat()
    .map((uma) => ({ ...uma, drawnFrom: snapshotId }));

  seatBeside(kept, seated);
}

/** Seats populated CM teams beside the user's own runners, replacing the last populate's and the example field. */
export function seatPopulatedTeams(teams: SimulatorUma[][]): void {
  const kept = ownRunners();

  seatBeside(kept, teamsBeside(kept, teams).flat());
}

/** Saved as empty too, so a reload does not bring the example field back. */
export function clearSimulatorField(): void {
  simulatorRoster.umas = [];
  simulatorRoster.configured = true;
}

/**
 * A saved or imported field: every runner that reads as the field keeps them, each with an id of its own, and the
 * team colors that are valid. Throws rather than empty the field or overfill it.
 */
export function restoreSimulatorField(saved: { field: unknown[]; teamColors?: unknown }): {
  umas: SimulatorUma[];
  teamColors: Record<number, string>;
} {
  const ids = new Set<string>();
  const umas = saved.field.flatMap((value) => {
    const fallback = createSimulatorUma();
    const uma = restoreSimulatorUma(value, fallback);
    if (uma === fallback) return [];

    if (ids.has(uma.id)) uma.id = crypto.randomUUID();
    ids.add(uma.id);
    return [uma];
  });

  if (!umas.length) throw new Error('This code has no runner the race field can read.');
  if (umas.length > MAX_FIELD)
    throw new Error('A race can contain at most 18 Uma, but this code has ' + umas.length + '.');

  return { umas, teamColors: readTeamColors(saved.teamColors) };
}

function readTeamColors(value: unknown): Record<number, string> {
  const teamColors: Record<number, string> = {};
  const colors = value && typeof value === 'object' ? Object.entries(value) : [];
  for (const [key, color] of colors) {
    const id = Number(key);
    const valid = Number.isInteger(id) && id >= 1 && id <= 255;
    if (valid && typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))
      teamColors[id] = color.toLowerCase();
  }

  return teamColors;
}

function restoreField():
  { umas: SimulatorUma[]; teamColors: Record<number, string>; configured: boolean } | undefined {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(FIELD_STORAGE_KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return undefined;

    const { field, teamColors, configured } = saved as {
      field?: unknown;
      teamColors?: unknown;
      configured?: unknown;
    };
    if (!Array.isArray(field)) return undefined;
    // An empty field was cleared on purpose, so it stays empty.
    if (!field.length)
      return { umas: [], teamColors: readTeamColors(teamColors), configured: true };

    const restored = restoreSimulatorField({ field, teamColors });
    // Fields saved before the flag existed still read as the example while every runner comes from it. An untouched
    // example field is now empty: the race page asks for a field instead of opening on one.
    const userField =
      typeof configured === 'boolean' ? configured : !restored.umas.every(isExampleRunner);
    if (!userField && restored.umas.every(isExampleRunner))
      return { ...restored, umas: [], configured: true };
    return { ...restored, configured: userField };
  } catch {
    return undefined;
  }
}

const defaultTeamColors = [
  ['Blue', '#69b7ee'],
  ['Purple', '#bd91d1'],
  ['Amber', '#e8ad63'],
  ['Green', '#72c49a'],
  ['Rose', '#ec8f9e']
] as const;

export const simulatorTeamColors = $state<Record<number, string>>({
  ...Object.fromEntries(defaultTeamColors.map(([, color], index) => [index + 1, color])),
  ...kept?.teamColors
});

/** Run it in an effect so every change to the field is saved. */
export function saveSimulatorField(): void {
  const data = JSON.stringify({
    field: $state.snapshot(simulatorRoster.umas),
    teamColors: $state.snapshot(simulatorTeamColors),
    configured: simulatorRoster.configured
  });

  try {
    localStorage.setItem(FIELD_STORAGE_KEY, data);
  } catch {
    /* Storage can be full or disabled; the field still works for this visit. */
  }
}

export function simulatorTeamColor(id?: number): string {
  return id
    ? (simulatorTeamColors[id] ??
        '#' + ((Math.imul(id, 0x9e3779b1) >>> 0) & 0xffffff).toString(16).padStart(6, '0'))
    : '#8993a2';
}

export function simulatorTeamLabel(id?: number, color?: string): string {
  return id
    ? (defaultTeamColors[id - 1]?.[0] ?? (color ?? simulatorTeamColor(id)).toUpperCase()) + ' team'
    : 'No team';
}

/** One color identifies one team; imported numeric groups retain their simulator IDs. */
export function addSimulatorTeamColor(color: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw Error('Choose a valid team color.');
  const normalized = color.toLowerCase(),
    used = new Set([
      ...Object.keys(simulatorTeamColors).map(Number),
      ...simulatorRoster.umas.map((uma) => uma.teamId ?? 0)
    ]);

  const existing = [...used].find(
    (id) => id > 0 && simulatorTeamColor(id).toLowerCase() === normalized
  );

  if (existing !== undefined) return existing;
  const id = Array.from({ length: 255 }, (_, index) => index + 1).find((id) => !used.has(id));
  if (id === undefined) throw Error('All 255 team colors are in use. Choose an existing color.');
  simulatorTeamColors[id] = normalized;
  return id;
}

/** Replaces the whole field and its team colors, as loading a code copied from the race tab does. */
export function replaceSimulatorField(
  umas: SimulatorUma[],
  teamColors: Record<number, string>
): void {
  simulatorRoster.umas = umas.length === 1 ? [...umas, createRosterUma('Opponent')] : umas;
  simulatorRoster.configured = true;
  for (const id of Object.keys(simulatorTeamColors)) delete simulatorTeamColors[Number(id)];
  for (const [index, [, color]] of defaultTeamColors.entries())
    simulatorTeamColors[index + 1] = color;
  Object.assign(simulatorTeamColors, teamColors);
}
