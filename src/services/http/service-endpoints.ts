const configuredUmaLogsBase = (import.meta.env.VITE_UMALOGS_API_BASE ?? '').trim();
const umaLogsBase =
  configuredUmaLogsBase === 'same-origin' ? '' : configuredUmaLogsBase.replace(/\/$/, '');

export function umaLogsApi(path: string): string {
  return `${umaLogsBase}${path.startsWith('/') ? path : `/${path}`}`;
}
