import { describe, expect, it } from 'vitest';
import {
  replaceSimulatorField,
  restoreSimulatorField,
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
