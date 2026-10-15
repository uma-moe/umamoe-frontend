import type { SqlValue } from 'sql.js';

export type MasterDataAction =
  { kind: 'bundled' } | { kind: 'file'; bytes: Uint8Array } | { kind: 'query'; sql: string };

export type MasterDataRequest = MasterDataAction & { id: number };

export type MasterDataResponse = { id: number } & (
  | { kind: 'schema'; schema: Record<string, string[]> }
  | { kind: 'query'; columns: string[]; values: SqlValue[][]; truncated: boolean }
  | { kind: 'error'; error: string }
);
