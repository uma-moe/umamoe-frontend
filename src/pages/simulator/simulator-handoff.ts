import { idbRequest, transactionComplete } from '@/lib/indexed-db';
import type { MonteCarloGateOrder } from './requests/race-sim-request';
import type { MonteCarloResult } from './simulator-repository';
import type { SimulatorUma } from './simulator-uma';

/** A race field another page opens in the race simulator, with the run it already finished when there is one. */
export interface SimulatorHandoff {
  version: 1;
  umas: SimulatorUma[];
  courseId: number;
  raceInstanceId?: number;
  /** Simulator condition values: ground, weather and season as the session's selects hold them. */
  conditions: { ground?: string; weather?: string; season?: string };
  seed: number;
  gateOrder: MonteCarloGateOrder;
  /** Where the field comes from, for the notice above it. */
  origin: string;
  run?: MonteCarloResult;
}

const DATABASE = 'umamoe-simulator-handoff';
const STORE = 'handoffs';
// A tab that never loaded leaves its field behind; it is cleared once a newer hand-off is staged.
const MAX_AGE_MS = 60 * 60 * 1000;

interface StoredHandoff {
  token: string;
  stagedAt: number;
  handoff: SimulatorHandoff;
}

function openHandoffDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DATABASE, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE, { keyPath: 'token' });
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () =>
      reject(opening.error ?? new Error('The simulator hand-off could not be stored.'));
  });
}

export async function stageSimulatorHandoff(handoff: SimulatorHandoff): Promise<string> {
  const db = await openHandoffDatabase();
  try {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const stored: StoredHandoff[] = await idbRequest(store.getAll());
    const now = Date.now();

    for (const entry of stored) if (now - entry.stagedAt > MAX_AGE_MS) store.delete(entry.token);

    const token = crypto.randomUUID();
    store.put({ token, stagedAt: now, handoff } satisfies StoredHandoff);
    await transactionComplete(transaction);
    return token;
  } finally {
    db.close();
  }
}

/** Reads a staged hand-off once; a reload of the same address finds nothing. */
export async function takeSimulatorHandoff(token: string): Promise<SimulatorHandoff | undefined> {
  const db = await openHandoffDatabase();
  try {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const stored: StoredHandoff | undefined = await idbRequest(store.get(token));
    store.delete(token);
    await transactionComplete(transaction);

    const handoff = stored?.handoff;
    return handoff?.version === 1 && Array.isArray(handoff.umas) ? handoff : undefined;
  } finally {
    db.close();
  }
}

export const SIMULATOR_HANDOFF_PARAMETER = 'handoff';

/**
 * Opens the race simulator in a new tab on this field. Call it straight from a click: the tab opens before anything
 * is awaited, so the browser counts it as the reader's own.
 */
export async function openSimulatorHandoff(handoff: SimulatorHandoff): Promise<void> {
  const tab = window.open('', '_blank');
  if (!tab)
    throw new Error('The browser blocked the new tab. Allow pop-ups for this site and retry.');

  tab.document.title = 'Opening the race simulator…';
  try {
    const token = await stageSimulatorHandoff(handoff);
    const address = new URL('/simulator/race', location.origin);
    address.searchParams.set(SIMULATOR_HANDOFF_PARAMETER, token);
    tab.location.replace(address.href);
  } catch (error) {
    tab.close();
    throw error;
  }
}
