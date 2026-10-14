import { describe, expect, it } from 'vitest';
import { normalizeVeteranImport } from './veteran-normalizer';

describe('Veteran import normalization', () => {
  it('normalizes Angular profile Veterans and encoded factors', () => { const [record] = normalizeVeteranImport([{ trained_chara_id: 88, card_id: 100101, speed: 1200, stamina: 900, power: 1100, guts: 600, wiz: 800, factor_id_array: [103, 3402], skills: [200011] }]); expect(record).toMatchObject({ schemaVersion: 1, recordId: 'trained-88', trainedCharaId: 88, cardId: 100101, stats: { speed: 1200, wisdom: 800 }, factors: [{ id: 10, level: 3 }, { id: 340, level: 2 }], skills: [{ id: 20001, level: 1 }] }); });
  it('rejects the complete import before storage when a record is invalid', () => { expect(() => normalizeVeteranImport([{ card_id: 0 }])).toThrow(/Veteran 1/); });
  it('accepts a wrapped Veterans export', () => { expect(normalizeVeteranImport({ veterans: [{ card_id: 100101, speed: 1 }] })).toHaveLength(1); });
});
