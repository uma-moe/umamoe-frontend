import { resourceCache } from '@/services/resources/resource-cache';
import MasterWorker from '../master-data.worker?worker';
import type {
  MasterDatabaseSource,
  MasterDataAction,
  MasterDataResponse,
  MasterTable,
  QueryResult
} from './master-data-types';

const QUERY_TIMEOUT_MS = 20_000;

/** What the open database is, as shown to the visitor. */
export type OpenDatabase = { kind: 'published'; marker: string } | { kind: 'file'; name: string };

interface DatabaseChoice {
  source: MasterDatabaseSource;
  database: OpenDatabase;
}

type Reply = Exclude<MasterDataResponse, { kind: 'error' }>;

interface PendingRequest {
  resolve: (reply: Reply) => void;
  reject: (error: Error) => void;
}

/**
 * One SQLite worker and the database it holds. Queries run in the worker so a slow statement never
 * blocks the page; one that runs away is stopped by restarting the worker and reopening the database.
 */
export class MasterDataSession {
  tables = $state.raw<MasterTable[]>([]);
  database = $state.raw<OpenDatabase>();
  result = $state.raw<QueryResult>();
  opening = $state(false);
  querying = $state(false);
  loadError = $state('');
  queryError = $state('');

  /** The work the screen is waiting for; opening wins because it replaces every table. */
  get pending(): 'opening' | 'querying' | undefined {
    if (this.opening) return 'opening';
    return this.querying ? 'querying' : undefined;
  }

  #worker: Worker | undefined;
  #nextRequest = 0;
  #waiting = new Map<number, PendingRequest>();
  #opened: DatabaseChoice | undefined;
  #latestOpen = 0;
  #latestQuery = 0;

  openPublished(): Promise<boolean> {
    return this.#open(async () => {
      const location = await resourceCache.masterDatabase();
      if (!location) throw new Error('The game database is not published yet.');

      return {
        source: { kind: 'published', url: location.path },
        database: { kind: 'published', marker: location.marker ?? 'current' }
      };
    });
  }

  openFile(file: File): Promise<boolean> {
    return this.#open(async () => ({
      source: { kind: 'file', file },
      database: { kind: 'file', name: file.name }
    }));
  }

  async run(sql: string): Promise<void> {
    const token = ++this.#latestQuery;
    this.querying = true;
    this.queryError = '';

    const timeout = setTimeout(() => this.#stopRunawayQuery(), QUERY_TIMEOUT_MS);
    try {
      const reply = await this.#request({ kind: 'query', sql });
      if (token !== this.#latestQuery) return;
      if (reply.kind !== 'result') throw new Error('The SQL engine sent an unexpected reply.');

      this.result = {
        columns: reply.columns,
        values: reply.values,
        truncated: reply.truncated,
        elapsedMs: reply.elapsedMs
      };
    } catch (error) {
      if (token !== this.#latestQuery) return;
      this.queryError = messageOf(error);
      this.result = undefined;
    } finally {
      clearTimeout(timeout);
      if (token === this.#latestQuery) this.querying = false;
    }
  }

  destroy(): void {
    this.#worker?.terminate();
    this.#worker = undefined;
    this.#waiting.clear();
  }

  async #open(choose: () => Promise<DatabaseChoice>): Promise<boolean> {
    const token = ++this.#latestOpen;
    this.opening = true;
    this.loadError = '';

    try {
      const choice = await choose();
      // The worker keeps whichever database it opened last, so a superseded choice must not reach it.
      if (token !== this.#latestOpen) return false;

      const reply = await this.#request({ kind: 'open', source: choice.source });
      if (token !== this.#latestOpen) return false;
      if (reply.kind !== 'catalog') throw new Error('The SQL engine sent an unexpected reply.');

      this.tables = reply.tables;
      this.database = choice.database;
      this.#opened = choice;
      return true;
    } catch (error) {
      if (token === this.#latestOpen) this.loadError = messageOf(error);
      return false;
    } finally {
      if (token === this.#latestOpen) this.opening = false;
    }
  }

  #request(action: MasterDataAction): Promise<Reply> {
    const id = ++this.#nextRequest;
    const worker = this.#ensureWorker();

    return new Promise((resolve, reject) => {
      this.#waiting.set(id, { resolve, reject });
      worker.postMessage({ ...action, id });
    });
  }

  #ensureWorker(): Worker {
    if (this.#worker) return this.#worker;

    const worker = new MasterWorker();
    worker.onmessage = (event: MessageEvent<MasterDataResponse>) => this.#receive(event.data);
    worker.onerror = () =>
      this.#restart(new Error('The SQL engine could not start. Reload the page to try again.'));

    this.#worker = worker;
    return worker;
  }

  #receive(response: MasterDataResponse): void {
    const request = this.#waiting.get(response.id);
    if (!request) return;

    this.#waiting.delete(response.id);
    if (response.kind === 'error') request.reject(new Error(response.error));
    else request.resolve(response);
  }

  /** Drops the worker and fails every request still waiting on it. */
  #restart(reason: Error): void {
    this.#worker?.terminate();
    this.#worker = undefined;

    const waiting = [...this.#waiting.values()];
    this.#waiting.clear();
    for (const request of waiting) request.reject(reason);
  }

  #stopRunawayQuery(): void {
    this.#restart(new Error('The query ran for more than 20 seconds and was stopped.'));

    // The new worker starts empty; the published database comes back from the HTTP cache.
    const opened = this.#opened;
    if (opened) void this.#open(async () => opened);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
