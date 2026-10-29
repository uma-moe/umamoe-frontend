import { expect, it } from 'vitest';
import {
  browseTableSql,
  firstQueriedTable,
  matchingRows,
  resultColumns,
  resultRows,
  rowSearchText,
  timestampLabel
} from './master-data-results';
import type { MasterTable, QueryResult } from './master-data-types';

const result: QueryResult = {
  columns: ['id', 'text', 'id'],
  values: [
    [1, 'Special Week', 10],
    [2, null, 20],
    [3, 'Silence Suzuka', null]
  ],
  truncated: false,
  elapsedMs: 3
};

const tables: MasterTable[] = [
  { name: 'text_data', rows: 3, columns: [{ name: 'id', type: 'INTEGER' }] },
  { name: 'odd "name"', rows: 1, columns: [] }
];

it('keys cells by position so repeated column names and NULL stay distinct', () => {
  const columns = resultColumns(result);
  const rows = resultRows(result);

  expect(columns).toEqual([
    { key: 'c0', label: 'id' },
    { key: 'c1', label: 'text' },
    { key: 'c2', label: 'id' }
  ]);
  expect(rows[1]).toEqual({ index: 1, c0: 2, c1: '', c2: 20 });
});

it('filters rows case-insensitively without matching NULL or across cells', () => {
  const rows = resultRows(result);
  const searchText = rowSearchText(result);

  const suzuka = matchingRows(rows, searchText, '  suzUKA ');
  const acrossCells = matchingRows(rows, searchText, 'week10');
  const nullText = matchingRows(rows, searchText, 'null');

  expect(suzuka.map((row) => row.index)).toEqual([2]);
  expect(acrossCells).toEqual([]);
  expect(nullText).toEqual([]);
});

it('labels Unix-second timestamps only in *_date columns', () => {
  expect(timestampLabel('start_date', 1609513200)).toBeDefined();
  expect(timestampLabel('start_date', 0)).toBeUndefined();
  expect(timestampLabel('date', 219)).toBeUndefined();
});

it('finds the browsed table for quoted and bare names', () => {
  expect(firstQueriedTable(browseTableSql('odd "name"'), tables)).toBe('odd "name"');
  expect(firstQueriedTable('select text from TEXT_DATA where id = 1', tables)).toBe('text_data');
  expect(firstQueriedTable('SELECT 1', tables)).toBe('');
});
