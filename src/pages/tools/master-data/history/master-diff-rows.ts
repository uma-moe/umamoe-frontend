import type { MasterCell, MasterTableDiff } from '@/services/resources/master-history';
import { columnKey } from '../master-data-results';

export type DiffChange = 'added' | 'removed' | 'modified';

/** One changed row of a table; a modified row keeps both versions so cells can show before → after. */
export type DiffEntry =
  | { change: 'added' | 'removed'; cells: MasterCell[] }
  | { change: 'modified'; before: MasterCell[]; after: MasterCell[] };

/**
 * A DataTable row for one entry. Cells are keyed by position like query results; `entry` points back to
 * the raw cells, which keep NULL and blobs distinct from text.
 */
export type DiffTableRow = Record<string, string | number> & { entry: number; change: DiffChange };

/** Added rows first, then removed and modified ones, as Hakuraku lists them. */
export function diffEntries(table: MasterTableDiff): DiffEntry[] {
  return [
    ...table.added.map((cells): DiffEntry => ({ change: 'added', cells })),
    ...table.removed.map((cells): DiffEntry => ({ change: 'removed', cells })),
    ...table.modified.map(({ before, after }): DiffEntry => ({ change: 'modified', before, after }))
  ];
}

export function diffTableRows(entries: DiffEntry[]): DiffTableRow[] {
  return entries.map((entry, index) => {
    const row: DiffTableRow = { entry: index, change: entry.change };
    // Sorting and in-page search follow a modified row's current values.
    const cells = entry.change === 'modified' ? entry.after : entry.cells;
    cells.forEach((cell, position) => {
      row[columnKey(position)] = typeof cell === 'number' ? cell : masterCellText(cell);
    });

    return row;
  });
}

/** Text for a cell, with blobs in SQLite's literal form like query results. */
export function masterCellText(cell: MasterCell): string {
  if (cell === null) return '';
  if (typeof cell === 'object') return `X'${cell.blobHex}'`;
  return String(cell);
}

export function sameCell(before: MasterCell, after: MasterCell): boolean {
  if (typeof before === 'object' && before !== null) {
    return typeof after === 'object' && after !== null && before.blobHex === after.blobHex;
  }

  return before === after;
}
