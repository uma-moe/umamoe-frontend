import type { SqlValue } from 'sql.js';
import type { TableColumn } from '@/components/data/DataTable.svelte';
import type { MasterTable, QueryResult } from './master-data-types';

/**
 * A DataTable row for one result row. Cells are keyed by position (`c0`, `c1`, …) because a query can
 * return the same column name twice; `index` points back to the raw values, which keep NULL distinct.
 */
export type ResultRow = Record<string, string | number> & { index: number };

const timestampFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short'
});

export function columnKey(position: number): string {
  return `c${position}`;
}

export function columnPosition(key: string): number {
  return Number(key.slice(1));
}

/** SQLite's blob literal, so exports and filters can show binary values as text. */
export function cellText(value: SqlValue): string {
  if (value === null) return '';
  if (value instanceof Uint8Array)
    return `X'${Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('')}'`;

  return String(value);
}

// Columns stay left-aligned and content-sized, like a spreadsheet; numbers still sort numerically.
export function resultColumns(result: QueryResult): TableColumn[] {
  return result.columns.map((label, position) => ({ key: columnKey(position), label }));
}

export function resultRows(result: QueryResult): ResultRow[] {
  return result.values.map((values, index) => {
    const row: ResultRow = { index };
    values.forEach((value, position) => {
      row[columnKey(position)] = typeof value === 'number' ? value : cellText(value);
    });

    return row;
  });
}

/** Lower-cased text per row, separated so a search never matches across two cells. */
export function rowSearchText(result: QueryResult): string[] {
  return result.values.map((values) => values.map(cellText).join('\u0000').toLowerCase());
}

export function matchingRows(rows: ResultRow[], searchText: string[], filter: string): ResultRow[] {
  const needle = filter.trim().toLowerCase();
  if (!needle) return rows;

  return rows.filter((row) => searchText[row.index]?.includes(needle));
}

/** Master tables store dates as Unix seconds in columns named `*_date`. */
export function timestampLabel(column: string, value: SqlValue): string | undefined {
  if (!column.endsWith('_date') || typeof value !== 'number' || value <= 0) return undefined;
  return timestampFormat.format(new Date(value * 1000));
}

export function tablesWithColumn(tables: MasterTable[], column: string): MasterTable[] {
  return tables.filter((table) => table.columns.some((candidate) => candidate.name === column));
}

export function browseTableSql(table: string): string {
  return `SELECT * FROM "${table.replaceAll('"', '""')}"`;
}

/** The catalog table named by a statement's first FROM, so the sidebar can mark it. */
export function firstQueriedTable(sql: string, tables: MasterTable[]): string {
  const name = /\bfrom\s+(?:"((?:[^"]|"")+)"|([\w$]+))/i.exec(sql);
  if (!name) return '';

  const table = name[1]?.replaceAll('""', '"') ?? name[2] ?? '';
  return (
    tables.find((candidate) => candidate.name.toLowerCase() === table.toLowerCase())?.name ?? ''
  );
}
