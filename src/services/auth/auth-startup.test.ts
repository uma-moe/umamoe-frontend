import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
const request = vi.hoisted(() => vi.fn());
vi.mock('@/services/http/app-http', () => ({ appHttp: { request } }));
beforeEach(() => { vi.resetModules(); request.mockReset(); localStorage.setItem('auth_token', 'first'); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

it('starts account discovery alongside session verification without showing an unverified user', async () => {
  let verify!: (value: unknown) => void;
  request.mockImplementation(path => path.endsWith('/me') ? new Promise(resolve => verify = resolve) : Promise.resolve([]));
  const { initializeAuth, authUser, authReady } = await import('./auth-state');
  const startup = initializeAuth();
  expect(request.mock.calls.map(([path]) => path)).toEqual(['/api/auth/me', '/api/auth/accounts']);
  expect(get(authUser)).toBeNull();
  expect(get(authReady)).toBe(false);
  verify({ id: 'owner', display_name: 'Owner' }); await startup;
  expect(get(authUser)?.id).toBe('owner');
  expect(get(authReady)).toBe(true);
});

it('shares account reads and refreshes them after writes, explicit refresh, or a session change', async () => {
  request.mockResolvedValue([]);
  const { authRepository: repo } = await import('./auth-repository');
  await Promise.all([repo.linkedAccounts(), repo.linkedAccounts()]);
  await repo.linkedAccounts();
  expect(request).toHaveBeenCalledTimes(1);
  for (const mutation of [() => repo.linkAccount('123'), () => repo.verifyAccount('123'), () => repo.unlinkAccount('123')]) {
    const before = request.mock.calls.length;
    await mutation(); await repo.linkedAccounts();
    expect(request).toHaveBeenCalledTimes(before + 2);
  }
  await repo.linkedAccounts(true);
  localStorage.setItem('auth_token', 'second');
  await repo.linkedAccounts();
  expect(request).toHaveBeenCalledTimes(9);
});

it('finishes startup and keeps sign-in and logout usable when storage access is denied', async () => {
  const blocked = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('Storage blocked', 'SecurityError'); });
  const { initializeAuth, completeLogin, authReady } = await import('./auth-state');
  const { getAuthToken, clearAuthToken } = await import('./auth-token');
  await initializeAuth();
  expect(get(authReady)).toBe(true);
  expect(request).not.toHaveBeenCalled();
  request.mockImplementation(path => Promise.resolve(path.endsWith('/me') ? { id: 'owner', display_name: 'Owner' } : []));
  await completeLogin(' temporary-token ');
  expect(getAuthToken()).toBe('temporary-token');
  clearAuthToken();
  expect(getAuthToken()).toBeUndefined();
  blocked.mockRestore();
  // A failed storage removal must not resurrect a previous persisted session.
  expect(getAuthToken()).toBeUndefined();
});
