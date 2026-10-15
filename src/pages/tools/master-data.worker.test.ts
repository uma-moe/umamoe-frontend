import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MasterDataRequest } from './master-data/master-data-types';

const database = vi.hoisted(() => ({
  run: vi.fn(),
  exec: vi.fn(() => []),
  close: vi.fn(),
  prepare: vi.fn()
}));

vi.mock('sql.js', () => ({
  default: async () => ({
    Database: function () {
      return database;
    }
  })
}));

let previousHandler: typeof self.onmessage;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  previousHandler = self.onmessage;
});

afterEach(() => {
  self.onmessage = previousHandler;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function send(request: MasterDataRequest) {
  const postMessage = vi.spyOn(self, 'postMessage').mockImplementation(() => {});
  await import('./master-data.worker');
  const handler = self.onmessage;
  if (!handler) throw new Error('Worker did not register a message handler.');
  await handler.call(self, new MessageEvent('message', { data: request }));
  return postMessage;
}

describe('master data worker protocol', () => {
  it('rejects invalid bundled data instead of treating arbitrary JSON as tables', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('null'));
    vi.stubGlobal('fetch', fetch);
    const postMessage = await send({ id: 1, kind: 'bundled' });
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/hakuraku/umdb.json.gz');
    expect(postMessage).toHaveBeenCalledWith({
      id: 1,
      kind: 'error',
      error: 'Invalid bundled game data.'
    });

    expect(database.run).not.toHaveBeenCalled();
  });

  it('closes the new database when the bundled data contains malformed rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ chara: [null] })))
    );

    const postMessage = await send({ id: 2, kind: 'bundled' });
    expect(postMessage).toHaveBeenCalledWith({
      id: 2,
      kind: 'error',
      error: 'Invalid rows in game data table chara.'
    });

    expect(database.close).toHaveBeenCalledOnce();
  });

  it('loads file bytes without fetching the bundled data', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const postMessage = await send({ id: 3, kind: 'file', bytes: new Uint8Array([1, 2]) });
    expect(fetch).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({ id: 3, kind: 'schema', schema: {} });
  });

  it('reports a query without an initialized database as an error variant', async () => {
    const postMessage = await send({ id: 4, kind: 'query', sql: 'SELECT 1' });
    expect(postMessage).toHaveBeenCalledWith({
      id: 4,
      kind: 'error',
      error: 'Load a database first.'
    });
  });
});
