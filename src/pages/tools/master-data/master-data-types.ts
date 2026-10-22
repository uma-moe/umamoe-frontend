import type { SqlValue } from 'sql.js';

/** Enough for every master table, including text_data (~55k rows), while bounding runaway joins. */
export const MAX_RESULT_ROWS = 100_000;

export type MasterDatabaseSource =
  { kind: 'published'; url: string } | { kind: 'file'; file: File };

export interface MasterColumn {
  name: string;
  /** Declared SQLite type, such as INTEGER or TEXT; empty when the column declares none. */
  type: string;
}

export interface MasterTable {
  name: string;
  rows: number;
  columns: MasterColumn[];
}

export interface QueryResult {
  columns: string[];
  values: SqlValue[][];
  /** The statement produced more than MAX_RESULT_ROWS rows. */
  truncated: boolean;
  elapsedMs: number;
}

export type MasterDataAction =
  { kind: 'open'; source: MasterDatabaseSource } | { kind: 'query'; sql: string };

export type MasterDataRequest = MasterDataAction & { id: number };

export type MasterDataResponse = { id: number } & (
  | { kind: 'catalog'; tables: MasterTable[] }
  | ({ kind: 'result' } & QueryResult)
  | { kind: 'error'; error: string }
);
