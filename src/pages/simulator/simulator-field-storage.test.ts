import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSimulatorUma, type SimulatorUma } from './simulator-uma';
import { createExampleRace } from './simulator-example';

const KEY = 'uma.simulator.field';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key)
  };
}

const runner = (name: string, id: string): SimulatorUma => ({ ...createSimulatorUma(name), id });

let storage: ReturnType<typeof memoryStorage>;

/** Reimported, so each test restores the field from storage again. */
async function rosterModule() {
  vi.resetModules();
  return import('./simulator-roster.svelte');
}

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
});

describe('the field this browser last raced', () => {
  it('keeps the runners and their team colors', async () => {
    const { importSimulatorUmas, saveSimulatorField, simulatorTeamColors } = await rosterModule();
    importSimulatorUmas([runner('Seiun Sky', 'a'), runner('Silence Suzuka', 'b')]);
    simulatorTeamColors[2] = '#123456';
    saveSimulatorField();

    const saved = JSON.parse(storage.getItem(KEY)!);
    expect(saved.field.map((uma: SimulatorUma) => uma.name)).toEqual([
      'Seiun Sky',
      'Silence Suzuka'
    ]);
    expect(saved.teamColors[2]).toBe('#123456');
  });

  it('opens on the field kept from last time', async () => {
    storage.setItem(
      KEY,
      JSON.stringify({
        field: [runner('Seiun Sky', 'a'), runner('Silence Suzuka', 'b')],
        teamColors: { 2: '#123456', 3: 'red' }
      })
    );

    const { simulatorRoster, simulatorTeamColors } = await rosterModule();

    expect(simulatorRoster.umas.map((uma) => uma.name)).toEqual(['Seiun Sky', 'Silence Suzuka']);
    expect(simulatorRoster.configured).toBe(true);
    expect(simulatorTeamColors[2]).toBe('#123456');
    // 'red' is not a hex color, so team 3 keeps its default.
    expect(simulatorTeamColors[3]).toBe('#e8ad63');
  });

  it('stays empty after a cleared field', async () => {
    storage.setItem(KEY, JSON.stringify({ field: [], teamColors: {} }));

    const { simulatorRoster } = await rosterModule();

    expect(simulatorRoster.umas).toEqual([]);
    expect(simulatorRoster.configured).toBe(true);
  });

  it('opens empty when what was kept is unreadable', async () => {
    storage.setItem(KEY, JSON.stringify({ field: [{ name: 3 }] }));

    const { simulatorRoster } = await rosterModule();

    expect(simulatorRoster.umas).toEqual([]);
    expect(simulatorRoster.configured).toBe(true);
  });

  it('keeps the empty field replaceable after a reload', async () => {
    const first = await rosterModule();
    first.saveSimulatorField();

    const { importSimulatorUmas, simulatorRoster } = await rosterModule();
    expect(simulatorRoster.umas).toEqual([]);

    importSimulatorUmas([runner('Pick', 'a'), runner('Runner-up', 'b')]);

    expect(simulatorRoster.umas.map((uma) => uma.name)).toEqual(['Pick', 'Runner-up']);
  });

  it('keeps a populated CM room when a build joins it', async () => {
    const { GENERATED_FIELD_SOURCE, MOB_SOURCE, importSimulatorUmas, simulatorRoster } =
      await rosterModule();
    simulatorRoster.umas.push({
      ...runner('Populated', 'populated'),
      source: GENERATED_FIELD_SOURCE
    });
    simulatorRoster.umas.push({ ...runner('Mob 2', 'mob'), source: MOB_SOURCE });
    simulatorRoster.umas.push(runner('Seiun Sky', 'own'));
    simulatorRoster.configured = true;

    importSimulatorUmas([runner('Pick', 'a')]);

    expect(simulatorRoster.umas.map((uma) => uma.name)).toEqual([
      'Populated',
      'Mob 2',
      'Seiun Sky',
      'Pick'
    ]);
  });

  it('takes the example runners’ place when a build joins them', async () => {
    const { importSimulatorUmas, simulatorRoster } = await rosterModule();
    simulatorRoster.umas.push(...createExampleRace().umas);
    simulatorRoster.umas.push(runner('Seiun Sky', 'own'));

    importSimulatorUmas([runner('Pick', 'a')]);

    expect(simulatorRoster.umas.map((uma) => uma.name)).toEqual(['Seiun Sky', 'Pick']);
  });

  it('adds a build beside the runners already placed', async () => {
    const { importSimulatorUmas, simulatorRoster } = await rosterModule();
    importSimulatorUmas([runner('Seiun Sky', 'a'), runner('Silence Suzuka', 'b')]);

    importSimulatorUmas([runner('Pick', 'c')]);

    expect(simulatorRoster.umas.map((uma) => uma.name)).toEqual([
      'Seiun Sky',
      'Silence Suzuka',
      'Pick'
    ]);
  });

  it('treats an untouched saved example field as empty', async () => {
    const example = createExampleRace().umas;
    storage.setItem(KEY, JSON.stringify({ field: example, teamColors: {} }));

    const { simulatorRoster } = await rosterModule();

    expect(simulatorRoster.umas).toEqual([]);
    expect(simulatorRoster.configured).toBe(true);
  });

  it('keeps an empty configured field once it is configured', async () => {
    const first = await rosterModule();
    first.simulatorRoster.configured = true;
    first.saveSimulatorField();

    const { simulatorRoster } = await rosterModule();

    expect(simulatorRoster.umas).toEqual([]);
    expect(simulatorRoster.configured).toBe(true);
  });

  it('empties the field and keeps it empty', async () => {
    const { clearSimulatorField, importSimulatorUmas, saveSimulatorField, simulatorRoster } =
      await rosterModule();
    importSimulatorUmas([runner('Seiun Sky', 'a'), runner('Silence Suzuka', 'b')]);

    clearSimulatorField();
    saveSimulatorField();

    expect(simulatorRoster.umas).toEqual([]);
    expect(JSON.parse(storage.getItem(KEY)!).field).toEqual([]);
  });
});
