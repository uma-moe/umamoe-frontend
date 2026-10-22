import { File as NodeFile } from 'node:buffer';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_RESULT_ROWS, type MasterDataRequest } from './master-data/master-data-types';

const sqlite = vi.hoisted(() => {
  const statement = {
    getColumnNames: vi.fn(() => ['id']),
    step: vi.fn(() => false),
    get: vi.fn(() => [1]),
    free: vi.fn()
  };

  const database = {
    run: vi.fn(),
    exec: vi.fn((sql: string): { columns: string[]; values: unknown[][] }[] => {
      if (sql.startsWith('SELECT name FROM sqlite_master'))
        return [{ columns: ['name'], values: [['chara_data'], ['empty_table']] }];
      if (sql === 'SELECT COUNT(*) FROM "chara_data"') return [{ columns: [], values: [[2]] }];
      if (sql === 'SELECT COUNT(*) FROM "empty_table"') return [{ columns: [], values: [[0]] }];
      if (sql.startsWith('PRAGMA table_info'))
        return [{ columns: [], values: [[0, 'id', 'INTEGER', 1, null, 1]] }];
      return [];
    }),
    prepare: vi.fn(() => statement),
    close: vi.fn()
  };

  return { statement, database, opened: [] as Uint8Array[] };
});

vi.mock('sql.js', () => ({
  default: async () => ({
    Database: function (bytes: Uint8Array) {
      sqlite.opened.push(bytes);
      return sqlite.database;
    }
  })
}));

let previousHandler: typeof self.onmessage;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  sqlite.statement.step.mockReturnValue(false);
  sqlite.opened.length = 0;
  // jsdom's File cannot read its bytes; the worker reads chosen files with arrayBuffer().
  vi.stubGlobal('File', NodeFile);
  previousHandler = self.onmessage;
});

afterEach(() => {
  self.onmessage = previousHandler;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function send(...requests: MasterDataRequest[]) {
  const postMessage = vi.spyOn(self, 'postMessage').mockImplementation(() => {});
  await import('./master-data.worker');
  const handler = self.onmessage;
  if (!handler) throw new Error('Worker did not register a message handler.');
  for (const request of requests)
    await handler.call(self, new MessageEvent('message', { data: request }));
  return postMessage;
}

describe('master data worker protocol', () => {
  it('opens the published database from a raw gzip archive and lists every table', async () => {
    const databaseBytes = new Uint8Array([0x53, 0x51, 0x4c]);
    const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array(gzipSync(databaseBytes))));
    vi.stubGlobal('fetch', fetch);

    const postMessage = await send({
      id: 1,
      kind: 'open',
      source: { kind: 'published', url: '/resources/simulator/v1/master.mdb.gz' }
    });

    expect(fetch).toHaveBeenCalledExactlyOnceWith('/resources/simulator/v1/master.mdb.gz', {
      credentials: 'omit'
    });
    expect(sqlite.opened).toEqual([databaseBytes]);
    expect(sqlite.database.run).toHaveBeenCalledWith('PRAGMA query_only = ON');
    expect(postMessage).toHaveBeenCalledWith({
      id: 1,
      kind: 'catalog',
      tables: [
        { name: 'chara_data', rows: 2, columns: [{ name: 'id', type: 'INTEGER' }] },
        { name: 'empty_table', rows: 0, columns: [{ name: 'id', type: 'INTEGER' }] }
      ]
    });
  });

  it('reads a chosen file without downloading the published database', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const file = new File([new Uint8Array([1, 2])], 'master.mdb');

    await send({ id: 2, kind: 'open', source: { kind: 'file', file } });

    expect(fetch).not.toHaveBeenCalled();
    expect(sqlite.opened).toEqual([new Uint8Array([1, 2])]);
  });

  it('closes a database it could not read and reports the failure', async () => {
    sqlite.database.run.mockImplementationOnce(() => {
      throw new Error('file is not a database');
    });
    const file = new File([new Uint8Array([1])], 'notes.txt');

    const postMessage = await send({ id: 3, kind: 'open', source: { kind: 'file', file } });

    expect(sqlite.database.close).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith({
      id: 3,
      kind: 'error',
      error: 'file is not a database'
    });
  });

  it('reports a query without an open database as an error variant', async () => {
    const postMessage = await send({ id: 4, kind: 'query', sql: 'SELECT 1' });

    expect(postMessage).toHaveBeenCalledWith({
      id: 4,
      kind: 'error',
      error: 'Load a database first.'
    });
  });

  it('stops at the row limit and marks the result as truncated', async () => {
    sqlite.statement.step.mockReturnValue(true);
    const file = new File([new Uint8Array([1])], 'master.mdb');

    const postMessage = await send(
      { id: 5, kind: 'open', source: { kind: 'file', file } },
      { id: 6, kind: 'query', sql: 'SELECT id FROM text_data' }
    );

    const result = postMessage.mock.calls.at(-1)?.[0];
    expect(result).toMatchObject({ id: 6, kind: 'result', columns: ['id'], truncated: true });
    expect(result.values).toHaveLength(MAX_RESULT_ROWS);
    expect(sqlite.statement.free).toHaveBeenCalledOnce();
  });
});
