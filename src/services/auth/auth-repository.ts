import { appHttp } from '@/services/http/app-http';
import type {
  ApiKey,
  AuthIdentity,
  AuthLoginResponse,
  AuthUser,
  LinkedAccount,
  VerifyAccountResponse
} from './auth-types';
import { RequestCache } from '@/services/cache/request-cache';
import { getAuthToken } from './auth-token';

const accountsCache = new RequestCache();
let accountsToken: string | undefined;
function linkedAccounts(refresh = false): Promise<LinkedAccount[]> {
  const token = getAuthToken();
  if (token !== accountsToken) {
    accountsCache.invalidate();
    accountsToken = token;
  }

  return accountsCache.get(
    'accounts',
    30_000,
    () => appHttp.request<LinkedAccount[]>('/api/auth/accounts'),
    refresh
  );
}

function updateAccounts<T>(request: Promise<T>): Promise<T> {
  return request.finally(() => accountsCache.invalidate());
}

export const authRepository = {
  me: () => appHttp.request<AuthUser>('/api/auth/me'),
  login: (provider: string) =>
    appHttp.request<AuthLoginResponse>(`/api/auth/login/${encodeURIComponent(provider)}`, {
      query: { origin: window.location.origin }
    }),
  linkedAccounts,
  linkAccount: (accountId: string) =>
    updateAccounts(
      appHttp.request<LinkedAccount>('/api/auth/link', {
        method: 'POST',
        body: { account_id: Number(accountId) }
      })
    ),
  verifyAccount: (accountId: string) =>
    updateAccounts(
      appHttp.request<VerifyAccountResponse>('/api/auth/verify', {
        method: 'POST',
        body: { account_id: accountId }
      })
    ),
  unlinkAccount: (accountId: string) =>
    updateAccounts(
      appHttp.request<void>(`/api/auth/link/${encodeURIComponent(accountId)}`, { method: 'DELETE' })
    ),
  identities: () => appHttp.request<AuthIdentity[]>('/api/auth/identities'),
  connectProvider: (provider: string) =>
    appHttp.request<AuthLoginResponse>(`/api/auth/connect/${encodeURIComponent(provider)}`),
  disconnectProvider: (provider: string) =>
    appHttp.request<void>(`/api/auth/disconnect/${encodeURIComponent(provider)}`, {
      method: 'DELETE'
    }),
  apiKeys: () => appHttp.request<ApiKey[]>('/api/auth/api-keys'),
  createApiKey: (name: string) =>
    appHttp.request<ApiKey>('/api/auth/api-keys', { method: 'POST', body: { name } }),
  revokeApiKey: (id: string) =>
    appHttp.request<void>(`/api/auth/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' })
};
