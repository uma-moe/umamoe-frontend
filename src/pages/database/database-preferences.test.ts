import { describe, expect, it } from 'vitest';
import { emptyInheritanceFilters } from '@/lib/inheritance/inheritance-search';
import {
  DATABASE_FILTER_MODE_KEY,
  DATABASE_FILTER_PRESETS_KEY,
  DATABASE_FILTER_STATE_KEY,
  compactStateFromFilters,
  databasePresetFilterCount,
  decodeDatabaseFilterState,
  encodeDatabaseFilterState,
  exportDatabasePresets,
  filtersFromCompactState,
  importDatabasePresets,
  readDatabasePreferences,
  readDatabasePresets,
  writeDatabasePreferences,
  type CompactDatabaseFilterState
} from './database-preferences';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); }
  };
}

describe('Angular-compatible database preferences', () => {
  it('round-trips Any star ranges while ignoring unselected white factors', () => {
    const compact = { g: [[0, 2, 3]], mg: [[0, 3, 3]], b: [[0, 2, 5]], w: [[0, 1, 9]] };
    const filters = filtersFromCompactState(compact, 'advanced');
    expect(filters.green).toEqual([{ factorId: 0, minimumStars: 2, maximumStars: 3 }]);
    expect(compactStateFromFilters(filters)).toMatchObject({ g: compact.g, mg: compact.mg, b: compact.b });
    expect(filters.white).toEqual([]);
  });
  it('keeps unselected Angular tree slots absent rather than inventing character zero', () => {
    const filters = filtersFromCompactState({ t: [1013, null, null, null, null, null, null], mwc: 0, sc: '', pr: null as unknown as number }, 'advanced');
    expect(filters).toMatchObject({ playerCharaId: 1013, mainParentIds: [], parentLeftId: undefined, parentRightId: undefined, minWinCount: 0, supportCardId: undefined, minParentRank: undefined });
    expect(compactStateFromFilters(filters).t).toEqual([1013, null, null, null, null, null, null]);
  });
  it('round-trips Angular compact fields without losing unknown future data', () => {
    const compact: CompactDatabaseFilterState = {
      b: [[10, 3, 6]],
      omw: [[200010, 2]],
      t: [1010, 1020, 1030, 1040, null, null, null],
      imp: [1050],
      cwc: 4,
      rs: [[0, 4, 1, 2001]],
      future_flag: { enabled: true }
    };
    const restored = filtersFromCompactState(decodeDatabaseFilterState(encodeDatabaseFilterState(compact)), 'advanced');
    expect(restored.blue).toEqual([{ factorId: 10, minimumStars: 3, maximumStars: 6 }]);
    expect(restored.mainParentIds).toEqual([1020, 1050]);
    expect(restored.optionalMainWhite[0]).toMatchObject({ factorId: 200010, priority: 2 });
    expect(restored.minCommonWhiteCount).toBe(4);
    expect(compactStateFromFilters(restored, compact).future_flag).toEqual({ enabled: true });
  });

  it('uses the original Angular keys and keeps separate form and UQL payloads', () => {
    const storage = memoryStorage();
    const structured = emptyInheritanceFilters();
    structured.blue = [{ factorId: 10, minimumStars: 3, maximumStars: 4 }];
    const first = writeDatabasePreferences(storage, 'advanced', structured, null, {});
    const uql = emptyInheritanceFilters();
    uql.uql = 'Speed >= 6';
    writeDatabasePreferences(storage, 'uql', uql, first.saved, {});
    expect(storage.getItem(DATABASE_FILTER_MODE_KEY)).toBe('uql');
    const saved = JSON.parse(storage.getItem(DATABASE_FILTER_STATE_KEY) ?? '{}');
    expect(saved.formState).toBeTruthy();
    expect(saved.uqlState).toBeTruthy();
    expect(readDatabasePreferences(storage).filters.uql).toBe('Speed >= 6');
  });

  it('stores additive OR chaining without changing legacy AND tuples', () => {
    const filters = emptyInheritanceFilters();
    filters.blue = [
      { factorId: 10, minimumStars: 2, maximumStars: 3 },
      { factorId: 20, minimumStars: 1, maximumStars: 2, operator: 'or' }
    ];
    const compact = compactStateFromFilters(filters);
    expect(compact.b).toEqual([[10, 2, 3], [20, 1, 2, 1]]);
    expect(filtersFromCompactState(compact, 'basic').blue[1]?.operator).toBe('or');
  });

  it('drops obsolete main-parent occurrence settings while preserving stars and joins', () => {
    const compact = { mb: [[10, 2, 3, 1, 0, 0, 1]], mp: [[20, 1, 2, 0, 1, 1, 1]], mg: [[0, 3, 3, 1, 0, 1, 1]], mw: [[201600, 1, 3, 0, 0, 0, 1]] };
    const filters = filtersFromCompactState(compact, 'advanced');
    expect(filters.mainBlue).toEqual([{ factorId: 10, minimumStars: 2, maximumStars: 3, operator: 'or' }]);
    expect(filters.mainPink).toEqual([{ factorId: 20, minimumStars: 1, maximumStars: 2 }]);
    expect(filters.mainGreen).toEqual([{ factorId: 0, minimumStars: 3, maximumStars: 3, operator: 'or' }]);
    expect(filters.mainWhite).toEqual([{ factorId: 201600, minimumStars: 1, maximumStars: 3 }]);
    expect(compactStateFromFilters(filters, compact)).toMatchObject({ mb: [[10, 2, 3, 1]], mp: [[20, 1, 2]], mg: [[0, 3, 3, 1]], mw: [[201600, 1, 3]] });
  });

  it('retains Angular P2 context in URLs and presets, but not silent preferences', () => {
    const filters = emptyInheritanceFilters(); filters.p2MainCharaId = 1013; filters.p2WinSaddle = [100, 101];
    const storage = memoryStorage();
    const { compact, saved } = writeDatabasePreferences(storage, 'advanced', filters, null, { p2c: 999, p2w: [9], p2i: 42 });
    expect(compact).toMatchObject({ p2c: 1013, p2w: [100, 101], p2i: 42 });
    const restored = filtersFromCompactState(decodeDatabaseFilterState(encodeDatabaseFilterState(compact)), 'advanced');
    expect(restored).toMatchObject({ p2MainCharaId: 1013, p2WinSaddle: [100, 101] });
    const preference = decodeDatabaseFilterState(saved.formState);
    for (const key of ['p2c','p2w','p2i']) expect(preference).not.toHaveProperty(key);
    expect(readDatabasePreferences(storage).filters.p2MainCharaId).toBeUndefined();
    expect(compactStateFromFilters(emptyInheritanceFilters(), compact)).not.toHaveProperty('p2i');
    expect(filtersFromCompactState({ p2c: null as unknown as number, p2w: [NaN, -1, 3, 3, 1.5] }, 'advanced')).toMatchObject({ p2MainCharaId: undefined, p2WinSaddle: [3] });
  });

  it('persists the selected UUID but waits for its lookup instead of restoring stale affinity values', () => {
    const storage = memoryStorage();
    const filters = emptyInheritanceFilters(); filters.p2MainCharaId = 1013; filters.p2WinSaddle = [100];
    const {compact} = writeDatabasePreferences(storage, 'advanced', filters, null, {vet:'selected-uuid'});
    const restored = decodeDatabaseFilterState(encodeDatabaseFilterState(compact));
    expect(restored.vet).toBe('selected-uuid');
    expect(filtersFromCompactState(restored, 'advanced')).toMatchObject({p2MainCharaId:undefined, p2WinSaddle:[]});
    expect(readDatabasePreferences(storage).compact.vet).toBe('selected-uuid');
  });

  it('reads the Angular preset schema and computes its visible count', () => {
    const storage = memoryStorage();
    const state = encodeDatabaseFilterState({ b: [[10, 3, 9]], uid: '123' });
    storage.setItem(DATABASE_FILTER_PRESETS_KEY, JSON.stringify([{ version: 1, id: 'x', name: 'Borrow', mode: 'basic', state, createdAt: 1, updatedAt: 2 }]));
    const preset = readDatabasePresets(storage)[0]!;
    expect(preset.name).toBe('Borrow');
    expect(databasePresetFilterCount(preset)).toBe(2);
  });

  it('round-trips the Angular clipboard export and replaces presets by name', () => {
    const state = encodeDatabaseFilterState({ uid: '123' });
    const old = { version: 1 as const, id: 'kept-id', name: 'Borrow', mode: 'basic' as const, state, createdAt: 1, updatedAt: 2 };
    const incoming = { ...old, id: 'different-id', mode: 'advanced' as const, updatedAt: 3 };
    const transfer = exportDatabasePresets([incoming], '2026-08-29T00:00:00.000Z');
    const result = importDatabasePresets(transfer, [old], 100);
    expect(result.importedCount).toBe(1);
    expect(result.presets).toEqual([{ ...incoming, id: 'kept-id', createdAt: 1, updatedAt: 100 }]);
  });
});
