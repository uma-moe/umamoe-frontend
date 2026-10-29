import type { VeteranRecord } from '../generated/veteran-record';

export interface StoredVeteran {
  key: string;
  workspaceId: string;
  fingerprint: string;
  updatedAt: string;
  record: VeteranRecord;
}

export const veteranRecordsStore = 'records';
export const veteranSnapshotsStore = 'snapshots';

export function idbRequest<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error('IndexedDB request failed.'));
  });
}

export function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction was aborted.'));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

export function openVeteranDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('umamoe-veterans', 1);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      const records = db.createObjectStore(veteranRecordsStore, { keyPath: 'key' });
      records.createIndex('workspaceId', 'workspaceId');
      db.createObjectStore(veteranSnapshotsStore, { keyPath: 'id' }).createIndex(
        'workspaceId',
        'workspaceId'
      );
    };

    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () =>
      reject(opening.error ?? new Error('The Veteran database could not be opened.'));
  });
}

export async function recordsInWorkspace(
  db: IDBDatabase,
  workspaceId: string
): Promise<StoredVeteran[]> {
  const transaction = db.transaction(veteranRecordsStore, 'readonly');
  return idbRequest(
    transaction
      .objectStore(veteranRecordsStore)
      .index('workspaceId')
      .getAll(IDBKeyRange.only(workspaceId))
  ) as Promise<StoredVeteran[]>;
}

export async function mostRecentVeteran(workspaceId: string): Promise<VeteranRecord | undefined> {
  const db = await openVeteranDatabase();
  try {
    const values = await recordsInWorkspace(db, workspaceId);
    values.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    return values[0]?.record;
  } finally {
    db.close();
  }
}
