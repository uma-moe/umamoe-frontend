import { describe, expect, it } from 'vitest';
import { readConnectResult } from './connect-result';

describe('readConnectResult', () => {
  it('reads a connected provider', () => {
    const result = readConnectResult(new URL('https://uma.moe/auth/connect?success=discord'));

    expect(result).toEqual({ status: 'connected', provider: 'discord' });
  });

  it('explains an identity that belongs to another account', () => {
    const url = new URL('https://uma.moe/auth/connect');
    url.searchParams.set('error', 'This SSO account is already linked to another user');

    const result = readConnectResult(url);

    expect(result).toEqual({
      status: 'failed',
      message:
        'That login already belongs to a different uma.moe account, so it was not connected here.'
    });
  });

  it('passes other backend errors through', () => {
    const result = readConnectResult(new URL('https://uma.moe/auth/connect?error=Nope'));

    expect(result).toEqual({ status: 'failed', message: 'Nope' });
  });

  it('ignores other pages and a bare connect address', () => {
    expect(readConnectResult(new URL('https://uma.moe/settings?error=Nope'))).toBeUndefined();
    expect(readConnectResult(new URL('https://uma.moe/auth/connect'))).toBeUndefined();
  });
});
