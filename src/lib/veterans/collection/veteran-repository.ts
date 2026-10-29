import type { VeteranRecord } from '../generated/veteran-record';
import {
  normalizeVeteranImport,
  normalizeVeteranRecord,
  veteranFingerprint
} from '../records/veteran-normalizer';
import {
  idbRequest,
  openVeteranDatabase,
  recordsInWorkspace,
  transactionComplete,
  veteranRecordsStore,
  veteranSnapshotsStore,
  type StoredVeteran
} from './veteran-storage';

interface RecoverySnapshot {
  id: string;
  workspaceId: string;
  createdAt: string;
  reason: string;
  records: VeteranRecord[];
}

function key(workspaceId: string, recordId: string): string {
  return `${workspaceId}\u0000${recordId}`;
}

function dedup(record: VeteranRecord): string {
  return record.trainedCharaId != null
    ? `trained:${record.trainedCharaId}`
    : `content:${veteranFingerprint(record)}`;
}

function stored(workspaceId: string, record: VeteranRecord): StoredVeteran {
  return {
    key: key(workspaceId, record.recordId),
    workspaceId,
    fingerprint: dedup(record),
    updatedAt: new Date().toISOString(),
    record
  };
}

export interface VeteranImportResult {
  inserted: number;
  updated: number;
  total: number;
}

export const veteranRepository = {
  async query(workspaceId: string): Promise<VeteranRecord[]> {
    const db = await openVeteranDatabase();
    try {
      return (await recordsInWorkspace(db, workspaceId)).map((item) => item.record);
    } finally {
      db.close();
    }
  },
  async import(workspaceId: string, json: unknown): Promise<VeteranImportResult> {
    const normalized = normalizeVeteranImport(json); // Every record validates before the write transaction starts.
    const incoming = new Map<string, VeteranRecord>();
    for (const record of normalized) incoming.set(dedup(record), record);
    const db = await openVeteranDatabase();
    try {
      const existing = await recordsInWorkspace(db, workspaceId);
      const byFingerprint = new Map(existing.map((item) => [item.fingerprint, item]));
      const transaction = db.transaction(veteranRecordsStore, 'readwrite');
      const store = transaction.objectStore(veteranRecordsStore);
      let inserted = 0;
      let updated = 0;
      for (const [fingerprint, record] of incoming) {
        const previous = byFingerprint.get(fingerprint);
        if (previous) {
          record.recordId = previous.record.recordId;
          updated += 1;
        } else inserted += 1;

        store.put(stored(workspaceId, record));
      }

      await transactionComplete(transaction);
      return { inserted, updated, total: incoming.size };
    } finally {
      db.close();
    }
  },
  async upsert(workspaceId: string, value: unknown): Promise<VeteranRecord> {
    const record = normalizeVeteranRecord(value);
    const db = await openVeteranDatabase();
    try {
      const existing = await recordsInWorkspace(db, workspaceId);
      const previous = existing.find((item) => item.fingerprint === dedup(record));
      if (previous) record.recordId = previous.record.recordId;
      const transaction = db.transaction(veteranRecordsStore, 'readwrite');
      transaction.objectStore(veteranRecordsStore).put(stored(workspaceId, record));
      await transactionComplete(transaction);
      return record;
    } finally {
      db.close();
    }
  },
  async remove(workspaceId: string, recordId: string): Promise<void> {
    const db = await openVeteranDatabase();
    try {
      const transaction = db.transaction(veteranRecordsStore, 'readwrite');
      transaction.objectStore(veteranRecordsStore).delete(key(workspaceId, recordId));
      await transactionComplete(transaction);
    } finally {
      db.close();
    }
  },
  async replace(workspaceId: string, values: unknown[], reason = 'replace'): Promise<number> {
    const normalized = values.map(normalizeVeteranRecord);
    const unique = new Map(normalized.map((record) => [dedup(record), record]));
    const db = await openVeteranDatabase();
    try {
      const existing = await recordsInWorkspace(db, workspaceId);
      const transaction = db.transaction([veteranRecordsStore, veteranSnapshotsStore], 'readwrite');
      const records = transaction.objectStore(veteranRecordsStore);
      transaction.objectStore(veteranSnapshotsStore).put({
        id: `${workspaceId}:${Date.now()}`,
        workspaceId,
        createdAt: new Date().toISOString(),
        reason,
        records: existing.map((item) => item.record)
      } satisfies RecoverySnapshot);

      for (const item of existing) records.delete(item.key);
      for (const record of unique.values()) records.put(stored(workspaceId, record));
      await transactionComplete(transaction);
      return unique.size;
    } finally {
      db.close();
    }
  },
  async snapshots(workspaceId: string): Promise<RecoverySnapshot[]> {
    const db = await openVeteranDatabase();
    try {
      const transaction = db.transaction(veteranSnapshotsStore, 'readonly');
      return (await idbRequest(
        transaction
          .objectStore(veteranSnapshotsStore)
          .index('workspaceId')
          .getAll(IDBKeyRange.only(workspaceId))
      )) as RecoverySnapshot[];
    } finally {
      db.close();
    }
  },
  async export(workspaceId: string): Promise<{
    schemaVersion: 1;
    workspaceId: string;
    exportedAt: string;
    veterans: VeteranRecord[];
  }> {
    return {
      schemaVersion: 1,
      workspaceId,
      exportedAt: new Date().toISOString(),
      veterans: await this.query(workspaceId)
    };
  }
};
