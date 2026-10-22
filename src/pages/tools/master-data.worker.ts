import initSqlJs, { type Database, type SqlValue } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { ungzip } from 'pako';
import {
  MAX_RESULT_ROWS,
  type MasterDatabaseSource,
  type MasterDataRequest,
  type MasterDataResponse,
  type MasterTable,
  type QueryResult
} from './master-data/master-data-types';

const engine = initSqlJs({ locateFile: () => wasmUrl });
let database: Database | undefined;

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

async function readSource(source: MasterDatabaseSource): Promise<Uint8Array> {
  if (source.kind === 'file') return new Uint8Array(await source.file.arrayBuffer());

  const response = await fetch(source.url, { credentials: 'omit' });
  if (!response.ok) throw new Error(`The game database returned ${response.status}.`);
  return new Uint8Array(await response.arrayBuffer());
}

function readCatalog(next: Database): MasterTable[] {
  const names =
    next
      .exec(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name"
      )[0]
      ?.values.map(([name]) => String(name)) ?? [];

  return names.map((name) => {
    const rows = next.exec(`SELECT COUNT(*) FROM ${quote(name)}`)[0]?.values[0]?.[0];
    const columns =
      next.exec(`PRAGMA table_info(${quote(name)})`)[0]?.values.map((column) => ({
        name: String(column[1]),
        type: typeof column[2] === 'string' ? column[2] : ''
      })) ?? [];

    return { name, rows: Number(rows ?? 0), columns };
  });
}

async function open(source: MasterDatabaseSource): Promise<MasterTable[]> {
  const SQL = await engine;
  const bytes = await readSource(source);
  // The service sends Content-Encoding: gzip, but files and some proxies keep the raw archive.
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const next = new SQL.Database(isGzip ? ungzip(bytes) : bytes);

  try {
    next.run('PRAGMA query_only = ON');
    const tables = readCatalog(next);
    database?.close();
    database = next;
    return tables;
  } catch (error) {
    next.close();
    throw error;
  }
}

function query(sql: string): QueryResult {
  if (!database) throw new Error('Load a database first.');

  // A query may turn this off, so restore it before every statement.
  database.run('PRAGMA query_only = ON');
  const started = performance.now();
  const statement = database.prepare(sql);

  try {
    const values: SqlValue[][] = [];
    while (values.length < MAX_RESULT_ROWS && statement.step()) values.push(statement.get());

    return {
      columns: statement.getColumnNames(),
      values,
      truncated: values.length === MAX_RESULT_ROWS && statement.step(),
      elapsedMs: Math.round(performance.now() - started)
    };
  } finally {
    statement.free();
  }
}

async function respond(request: MasterDataRequest): Promise<MasterDataResponse> {
  const { id } = request;

  switch (request.kind) {
    case 'open':
      return { id, kind: 'catalog', tables: await open(request.source) };
    case 'query':
      return { id, kind: 'result', ...query(request.sql) };
    default: {
      const unknown: never = request;
      throw new Error(`Unknown master data request ${JSON.stringify(unknown)}.`);
    }
  }
}

self.onmessage = async (event: MessageEvent<MasterDataRequest>) => {
  const { id } = event.data;

  try {
    self.postMessage(await respond(event.data));
  } catch (error) {
    self.postMessage({
      id,
      kind: 'error',
      error: error instanceof Error ? error.message : String(error)
    } satisfies MasterDataResponse);
  }
};
