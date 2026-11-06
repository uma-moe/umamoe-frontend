import { describe, expect, it } from 'vitest';
import {
  claimRunner,
  GENERATED_FIELD_SOURCE,
  isDrawnOpponent,
  MOB_SOURCE,
  replaceSimulatorField,
  restoreSimulatorField,
  seatCmRoom,
  seatPopulatedField,
  simulatorRoster,
  simulatorTeamColors
} from './simulator-roster.svelte';
import { createSimulatorUma } from './simulator-uma';

const runner = (name: string, id: string = crypto.randomUUID()) => ({
  ...createSimulatorUma(name),
  id
});

describe('whole race fields from a code', () => {
  it('keeps every runner it can read, each with an id of its own, and the valid team colors', () => {
    const twin = runner('Seiun Sky', 'same');
    const saved = {
      field: [twin, { ...runner('Mihono Bourbon'), id: 'same' }, { name: 3 }, 'nothing'],
      teamColors: { '2': '#BD91D1', '0': '#000000', '3': 'red' }
    };

    const { umas, teamColors } = restoreSimulatorField(saved);

    expect(umas.map((uma) => uma.name)).toEqual(['Seiun Sky', 'Mihono Bourbon']);
    expect(new Set(umas.map((uma) => uma.id)).size).toBe(2);
    expect(teamColors).toEqual({ 2: '#bd91d1' });
  });

  it('refuses a field it can’t read or that is too large', () => {
    const nineteen = Array.from({ length: 19 }, (_, index) => runner('Uma ' + index));

    expect(() => restoreSimulatorField({ field: [{ name: 1 }] })).toThrow('no runner');
    expect(() => restoreSimulatorField({ field: nineteen })).toThrow('at most 18');
  });

  it('replaces the field and its team colors, the default colors kept', () => {
    replaceSimulatorField([runner('Seiun Sky'), runner('Silence Suzuka')], { 7: '#123456' });

    expect(simulatorRoster.umas.map((uma) => uma.name)).toEqual(['Seiun Sky', 'Silence Suzuka']);
    expect(simulatorRoster.configured).toBe(true);
    expect(simulatorTeamColors[7]).toBe('#123456');
    expect(simulatorTeamColors[1]).toBe('#69b7ee');
  });
});

describe('a CM room drawn beside the user’s runners', () => {
  const team = (name: string) => [runner(name + ' 1'), runner(name + ' 2'), runner(name + ' 3')];

  it('keeps the CM Data label on drawn runners', () => {
    simulatorRoster.umas = [];

    seatCmRoom([team('First').map((uma) => ({ ...uma, source: 'CM Data' }))], 'cm21');

    expect(simulatorRoster.umas.map((uma) => uma.source)).toEqual([
      'CM Data',
      'CM Data',
      'CM Data'
    ]);
  });

  it('seats each drawn team on a team number the kept runners leave free', () => {
    simulatorRoster.umas = [{ ...runner('Seiun Sky'), teamId: 1 }];

    seatCmRoom([team('First'), team('Second')], 'cm21');

    const drawn = simulatorRoster.umas.filter(isDrawnOpponent);
    expect(simulatorRoster.umas[0]?.name).toBe('Seiun Sky');
    expect(drawn.map((uma) => uma.teamId)).toEqual([2, 2, 2, 3, 3, 3]);
  });

  it('replaces the last draw but keeps a drawn runner the user claimed', () => {
    simulatorRoster.umas = [];
    seatCmRoom([team('First'), team('Second'), team('Third')], 'cm21');
    const claimed = simulatorRoster.umas[0]!;
    claimRunner(claimed);

    seatCmRoom([team('Fourth'), team('Fifth'), team('Sixth')], 'cm21');

    expect(isDrawnOpponent(claimed)).toBe(false);
    expect(simulatorRoster.umas.map((uma) => uma.name)).toEqual([
      'First 1',
      ...team('Fourth').map((uma) => uma.name),
      ...team('Fifth').map((uma) => uma.name),
      ...team('Sixth').map((uma) => uma.name)
    ]);
  });
});

describe('a populated field beside the user’s runners', () => {
  const populated = (name: string) =>
    [1, 2, 3].flatMap((teamId) =>
      [1, 2, 3].map((member) => ({
        ...runner(name + ' ' + teamId + '.' + member),
        teamId,
        source: GENERATED_FIELD_SOURCE
      }))
    );

  it('keeps the user’s own runners and seats the populated teams on free team numbers', () => {
    const own = { ...runner('Seiun Sky'), teamId: 1 };
    simulatorRoster.umas = [own];

    seatPopulatedField(populated('First'));

    const teams = simulatorRoster.umas.slice(1).map((uma) => uma.teamId);
    expect(simulatorRoster.umas[0]).toEqual(own);
    expect(teams).toEqual([2, 2, 2, 3, 3, 3, 4, 4, 4]);
  });

  it('replaces the last populated field, its mobs and draws, but keeps a populated runner the user edited', () => {
    simulatorRoster.umas = [];
    seatPopulatedField(populated('First'));
    const edited = simulatorRoster.umas[0]!;
    claimRunner(edited);
    simulatorRoster.umas.push({ ...runner('Mob'), source: MOB_SOURCE });
    simulatorRoster.umas.push({ ...runner('Drawn'), drawnFrom: 'cm21' });

    seatPopulatedField(populated('Second'));

    const names = simulatorRoster.umas.map((uma) => uma.name);
    expect(names).toEqual(['First 1.1', ...populated('Second').map((uma) => uma.name)]);
  });

  it('refuses a populated field that would overfill the race', () => {
    const own = Array.from({ length: 10 }, (_, index) => runner('Own ' + index));
    simulatorRoster.umas = own;

    expect(() => seatPopulatedField(populated('First'))).toThrow('at most 18');
    expect(simulatorRoster.umas).toEqual(own);
  });
});
