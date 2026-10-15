import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { ungzip } from 'pako';
import type { MasterDataRequest, MasterDataResponse } from './master-data/master-data-types';

let database: Database | undefined;
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const SQL = initSqlJs({ locateFile: () => wasmUrl });

self.onmessage = async (event: MessageEvent<MasterDataRequest>) => {
  const request = event.data;
  const { id, kind } = request;
  try {
    const engine = await SQL;
    if (kind !== 'query') {
      let next: Database;
      if (kind === 'file') {
        const { bytes } = request;
        next = new engine.Database(bytes[0] === 0x1f && bytes[1] === 0x8b ? ungzip(bytes) : bytes);
      } else {
        const response = await fetch('/hakuraku/umdb.json.gz');
        if (!response.ok) throw new Error(`Bundled game data unavailable (${response.status})`);
        const payload = new Uint8Array(await response.arrayBuffer());
        const gameData: unknown = JSON.parse(
          new TextDecoder().decode(
            payload[0] === 0x1f && payload[1] === 0x8b ? ungzip(payload) : payload
          )
        );

        if (gameData === null || typeof gameData !== 'object' || Array.isArray(gameData))
          throw new Error('Invalid bundled game data.');
        next = new engine.Database();
        try {
          next.run('BEGIN');
          for (const [name, values] of Object.entries(gameData)) {
            if (!Array.isArray(values) || !values.length) continue;
            const rows = values.filter(
              (row): row is Record<string, unknown> =>
                row !== null && typeof row === 'object' && !Array.isArray(row)
            );

            if (rows.length !== values.length)
              throw new Error(`Invalid rows in game data table ${name}.`);
            const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
            if (!columns.length) continue;
            next.run(
              `CREATE TABLE ${quote(name)} (${columns.map((column) => `${quote(column)} ${rows.some((row) => typeof row[column] === 'number') ? 'NUMERIC' : 'TEXT'}`).join(',')})`
            );
            const statement = next.prepare(
              `INSERT INTO ${quote(name)} VALUES (${columns.map(() => '?').join(',')})`
            );

            try {
              for (const row of rows)
                statement.run(
                  columns.map((column) => {
                    const value = row[column];
                    if (value === null || value === undefined) return null;
                    if (typeof value === 'number' || typeof value === 'string') return value;
                    return JSON.stringify(value);
                  })
                );
            } finally {
              statement.free();
            }
          }

          next.run('COMMIT');
        } catch (error) {
          next.close();
          throw error;
        }
      }

      next.run('PRAGMA query_only = ON');
      const tables =
        next
          .exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0]
          ?.values.map((row) => String(row[0])) ?? [];

      const schema = Object.fromEntries(
        tables.map((table) => [
          table,
          next.exec(`PRAGMA table_info(${quote(table)})`)[0]?.values.map((row) => String(row[1])) ??
            []
        ])
      );

      database?.close();
      database = next;
      self.postMessage({ id, kind: 'schema', schema } satisfies MasterDataResponse);
    } else {
      if (!database) throw new Error('Load a database first.');
      database.run('PRAGMA query_only = ON');
      const statement = database.prepare(request.sql);
      try {
        const columns = statement.getColumnNames();
        const values: SqlValue[][] = [];
        while (values.length < 1000 && statement.step()) values.push(statement.get());
        const truncated = values.length === 1000 && statement.step();
        self.postMessage({
          id,
          kind: 'query',
          columns,
          values,
          truncated
        } satisfies MasterDataResponse);
      } finally {
        statement.free();
      }
    }
  } catch (error) {
    self.postMessage({
      id,
      kind: 'error',
      error: error instanceof Error ? error.message : String(error)
    } satisfies MasterDataResponse);
  }
};
