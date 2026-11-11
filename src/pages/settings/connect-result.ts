export const CONNECT_RESULT_PATH = '/auth/connect';

export type ConnectResult =
  { status: 'connected'; provider: string } | { status: 'failed'; message: string };

const ALREADY_LINKED = 'This SSO account is already linked to another user';

function failureMessage(error: string): string {
  if (error === ALREADY_LINKED)
    return 'That login already belongs to a different uma.moe account, so it was not connected here.';

  return error;
}

/** Reads the result the backend appends when it redirects a finished connect back to the site. */
export function readConnectResult(url: URL): ConnectResult | undefined {
  if (url.pathname !== CONNECT_RESULT_PATH) return undefined;

  const error = url.searchParams.get('error');
  if (error !== null) return { status: 'failed', message: failureMessage(error) };

  const provider = url.searchParams.get('success');
  if (provider !== null) return { status: 'connected', provider };

  return undefined;
}
