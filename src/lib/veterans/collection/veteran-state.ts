import { writable } from 'svelte/store';
import type { VeteranRecord } from '../generated/veteran-record';
import { veteranRepository, type VeteranImportResult } from './veteran-repository';

export const veteranRecords = writable<VeteranRecord[]>([]);
export const veteranRecordsLoading = writable(false);
export const veteranRecordsError = writable('');
let loadedWorkspace = '';

export async function loadVeterans(workspaceId: string, force = false): Promise<void> {
  if (!force && loadedWorkspace === workspaceId) return;
  veteranRecordsLoading.set(true);
  veteranRecordsError.set('');
  try {
    veteranRecords.set(await veteranRepository.query(workspaceId));
    loadedWorkspace = workspaceId;
  } catch (error) {
    veteranRecordsError.set(
      error instanceof Error ? error.message : 'Veterans could not be loaded.'
    );
  } finally {
    veteranRecordsLoading.set(false);
  }
}

export async function importVeterans(
  workspaceId: string,
  value: unknown
): Promise<VeteranImportResult> {
  const result = await veteranRepository.import(workspaceId, value);
  await loadVeterans(workspaceId, true);
  return result;
}

export async function removeVeteran(workspaceId: string, recordId: string): Promise<void> {
  await veteranRepository.remove(workspaceId, recordId);
  await loadVeterans(workspaceId, true);
}

export async function upsertVeteran(workspaceId: string, value: unknown): Promise<void> {
  await veteranRepository.upsert(workspaceId, value);
  await loadVeterans(workspaceId, true);
}
