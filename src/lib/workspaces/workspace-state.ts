import { derived, get, writable } from 'svelte/store';

export interface VeteranWorkspace {
  id: string;
  kind: 'local' | 'account';
  label: string;
  accountId?: string;
  revision?: string;
  syncStatus: 'local' | 'synced' | 'pending' | 'conflict' | 'offline';
}

const ACTIVE_KEY = 'uma:active-workspace';
const localWorkspace: VeteranWorkspace = { id: 'local', kind: 'local', label: 'Local device', syncStatus: 'local' };
export const workspaces = writable<VeteranWorkspace[]>([localWorkspace]);
export const activeWorkspaceId = writable('local');
export const activeWorkspace = derived([workspaces, activeWorkspaceId], ([$workspaces, $id]) => $workspaces.find((workspace) => workspace.id === $id) ?? localWorkspace);

export function initializeWorkspace(): void {
  try { const saved = window.localStorage.getItem(ACTIVE_KEY); if (saved) activeWorkspaceId.set(saved); } catch { /* Selection still works in memory when storage is blocked. */ }
}

export function selectWorkspace(id: string): void {
  if (!get(workspaces).some((workspace) => workspace.id === id)) return;
  activeWorkspaceId.set(id);
  try { window.localStorage.setItem(ACTIVE_KEY, id); } catch { /* Keep the current in-memory selection. */ }
}

export function setAccountWorkspaces(accounts: Array<{ accountId: string; label: string }>): void {
  const next = [localWorkspace, ...accounts.map((account) => ({ id: `account:${account.accountId}`, kind: 'account' as const, label: account.label, accountId: account.accountId, syncStatus: 'pending' as const }))];
  workspaces.set(next);
  if (!next.some((workspace) => workspace.id === get(activeWorkspaceId))) activeWorkspaceId.set('local');
  try { if (accounts.length && !window.localStorage.getItem(ACTIVE_KEY)) selectWorkspace(next[1]!.id); } catch { /* Use the local collection when preferences are unavailable. */ }
}
