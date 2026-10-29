import { expect, it } from 'vitest';
import type { MasterTableDiff } from '@/services/resources/master-history';
import { diffEntries, diffTableRows, masterCellText, sameCell } from './master-diff-rows';

const textData: MasterTableDiff = {
  columns: ['id', 'text'],
  added: [[3, 'new']],
  removed: [[2, null]],
  modified: [{ before: [1, 'old'], after: [1, 'changed'] }]
};

it('lists added, removed and modified rows in that order', () => {
  const entries = diffEntries(textData);

  expect(entries.map((entry) => entry.change)).toEqual(['added', 'removed', 'modified']);
});

it('sorts and searches modified rows by their current values', () => {
  const rows = diffTableRows(diffEntries(textData));

  expect(rows).toEqual([
    { entry: 0, change: 'added', c0: 3, c1: 'new' },
    { entry: 1, change: 'removed', c0: 2, c1: '' },
    { entry: 2, change: 'modified', c0: 1, c1: 'changed' }
  ]);
});

it('compares blobs by their bytes and shows them as SQLite literals', () => {
  const before = { blobHex: '00ff' };
  const after = { blobHex: '00ff' };

  expect(sameCell(before, after)).toBe(true);
  expect(sameCell(before, null)).toBe(false);
  expect(sameCell(0, null)).toBe(false);
  expect(masterCellText(before)).toBe("X'00ff'");
});
