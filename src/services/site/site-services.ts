import { writable } from 'svelte/store';
import { runtimeConfig } from '../runtime-config';

export interface EndpointStatus {
  name: string;
  group: string;
  healthy: boolean;
}

export const serviceStatus = writable<{
  state: 'loading' | 'operational' | 'degraded' | 'down';
  endpoints: EndpointStatus[];
}>({ state: 'loading', endpoints: [] });

export const availableVersion = writable('');
export const CURRENT_UPDATE_VERSION = 18;

function parseEndpointStatus(value: unknown): EndpointStatus {
  if (value === null || typeof value !== 'object') throw new Error('Invalid service status.');
  const name = 'name' in value ? String(value.name ?? '') : '';
  const group = 'group' in value ? String(value.group ?? '') : '';
  const results = 'results' in value && Array.isArray(value.results) ? value.results : [];
  const latest: unknown = results.at(-1);
  const healthy =
    latest !== null && typeof latest === 'object' && 'success' in latest && latest.success === true;

  return { name, group, healthy };
}

function statusForEndpoints(endpoints: EndpointStatus[]): 'operational' | 'degraded' | 'down' {
  if (endpoints.every((endpoint) => endpoint.healthy)) return 'operational';
  if (endpoints.some((endpoint) => endpoint.healthy)) return 'degraded';
  return 'down';
}

export const buildVersion = () =>
  document.querySelector<HTMLMetaElement>('meta[name="app-build-version"]')?.content.trim() ||
  'local';

export function reloadUpdatedVersion(version: string): void {
  const url = new URL(location.href);
  url.searchParams.set('__uma_version', version);
  location.replace(url.href);
}

/** Shared, visibility-aware polling. Optional service failures never block the page. */
export function startSiteServices(): () => void {
  const controller = new AbortController();
  const url = new URL(location.href);
  if (url.searchParams.has('__uma_version')) {
    url.searchParams.delete('__uma_version');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }

  const current = buildVersion();
  let statusChecked = -Infinity;
  let versionChecked = -Infinity;
  let statusBusy = false;
  let versionBusy = false;
  const fetchJson = async (path: string): Promise<unknown> => {
    const response = await fetch(path, {
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`Service returned ${response.status}.`);
    return response.json();
  };

  async function refreshStatus() {
    if (statusBusy || !runtimeConfig.statusApiUrl || Date.now() - statusChecked < 300_000) return;
    statusBusy = true;
    statusChecked = Date.now();
    try {
      const data = await fetchJson(runtimeConfig.statusApiUrl);
      if (!Array.isArray(data) || !data.length) throw new Error('No service status available.');
      const endpoints = data.map(parseEndpointStatus);
      if (!controller.signal.aborted)
        serviceStatus.set({ endpoints, state: statusForEndpoints(endpoints) });
    } catch {
      if (!controller.signal.aborted) serviceStatus.set({ state: 'loading', endpoints: [] });
    } finally {
      statusBusy = false;
    }
  }

  async function refreshVersion() {
    if (versionBusy || current === 'local' || Date.now() - versionChecked < 300_000) return;
    versionBusy = true;
    versionChecked = Date.now();
    try {
      const data = await fetchJson('/version.json');
      const version =
        data !== null &&
        typeof data === 'object' &&
        'version' in data &&
        typeof data.version === 'string'
          ? data.version.trim()
          : '';

      if (!controller.signal.aborted && version && version !== current)
        availableVersion.set(version);
    } catch {
      /* Keep the working page when the version endpoint is unavailable. */
    } finally {
      versionBusy = false;
    }
  }

  const refresh = () => {
    if (!document.hidden) {
      void refreshStatus();
      void refreshVersion();
    }
  };

  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('focus', refresh);
  window.addEventListener('online', refresh);
  const timer = setInterval(refresh, 60_000);
  refresh();
  return () => {
    controller.abort();
    clearInterval(timer);
    document.removeEventListener('visibilitychange', refresh);
    window.removeEventListener('focus', refresh);
    window.removeEventListener('online', refresh);
  };
}
