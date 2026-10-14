import { writable } from 'svelte/store';
import { authRepository } from './auth-repository';
import { clearAuthToken, getAuthToken, setAuthToken } from './auth-token';
import type { AuthUser } from './auth-types';
import { setAccountWorkspaces } from '@/lib/workspaces/workspace-state';
import { HttpError } from '@/services/http/http-client';

export const authUser = writable<AuthUser | null>(null);
export const authReady = writable(false);

export async function initializeAuth(): Promise<void> {
  if (!getAuthToken()) { authReady.set(true); return; }
  try {
    const userRequest = authRepository.me();
    const accountsRequest = authRepository.linkedAccounts().catch(() => []);
    authUser.set(await userRequest);
    const accounts = await accountsRequest;
    setAccountWorkspaces(accounts.filter(account => account.verification_status === 'verified').map((account) => ({ accountId: account.account_id, label: account.trainer_name || account.account_id })));
  }
  catch (error) {
    if (error instanceof HttpError && [401, 403, 404].includes(error.status)) clearAuthToken();
    authUser.set(null);
    setAccountWorkspaces([]);
  }
  finally { authReady.set(true); }
}

export async function beginLogin(provider: 'google' | 'discord'): Promise<void> {
  const response = await authRepository.login(provider);
  try {
    if (new URLSearchParams(window.location.search).get('returnTo') === '/veterans') sessionStorage.setItem('auth_return_to', '/veterans');
    else sessionStorage.removeItem('auth_return_to');
  } catch { /* Sign-in still works when session storage is unavailable. */ }
  window.location.assign(response.url);
}

export async function completeLogin(token: string): Promise<AuthUser> {
  authReady.set(false);
  setAuthToken(token);
  try {
    const userRequest = authRepository.me();
    const accountsRequest = authRepository.linkedAccounts().catch(() => []);
    const user = await userRequest;
    authUser.set(user);
    const accounts = await accountsRequest;
    setAccountWorkspaces(accounts.filter(account => account.verification_status === 'verified').map((account) => ({ accountId: account.account_id, label: account.trainer_name || account.account_id })));
    return user;
  } catch (error) {
    if (error instanceof HttpError && [401, 403, 404].includes(error.status)) clearAuthToken();
    throw error;
  } finally { authReady.set(true); }
}

export function logout(): void {
  clearAuthToken();
  // The fresh page resets stores; clearing them here races protected-route redirects with this navigation.
  window.location.assign('/');
}
