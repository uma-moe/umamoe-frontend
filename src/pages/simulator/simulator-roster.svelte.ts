import { createSimulatorUma, restoreSimulatorUma, type SimulatorUma } from './simulator-uma';
import { loadReleasedCharacters, type CharacterData } from '@/lib/game-data/characters';
import { createExampleRace } from './simulator-example';

let characters: CharacterData[] = [];

export const simulatorRoster = $state<{ umas: SimulatorUma[]; configured: boolean }>({
  umas: createExampleRace().umas,
  configured: false
});

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

/** A whole team/lobby explicitly replaces the current field. Individual builds append. */
export function importSimulatorUmas(umas: SimulatorUma[], replace = false): void {
  const existing = replace || !simulatorRoster.configured ? [] : simulatorRoster.umas;
  if (existing.length + umas.length > 18)
    throw new Error('A race can contain at most 18 Uma. Remove a runner first.');
  simulatorRoster.umas = [...existing, ...umas];
  if (simulatorRoster.umas.length === 1) simulatorRoster.umas.push(createRosterUma('Opponent'));
  simulatorRoster.configured = true;
}

/** The most runners a race takes. */
const MAX_FIELD = 18;

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

  const teamColors: Record<number, string> = {};
  const colors =
    saved.teamColors && typeof saved.teamColors === 'object'
      ? Object.entries(saved.teamColors)
      : [];
  for (const [key, color] of colors) {
    const id = Number(key);
    const valid = Number.isInteger(id) && id >= 1 && id <= 255;
    if (valid && typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))
      teamColors[id] = color.toLowerCase();
  }

  return { umas, teamColors };
}

const defaultTeamColors = [
  ['Blue', '#69b7ee'],
  ['Purple', '#bd91d1'],
  ['Amber', '#e8ad63'],
  ['Green', '#72c49a'],
  ['Rose', '#ec8f9e']
] as const;

export const simulatorTeamColors = $state<Record<number, string>>(
  Object.fromEntries(defaultTeamColors.map(([, color], index) => [index + 1, color]))
);

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
