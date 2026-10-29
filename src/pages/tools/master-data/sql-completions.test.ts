import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { expect, it } from 'vitest';
import { columnsInScope, sqlIdentifier } from './sql-completions';
import type { MasterTable } from './master-data-types';

const tables: MasterTable[] = [
  {
    name: 'text_data',
    rows: 2,
    columns: [
      { name: 'category', type: 'INTEGER' },
      { name: 'index', type: 'INTEGER' }
    ]
  },
  { name: 'chara_data', rows: 1, columns: [{ name: 'birth_year', type: 'INTEGER' }] }
];

function complete(statement: string) {
  const state = EditorState.create({ doc: statement });
  return columnsInScope(tables)(new CompletionContext(state, statement.length, false));
}

it('suggests the columns of the tables a statement reads, quoting keyword names', () => {
  const result = complete('SELECT * FROM text_data WHERE cat');

  expect(result?.from).toBe('SELECT * FROM text_data WHERE '.length);
  expect(result?.options.map((option) => [option.label, option.apply])).toEqual([
    ['category', undefined],
    ['index', '"index"']
  ]);
});

it('includes joined tables and stays quiet before any table is named', () => {
  const joined = complete('SELECT * FROM "text_data" t JOIN chara_data c ON c.birth_year = t.ca');

  expect(joined?.options.map((option) => option.label)).toEqual([
    'category',
    'index',
    'birth_year'
  ]);
  expect(complete('SELECT cat')).toBeNull();
});

it('leaves plain identifiers unquoted and escapes embedded quotes', () => {
  expect(sqlIdentifier('chara_id')).toBe('chara_id');
  expect(sqlIdentifier('order')).toBe('"order"');
  expect(sqlIdentifier('odd "name"')).toBe('"odd ""name"""');
});
