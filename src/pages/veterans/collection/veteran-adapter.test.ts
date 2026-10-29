import { expect, it } from 'vitest';
import { combineVeteranFactors, veteranToUi } from './veteran-adapter';
import { normalizeVeteranRecord } from '@/lib/veterans/records/veteran-normalizer';
it('adds matching factor stars without mutating split data or merging different IDs', () => {
  const factors = [
    { id: 10, level: 3 },
    { id: 20, level: 2 },
    { id: 10, level: 3 },
    { id: 10, level: 3 }
  ];

  expect(combineVeteranFactors(factors)).toEqual([
    { id: 10, level: 9 },
    { id: 20, level: 2 }
  ]);

  expect(factors.map((factor) => factor.level)).toEqual([3, 2, 3, 3]);
  expect(combineVeteranFactors([])).toEqual([]);
});

it('combines only Own, P1 and P2 even when ancestors are unordered or P1 is missing', () => {
  const record = normalizeVeteranRecord({
    card_id: 101101,
    factors: [103],
    succession_chara_array: [
      { position_id: 11, card_id: 100101, factor_id_array: [103, 203] },
      { position_id: 20, card_id: 101301, factor_id_array: [102] },
      { position_id: 12, card_id: 100601, factor_id_array: [103, 203] },
      { position_id: 10, card_id: 106701, factor_id_array: [101] },
      { position_id: 21, card_id: 100701, factor_id_array: [103, 203] },
      { position_id: 22, card_id: 108801, factor_id_array: [103, 203] }
    ]
  });

  const display = () => veteranToUi(record, 'Local device', new Map());
  expect(
    display()
      .combinedSparks?.flatMap((group) => group.items)
      .map((spark) => spark.level)
  ).toEqual([6]);
  expect(display().parents?.map((parent) => [parent.position, parent.name])).toEqual([
    ['P1', 'Character 106701'],
    ['P2', 'Character 101301']
  ]);
  record.parents = record.parents.filter((parent) => parent.positionId !== 10);
  expect(
    display()
      .combinedSparks?.flatMap((group) => group.items)
      .map((spark) => spark.level)
  ).toEqual([5]);
  expect(display().parents?.map((parent) => parent.position)).toEqual(['P2']);
});
