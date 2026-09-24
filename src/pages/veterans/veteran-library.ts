import { get, writable } from 'svelte/store';
import { authUser } from '@/services/auth/auth-state';
import { getAuthToken } from '@/services/auth/auth-token';
import { workspaces } from '@/lib/workspaces/workspace-state';
import { veteranRepository } from '@/lib/veterans/veteran-repository';
import { normalizeVeteranImport } from '@/lib/veterans/veteran-normalizer';
import { veteranPayload } from '@/lib/veterans/veteran-profile';
import type { VeteranRecord } from '@/lib/veterans/generated/veteran-record';
import { profileRepository } from '@/pages/profile/profile-repository';
import { deviceParent, type SelectableParent } from '@/lib/veterans/parent-picker';

export const veteranDrafts = writable<Record<string, VeteranRecord[]>>({});
export const veteranLibraryRevision = writable(0);
export const veteranImportBusy = writable(false);
export const veteranLibraryNotice = writable<{ tone: 'success' | 'danger'; message: string } | null>(null);
export function draftScope(accountId: string, userId = get(authUser)?.id): string {
  return accountId && userId ? `pending:${userId}:${accountId}` : 'local';
}
export async function loadVeteranDrafts(scope: string): Promise<void> {
  const records = await veteranRepository.query(scope);
  veteranDrafts.update(all => ({ ...all, [scope]: records }));
}
export async function deviceVeteranParents(): Promise<SelectableParent[]> {
  const userId = get(authUser)?.id;
  const accounts = ['', ...(userId ? get(workspaces).flatMap(workspace => workspace.accountId ? [workspace.accountId] : []) : [])];
  return (await Promise.all(accounts.map(async accountId => (await veteranRepository.query(draftScope(accountId, userId))).map(record => deviceParent(record, accountId))))).flat();
}
function session(accountId: string) {
  const token = getAuthToken(), userId = get(authUser)?.id;
  return { token, userId, scope: draftScope(accountId, userId),
    check() {
      if (getAuthToken() !== token || get(authUser)?.id !== userId) throw new Error('Your sign-in session changed. Choose the file again.');
      if (accountId && (!token || !userId || !get(workspaces).some(w => w.accountId === accountId))) throw new Error('Choose a verified linked account before uploading.');
    }
  };
}
async function sync(accountId: string, request: ReturnType<typeof session>): Promise<number> {
  request.check();
  const records = await veteranRepository.query(request.scope);
  if (!records.length) return 0;
  if (records.some(record => !Number.isSafeInteger(record.trainedCharaId) || Number(record.trainedCharaId) <= 0)) throw new Error('These veterans are saved on this device, but their export is missing trained character IDs required for account uploads. Use a full game export.');
  request.check();
  try { await profileRepository.ingestVeterans(accountId, records.map(veteranPayload)); }
  catch (error) {
    throw new Error(`Saved on this device; account upload failed. ${error instanceof Error ? error.message : 'Please try again.'}`);
  }
  request.check();
  // Keep the recovery copy until the server collection can actually be read back.
  const refreshed = await profileRepository.load(accountId, true);
  request.check();
  const uploadedIds = new Set(refreshed.veterans?.map(veteran => veteran.trained_chara_id));
  if (uploadedIds.size !== records.length || records.some(record => !uploadedIds.has(record.trainedCharaId))) throw new Error('Upload accepted, but the account collection has not refreshed yet. Your device copy is kept; retry in a moment.');
  await veteranRepository.replace(request.scope, [], 'uploaded-to-account');
  await loadVeteranDrafts(request.scope);
  veteranLibraryRevision.update(value => value + 1);
  return records.length;
}

// ponytail: one import at a time per tab; use per-account queues if concurrent bulk imports become necessary.
async function operation(action: () => Promise<string>): Promise<void> {
  if (get(veteranImportBusy)) throw new Error('An import is already in progress. Wait for it to finish.');
  veteranImportBusy.set(true); veteranLibraryNotice.set(null);
  try { veteranLibraryNotice.set({ tone: 'success', message: await action() }); }
  catch (error) { veteranLibraryNotice.set({ tone: 'danger', message: error instanceof Error ? error.message : 'Could not import veterans. Please try again.' }); throw error; }
  finally { veteranImportBusy.set(false); }
}
export async function importVeteranFiles(files: FileList | File[], accountId = ''): Promise<void> {
  const request = session(accountId);
  await operation(async () => {
    const selected = Array.from(files);
    if (!selected.length || selected.some(file => !file.name.toLowerCase().endsWith('.json'))) throw new Error('Choose veteran exports in .json format.');
    if (selected.reduce((sum, file) => sum + file.size, 0) > 128 * 1024 * 1024) throw new Error('Choose files smaller than 128 MB in total.');
    const records: VeteranRecord[] = [];
    for (const file of selected) {
      try { records.push(...normalizeVeteranImport(JSON.parse(await file.text()))); }
      catch (error) { throw new Error(`${file.name}: ${error instanceof Error ? error.message : 'Invalid veteran export.'}`); }
    }
    request.check();
    const total = await veteranRepository.replace(request.scope, records, 'json-upload');
    await loadVeteranDrafts(request.scope);
    if (accountId) {
      const count = await sync(accountId, request);
      return `${count} veteran${count === 1 ? '' : 's'} synced to ${get(workspaces).find(w => w.accountId === accountId)?.label ?? accountId}.`;
    }
    return `${total} veteran${total === 1 ? '' : 's'} saved on this device. ${request.userId ? 'Select a linked account to sync your collection.' : 'Sign in to sync them to your account.'}`;
  });
}
export async function syncVeteranDrafts(accountId: string, includeLocal = false): Promise<void> {
  const request = session(accountId);
  await operation(async () => {
    request.check();
    if (includeLocal) {
      const local = await veteranRepository.query('local');
      request.check();
      if (local.length) { await veteranRepository.replace(request.scope, local, 'device-upload'); await loadVeteranDrafts(request.scope); }
    }
    const count = await sync(accountId, request);
    return `${count} veteran${count === 1 ? '' : 's'} synced to ${get(workspaces).find(w => w.accountId === accountId)?.label ?? accountId}.${includeLocal ? ' Your device copy is kept.' : ''}`;
  });
}
